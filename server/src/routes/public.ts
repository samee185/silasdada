import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { prisma } from '../db';
import { createPublicBooking, moveBooking, visitorCancel } from '../lib/bookings';
import { handle, HttpError, parse } from '../lib/http';
import { normalizePhone } from '../lib/phone';
import { computeRange, loadContext, todayIso, TZ } from '../lib/slots';

export const publicRouter = Router();

const bookLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many booking attempts from this device. Please try again in an hour.' },
});

/** GET /api/public/availability?from=2026-11-09&days=14 */
publicRouter.get(
  '/availability',
  handle(async (req, res) => {
    const today = todayIso();
    const settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
    const lastDay = DateTime.fromISO(today, { zone: TZ }).plus({ days: settings.maxAdvanceDays }).toISODate()!;
    let from = typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : today;
    if (from < today) from = today;
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 42);
    const until = DateTime.fromISO(from, { zone: TZ }).plus({ days: days - 1 }).toISODate()!;
    const ctx = await loadContext(from, until);
    res.set('Cache-Control', 'no-store');
    res.json({
      today,
      lastDay,
      timezone: TZ,
      slotMinutes: settings.slotMinutes,
      confirmMode: settings.confirmMode,
      days: computeRange(from, days, ctx).filter((d) => d.date <= lastDay),
    });
  }),
);

const bookingSchema = z.object({
  start: z.string().datetime({ message: 'Pick a time.' }),
  mode: z.enum(['IN_PERSON', 'WHATSAPP'], { message: 'Choose in person or WhatsApp call.' }),
  name: z.string().trim().min(2, 'Enter your full name.').max(120),
  phone: z.string().trim().min(7, 'Enter your WhatsApp number.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  reason: z.string().trim().max(1500, 'Please keep it under 1,500 characters.').optional().nullable(),
  isMember: z.boolean().default(true),
  whatsappOptIn: z.boolean().default(true),
  website: z.string().optional(), // honeypot: real people never fill this hidden field
});

publicRouter.post(
  '/bookings',
  bookLimiter,
  handle(async (req, res) => {
    const data = parse(bookingSchema, req.body);
    if (data.website) throw new HttpError(400, 'Something went wrong. Please try again.');
    const phone = normalizePhone(data.phone);
    if (!phone) throw new HttpError(400, 'Some fields need attention.', { phone: 'Enter a valid phone number, e.g. 0803 123 4567.' });
    const { website: _ignored, ...input } = data;
    const b = await createPublicBooking({ ...input, phone });
    res.status(201).json({ booking: publicView(b), manageToken: b.manageToken });
  }),
);

async function byToken(token: string) {
  const b = await prisma.booking.findUnique({ where: { manageToken: token } });
  if (!b) throw new HttpError(404, 'We could not find this booking. The link may be incomplete.');
  return b;
}

function publicView(b: Awaited<ReturnType<typeof byToken>>) {
  return {
    name: b.name,
    phone: b.phone,
    email: b.email,
    mode: b.mode,
    startAt: b.startAt,
    endAt: b.endAt,
    status: b.status,
    statusNote: b.statusNote,
  };
}

publicRouter.get(
  '/bookings/:token',
  handle(async (req, res) => {
    const b = await byToken(String(req.params.token));
    const site = await prisma.siteProfile.findUniqueOrThrow({ where: { id: 1 } });
    res.set('Cache-Control', 'no-store');
    res.json({ booking: publicView(b), meetingAddress: site.meetingAddress, mapsUrl: site.mapsUrl });
  }),
);

publicRouter.post(
  '/bookings/:token/cancel',
  bookLimiter,
  handle(async (req, res) => {
    const b = await visitorCancel(await byToken(String(req.params.token)));
    res.json({ booking: publicView(b) });
  }),
);

publicRouter.post(
  '/bookings/:token/move',
  bookLimiter,
  handle(async (req, res) => {
    const { start, mode } = parse(bookingSchema.pick({ start: true, mode: true }), req.body);
    const b = await moveBooking(await byToken(String(req.params.token)), start, mode);
    res.json({ booking: publicView(b) });
  }),
);
