import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { Summary } from '../../api/types';
import { useAuth } from '../../hooks/useAuth';
import { useSite } from '../../hooks/useSite';
import { fmtShort, fmtTime, TZ } from '../../lib/format';
import { DraftBox } from './AiDrafts';
import { AppointmentCard, Toast, useBookingActions, WhatsAppList } from './Appointments';

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function OverviewPage() {
  const { user } = useAuth();
  const { site } = useSite();
  const owner = user?.role === 'OWNER';
  const [s, setS] = useState<Summary | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (owner) setS(await api.get<Summary>('/api/appointments/summary'));
  }, [owner]);
  useEffect(() => {
    void load();
  }, [load]);
  const { open, dialog } = useBookingActions((msg) => {
    setToast(msg);
    void load();
  });

  if (!user) return null;
  const who = owner ? "Rev'd Dada" : user.name.split(' ')[0];
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date());
  const minsToNext = s?.next ? Math.round((new Date(s.next.startAt).getTime() - Date.now()) / 60000) : null;

  return (
    <>
      <div className="page-head rise">
        <div>
          <p className="muted" style={{ fontSize: 14 }}>{today}</p>
          <h1>{greeting()}, {who}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {owner && <Link className="btn btn-ghost btn-sm" to="/admin/schedule">Change today's hours</Link>}
          <a className="btn btn-dark btn-sm" href="/" target="_blank" rel="noreferrer">View my site</a>
        </div>
      </div>

      {owner && s && (
        <>
          <div className="tiles">
            <Link to="/admin/appointments" className="tile dark rise d1">
              <p style={{ color: 'var(--on-brand-3)' }}>Today's meetings</p>
              <h3 style={{ fontSize: 44, margin: '8px 0 6px' }}>{s.today.length}</h3>
              <p style={{ color: 'var(--accent-glow)' }}>{s.next ? `Next: ${fmtShort(s.next.startAt)}, ${fmtTime(s.next.startAt)}` : 'Nothing booked yet'}</p>
            </Link>
            <Link to="/admin/appointments" className="tile rise d2">
              <p>New bookings (3 days)</p>
              <h3 style={{ fontSize: 44, margin: '8px 0 6px' }}>{s.newBookings.length}</h3>
              <p style={{ color: s.pending ? 'var(--warn-text)' : 'var(--success-text)' }}>{s.pending ? `${s.pending} waiting for your approval` : 'All confirmed'}</p>
            </Link>
            <Link to="/admin/appointments" className="tile rise d3">
              <p>WhatsApp messages to send</p>
              <h3 style={{ fontSize: 44, margin: '8px 0 6px' }}>{s.whatsapp.length}</h3>
              <p style={{ color: 'var(--success-text)' }}>Emails go out automatically</p>
            </Link>
            <Link to="/admin/website" className="tile rise d4">
              <p>Your website</p>
              <h3 style={{ fontSize: 22, margin: '10px 0 6px' }}>Live</h3>
              <p>{site?.welcomeLine ? 'Profile and story are set.' : 'Add a welcome line and your story.'}</p>
            </Link>
          </div>

          <div className="grid-2">
            <section className="card rise d3">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 }}>
                <h2 style={{ fontSize: 22 }}>Today</h2>
                {minsToNext !== null && minsToNext >= 0 && minsToNext < 600 && (
                  <span className="pill pill-success"><span className="dot pulse" style={{ background: 'var(--success)' }} />Up next in {minsToNext < 60 ? `${minsToNext} min` : `${Math.floor(minsToNext / 60)} h ${minsToNext % 60} min`}</span>
                )}
              </div>
              {s.today.length ? s.today.map((a) => <AppointmentCard key={a.id} a={a} onAction={open} />) : <p className="muted">No meetings today.</p>}
            </section>
            <section className="card rise d4">
              <h2 style={{ fontSize: 22, marginBottom: 4 }}>WhatsApp messages to send</h2>
              <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Tap a green button: WhatsApp opens with the message ready.</p>
              <WhatsAppList items={s.whatsapp} onChange={load} />
            </section>
            <div style={{ gridColumn: '1 / -1' }} className="rise d5"><DraftBox compact /></div>
            {s.newBookings.length > 0 && (
              <section className="card rise d5" style={{ gridColumn: '1 / -1' }}>
                <h2 style={{ fontSize: 22, marginBottom: 12 }}>New bookings</h2>
                {s.newBookings.map((a) => <AppointmentCard key={a.id} a={a} onAction={open} />)}
              </section>
            )}
          </div>
        </>
      )}

      {!owner && (
        <div className="tiles">
          <Link to="/admin/website" className="tile dark rise d1">
            <span className="pill pill-success">Live</span>
            <h3>Website content</h3>
            <p>Edit the welcome line, story, photos and contact details.</p>
          </Link>
          <Link to="/admin/messages" className="tile rise d2">
            <span className="pill pill-accent">Messages</span>
            <h3>Write or upload a message</h3>
            <p>Draft, schedule and publish messages for Rev'd Dada.</p>
          </Link>
        </div>
      )}
      {!owner && (
        <div className="rise d3"><DraftBox compact /></div>
      )}
      {dialog}
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </>
  );
}
