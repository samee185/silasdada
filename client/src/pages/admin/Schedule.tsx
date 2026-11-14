import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { DayOverride, SlotMode, WeeklyBlock } from '../../api/types';
import { TextArea, TextField } from '../../components/Field';
import { Trash } from '../../components/Icons';
import { fmtDate, fmtShort, fmtTime, modeLabel, mondayIndex, todayLagos } from '../../lib/format';
import { Toast } from './Appointments';
import { MeetingRulesForm, WeekForm } from './forms';

type Option = 'NORMAL' | 'CUSTOM' | 'CLOSED';
type Block = { start: string; end: string; mode: SlotMode };
type Affected = { id: string; name: string; startAt: string; mode: string; status: string };
type Choice = 'KEEP' | 'RESCHEDULE' | 'CANCEL';

const saveBtn = (save: () => Promise<boolean>, busy: boolean) => (
  <div>
    <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void save()}>
      {busy && <span className="spinner" />} Save changes
    </button>
  </div>
);

export function SchedulePage() {
  const [tab, setTab] = useState<'days' | 'week' | 'rules'>('days');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>My schedule</h1>
          <p>Set your usual week once. When plans change, tap a date and change just that day.</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ['days', 'Change a day'],
            ['week', 'Usual week'],
            ['rules', 'Meeting rules'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" className="chip" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'days' && <DayChanges />}
      {tab === 'week' && <div className="card"><WeekForm actions={saveBtn} /></div>}
      {tab === 'rules' && <div className="card"><MeetingRulesForm actions={saveBtn} /></div>}
    </>
  );
}

