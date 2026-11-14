import { DateTime } from 'luxon';
import type { Booking, DayOverride, MeetingMode, OverrideBlock, Prisma, PrismaClient, Settings, WeeklyBlock } from '@prisma/client';
import { prisma } from '../db';

export const TZ = 'Africa/Lagos';
type Db = PrismaClient | Prisma.TransactionClient;

export type Slot = { start: string; end: string; mode: MeetingMode };
export type DayAvailability = { date: string; closed: boolean; changed: boolean; note: string | null; slots: Slot[] };
type Block = { start: string; end: string; mode: MeetingMode };

export type ScheduleContext = {
  settings: Settings;
  weekly: WeeklyBlock[];
  overrides: Map<string, DayOverride & { blocks: OverrideBlock[] }>;
  bookings: Pick<Booking, 'id' | 'startAt' | 'endAt'>[];
  now: DateTime;
};

/** "2026-11-10" → the Date Prisma stores in a DATE column. */
export const dateKey = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
export const isoOf = (d: Date) => d.toISOString().slice(0, 10);
export const todayIso = () => DateTime.now().setZone(TZ).toISODate()!;
export const lagosDate = (d: Date) => DateTime.fromJSDate(d).setZone(TZ).toISODate()!;

/** Bookings that hold a time: confirmed ones, and pending ones still inside their hold. */
export const activeWhere = (now: Date): Prisma.BookingWhereInput => ({
  OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }] }],
});

export async function loadContext(fromIso: string, toIso: string, db: Db = prisma, excludeBookingId?: string): Promise<ScheduleContext> {
  const now = DateTime.now().setZone(TZ);
  const from = DateTime.fromISO(fromIso, { zone: TZ }).startOf('day');
  const to = DateTime.fromISO(toIso, { zone: TZ }).endOf('day');
  const [settings, weekly, overrides, bookings] = await Promise.all([
    db.settings.findUniqueOrThrow({ where: { id: 1 } }),
    db.weeklyBlock.findMany(),
    db.dayOverride.findMany({ where: { date: { gte: dateKey(fromIso), lte: dateKey(toIso) } }, include: { blocks: true } }),
    db.booking.findMany({
      where: {
        startAt: { gte: from.minus({ days: 1 }).toJSDate(), lte: to.plus({ days: 1 }).toJSDate() },
        ...activeWhere(now.toJSDate()),
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: { id: true, startAt: true, endAt: true },
    }),
  ]);
  return { settings, weekly, overrides: new Map(overrides.map((o) => [isoOf(o.date), o])), bookings, now };
}

/** The blocks that apply on a date: that day's override if there is one, otherwise the usual week. */
export function blocksFor(date: string, ctx: Pick<ScheduleContext, 'weekly' | 'overrides'>): { blocks: Block[]; closed: boolean; changed: boolean; note: string | null } {
  const ov = ctx.overrides.get(date);
  if (ov) {
    return ov.type === 'CLOSED'
      ? { blocks: [], closed: true, changed: true, note: ov.note }
      : { blocks: ov.blocks, closed: false, changed: true, note: ov.note };
  }
  const weekday = DateTime.fromISO(date, { zone: TZ }).weekday % 7; // luxon: Mon=1…Sun=7 → Sun=0
  return { blocks: ctx.weekly.filter((b) => b.weekday === weekday), closed: false, changed: false, note: null };
}

export function computeDay(date: string, ctx: ScheduleContext): DayAvailability {
  const { settings: s, now } = ctx;
  const { blocks, closed, changed, note } = blocksFor(date, ctx);
  const day = DateTime.fromISO(date, { zone: TZ });
  const earliest = now.plus({ hours: s.minNoticeHours });
  const latest = now.startOf('day').plus({ days: s.maxAdvanceDays }).endOf('day');
  const buffer = s.bufferMinutes;
  const dayBookings = ctx.bookings.filter((b) => lagosDate(b.startAt) === date);

  if (s.maxPerDay && dayBookings.length >= s.maxPerDay) return { date, closed, changed, note, slots: [] };

  // Every block offers candidate start times on its own grid. A time inside more than one block
  // (e.g. in-person 10–1 and WhatsApp 9–5) is offered once, as whichever types cover it.
  const byStart = new Map<number, Slot>();
  for (const b of [...blocks].sort((x, y) => x.start.localeCompare(y.start))) {
    let t = DateTime.fromISO(`${date}T${b.start}`, { zone: TZ });
    const blockEnd = DateTime.fromISO(`${date}T${b.end}`, { zone: TZ });
    while (t.plus({ minutes: s.slotMinutes }) <= blockEnd) {
      const end = t.plus({ minutes: s.slotMinutes });
      const clash = dayBookings.some(
        (bk) => t.toMillis() < bk.endAt.getTime() + buffer * 60_000 && end.toMillis() + buffer * 60_000 > bk.startAt.getTime(),
      );
      if (!clash && t >= earliest && t <= latest && day.hasSame(t, 'day') && !byStart.has(t.toMillis())) {
        const mode = modeCovering(t.toJSDate(), end.toJSDate(), date, blocks);
        if (mode) byStart.set(t.toMillis(), { start: t.toUTC().toISO()!, end: end.toUTC().toISO()!, mode });
      }
      t = end.plus({ minutes: buffer });
    }
  }
  const slots = [...byStart.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
  return { date, closed, changed, note, slots };
}

export function computeRange(fromIso: string, days: number, ctx: ScheduleContext): DayAvailability[] {
  const start = DateTime.fromISO(fromIso, { zone: TZ });
  return Array.from({ length: days }, (_, i) => computeDay(start.plus({ days: i }).toISODate()!, ctx));
}

/** The meeting types offered for [start,end): every block that fully contains it adds its type. */
export function modeCovering(start: Date, end: Date, date: string, blocks: Block[]): MeetingMode | null {
  let inPerson = false;
  let whatsapp = false;
  for (const b of blocks) {
    const bs = DateTime.fromISO(`${date}T${b.start}`, { zone: TZ }).toMillis();
    const be = DateTime.fromISO(`${date}T${b.end}`, { zone: TZ }).toMillis();
    if (start.getTime() < bs || end.getTime() > be) continue;
    if (b.mode !== 'WHATSAPP') inPerson = true;
    if (b.mode !== 'IN_PERSON') whatsapp = true;
  }
  return inPerson && whatsapp ? 'BOTH' : inPerson ? 'IN_PERSON' : whatsapp ? 'WHATSAPP' : null;
}

/** True when [start,end) still fits the day's hours for this meeting type (used to find bookings a day change would break). */
export function fitsBlocks(start: Date, end: Date, date: string, blocks: Block[], mode: MeetingMode) {
  const offered = modeCovering(start, end, date, blocks);
  return offered === 'BOTH' || (offered !== null && offered === mode);
}

/** Locks one calendar date so two bookings for it are never written at the same moment. */
export async function lockDay(tx: Prisma.TransactionClient, date: string) {
  const d = dateKey(date);
  await tx.$executeRaw`INSERT IGNORE INTO \`DayLock\` (\`date\`) VALUES (${d})`;
  await tx.$queryRaw`SELECT \`date\` FROM \`DayLock\` WHERE \`date\` = ${d} FOR UPDATE`;
}
