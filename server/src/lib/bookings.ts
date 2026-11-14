import crypto from 'crypto';
import { DateTime } from 'luxon';
import { Prisma, type Booking, type MeetingMode } from '@prisma/client';
import { prisma } from '../db';
import { HttpError } from './http';
import { cancelPending, processOutbox, queue, queueReminders, sendSoon } from './outbox';
import { computeDay, lagosDate, loadContext, lockDay, TZ } from './slots';

export type BookingInput = {
  start: string; // ISO
  mode: Exclude<MeetingMode, 'BOTH'>;
  name: string;
  phone: string;
  email: string;
  reason?: string | null;
  isMember: boolean;
  whatsappOptIn: boolean;
};

const token = () => crypto.randomBytes(24).toString('base64url');

/** Is this exact start time (and meeting type) still offered for that day? */
async function assertSlotFree(tx: Prisma.TransactionClient, start: Date, mode: MeetingMode, excludeId?: string) {
  const date = lagosDate(start);
  await lockDay(tx, date);
  const ctx = await loadContext(date, date, tx, excludeId);
  const day = computeDay(date, ctx);
  const slot = day.slots.find((s) => new Date(s.start).getTime() === start.getTime());
  if (!slot || (slot.mode !== 'BOTH' && slot.mode !== mode)) {
    throw new HttpError(409, 'Sorry, that time was just taken or is no longer available. Please pick another.');
  }
  return { slot, settings: ctx.settings };
}

function uniqueClash(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/** A visitor books from the public page. */
export async function createPublicBooking(input: BookingInput) {
  const start = new Date(input.start);
  try {
    const booking = await prisma.$transaction(async (tx) => {
      const { slot, settings } = await assertSlotFree(tx, start, input.mode);
      const auto = settings.confirmMode === 'AUTO';
      const { start: _start, ...fields } = input; // `start` is stored as startAt below
      const b = await tx.booking.create({
        data: {
          ...fields,
          reason: input.reason || null,
          startAt: start,
          endAt: new Date(slot.end),
          slotKey: start,
          status: auto ? 'CONFIRMED' : 'PENDING',
          holdExpiresAt: auto ? null : earliest(new Date(Date.now() + settings.holdHours * 3600_000), start),
          manageToken: token(),
        },
      });
      await queue(tx, b, auto ? 'BOOKED' : 'REQUESTED');
      await queue(tx, b, 'PASTOR_NEW');
      if (auto) await queueReminders(tx, b);
      return b;
    });
    sendSoon(booking.id);
    return booking;
  } catch (e) {
    if (uniqueClash(e)) throw new HttpError(409, 'Sorry, that time was just taken. Please pick another.');
    throw e;
  }
}

const earliest = (a: Date, b: Date) => (a < b ? a : b);

/** The pastor adds a booking himself (someone who phoned). Can overlap only when he confirms it. */
export async function createOwnerBooking(input: BookingInput & { durationMinutes?: number }, force: boolean) {
  const start = new Date(input.start);
  const settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
  const end = new Date(start.getTime() + (input.durationMinutes ?? settings.slotMinutes) * 60_000);
  try {
    const booking = await prisma.$transaction(async (tx) => {
      await lockDay(tx, lagosDate(start));
      const overlapping = await tx.booking.findMany({
        where: { status: { in: ['CONFIRMED', 'PENDING'] }, startAt: { lt: end }, endAt: { gt: start } },
        select: { id: true, name: true, startAt: true },
      });
      if (overlapping.length && !force) {
        throw new HttpError(409, `This overlaps ${overlapping.map((o) => o.name).join(', ')}. Add it anyway?`, { clash: 'overlap' });
      }
      const b = await tx.booking.create({
        data: {
          name: input.name,
          phone: input.phone,
          email: input.email,
          mode: input.mode,
          reason: input.reason || null,
          isMember: input.isMember,
          whatsappOptIn: input.whatsappOptIn,
          startAt: start,
          endAt: end,
          slotKey: overlapping.length ? null : start, // a deliberate double booking doesn't claim the slot key
          status: 'CONFIRMED',
          manageToken: token(),
        },
      });
      await queue(tx, b, 'BOOKED');
      await queueReminders(tx, b);
      return b;
    });
    sendSoon(booking.id);
    return booking;
  } catch (e) {
    if (uniqueClash(e)) throw new HttpError(409, 'Another booking starts at exactly this time.', { clash: 'overlap' });
    throw e;
  }
}

/** Moves a booking to a new free time (visitor via their link, or after a reschedule request). */
export async function moveBooking(booking: Booking, newStart: string, mode: Exclude<MeetingMode, 'BOTH'>) {
  if (!['CONFIRMED', 'PENDING', 'NEEDS_RESCHEDULE'].includes(booking.status)) {
    throw new HttpError(400, 'This booking can no longer be changed. Please make a new booking.');
  }
  const start = new Date(newStart);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const { slot, settings } = await assertSlotFree(tx, start, mode, booking.id);
      await cancelPending(tx, booking.id);
      const auto = settings.confirmMode === 'AUTO' || booking.status === 'CONFIRMED' || booking.status === 'NEEDS_RESCHEDULE';
      const b = await tx.booking.update({
        where: { id: booking.id },
        data: {
          startAt: start,
          endAt: new Date(slot.end),
          slotKey: start,
          mode,
          status: auto ? 'CONFIRMED' : 'PENDING',
          holdExpiresAt: auto ? null : earliest(new Date(Date.now() + settings.holdHours * 3600_000), start),
          statusNote: null,
        },
      });
      await queue(tx, b, auto ? 'RESCHEDULED' : 'REQUESTED');
      await queue(tx, b, 'PASTOR_NEW');
      if (auto) await queueReminders(tx, b);
      return b;
    });
    sendSoon(updated.id);
    return updated;
  } catch (e) {
    if (uniqueClash(e)) throw new HttpError(409, 'Sorry, that time was just taken. Please pick another.');
    throw e;
  }
}

