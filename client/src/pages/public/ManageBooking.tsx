import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { PublicBooking } from '../../api/types';
import { SlotPicker, type ModeFilter, type Picked } from '../../components/SlotPicker';
import { fmtDayYear, fmtTime, modeLabel, STATUS_LABEL } from '../../lib/format';
import { BookHero, placeText } from './Book';

type Data = { booking: PublicBooking; meetingAddress: string | null; mapsUrl: string | null };

/** The page behind the link in every email: view, cancel or move a booking. */
export function ManageBookingPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [filter, setFilter] = useState<ModeFilter>('ANY');
  const [picked, setPicked] = useState<Picked>(null);
  const [mode, setMode] = useState<'IN_PERSON' | 'WHATSAPP'>('IN_PERSON');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Data>(`/api/public/bookings/${token}`)
      .then((d) => {
        setData(d);
        setMode(d.booking.mode);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  /** A time offered both ways keeps their current choice (or the filter); otherwise it is whatever the time offers. */
  function choose(p: Picked) {
    setPicked(p);
    if (!p || !data) return;
    if (p.slot.mode !== 'BOTH') setMode(p.slot.mode);
    else setMode(filter !== 'ANY' ? filter : data.booking.mode);
  }

  async function cancel() {
    if (!window.confirm('Cancel this meeting? The time will be offered to someone else.')) return;
    setBusy(true);
    try {
      const r = await api.post<{ booking: PublicBooking }>(`/api/public/bookings/${token}/cancel`);
      setData((d) => (d ? { ...d, booking: r.booking } : d));
      setNotice('Your meeting has been cancelled.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  }

  async function move() {
    if (!picked || !data) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ booking: PublicBooking }>(`/api/public/bookings/${token}/move`, { start: picked.slot.start, mode });
      setData({ ...data, booking: r.booking });
      setMoving(false);
      setPicked(null);
      setNotice('Your new time is confirmed. Check your email for the details.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change the time.');
    } finally {
      setBusy(false);
    }
  }

  const b = data?.booking;
  const open = b && ['CONFIRMED', 'PENDING', 'NEEDS_RESCHEDULE'].includes(b.status);
  const needsNew = b?.status === 'NEEDS_RESCHEDULE';

  return (
    <>
      <BookHero title={needsNew ? 'Please pick a new time' : 'Your booking'} />
      <div className="book-wrap">
        <div className="book-card rise d2">
          {error && <div className="alert alert-error" style={{ margin: 20 }}>{error}</div>}
          {notice && <div className="alert alert-success" style={{ margin: 20 }}>{notice}</div>}
          {!data && !error && <div className="page-loading" style={{ minHeight: 240 }}><span className="spinner" /></div>}
          {b && !(moving || needsNew) && (
            <div className="details">
              <div style={{ flex: '1 1 520px', padding: 'clamp(22px, 4vw, 44px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span className={`pill ${b.status === 'CONFIRMED' ? 'pill-success' : b.status === 'PENDING' ? 'pill-accent' : 'pill-muted'}`} style={{ alignSelf: 'flex-start' }}>
                  {STATUS_LABEL[b.status]}
                </span>
                <h2 style={{ fontSize: 30 }}>Hello {b.name.split(' ')[0]}</h2>
                <p className="muted" style={{ fontSize: 16 }}>
                  {open ? 'Here are the details of your meeting with Rev\'d Silas O. Dada.' : 'This booking is closed. You are welcome to book another time.'}
                </p>
                {b.statusNote && <div className="alert alert-info">Note from Rev'd Dada: {b.statusNote}</div>}
                {open ? (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                    <button type="button" className="btn btn-dark" onClick={() => setMoving(true)}>Change the time</button>
                    <button type="button" className="btn btn-link" disabled={busy} onClick={cancel}>Cancel meeting</button>
                  </div>
                ) : (
                  <Link className="btn btn-accent" to="/book" style={{ alignSelf: 'flex-start' }}>Book another time</Link>
                )}
              </div>
              <aside>
                <div className="summary-card">
                  <small>{STATUS_LABEL[b.status]}</small>
                  <div className="d">{fmtDayYear(b.startAt)}</div>
                  <div className="t">{fmtTime(b.startAt)}</div>
                  <div className="p">{placeText(b.mode, data?.meetingAddress)}</div>
                  {b.mode === 'IN_PERSON' && data?.mapsUrl && (
                    <a href={data.mapsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-glow)', fontSize: 14, display: 'inline-block', marginTop: 10 }}>Open in Maps</a>
                  )}
                </div>
              </aside>
            </div>
          )}
          {b && (moving || needsNew) && (
            <>
              {needsNew && b.statusNote && <div className="alert alert-info" style={{ margin: 20 }}>Note from Rev'd Dada: {b.statusNote}</div>}
              <SlotPicker value={picked} onChange={choose} filter={filter} onFilter={setFilter} />
              {picked?.slot.mode === 'BOTH' && (
                <div className="field" style={{ padding: '0 20px 12px' }}>
                  How would you like to meet?
                  <div className="segmented" role="radiogroup" style={{ alignSelf: 'flex-start' }}>
                    {(['IN_PERSON', 'WHATSAPP'] as const).map((m) => (
                      <button key={m} type="button" role="radio" aria-checked={mode === m} aria-pressed={mode === m} onClick={() => setMode(m)}>
                        {modeLabel(m)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="picked-bar">
                {!needsNew ? <button type="button" className="btn btn-ghost" onClick={() => setMoving(false)}>Keep my current time</button> : <span />}
                <button type="button" className="btn btn-accent shine" disabled={!picked || busy} onClick={move}>
                  {busy && <span className="spinner" />} {picked ? `Move to ${fmtTime(picked.slot.start)}` : 'Pick a new time'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
