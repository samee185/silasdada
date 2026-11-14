import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import type { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireRole } from '../lib/auth';
import { createOwnerBooking, ownerAction, type OwnerAction } from '../lib/bookings';
import { handle, HttpError, parse } from '../lib/http';
import { whatsappQueue } from '../lib/outbox';
import { normalizePhone, waDigits } from '../lib/phone';
import { TZ } from '../lib/slots';

/** Appointments are private to Rev'd Dada: the secretary's login is refused here. */
export const appointmentsRouter = Router();
appointmentsRouter.use(requireRole('OWNER'));

const VIEWS: Record<string, { where: (now: Date) => Prisma.BookingWhereInput; order: 'asc' | 'desc' }> = {
  upcoming: { where: (now) => ({ status: { in: ['CONFIRMED', 'PENDING'] }, endAt: { gte: now } }), order: 'asc' },
  requests: { where: () => ({ status: 'PENDING' }), order: 'asc' },
  reschedule: { where: () => ({ status: 'NEEDS_RESCHEDULE' }), order: 'asc' },
  past: { where: (now) => ({ OR: [{ endAt: { lt: now } }, { status: { in: ['COMPLETED', 'CANCELLED', 'DECLINED', 'EXPIRED'] } }] }), order: 'desc' },
};

function view(b: Prisma.BookingGetPayload<object>) {
  return {
    id: b.id,
    name: b.name,
    phone: b.phone,
    email: b.email,
    mode: b.mode,
    startAt: b.startAt,
    endAt: b.endAt,
    status: b.status as BookingStatus,
    statusNote: b.statusNote,
    reason: b.reason,
    reasonCleared: Boolean(b.reasonClearedAt),
    isMember: b.isMember,
    createdAt: b.createdAt,
    whatsappChat: `https://wa.me/${waDigits(b.phone)}`,
  };
}

appointmentsRouter.get(
  '/',
  handle(async (req, res) => {
    const v = VIEWS[String(req.query.view ?? 'upcoming')] ?? VIEWS.upcoming;
    const rows = await prisma.booking.findMany({ where: v.where(new Date()), orderBy: { startAt: v.order }, take: 200 });
    res.json({ bookings: rows.map(view) });
  }),
);

/** Numbers and lists for the dashboard home. */
appointmentsRouter.get(
  '/summary',
  handle(async (_req, res) => {
    const now = DateTime.now().setZone(TZ);
    const dayStart = now.startOf('day').toJSDate();
    const dayEnd = now.endOf('day').toJSDate();
    const [today, pending, newBookings, reschedule, wa, next] = await Promise.all([
      prisma.booking.findMany({ where: { status: { in: ['CONFIRMED', 'PENDING'] }, startAt: { gte: dayStart, lte: dayEnd } }, orderBy: { startAt: 'asc' } }),
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.booking.findMany({ where: { status: { in: ['CONFIRMED', 'PENDING'] }, createdAt: { gte: now.minus({ days: 3 }).toJSDate() }, endAt: { gte: new Date() } }, orderBy: { createdAt: 'desc' }, take: 6 }),
      prisma.booking.count({ where: { status: 'NEEDS_RESCHEDULE' } }),
      whatsappQueue(),
      prisma.booking.findFirst({ where: { status: 'CONFIRMED', startAt: { gte: new Date() } }, orderBy: { startAt: 'asc' } }),
    ]);
    res.json({ today: today.map(view), pending, newBookings: newBookings.map(view), reschedule, whatsapp: wa, next: next ? view(next) : null });
  }),
);

appointmentsRouter.get(
  '/whatsapp',
  handle(async (_req, res) => {
    res.json({ items: await whatsappQueue() });
  }),
);

appointmentsRouter.post(
  '/whatsapp/:id/sent',
  handle(async (req, res) => {
    await prisma.notification.updateMany({
      where: { id: String(req.params.id), channel: 'WHATSAPP_MANUAL' },
      data: { status: 'SENT', sentAt: new Date() },
    });
    res.json({ ok: true });
  }),
);

appointmentsRouter.post(
  '/whatsapp/:id/skip',
  handle(async (req, res) => {
    await prisma.notification.updateMany({ where: { id: String(req.params.id), channel: 'WHATSAPP_MANUAL' }, data: { status: 'CANCELLED' } });
    res.json({ ok: true });
  }),
);

appointmentsRouter.post(
  '/:id/:action',
  handle(async (req, res) => {
    const action = String(req.params.action) as OwnerAction;
    if (!['approve', 'decline', 'cancel', 'reschedule', 'complete'].includes(action)) throw new HttpError(404, 'Not found');
    const { note } = parse(z.object({ note: z.string().trim().max(500).optional().nullable() }), req.body);
    const b = await ownerAction(String(req.params.id), action, note || null);
    res.json({ booking: view(b) });
  }),
);

const ownerBookingSchema = z.object({
  start: z.string().datetime({ message: 'Pick a date and time.' }),
  mode: z.enum(['IN_PERSON', 'WHATSAPP']),
  name: z.string().trim().min(2, 'Enter their name.'),
  phone: z.string().trim().min(7, 'Enter their phone number.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  reason: z.string().trim().max(1500).optional().nullable(),
  isMember: z.boolean().default(true),
  whatsappOptIn: z.boolean().default(true),
  durationMinutes: z.number().int().min(15).max(240).optional(),
  force: z.boolean().default(false),
});

appointmentsRouter.post(
  '/',
  handle(async (req, res) => {
    const { force, ...data } = parse(ownerBookingSchema, req.body);
    const phone = normalizePhone(data.phone);
    if (!phone) throw new HttpError(400, 'Some fields need attention.', { phone: 'Enter a valid phone number.' });
    const b = await createOwnerBooking({ ...data, phone }, force);
    res.status(201).json({ booking: view(b) });
  }),
);
