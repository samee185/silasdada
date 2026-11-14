import nodemailer, { type Transporter } from 'nodemailer';
import type { Booking, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { CALENDAR_TEMPLATES, PASTOR_TEMPLATES, render, toHtml, toIcs, toPlain, type Template } from './messages';
import { waLink } from './phone';

type Db = Prisma.TransactionClient | typeof prisma;

let transporter: Transporter | null = null;
function mailer() {
  if (!env.SMTP_HOST || !env.SMTP_USER) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

/** Sends one email straight away (used for password resets). Logs it instead when SMTP isn't set up. */
export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }) {
  const transport = mailer();
  if (!transport) {
    console.log(`[email not configured] To ${msg.to}: ${msg.subject}\n${msg.text}`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, ...msg });
}

const ownerEmail = async (db: Db) => (await db.user.findFirst({ where: { role: 'OWNER' }, orderBy: { createdAt: 'asc' } }))?.email ?? null;

/**
 * Puts a message in the outbox. Person-facing messages go by email, plus a WhatsApp
 * copy for the pastor's "to send" list when the person opted in. Pastor alerts are email only.
 * The dedupe key includes the meeting time, so a moved meeting gets fresh reminders.
 */
export async function queue(db: Db, booking: Booking, template: Template, when: Date = new Date()) {
  const key = `${booking.id}:${template}:${booking.startAt.toISOString()}`;
  if (PASTOR_TEMPLATES.includes(template)) {
    const to = await ownerEmail(db);
    if (!to) return;
    await db.notification.upsert({
      where: { dedupeKey: `${key}:EMAIL` },
      update: {},
      create: { bookingId: booking.id, channel: 'EMAIL', template, recipient: to, scheduledFor: when, dedupeKey: `${key}:EMAIL` },
    });
    return;
  }
  await db.notification.upsert({
    where: { dedupeKey: `${key}:EMAIL` },
    update: {},
    create: { bookingId: booking.id, channel: 'EMAIL', template, recipient: booking.email, scheduledFor: when, dedupeKey: `${key}:EMAIL` },
  });
  if (booking.whatsappOptIn) {
    await db.notification.upsert({
      where: { dedupeKey: `${key}:WA` },
      update: {},
      create: { bookingId: booking.id, channel: 'WHATSAPP_MANUAL', template, recipient: booking.phone, scheduledFor: when, dedupeKey: `${key}:WA` },
    });
  }
}

/** Reminder rule: 24 hours before (only if booked more than 24 hours ahead) and 1 hour before. */
export async function queueReminders(db: Db, booking: Booking) {
  const now = Date.now();
  const start = booking.startAt.getTime();
  if (start - now > 24 * 3600_000) await queue(db, booking, 'REMINDER_24H', new Date(start - 24 * 3600_000));
  if (start - now > 3600_000) await queue(db, booking, 'REMINDER_1H', new Date(start - 3600_000));
}

/** Drops unsent messages for a booking (when it is cancelled, moved or declined). */
export async function cancelPending(db: Db, bookingId: string, templates?: Template[]) {
  await db.notification.updateMany({
    where: { bookingId, status: 'QUEUED', ...(templates ? { template: { in: templates } } : {}) },
    data: { status: 'CANCELLED' },
  });
}

const BACKOFF_MIN = [5, 30, 120];

/** Sends due emails. Safe to run from several places at once: each row is claimed before sending. */
export async function processOutbox(opts: { ids?: string[]; limit?: number } = {}) {
  const now = new Date();
  const due = await prisma.notification.findMany({
    where: {
      channel: 'EMAIL',
      status: 'QUEUED',
      scheduledFor: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
    },
    orderBy: { scheduledFor: 'asc' },
    take: opts.limit ?? 50,
  });
  if (!due.length) return { sent: 0, failed: 0 };
  const site = await prisma.siteProfile.findUniqueOrThrow({ where: { id: 1 } });
  let sent = 0;
  let failed = 0;

  for (const n of due) {
    const claimed = await prisma.notification.updateMany({ where: { id: n.id, status: 'QUEUED' }, data: { status: 'SENDING' } });
    if (!claimed.count) continue;
    const booking = n.bookingId ? await prisma.booking.findUnique({ where: { id: n.bookingId } }) : null;
    if (!booking || (n.template.startsWith('REMINDER') && booking.status !== 'CONFIRMED')) {
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'CANCELLED' } });
      continue;
    }
    try {
      const r = render(n.template as Template, booking, site);
      const transport = mailer();
      if (!transport) {
        console.log(`[email not configured] To ${n.recipient}: ${r.subject}`);
      } else {
        await transport.sendMail({
          from: env.MAIL_FROM || env.SMTP_USER,
          to: n.recipient,
          subject: r.subject,
          text: toPlain(r),
          html: toHtml(r, site),
          attachments: CALENDAR_TEMPLATES.includes(n.template as Template)
            ? [{ filename: 'meeting.ics', content: toIcs(booking, site), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }]
            : undefined,
        });
      }
      await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, error: null } });
      sent++;
    } catch (e) {
      const attempts = n.attempts + 1;
      const giveUp = attempts > BACKOFF_MIN.length;
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          status: giveUp ? 'FAILED' : 'QUEUED',
          attempts,
          nextAttemptAt: giveUp ? null : new Date(Date.now() + BACKOFF_MIN[attempts - 1] * 60_000),
          error: e instanceof Error ? e.message.slice(0, 1000) : String(e),
        },
      });
      failed++;
    }
  }
  return { sent, failed };
}

/** Sends a booking's just-queued emails straight away (after the database commit). */
export function sendSoon(bookingId: string) {
  setImmediate(async () => {
    try {
      const ids = (
        await prisma.notification.findMany({ where: { bookingId, channel: 'EMAIL', status: 'QUEUED', scheduledFor: { lte: new Date() } }, select: { id: true } })
      ).map((n) => n.id);
      if (ids.length) await processOutbox({ ids });
    } catch (e) {
      console.error('Immediate send failed (cron will retry):', e);
    }
  });
}

/** The pastor's WhatsApp "to send" list: ready-made messages that open WhatsApp with the text filled in. */
export async function whatsappQueue() {
  const rows = await prisma.notification.findMany({
    where: { channel: 'WHATSAPP_MANUAL', status: 'QUEUED', scheduledFor: { lte: new Date() } },
    include: { booking: true },
    orderBy: { scheduledFor: 'asc' },
    take: 100,
  });
  const site = await prisma.siteProfile.findUniqueOrThrow({ where: { id: 1 } });
  return rows
    .filter((n) => n.booking)
    .map((n) => {
      const text = toPlain(render(n.template as Template, n.booking!, site));
      return {
        id: n.id,
        template: n.template,
        bookingId: n.bookingId,
        name: n.booking!.name,
        phone: n.recipient,
        startAt: n.booking!.startAt,
        text,
        link: waLink(n.recipient, text),
      };
    });
}
