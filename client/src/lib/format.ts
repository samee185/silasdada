/** Everything is shown in Lagos time, whatever the visitor's phone is set to. */
export const TZ = 'Africa/Lagos';

const f = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts });
const time = f({ hour: 'numeric', minute: '2-digit', hour12: true });
const longDay = f({ weekday: 'long', day: 'numeric', month: 'long' });
const longDayYear = f({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDay = f({ weekday: 'short', day: 'numeric', month: 'short' });

export const fmtTime = (iso: string | Date) => time.format(new Date(iso)).replace(' ', ' ').toUpperCase();
export const fmtDay = (iso: string | Date) => longDay.format(new Date(iso));
export const fmtDayYear = (iso: string | Date) => longDayYear.format(new Date(iso));
export const fmtShort = (iso: string | Date) => shortDay.format(new Date(iso));
export const fmtWhen = (iso: string | Date) => `${fmtDay(iso)} · ${fmtTime(iso)}`;

/** "2026-11-10" (a calendar date) → readable, without timezone drift. */
export const fmtDate = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(`${date}T00:00:00Z`));

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** 0 = Monday … 6 = Sunday */
export const mondayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
export const todayLagos = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export const modeLabel = (m: string) => (m === 'WHATSAPP' ? 'WhatsApp call' : m === 'BOTH' ? 'In person or WhatsApp' : 'In person');

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Waiting for approval',
  CONFIRMED: 'Confirmed',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  NEEDS_RESCHEDULE: 'Asked to reschedule',
  COMPLETED: 'Completed',
  EXPIRED: 'Expired',
};
