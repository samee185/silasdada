import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { Availability, DayAvailability, Slot } from '../api/types';
import { addDays, fmtDate, fmtTime, modeLabel, mondayIndex } from '../lib/format';

export type ModeFilter = 'ANY' | 'IN_PERSON' | 'WHATSAPP';
export type Picked = { slot: Slot; date: string } | null;

const fits = (s: Slot, f: ModeFilter) => f === 'ANY' || s.mode === 'BOTH' || s.mode === f;

/** Two-week calendar of free days, then the free times on the chosen day. */
export function SlotPicker({ value, onChange, filter, onFilter }: { value: Picked; onChange: (p: Picked) => void; filter: ModeFilter; onFilter: (f: ModeFilter) => void }) {
  const [data, setData] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [day, setDay] = useState<string | null>(value?.date ?? null);

  useEffect(() => {
    api
      .get<Availability>('/api/public/availability?days=42')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const byDate = useMemo(() => new Map((data?.days ?? []).map((d) => [d.date, d])), [data]);
  const freeOn = (d: DayAvailability | undefined) => (d ? d.slots.filter((s) => fits(s, filter)) : []);

  // pick the first day with free times once data arrives (or the filter changes)
  useEffect(() => {
    if (!data) return;
    if (day && freeOn(byDate.get(day)).length) return;
    const first = data.days.find((d) => freeOn(d).length);
    setDay(first?.date ?? null);
    if (first) {
      const idx = Math.floor((Math.round((Date.parse(first.date) - Date.parse(addDays(data.today, -mondayIndex(data.today)))) / 864e5)) / 14);
      setPage(Math.max(0, idx));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="page-loading" style={{ minHeight: 280 }}><span className="spinner" /></div>;

  const gridStart = addDays(addDays(data.today, -mondayIndex(data.today)), page * 14);
  const cells = Array.from({ length: 14 }, (_, i) => addDays(gridStart, i));
  const lastPage = Math.floor((Date.parse(data.lastDay) - Date.parse(addDays(data.today, -mondayIndex(data.today)))) / 864e5 / 14);
  const selected = day ? byDate.get(day) : undefined;
  const slots = freeOn(selected);
  const anyFree = data.days.some((d) => freeOn(d).length);

  return (
    <div className="picker">
      <div className="picker-cal">
        <div className="picker-head">
          <h2>Pick a day</h2>
          <div className="segmented" role="group" aria-label="Meeting type">
            {(['ANY', 'IN_PERSON', 'WHATSAPP'] as ModeFilter[]).map((m) => (
              <button key={m} type="button" aria-pressed={filter === m} onClick={() => { onFilter(m); onChange(null); }}>
                {m === 'ANY' ? 'All' : modeLabel(m)}
              </button>
            ))}
          </div>
        </div>
        <div className="month-nav">
          <button type="button" className="icon-btn" aria-label="Earlier dates" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
          <strong>{fmtDate(cells[0], { day: 'numeric', month: 'short' })} – {fmtDate(cells[13], { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
          <button type="button" className="icon-btn" aria-label="Later dates" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>›</button>
        </div>
        <div className="dow" aria-hidden="true">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="days">
          {cells.map((date) => {
            const d = byDate.get(date);
            const free = freeOn(d).length;
            const past = date < data.today || date > data.lastDay;
            const isSel = date === day;
            return (
              <button
                key={date}
                type="button"
                className={`day${isSel ? ' sel' : ''}${free ? ' has' : ''}`}
                disabled={!free}
                aria-pressed={isSel}
                aria-label={`${fmtDate(date)}: ${d?.closed ? 'away' : free ? `${free} free times` : 'no free times'}`}
                onClick={() => { setDay(date); onChange(null); }}
              >
                <span className="n">{Number(date.slice(8))}</span>
                <span className="s">{past ? '' : d?.closed ? 'Away' : free ? `${free} free` : '—'}</span>
              </button>
            );
          })}
        </div>
        <div className="legend">
          <span><i className="has" />Free times</span>
          <span><i className="sel" />Selected</span>
          <span><i />Unavailable</span>
        </div>
      </div>

      <div className="picker-slots">
        {!anyFree ? (
          <div className="empty-slots">There are no free times in the next few weeks{filter !== 'ANY' ? ` for ${modeLabel(filter).toLowerCase()}` : ''}. Please check again soon.</div>
        ) : selected ? (
          <>
            <p className="eyebrow">{selected.note ?? `${slots.length} time${slots.length === 1 ? '' : 's'} available`}</p>
            <h2 style={{ fontSize: 26, marginBottom: 18 }}>{fmtDate(selected.date)}</h2>
            {slots.length ? (
              <div className="slots">
                {slots.map((s, i) => {
                  const isSel = value?.slot.start === s.start;
                  return (
                    <button key={s.start} type="button" className={`slot pop${isSel ? ' sel' : ''}`} style={{ animationDelay: `${i * 0.04}s` }} aria-pressed={isSel} onClick={() => onChange({ slot: s, date: selected.date })}>
                      <strong>{fmtTime(s.start)}</strong>
                      <span>{modeLabel(s.mode)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-slots">{selected.closed ? 'Pastor is away this day. Please pick another date.' : 'No free times this day.'}</div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
