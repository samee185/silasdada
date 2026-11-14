import { DateTime } from 'luxon';
import type { Booking, SiteProfile } from '@prisma/client';
import { env } from '../env';
import { TZ } from './slots';

/** Every message the app sends. The same words go out by email and on WhatsApp. */
export type Template =
  | 'BOOKED'
  | 'REQUESTED'
  | 'APPROVED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'CANCELLED_BY_YOU'
  | 'RESCHEDULE_REQUEST'
  | 'RESCHEDULED'
  | 'EXPIRED'
  | 'REMINDER_24H'
  | 'REMINDER_1H'
  | 'PASTOR_NEW'
  | 'PASTOR_CANCELLED';

export const PASTOR_TEMPLATES: Template[] = ['PASTOR_NEW', 'PASTOR_CANCELLED'];
export const CALENDAR_TEMPLATES: Template[] = ['BOOKED', 'APPROVED', 'RESCHEDULED'];

export const whenText = (d: Date) => DateTime.fromJSDate(d).setZone(TZ).toFormat("cccc, d LLLL yyyy 'at' h:mm a");
export const manageUrl = (b: Pick<Booking, 'manageToken'>) => `${env.APP_URL}/booking/${b.manageToken}`;

function placeText(site: SiteProfile) {
  const addr = site.meetingAddress ? `In person at ${site.meetingAddress.replace(/\n/g, ', ')}.` : 'In person.';
  return site.mapsUrl ? `${addr} Map: ${site.mapsUrl}` : addr;
}

export type Rendered = { subject: string; lines: string[]; cta?: { label: string; url: string } };

/** Builds the words for one message. Booking reasons are never included. */
export function render(t: Template, b: Booking, site: SiteProfile): Rendered {
  const first = b.name.split(' ')[0];
  const when = whenText(b.startAt);
  const pastor = "Rev'd Dada";
  const place = b.mode === 'WHATSAPP' ? `${pastor} will call you on WhatsApp at ${b.phone}.` : placeText(site);
  const manage = { label: 'View or change your booking', url: manageUrl(b) };
  const note = b.statusNote ? [`Note from ${pastor}: ${b.statusNote}`] : [];

  switch (t) {
    case 'BOOKED':
      return { subject: `Confirmed: your meeting with ${pastor}, ${when}`, lines: [`Hello ${first},`, `Your meeting with ${site.displayName} is confirmed for ${when}.`, place, 'We will remind you before the meeting.'], cta: manage };
    case 'REQUESTED':
      return { subject: `Request received: ${when}`, lines: [`Hello ${first},`, `Thank you. Your request to meet ${site.displayName} on ${when} has been received.`, `${pastor} will confirm shortly, and you will get a message as soon as he does.`], cta: manage };
    case 'APPROVED':
      return { subject: `Confirmed: your meeting with ${pastor}, ${when}`, lines: [`Hello ${first},`, `Good news: ${pastor} has confirmed your meeting on ${when}.`, place, ...note], cta: manage };
    case 'DECLINED':
      return { subject: 'About your meeting request', lines: [`Hello ${first},`, `${pastor} is not able to meet at ${when}.`, ...note, 'You are welcome to pick another time.'], cta: { label: 'Pick another time', url: `${env.APP_URL}/book` } };
    case 'CANCELLED':
      return { subject: `Cancelled: your meeting on ${when}`, lines: [`Hello ${first},`, `Your meeting with ${pastor} on ${when} has been cancelled.`, ...note, 'You are welcome to book another time.'], cta: { label: 'Book another time', url: `${env.APP_URL}/book` } };
    case 'CANCELLED_BY_YOU':
      return { subject: `Cancelled: ${when}`, lines: [`Hello ${first},`, `As you asked, your meeting on ${when} has been cancelled.`], cta: { label: 'Book another time', url: `${env.APP_URL}/book` } };
    case 'RESCHEDULE_REQUEST':
      return { subject: 'Please pick a new time for your meeting', lines: [`Hello ${first},`, `${pastor}'s plans have changed and he can no longer meet at ${when}.`, ...note, 'Please pick a new time that suits you.'], cta: { label: 'Pick a new time', url: manageUrl(b) } };
    case 'RESCHEDULED':
      return { subject: `New time confirmed: ${when}`, lines: [`Hello ${first},`, `Your meeting with ${pastor} is now on ${when}.`, place], cta: manage };
    case 'EXPIRED':
      return { subject: 'About your meeting request', lines: [`Hello ${first},`, `${pastor} wasn't able to confirm your request for ${when} in time.`, 'Please pick another time.'], cta: { label: 'Pick another time', url: `${env.APP_URL}/book` } };
    case 'REMINDER_24H':
      return { subject: `Reminder: meeting with ${pastor} tomorrow`, lines: [`Hello ${first},`, `A reminder of your meeting with ${pastor} on ${when}.`, place], cta: manage };
    case 'REMINDER_1H':
      return { subject: `Starting in 1 hour: meeting with ${pastor}`, lines: [`Hello ${first},`, `Your meeting with ${pastor} starts in about an hour (${DateTime.fromJSDate(b.startAt).setZone(TZ).toFormat('h:mm a')}).`, place], cta: manage };
    case 'PASTOR_NEW':
      return { subject: `New booking: ${b.name}, ${when}`, lines: [`${b.name} booked ${when}.`, `${b.mode === 'WHATSAPP' ? 'WhatsApp call' : 'In person'} · ${b.phone} · ${b.email}`, b.status === 'PENDING' ? 'It is waiting for your approval.' : 'It was confirmed automatically.'], cta: { label: 'Open appointments', url: `${env.APP_URL}/admin/appointments` } };
    case 'PASTOR_CANCELLED':
      return { subject: `Cancelled by ${b.name}: ${when}`, lines: [`${b.name} cancelled their meeting on ${when}. The time is free again.`], cta: { label: 'Open appointments', url: `${env.APP_URL}/admin/appointments` } };
  }
}

