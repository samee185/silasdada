import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireRole } from '../lib/auth';
import { emptyToNull, handle, HttpError, parse } from '../lib/http';
import { DateTime } from 'luxon';
import { ownerAction } from '../lib/bookings';
import { dateKey, fitsBlocks, isoOf, lagosDate, TZ } from '../lib/slots';
import { blockProblem, TIME_RE } from '../lib/time';

/** Meeting rules and the usual week. Rev'd Dada only: appointments are private to him. */
export const scheduleRouter = Router();
scheduleRouter.use(requireRole('OWNER'));

const settingsSchema = z.object({
  slotMinutes: z.number().int().refine((v) => [30, 45, 60, 90].includes(v), 'Choose 30, 45, 60 or 90 minutes.'),
  bufferMinutes: z.number().int().refine((v) => [0, 10, 15, 30].includes(v), 'Choose 0, 10, 15 or 30 minutes.'),
  minNoticeHours: z.number().int().min(0).max(24 * 14),
  maxAdvanceDays: z.number().int().min(1).max(180),
  maxPerDay: z.number().int().min(1).max(20).nullable(),
  confirmMode: z.enum(['AUTO', 'APPROVE']),
});

scheduleRouter.get(
  '/settings',
  handle(async (_req, res) => {
    res.json(await prisma.settings.findUniqueOrThrow({ where: { id: 1 } }));
  }),
);

scheduleRouter.put(
  '/settings',
  handle(async (req, res) => {
    const data = parse(settingsSchema.partial(), req.body);
    res.json(await prisma.settings.update({ where: { id: 1 }, data }));
  }),
);

const blockSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  start: z.string().regex(TIME_RE, 'Use a time like 10:00.'),
  end: z.string().regex(TIME_RE, 'Use a time like 13:00.'),
  mode: z.enum(['IN_PERSON', 'WHATSAPP', 'BOTH']),
  location: z.preprocess(emptyToNull, z.string().trim().max(255).nullable()).optional(),
});

scheduleRouter.get(
  '/weekly',
  handle(async (_req, res) => {
    const blocks = await prisma.weeklyBlock.findMany({ orderBy: [{ weekday: 'asc' }, { start: 'asc' }] });
    res.json({ blocks });
  }),
);

/** Replaces the whole usual week in one go (what the editor sends). */
scheduleRouter.put(
  '/weekly',
  handle(async (req, res) => {
    const { blocks } = parse(z.object({ blocks: z.array(blockSchema).max(50) }), req.body);
    for (let d = 0; d < 7; d++) {
      const problem = blockProblem(blocks.filter((b) => b.weekday === d));
      if (problem) throw new HttpError(400, `${DAY_NAMES[d]}: ${problem}`);
    }
    await prisma.$transaction([
      prisma.weeklyBlock.deleteMany({}),
      prisma.weeklyBlock.createMany({ data: blocks.map((b) => ({ ...b, location: b.location ?? null })) }),
    ]);
    const saved = await prisma.weeklyBlock.findMany({ orderBy: [{ weekday: 'asc' }, { start: 'asc' }] });
    res.json({ blocks: saved });
  }),
);

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Day changes (overrides) ─────────────────────────────

const dayBlockSchema = z.object({
  start: z.string().regex(TIME_RE, 'Use a time like 10:00.'),
  end: z.string().regex(TIME_RE, 'Use a time like 13:00.'),
  mode: z.enum(['IN_PERSON', 'WHATSAPP', 'BOTH']),
});
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const dayChangeSchema = z
  .object({
    from: z.string().regex(ISO_DATE),
    to: z.string().regex(ISO_DATE),
    type: z.enum(['NORMAL', 'CLOSED', 'CUSTOM']),
    note: z.string().trim().max(255).optional().nullable(),
    blocks: z.array(dayBlockSchema).max(10).default([]),
  })
  .refine((d) => d.to >= d.from, { message: 'The end date must be on or after the start date.', path: ['to'] })
  .refine((d) => d.type !== 'CUSTOM' || d.blocks.length > 0, { message: 'Add at least one set of hours.', path: ['blocks'] });

function datesBetween(from: string, to: string) {
  const out: string[] = [];
  let d = DateTime.fromISO(from, { zone: TZ });
  const end = DateTime.fromISO(to, { zone: TZ });
  while (d <= end && out.length < 93) {
    out.push(d.toISODate()!);
    d = d.plus({ days: 1 });
  }
  return out;
}

