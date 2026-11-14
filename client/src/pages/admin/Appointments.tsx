import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import type { Appointment, WhatsAppItem } from '../../api/types';
import { SelectField, TextArea, TextField } from '../../components/Field';
import { fmtDay, fmtShort, fmtTime, modeLabel, STATUS_LABEL, todayLagos } from '../../lib/format';

type View = 'upcoming' | 'requests' | 'reschedule' | 'past';
type Action = 'approve' | 'decline' | 'cancel' | 'reschedule' | 'complete';

const ACTION_TEXT: Record<Action, { title: string; button: string; note: string | null; danger?: boolean }> = {
  approve: { title: 'Approve this booking?', button: 'Approve', note: 'Optional note to include in the confirmation' },
  decline: { title: 'Decline this request?', button: 'Decline', note: 'Optional note (e.g. suggest another day)', danger: true },
  cancel: { title: 'Cancel this meeting?', button: 'Cancel meeting', note: 'Optional note to include in the cancellation', danger: true },
  reschedule: { title: 'Ask them to pick a new time?', button: 'Send reschedule link', note: 'Optional note (e.g. "I have to travel that day")' },
  complete: { title: 'Mark as completed?', button: 'Mark completed', note: null },
};

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pop" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="toast" role="status">{text}</div>;
}

/** One booking row with its buttons. Used here and on the dashboard home. */
export function AppointmentCard({ a, onAction }: { a: Appointment; onAction: (a: Appointment, action: Action) => void }) {
  const [showReason, setShowReason] = useState(false);
  const live = a.status === 'CONFIRMED' || a.status === 'PENDING';
  return (
    <div className={`appt${a.status === 'PENDING' ? ' pending' : ''}`}>
      <div className="when">
        <strong>{fmtTime(a.startAt)}</strong>
        <span>{fmtShort(a.startAt)}</span>
      </div>
      <div className="who">
        <strong>{a.name}</strong>
        <span className="meta">
          {modeLabel(a.mode)} · {a.phone} · {a.isMember ? 'Member' : 'Visitor'}
        </span>
        {a.reason ? (
          showReason ? (
            <p className="reason">“{a.reason}” <small>· only you can see this</small></p>
          ) : (
            <button type="button" className="add-link" style={{ display: 'block', marginTop: 6 }} onClick={() => setShowReason(true)}>Show what they wrote</button>
          )
        ) : a.reasonCleared ? (
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Reason cleared for privacy</p>
        ) : null}
        {a.statusNote && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Your note: {a.statusNote}</p>}
      </div>
      <div className="actions">
        <span className={`pill ${a.status === 'CONFIRMED' ? 'pill-success' : a.status === 'PENDING' ? 'pill-accent' : 'pill-muted'}`}>{STATUS_LABEL[a.status]}</span>
        {live && a.mode === 'WHATSAPP' && (
          <a className="btn btn-wa btn-sm" href={a.whatsappChat} target="_blank" rel="noreferrer">Call on WhatsApp</a>
        )}
        {a.status === 'PENDING' && (
          <>
            <button type="button" className="btn btn-dark btn-sm" onClick={() => onAction(a, 'approve')}>Approve</button>
            <button type="button" className="btn-link" onClick={() => onAction(a, 'decline')}>Decline</button>
          </>
        )}
        {a.status === 'CONFIRMED' && new Date(a.endAt) < new Date() && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAction(a, 'complete')}>Mark completed</button>
        )}
        {live && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAction(a, 'reschedule')}>Reschedule</button>
            <button type="button" className="btn-link" onClick={() => onAction(a, 'cancel')}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