export const toPlain = (r: Rendered) => [...r.lines, r.cta ? `${r.cta.label}: ${r.cta.url}` : ''].filter(Boolean).join('\n\n');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toHtml(r: Rendered, site: SiteProfile) {
  const body = r.lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#262a4f">${esc(l)}</p>`).join('');
  const button = r.cta
    ? `<p style="margin:24px 0 8px"><a href="${esc(r.cta.url)}" style="display:inline-block;background:#D62839;color:#ffffff;text-decoration:none;font-weight:600;padding:13px 24px;border-radius:999px">${esc(r.cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f6f6fb;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6fb;padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:#10134A;padding:22px 28px;color:#ffffff;font-family:Georgia,serif;font-size:20px">${esc(site.displayName)}<div style="font-family:Arial,sans-serif;font-size:12px;color:#CDD0EE;margin-top:4px">${esc(site.titleLine)}</div></td></tr>
<tr><td style="padding:28px">${body}${button}</td></tr>
<tr><td style="padding:16px 28px;background:#f7f7fc;font-size:12px;color:#73768f">Sent from ${esc(env.APP_URL.replace(/^https?:\/\//, ''))}. Please don't reply with private details; ${esc(site.displayName)} reads your booking note in his dashboard.</td></tr>
</table></td></tr></table></body></html>`;
}

/** .ics invite so the meeting lands in the person's phone calendar. */
export function toIcs(b: Booking, site: SiteProfile) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const location = b.mode === 'WHATSAPP' ? 'WhatsApp call' : (site.meetingAddress ?? '').replace(/\n/g, ', ');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//silasdada.com.ng//Appointments//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${b.id}@silasdada.com.ng`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(b.startAt)}`,
    `DTEND:${fmt(b.endAt)}`,
    `SUMMARY:Meeting with ${site.displayName}`,
    `LOCATION:${location}`,
    `DESCRIPTION:Manage your booking: ${manageUrl(b)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