scheduleRouter.get(
  '/overrides',
  handle(async (req, res) => {
    const from = typeof req.query.from === 'string' && ISO_DATE.test(req.query.from) ? req.query.from : DateTime.now().setZone(TZ).toISODate()!;
    const to = typeof req.query.to === 'string' && ISO_DATE.test(req.query.to) ? req.query.to : DateTime.fromISO(from).plus({ days: 120 }).toISODate()!;
    const rows = await prisma.dayOverride.findMany({ where: { date: { gte: dateKey(from), lte: dateKey(to) } }, include: { blocks: true }, orderBy: { date: 'asc' } });
    res.json({
      overrides: rows.map((o) => ({ date: isoOf(o.date), type: o.type, note: o.note, blocks: o.blocks.map(({ start, end, mode }) => ({ start, end, mode })) })),
    });
  }),
);

/** Which existing bookings would a day change affect? */
async function affectedBy(input: z.infer<typeof dayChangeSchema>) {
  const dates = datesBetween(input.from, input.to);
  const weekly = await prisma.weeklyBlock.findMany();
  const from = DateTime.fromISO(input.from, { zone: TZ }).startOf('day').toJSDate();
  const to = DateTime.fromISO(input.to, { zone: TZ }).endOf('day').toJSDate();
  const bookings = await prisma.booking.findMany({
    where: { status: { in: ['CONFIRMED', 'PENDING'] }, startAt: { gte: from, lte: to } },
    orderBy: { startAt: 'asc' },
  });
  return bookings.filter((b) => {
    const date = lagosDate(b.startAt);
    if (!dates.includes(date)) return false;
    const blocks =
      input.type === 'CLOSED'
        ? []
        : input.type === 'CUSTOM'
          ? input.blocks
          : weekly.filter((w) => w.weekday === DateTime.fromISO(date, { zone: TZ }).weekday % 7);
    return !fitsBlocks(b.startAt, b.endAt, date, blocks, b.mode);
  });
}

scheduleRouter.post(
  '/day/preview',
  handle(async (req, res) => {
    const input = parse(dayChangeSchema, req.body);
    const affected = await affectedBy(input);
    res.json({ affected: affected.map((b) => ({ id: b.id, name: b.name, startAt: b.startAt, mode: b.mode, status: b.status })) });
  }),
);

/** Saves a day change and applies the pastor's choice for every affected booking, in one go. */
scheduleRouter.put(
  '/day',
  handle(async (req, res) => {
    const body = parse(
      z.object({
        change: dayChangeSchema,
        resolutions: z.record(z.string(), z.enum(['KEEP', 'RESCHEDULE', 'CANCEL'])).default({}),
        message: z.string().trim().max(500).optional().nullable(),
      }),
      req.body,
    );
    const { change, resolutions, message } = body;
    const problem = blockProblem(change.blocks);
    if (change.type === 'CUSTOM' && problem) throw new HttpError(400, problem);
    const affected = await affectedBy(change);
    const missing = affected.filter((b) => !resolutions[b.id]);
    if (missing.length) throw new HttpError(409, 'Choose what happens to each affected booking first.', { affected: missing.map((b) => b.id) });

    const dates = datesBetween(change.from, change.to);
    await prisma.$transaction(async (tx) => {
      await tx.dayOverride.deleteMany({ where: { date: { in: dates.map(dateKey) } } });
      if (change.type !== 'NORMAL') {
        for (const d of dates) {
          await tx.dayOverride.create({
            data: {
              date: dateKey(d),
              type: change.type,
              note: change.note || null,
              blocks: change.type === 'CUSTOM' ? { create: change.blocks } : undefined,
            },
          });
        }
      }
    });

    let rescheduled = 0;
    let cancelled = 0;
    for (const b of affected) {
      const choice = resolutions[b.id];
      if (choice === 'RESCHEDULE') {
        await ownerAction(b.id, 'reschedule', message || null);
        rescheduled++;
      } else if (choice === 'CANCEL') {
        await ownerAction(b.id, 'cancel', message || null);
        cancelled++;
      }
    }
    res.json({ ok: true, days: dates.length, rescheduled, cancelled });
  }),
);