function DayChanges() {
  const today = todayLagos();
  const [month, setMonth] = useState(today.slice(0, 7)); // "2026-11"
  const [weekly, setWeekly] = useState<WeeklyBlock[]>([]);
  const [overrides, setOverrides] = useState<DayOverride[]>([]);
  const [range, setRange] = useState(false);
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);
  const [option, setOption] = useState<Option>('NORMAL');
  const [blocks, setBlocks] = useState<Block[]>([{ start: '12:00', end: '14:00', mode: 'BOTH' }]);
  const [note, setNote] = useState('');
  const [affected, setAffected] = useState<Affected[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [w, o] = await Promise.all([
      api.get<{ blocks: WeeklyBlock[] }>('/api/schedule/weekly'),
      api.get<{ overrides: DayOverride[] }>(`/api/schedule/overrides?from=${today}`),
    ]);
    setWeekly(w.blocks);
    setOverrides(o.overrides);
  }, [today]);
  useEffect(() => {
    void load();
  }, [load]);

  const ovMap = useMemo(() => new Map(overrides.map((o) => [o.date, o])), [overrides]);
  const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
  const usualFor = (date: string) => weekly.filter((b) => b.weekday === weekdayOf(date));
  const usualText = (date: string) => {
    const u = usualFor(date);
    return u.length ? u.map((b) => `${fmt12(b.start)}–${fmt12(b.end)} ${modeLower(b.mode)}`).join(', ') : 'No usual hours';
  };

  // when the selected date changes, start from what is saved for it
  useEffect(() => {
    const ov = ovMap.get(from);
    if (ov) {
      setOption(ov.type);
      setNote(ov.note ?? '');
      if (ov.type === 'CUSTOM') setBlocks(ov.blocks);
    } else {
      setOption('NORMAL');
      setNote('');
      const u = usualFor(from);
      setBlocks(u.length ? u.map(({ start, end, mode }) => ({ start, end, mode })) : [{ start: '12:00', end: '14:00', mode: 'BOTH' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, ovMap]);

  const change = useMemo(() => ({ from, to: range ? to : from, type: option, note, blocks: option === 'CUSTOM' ? blocks : [] }), [from, to, range, option, note, blocks]);

  // live clash preview
  useEffect(() => {
    let stop = false;
    const t = setTimeout(async () => {
      try {
        const r = await api.post<{ affected: Affected[] }>('/api/schedule/day/preview', change);
        if (stop) return;
        setAffected(r.affected);
        setChoices((c) => Object.fromEntries(r.affected.map((a) => [a.id, c[a.id] ?? 'RESCHEDULE'])));
      } catch {
        if (!stop) setAffected([]);
      }
    }, 300);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [change]);

  function pick(date: string) {
    setError(null);
    if (range && date >= from && from === to) setTo(date);
    else {
      setFrom(date);
      setTo(date);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.put<{ days: number; rescheduled: number; cancelled: number }>('/api/schedule/day', { change, resolutions: choices, message });
      const parts = [`Saved for ${r.days} day${r.days === 1 ? '' : 's'}`];
      if (r.rescheduled) parts.push(`${r.rescheduled} sent a reschedule link`);
      if (r.cancelled) parts.push(`${r.cancelled} cancelled`);
      setToast(parts.join(' · '));
      setMessage('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  // month grid
  const first = `${month}-01`;
  const lead = mondayIndex(first);
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const cells = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const shiftMonth = (n: number) => {
    const d = new Date(`${first}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const end = range ? to : from;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
      <section className="card" style={{ flex: '1 1 340px', minWidth: 0 }}>
        <div className="month-nav">
          <button type="button" className="icon-btn" aria-label="Previous month" disabled={month <= today.slice(0, 7)} onClick={() => shiftMonth(-1)}>‹</button>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{fmtDate(first, { month: 'long', year: 'numeric' })}</strong>
          <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
        </div>
        <div className="cal" style={{ marginBottom: 6 }}>
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => <span key={d} className="dowh">{d}</span>)}
        </div>
        <div className="cal">
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {cells.map((date) => {
            const ov = ovMap.get(date);
            const has = usualFor(date).length > 0;
            const sel = date === from || date === end;
            const inRange = date > from && date < end;
            return (
              <button key={date} type="button" disabled={date < today} className={`${sel ? 'sel' : inRange ? 'inrange' : ''}${!has && !ov ? ' off' : ''}`} onClick={() => pick(date)} aria-label={fmtDate(date)} aria-pressed={sel}>
                {Number(date.slice(8))}
                {(ov || has) && <span className={`cal-dot ${ov?.type === 'CLOSED' ? 'dot-closed' : ov ? 'dot-changed' : 'dot-usual'}`} />}
              </button>
            );
          })}
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--accent)', borderRadius: '50%', border: 'none' }} />Usual hours</span>
          <span><i style={{ background: '#2b6cb0', borderRadius: '50%', border: 'none' }} />Changed</span>
          <span><i style={{ background: 'transparent', borderRadius: '50%', border: '2px solid var(--muted)' }} />Closed</span>
        </div>
        <label className="check-row" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={range} onChange={(e) => { setRange(e.target.checked); setTo(from); }} />
          Several days (e.g. travelling): tap the first day, then the last
        </label>
      </section>

      <section className="card slide-in" key={`${from}-${end}`} style={{ flex: '1.3 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="step-label">{range && end !== from ? 'Edit these days only' : 'Edit this day only'}</p>
        <h2 style={{ fontSize: 24 }}>{range && end !== from ? `${fmtDate(from, { day: 'numeric', month: 'short' })} – ${fmtDate(end, { day: 'numeric', month: 'short' })}` : fmtDate(from)}</h2>
        {!(range && end !== from) && <p className="muted" style={{ fontSize: 13 }}>Usual: {usualText(from)}</p>}
        {(
          [
            ['NORMAL', 'Use my usual hours', range && end !== from ? 'Each day follows your usual week' : usualText(from)],
            ['CUSTOM', range && end !== from ? 'Change hours for these days only' : 'Change hours for this day only', 'Your usual week stays the same'],
            ['CLOSED', range && end !== from ? 'Close these days' : 'Close this day', 'No one can book'],
          ] as [Option, string, string][]
        ).map(([v, title, sub]) => (
          <button key={v} type="button" role="radio" aria-checked={option === v} className="opt" onClick={() => setOption(v)}>
            <span className="r" />
            <span><strong>{title}</strong><span>{sub}</span></span>
          </button>
        ))}
        {option === 'CUSTOM' && (
          <div className="slide-in" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 14, background: 'var(--surface-2)' }}>
            {blocks.map((b, i) => (
              <div className="block-row" key={i}>
                <input className="input" type="time" aria-label="From" value={b.start} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                <span className="muted">to</span>
                <input className="input" type="time" aria-label="To" value={b.end} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                <select className="select" aria-label="Meeting type" value={b.mode} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, mode: e.target.value as SlotMode } : x)))}>
                  <option value="BOTH">In person or WhatsApp</option>
                  <option value="WHATSAPP">WhatsApp call</option>
                  <option value="IN_PERSON">In person</option>
                </select>
                {blocks.length > 1 && (
                  <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}><Trash width={16} height={16} /></button>
                )}
              </div>
            ))}
            <button type="button" className="add-link" onClick={() => setBlocks([...blocks, { start: '16:00', end: '18:00', mode: 'BOTH' }])}>+ Add more hours</button>
          </div>
        )}
        {option !== 'NORMAL' && <TextField label="Note to show visitors (optional)" placeholder="e.g. Away for conference" value={note} onChange={(e) => setNote(e.target.value)} />}

        {affected.length > 0 && (
          <div className="clash slide-in">
            <p style={{ fontWeight: 600, color: 'var(--warn-text)' }}>
              {affected.length} booking{affected.length === 1 ? ' is' : 's are'} affected by this change
            </p>
            <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>Choose what happens to each one. Nobody is cancelled without your say.</p>
            {affected.map((a) => (
              <div className="clash-row" key={a.id}>
                <span>
                  <strong style={{ display: 'block' }}>{a.name}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>{fmtShort(a.startAt)} · {fmtTime(a.startAt)} · {modeLabel(a.mode)}</span>
                </span>
                <span className="segmented" role="radiogroup" aria-label={`What to do with ${a.name}`}>
                  {(['KEEP', 'RESCHEDULE', 'CANCEL'] as Choice[]).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={choices[a.id] === c} aria-pressed={choices[a.id] === c} onClick={() => setChoices({ ...choices, [a.id]: c })}>
                      {c === 'KEEP' ? 'Keep' : c === 'RESCHEDULE' ? 'Ask to reschedule' : 'Cancel'}
                    </button>
                  ))}
                </span>
              </div>
            ))}
            {Object.values(choices).some((c) => c !== 'KEEP') && (
              <TextArea label="Message to include (optional)" rows={2} placeholder="e.g. I have to travel that day. Please pick another time." value={message} onChange={(e) => setMessage(e.target.value)} />
            )}
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-accent shine" disabled={busy} onClick={save}>
            {busy && <span className="spinner" />} Save change
          </button>
        </div>
      </section>

      {overrides.length > 0 && (
        <section className="card" style={{ flex: '1 1 100%' }}>
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>Coming changes</h2>
          <div className="table-list">
            {overrides.map((o) => (
              <div className="row" key={o.date}>
                <span>
                  <strong style={{ display: 'block' }}>{fmtDate(o.date)}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {o.type === 'CLOSED' ? 'Closed' : o.blocks.map((b) => `${fmt12(b.start)}–${fmt12(b.end)} ${modeLower(b.mode)}`).join(', ')}
                    {o.note ? ` · ${o.note}` : ''}
                  </span>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRange(false); setFrom(o.date); setTo(o.date); setMonth(o.date.slice(0, 7)); }}>Edit</button>
              </div>
            ))}
          </div>
        </section>
      )}
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

const modeLower = (m: string) => (m === 'IN_PERSON' ? 'in person' : m === 'WHATSAPP' ? 'WhatsApp call' : 'in person or WhatsApp');

function fmt12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
}