/** The confirm-with-note dialog behind every booking button. */
export function useBookingActions(after: (msg: string) => void) {
  const [pending, setPending] = useState<{ a: Appointment; action: Action } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (a: Appointment, action: Action) => {
    setPending({ a, action });
    setNote('');
    setError(null);
  };
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      await api.post(`/api/appointments/${pending.a.id}/${pending.action}`, { note });
      const done: Record<Action, string> = {
        approve: `${pending.a.name} is confirmed. They've been emailed.`,
        decline: `Request declined. ${pending.a.name} has been emailed.`,
        cancel: `Meeting cancelled. ${pending.a.name} has been emailed.`,
        reschedule: `${pending.a.name} has been sent a link to pick a new time.`,
        complete: 'Marked as completed.',
      };
      after(done[pending.action]);
      setPending(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const dialog = pending ? (
    <Modal title={ACTION_TEXT[pending.action].title} onClose={() => setPending(null)}>
      <p className="muted">
        {pending.a.name} · {fmtDay(pending.a.startAt)} at {fmtTime(pending.a.startAt)}
      </p>
      {ACTION_TEXT[pending.action].note && (
        <TextArea label={ACTION_TEXT[pending.action].note!} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      )}
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>Back</button>
        <button type="button" className={`btn ${ACTION_TEXT[pending.action].danger ? 'btn-accent' : 'btn-dark'}`} disabled={busy} onClick={confirm}>
          {busy && <span className="spinner" />} {ACTION_TEXT[pending.action].button}
        </button>
      </div>
    </Modal>
  ) : null;

  return { open, dialog };
}

/** WhatsApp messages waiting to be sent by hand: tap, WhatsApp opens with the text, tick it off. */
export function WhatsAppList({ items, onChange }: { items: WhatsAppItem[]; onChange: () => void }) {
  const LABEL: Record<string, string> = {
    BOOKED: 'Confirmation', REQUESTED: 'Request received', APPROVED: 'Confirmation', DECLINED: 'Declined', CANCELLED: 'Cancellation',
    CANCELLED_BY_YOU: 'Cancellation', RESCHEDULE_REQUEST: 'Reschedule link', RESCHEDULED: 'New time', EXPIRED: 'Expired',
    REMINDER_24H: 'Reminder: tomorrow', REMINDER_1H: 'Reminder: in 1 hour',
  };
  if (!items.length) return <p className="muted" style={{ fontSize: 14 }}>Nothing to send right now. Emails go out automatically.</p>;
  return (
    <div>
      {items.map((m) => (
        <div className="wa-row" key={m.id}>
          <span style={{ flex: '1 1 180px' }}>
            <strong style={{ display: 'block' }}>{m.name}</strong>
            <span className="muted" style={{ fontSize: 13 }}>{LABEL[m.template] ?? m.template} · {fmtShort(m.startAt)}, {fmtTime(m.startAt)}</span>
          </span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a className="btn btn-wa btn-sm" href={m.link} target="_blank" rel="noreferrer" onClick={() => setTimeout(async () => { await api.post(`/api/appointments/whatsapp/${m.id}/sent`); onChange(); }, 800)}>
              Send on WhatsApp
            </a>
            <button type="button" className="btn-link" style={{ color: 'var(--muted)' }} onClick={async () => { await api.post(`/api/appointments/whatsapp/${m.id}/skip`); onChange(); }}>Skip</button>
          </span>
        </div>
      ))}
    </div>
  );
}

function AddBooking({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState({ date: todayLagos(), time: '10:00', mode: 'IN_PERSON', name: '', phone: '', email: '', reason: '', duration: 45 });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOverlap, setConfirmOverlap] = useState(false);

  async function save(e?: FormEvent, force = false) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const start = new Date(`${f.date}T${f.time}:00+01:00`).toISOString(); // Lagos is UTC+1 all year
      await api.post('/api/appointments', {
        start, mode: f.mode, name: f.name, phone: f.phone, email: f.email, reason: f.reason, durationMinutes: Number(f.duration), force,
      });
      onSaved(`Booked ${f.name}. They've been emailed a confirmation.`);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, 'Could not save.');
      setError(apiErr);
      setConfirmOverlap(apiErr.status === 409 && (apiErr.fields as Record<string, string>).clash === 'overlap');
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal title="Add a booking" onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="muted" style={{ fontSize: 14 }}>For someone who called or asked in person. They get the same emails and reminders.</p>
        <div className="form-grid">
          <TextField label="Date" type="date" required value={f.date} onChange={set('date')} />
          <TextField label="Time" type="time" required value={f.time} onChange={set('time')} />
          <SelectField label="Type" value={f.mode} onChange={set('mode')}>
            <option value="IN_PERSON">In person</option>
            <option value="WHATSAPP">WhatsApp call</option>
          </SelectField>
          <SelectField label="Length" value={f.duration} onChange={set('duration')}>
            {[30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
          </SelectField>
          <TextField className="span-all" label="Name" required value={f.name} onChange={set('name')} error={error?.fields.name} />
          <TextField label="Phone (WhatsApp)" type="tel" required value={f.phone} onChange={set('phone')} error={error?.fields.phone} />
          <TextField label="Email" type="email" required value={f.email} onChange={set('email')} error={error?.fields.email} />
          <TextArea className="span-all" label="Note (private)" rows={2} value={f.reason} onChange={set('reason')} />
        </div>
        {error && !error.fields.name && !error.fields.phone && !error.fields.email && <div className="alert alert-error">{error.message}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          {confirmOverlap ? (
            <button type="button" className="btn btn-accent" disabled={busy} onClick={() => save(undefined, true)}>Add anyway</button>
          ) : (
            <button className="btn btn-dark" disabled={busy}>{busy && <span className="spinner" />} Save booking</button>
          )}
        </div>
      </form>
    </Modal>
  );
}

export function AppointmentsPage() {
  const [view, setView] = useState<View>('upcoming');
  const [list, setList] = useState<Appointment[] | null>(null);
  const [wa, setWa] = useState<WhatsAppItem[]>([]);
  const [counts, setCounts] = useState({ pending: 0, reschedule: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [l, w, s] = await Promise.all([
      api.get<{ bookings: Appointment[] }>(`/api/appointments?view=${view}`),
      api.get<{ items: WhatsAppItem[] }>('/api/appointments/whatsapp'),
      api.get<{ pending: number; reschedule: number }>('/api/appointments/summary'),
    ]);
    setList(l.bookings);
    setWa(w.items);
    setCounts({ pending: s.pending, reschedule: s.reschedule });
  }, [view]);

  useEffect(() => {
    setList(null);
    void load();
  }, [load]);

  const after = (msg: string) => {
    setToast(msg);
    void load();
  };
  const { open, dialog } = useBookingActions(after);

  // group upcoming by day for easy scanning
  const groups = new Map<string, Appointment[]>();
  (list ?? []).forEach((a) => {
    const k = fmtDay(a.startAt);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Appointments</h1>
          <p>Only you can see this page.</p>
        </div>
        <button type="button" className="btn btn-dark" onClick={() => setAdding(true)}>+ Add a booking</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section style={{ flex: '2 1 520px', minWidth: 0 }}>
          <div className="tabs" role="tablist">
            {(
              [
                ['upcoming', 'Upcoming', 0],
                ['requests', 'Waiting for approval', counts.pending],
                ['reschedule', 'Asked to reschedule', counts.reschedule],
                ['past', 'Past', 0],
              ] as [View, string, number][]
            ).map(([v, label, n]) => (
              <button key={v} type="button" role="tab" className="chip" aria-selected={view === v} aria-pressed={view === v} onClick={() => setView(v)}>
                {label}
                {n > 0 && <span className="count">{n}</span>}
              </button>
            ))}
          </div>
          {!list ? (
            <div className="page-loading" style={{ minHeight: 200 }}><span className="spinner" /></div>
          ) : !list.length ? (
            <div className="card muted">
              {view === 'upcoming' ? 'No upcoming meetings yet. Share your booking link: silasdada.com.ng/book' : 'Nothing here.'}
            </div>
          ) : (
            [...groups.entries()].map(([day, items]) => (
              <div key={day} style={{ marginBottom: 22 }}>
                <p className="step-label" style={{ color: 'var(--muted)' }}>{day}</p>
                {items.map((a) => <AppointmentCard key={a.id} a={a} onAction={open} />)}
              </div>
            ))
          )}
        </section>
        <aside className="card" style={{ flex: '1 1 300px', minWidth: 0 }}>
          <h2 style={{ fontSize: 20, marginBottom: 4 }}>WhatsApp messages to send</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Tap a green button: WhatsApp opens with the message ready. It's ticked off automatically.</p>
          <WhatsAppList items={wa} onChange={load} />
        </aside>
      </div>
      {dialog}
      {adding && <AddBooking onClose={() => setAdding(false)} onSaved={(m) => { setAdding(false); after(m); }} />}
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </>
  );
}