export type OwnerAction = 'approve' | 'decline' | 'cancel' | 'reschedule' | 'complete';

/** The pastor's buttons on a booking. */
export async function ownerAction(id: string, action: OwnerAction, note?: string | null) {
  const b = await prisma.booking.findUnique({ where: { id } });
  if (!b) throw new HttpError(404, 'Booking not found.');
  const allowed: Record<OwnerAction, string[]> = {
    approve: ['PENDING'],
    decline: ['PENDING'],
    cancel: ['PENDING', 'CONFIRMED', 'NEEDS_RESCHEDULE'],
    reschedule: ['PENDING', 'CONFIRMED'],
    complete: ['CONFIRMED'],
  };
  if (!allowed[action].includes(b.status)) throw new HttpError(400, 'That action no longer applies to this booking.');

  const updated = await prisma.$transaction(async (tx) => {
    switch (action) {
      case 'approve': {
        const u = await tx.booking.update({ where: { id }, data: { status: 'CONFIRMED', holdExpiresAt: null, statusNote: note ?? null } });
        await queue(tx, u, 'APPROVED');
        await queueReminders(tx, u);
        return u;
      }
      case 'decline':
      case 'cancel':
      case 'reschedule': {
        await cancelPending(tx, id);
        const status = action === 'decline' ? 'DECLINED' : action === 'cancel' ? 'CANCELLED' : 'NEEDS_RESCHEDULE';
        const u = await tx.booking.update({ where: { id }, data: { status, slotKey: null, holdExpiresAt: null, statusNote: note ?? null } });
        await queue(tx, u, action === 'decline' ? 'DECLINED' : action === 'cancel' ? 'CANCELLED' : 'RESCHEDULE_REQUEST');
        return u;
      }
      case 'complete':
        return tx.booking.update({ where: { id }, data: { status: 'COMPLETED' } });
    }
  });
  sendSoon(id);
  return updated;
}

/** Visitor cancels from their link. */
export async function visitorCancel(b: Booking) {
  if (!['PENDING', 'CONFIRMED', 'NEEDS_RESCHEDULE'].includes(b.status)) throw new HttpError(400, 'This booking is already closed.');
  const u = await prisma.$transaction(async (tx) => {
    await cancelPending(tx, b.id);
    const u = await tx.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED', slotKey: null, holdExpiresAt: null } });
    await queue(tx, u, 'CANCELLED_BY_YOU');
    await queue(tx, u, 'PASTOR_CANCELLED');
    return u;
  });
  sendSoon(b.id);
  return u;
}

/**
 * Housekeeping, run by the cron endpoint and by a 5-minute timer inside the app:
 * expire unanswered requests, mark past meetings completed, clear old booking reasons,
 * retire WhatsApp reminders whose meeting has passed, and send due emails.
 */
export async function runMaintenance() {
  const now = new Date();
  const expired = await prisma.booking.findMany({ where: { status: 'PENDING', holdExpiresAt: { lte: now } } });
  for (const b of expired) {
    await prisma.$transaction(async (tx) => {
      await cancelPending(tx, b.id);
      const u = await tx.booking.update({ where: { id: b.id }, data: { status: 'EXPIRED', slotKey: null } });
      await queue(tx, u, 'EXPIRED');
    });
  }
  const completed = await prisma.booking.updateMany({
    where: { status: 'CONFIRMED', endAt: { lte: new Date(now.getTime() - 3600_000) } },
    data: { status: 'COMPLETED' },
  });
  const settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
  const cutoff = DateTime.now().setZone(TZ).minus({ days: settings.reasonRetentionDays }).toJSDate();
  const cleared = await prisma.booking.updateMany({
    where: { endAt: { lte: cutoff }, reason: { not: null } },
    data: { reason: null, reasonClearedAt: now },
  });
  await prisma.notification.updateMany({
    where: { channel: 'WHATSAPP_MANUAL', status: 'QUEUED', booking: { startAt: { lte: now } } },
    data: { status: 'CANCELLED' },
  });
  // scheduled messages go live once their time arrives
  const published = await prisma.post.updateMany({ where: { status: 'SCHEDULED', publishedAt: { lte: now } }, data: { status: 'PUBLISHED' } });
  const mail = await processOutbox();
  return { published: published.count, expired: expired.length, completed: completed.count, reasonsCleared: cleared.count, ...mail };
}
