import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { PublicBooking } from '../../api/types';
import { Backdrop } from '../../components/Backdrop';
import { TextArea, TextField } from '../../components/Field';
import { SlotPicker, type ModeFilter, type Picked } from '../../components/SlotPicker';
import { useSite } from '../../hooks/useSite';
import { fmtDate, fmtTime, modeLabel } from '../../lib/format';

type Mode = 'IN_PERSON' | 'WHATSAPP';

export function BookHero({ title, step }: { title: string; step?: number }) {
  const { site } = useSite();
  return (
    <section className="page-hero">
      <Backdrop stars={10} rays={{ x: '85%', y: '20%', size: 1300 }} beam={false} />
      <div className="page-hero-inner">
        <div>
          <p className="eyebrow on-dark rise">Book a meeting</p>
          <h1 className="rise d1">{title}</h1>
          <div className="who-row rise d2">
            <span className="av">
              {site?.portraitUrl && <img src={site.portraitUrl} alt="" />}
              <span className="online pulse" />
            </span>
            In person or WhatsApp call · confirmed instantly
          </div>
        </div>
        {step !== undefined && (
          <ol className="stepper" aria-label="Steps">
            {['Time', 'Details', 'Done'].map((s, i) => (
              <li key={s} className={i <= step ? 'on' : ''} aria-current={i === step ? 'step' : undefined}>
                {i + 1} · {s}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export function placeText(mode: Mode, address: string | null | undefined) {
  return mode === 'WHATSAPP' ? "WhatsApp call · Rev'd Dada will call your WhatsApp number" : `In person${address ? ` · ${address}` : ''}`;
}

export function BookPage() {
  const { site } = useSite();
  const [step, setStep] = useState(0);
  const [filter, setFilter] = useState<ModeFilter>('ANY');
  const [picked, setPicked] = useState<Picked>(null);
  const [mode, setMode] = useState<Mode>('IN_PERSON');
  const [form, setForm] = useState({ name: '', phone: '', email: '', reason: '', isMember: true, whatsappOptIn: true, website: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<PublicBooking | null>(null);

  function choose(p: Picked) {
    setPicked(p);
    if (p) setMode(p.slot.mode === 'BOTH' ? (filter !== 'ANY' ? filter : mode) : (p.slot.mode as Mode));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ booking: PublicBooking; manageToken: string }>('/api/public/bookings', {
        ...form,
        start: picked.slot.start,
        mode,
      });
      setDone(r.booking);
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, 'Could not book. Please try again.');
      setError(apiErr);
      if (apiErr.status === 409) {
        setPicked(null);
        setStep(0);
      }
    } finally {
      setBusy(false);
    }
  }

  const set = (k: 'name' | 'phone' | 'email' | 'reason' | 'website') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <BookHero title="Find a time with Rev'd Dada" step={step} />
      <div className="book-wrap">
        <div className="book-card rise d2">
          {step === 0 && (
            <>
              {error?.status === 409 && <div className="alert alert-error" style={{ margin: 20 }}>{error.message}</div>}
              <SlotPicker value={picked} onChange={choose} filter={filter} onFilter={setFilter} />
              <div className="picked-bar">
                <span className="muted">
                  Selected:{' '}
                  <strong style={{ color: 'var(--ink)' }}>{picked ? `${fmtDate(picked.date)} · ${fmtTime(picked.slot.start)}` : 'no time chosen yet'}</strong>
                </span>
                <button type="button" className="btn btn-accent shine" disabled={!picked} onClick={() => { setStep(1); setError(null); }}>
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 1 && picked && (
            <div className="details">
              <form onSubmit={submit} noValidate>
                <h2 style={{ fontSize: 26 }}>Your details</h2>
                {error && error.status !== 409 && !Object.keys(error.fields).length && <div className="alert alert-error">{error.message}</div>}
                {picked.slot.mode === 'BOTH' && (
                  <div className="field">
                    How would you like to meet?
                    <div className="segmented" role="radiogroup" style={{ alignSelf: 'flex-start' }}>
                      {(['IN_PERSON', 'WHATSAPP'] as Mode[]).map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={mode === m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                          {modeLabel(m)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="form-grid">
                  <TextField label="Full name" autoComplete="name" required value={form.name} onChange={set('name')} error={error?.fields.name} />
                  <TextField label="WhatsApp number" type="tel" autoComplete="tel" placeholder="0803 123 4567" required value={form.phone} onChange={set('phone')} error={error?.fields.phone} hint={mode === 'WHATSAPP' ? 'Rev\'d Dada will call you on this number.' : undefined} />
                  <TextField className="span-all" label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={error?.fields.email} />
                  <TextArea className="span-all" label="What would you like to talk about?" rows={4} placeholder="A sentence or two is enough." value={form.reason} onChange={set('reason')} error={error?.fields.reason} hint="Confidential. Only Rev'd Dada sees this, and it is never sent by email or WhatsApp." />
                </div>
                <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
                  <legend style={{ marginBottom: 8 }}>Are you a member of New Covenant Church?</legend>
                  <div className="radio-row">
                    <label><input type="radio" name="member" checked={form.isMember} onChange={() => setForm({ ...form, isMember: true })} /> Yes</label>
                    <label><input type="radio" name="member" checked={!form.isMember} onChange={() => setForm({ ...form, isMember: false })} /> Not yet / visiting</label>
                  </div>
                </fieldset>
                <label className="check-row">
                  <input type="checkbox" checked={form.whatsappOptIn} onChange={(e) => setForm({ ...form, whatsappOptIn: e.target.checked })} />
                  Send my appointment updates on WhatsApp too
                </label>
                <div className="honeypot" aria-hidden="true">
                  <label>Leave this empty<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
                </div>
                <p className="privacy">
                  <strong>Your privacy.</strong> We use your name, WhatsApp number and email only to confirm your meeting and send reminders. What you write about your reason is seen only by Rev'd Dada and is deleted 90 days after your meeting.
                </p>
              </form>
              <aside>
                <div className="summary-card pop">
                  <small>Your meeting</small>
                  <div className="d">{fmtDate(picked.date)}</div>
                  <div className="t">{fmtTime(picked.slot.start)}</div>
                  <div className="p">{placeText(mode, site?.meetingAddress)}</div>
                </div>
                <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>Reminders come 24 hours and 1 hour before.</p>
                <button type="button" className="btn btn-accent btn-lg shine" disabled={busy} onClick={(e) => submit(e as unknown as FormEvent)}>
                  {busy && <span className="spinner" />} Confirm booking
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Change time</button>
              </aside>
            </div>
          )}

          {step === 2 && done && (
            <div className="success">
              <div className="tick">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
              <h2 className="rise d1">{done.status === 'PENDING' ? 'Request sent' : "You're booked"}</h2>
              <p className="rise d2">
                {fmtDate(picked!.date)} at {fmtTime(done.startAt)}.{' '}
                {done.status === 'PENDING'
                  ? "Rev'd Dada will confirm shortly. You'll get an email the moment he does."
                  : 'A confirmation is on its way to your email, with a calendar invite.'}
              </p>
              <div className="rise d3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link className="btn btn-dark" to="/">Back to the home page</Link>
                <button type="button" className="btn btn-ghost" onClick={() => { setDone(null); setPicked(null); setStep(0); }}>Book another time</button>
              </div>
              <p className="muted" style={{ fontSize: 14 }}>Need to cancel or change it? Use the link in your email.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
