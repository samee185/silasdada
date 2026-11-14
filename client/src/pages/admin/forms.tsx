import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import { mediaIdFromUrl, type MeetingMode, type Settings, type SiteProfile, type WeeklyBlock } from '../../api/types';
import { SelectField, TextArea, TextField } from '../../components/Field';
import { Trash } from '../../components/Icons';
import { PhotoPicker } from '../../components/PhotoPicker';
import { useSite } from '../../hooks/useSite';

/** Each form renders its own fields; the page decides which buttons to show (Save, or Back / Continue). */
type Actions = (save: () => Promise<boolean>, busy: boolean) => ReactNode;

function useSaver() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await fn();
      setSaved(true);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'Could not save. Check your connection and try again.'));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, saved, run, setSaved };
}

function FormStatus({ error, saved }: { error: ApiError | null; saved: boolean }) {
  if (error) return <div className="alert alert-error" role="alert">{error.message}</div>;
  if (saved) return <div className="alert alert-success" role="status">Saved.</div>;
  return null;
}

// ─── Profile: photos, name, title, welcome, story, scripture ───

type Photo = { id: string | null; url: string | null };

export function ProfileForm({ actions, showPreview = true }: { actions: Actions; showPreview?: boolean }) {
  const { site, setSite } = useSite();
  const s = site as SiteProfile;
  const [f, setF] = useState({
    displayName: s.displayName,
    titleLine: s.titleLine,
    welcomeLine: s.welcomeLine ?? '',
    story: s.story ?? '',
    scripture: s.scripture ?? '',
    scriptureRef: s.scriptureRef ?? '',
  });
  const [photos, setPhotos] = useState<Record<'portrait' | 'about' | 'casual', Photo>>({
    portrait: { id: mediaIdFromUrl(s.portraitUrl), url: s.portraitUrl },
    about: { id: mediaIdFromUrl(s.aboutPhotoUrl), url: s.aboutPhotoUrl },
    casual: { id: mediaIdFromUrl(s.casualPhotoUrl), url: s.casualPhotoUrl },
  });
  const { busy, error, saved, run, setSaved } = useSaver();
  const err = error?.fields ?? {};
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setF({ ...f, [k]: e.target.value });
  };
  const setPhoto = (k: keyof typeof photos, p: Photo) => {
    setSaved(false);
    setPhotos({ ...photos, [k]: p });
  };

  const save = () =>
    run(async () => {
      const next = await api.put<SiteProfile>('/api/site', {
        ...f,
        portraitId: photos.portrait.id,
        aboutPhotoId: photos.about.id,
        casualPhotoId: photos.casual.id,
      });
      setSite(next);
    });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="photo-row">
          <PhotoPicker label="Home page portrait" hint="Shown large at the top of your site" url={photos.portrait.url} onUploaded={(m) => setPhoto('portrait', m)} />
          <PhotoPicker label="About photo" hint="At the pulpit or with family" url={photos.about.url} shape="square" onUploaded={(m) => setPhoto('about', m)} onRemove={() => setPhoto('about', { id: null, url: null })} />
          <PhotoPicker label="Casual photo" hint="Optional" url={photos.casual.url} shape="square" onUploaded={(m) => setPhoto('casual', m)} onRemove={() => setPhoto('casual', { id: null, url: null })} />
        </div>
        <TextField label="Name as shown" value={f.displayName} onChange={set('displayName')} error={err.displayName} />
        <TextField label="Your title" value={f.titleLine} onChange={set('titleLine')} error={err.titleLine} hint="Shown under your name, e.g. Conference Pastor, Old Ife Road Conference · New Covenant Church" />
        <TextField label="Welcome line" placeholder="One sentence visitors read first" value={f.welcomeLine} onChange={set('welcomeLine')} error={err.welcomeLine} maxLength={300} />
        <TextArea label="Your story" rows={6} placeholder="Your calling, ministry journey, family — whatever you would like people to know." value={f.story} onChange={set('story')} error={err.story} />
        <div className="form-grid">
          <TextArea className="span-all" label="Favourite scripture or motto" rows={3} value={f.scripture} onChange={set('scripture')} error={err.scripture} />
          <TextField label="Reference" placeholder="e.g. Isaiah 40:31 · KJV" value={f.scriptureRef} onChange={set('scriptureRef')} error={err.scriptureRef} />
        </div>
        <FormStatus error={error} saved={saved} />
        {actions(save, busy)}
      </div>
      {showPreview && (
        <aside style={{ flex: '1 1 260px', minWidth: 0 }}>
          <p className="step-label" style={{ color: 'var(--muted)' }}>Live preview</p>
          <div className="preview-card">
            {photos.portrait.url && <img src={photos.portrait.url} alt="" />}
            <span style={{ fontSize: 11, color: 'var(--accent-glow)', letterSpacing: '.16em', textTransform: 'uppercase' }}>
              {f.titleLine.split('·')[0]}
            </span>
            <span className="name">{f.displayName || 'Your name'}</span>
            <span className="small">{f.welcomeLine || 'Your welcome line appears here as you type.'}</span>
            <span className="btn btn-accent btn-sm" style={{ alignSelf: 'flex-start', pointerEvents: 'none' }}>Book a meeting</span>
          </div>
        </aside>
      )}
    </div>
  );
}

// ─── Contact and socials ───

export function ContactForm({ actions }: { actions: Actions }) {
  const { site, setSite } = useSite();
  const s = site as SiteProfile;
  const [f, setF] = useState({
    publicEmail: s.publicEmail ?? '',
    publicPhone: s.publicPhone ?? '',
    meetingAddress: s.meetingAddress ?? '',
    mapsUrl: s.mapsUrl ?? '',
    youtube: s.socials.youtube ?? '',
    facebook: s.socials.facebook ?? '',
    instagram: s.socials.instagram ?? '',
    tiktok: s.socials.tiktok ?? '',
    x: s.socials.x ?? '',
  });
  const { busy, error, saved, run, setSaved } = useSaver();
  const err = error?.fields ?? {};
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setF({ ...f, [k]: e.target.value });
  };
  const save = () => run(async () => setSite(await api.put<SiteProfile>('/api/site', f)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="form-grid">
        <TextField label="Public email" type="email" placeholder="Optional" value={f.publicEmail} onChange={set('publicEmail')} error={err.publicEmail} />
        <TextField label="Public phone" type="tel" placeholder="Optional" value={f.publicPhone} onChange={set('publicPhone')} error={err.publicPhone} />
        <TextArea className="span-all" label="Where in-person meetings hold" rows={2} placeholder="Office address" value={f.meetingAddress} onChange={set('meetingAddress')} error={err.meetingAddress} hint="Sent to people who book an in-person meeting." />
        <TextField className="span-all" label="Google Maps link" type="url" placeholder="https://maps.app.goo.gl/…" value={f.mapsUrl} onChange={set('mapsUrl')} error={err.mapsUrl} />
        <TextField label="YouTube" type="url" placeholder="Optional" value={f.youtube} onChange={set('youtube')} error={err.youtube} />
        <TextField label="Facebook" type="url" placeholder="Optional" value={f.facebook} onChange={set('facebook')} error={err.facebook} />
        <TextField label="Instagram" type="url" placeholder="Optional" value={f.instagram} onChange={set('instagram')} error={err.instagram} />
        <TextField label="TikTok" type="url" placeholder="Optional" value={f.tiktok} onChange={set('tiktok')} error={err.tiktok} />
        <TextField label="X (Twitter)" type="url" placeholder="Optional" value={f.x} onChange={set('x')} error={err.x} />
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Leave any field empty to hide it from your site.</p>
      <FormStatus error={error} saved={saved} />
      {actions(save, busy)}
    </div>
  );
}

// ─── Meeting rules ───

export function MeetingRulesForm({ actions }: { actions: Actions }) {
  const [f, setF] = useState<Settings | null>(null);
  const { busy, error, saved, run, setSaved } = useSaver();
  useEffect(() => {
    api.get<Settings>('/api/schedule/settings').then(setF).catch(() => setF(null));
  }, []);
  if (!f) return <div className="page-loading" style={{ minHeight: 200 }}><span className="spinner" /></div>;
  const update = (patch: Partial<Settings>) => {
    setSaved(false);
    setF({ ...f, ...patch });
  };
  const save = () =>
    run(async () => {
      const { slotMinutes, bufferMinutes, minNoticeHours, maxAdvanceDays, maxPerDay, confirmMode } = f;
      setF(await api.put<Settings>('/api/schedule/settings', { slotMinutes, bufferMinutes, minNoticeHours, maxAdvanceDays, maxPerDay, confirmMode }));
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p style={{ fontWeight: 600, marginBottom: 10 }}>Meeting length</p>
        <div className="chips" role="group" aria-label="Meeting length">
          {[30, 45, 60, 90].map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={f.slotMinutes === m} onClick={() => update({ slotMinutes: m })}>
              {m} min
            </button>
          ))}
        </div>
      </div>
      <div>
        <p style={{ fontWeight: 600, marginBottom: 10 }}>Break between meetings</p>
        <div className="chips" role="group" aria-label="Break between meetings">
          {[0, 10, 15, 30].map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={f.bufferMinutes === m} onClick={() => update({ bufferMinutes: m })}>
              {m === 0 ? 'No break' : `${m} min`}
            </button>
          ))}
        </div>
      </div>
      <div className="form-grid">
        <SelectField label="Book at least" value={f.minNoticeHours} onChange={(e) => update({ minNoticeHours: Number(e.target.value) })}>
          <option value={3}>3 hours ahead</option>
          <option value={12}>12 hours ahead</option>
          <option value={24}>24 hours ahead</option>
          <option value={48}>2 days ahead</option>
        </SelectField>
        <SelectField label="Book up to" value={f.maxAdvanceDays} onChange={(e) => update({ maxAdvanceDays: Number(e.target.value) })}>
          <option value={14}>2 weeks ahead</option>
          <option value={28}>4 weeks ahead</option>
          <option value={56}>8 weeks ahead</option>
        </SelectField>
        <SelectField label="Most meetings a day" value={f.maxPerDay ?? 0} onChange={(e) => update({ maxPerDay: Number(e.target.value) || null })}>
          {[2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          <option value={0}>No limit</option>
        </SelectField>
      </div>
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          <strong style={{ display: 'block' }}>Confirm bookings automatically</strong>
          <span className="muted" style={{ fontSize: 14 }}>
            {f.confirmMode === 'AUTO' ? 'On: people are confirmed the moment they book.' : 'Off: you approve each booking first.'}
          </span>
        </span>
        <button type="button" role="switch" className="switch" aria-checked={f.confirmMode === 'AUTO'} aria-label="Confirm bookings automatically" onClick={() => update({ confirmMode: f.confirmMode === 'AUTO' ? 'APPROVE' : 'AUTO' })} />
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        WhatsApp calls: you call the person on their WhatsApp number at the booked time. Reminders go out 24 hours before (when booked earlier than that) and 1 hour before.
      </p>
      <FormStatus error={error} saved={saved} />
      {actions(save, busy)}
    </div>
  );
}

// ─── Usual week ───

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAY = [1, 2, 3, 4, 5, 6, 0]; // display Monday-first, store Sunday = 0
const MODE_LABEL: Record<MeetingMode, string> = { BOTH: 'In person or WhatsApp', WHATSAPP: 'WhatsApp call', IN_PERSON: 'In person' };

export function WeekForm({ actions }: { actions: Actions }) {
  const [blocks, setBlocks] = useState<WeeklyBlock[] | null>(null);
  const { busy, error, saved, run, setSaved } = useSaver();
  useEffect(() => {
    api.get<{ blocks: WeeklyBlock[] }>('/api/schedule/weekly').then((r) => setBlocks(r.blocks)).catch(() => setBlocks([]));
  }, []);
  if (!blocks) return <div className="page-loading" style={{ minHeight: 200 }}><span className="spinner" /></div>;

  const change = (next: WeeklyBlock[]) => {
    setSaved(false);
    setBlocks(next);
  };
  const forDay = (d: number) => blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.weekday === d);
  const toggleDay = (d: number) =>
    forDay(d).length
      ? change(blocks.filter((b) => b.weekday !== d))
      : change([...blocks, { weekday: d, start: '10:00', end: '13:00', mode: 'BOTH' }]);
  const addBlock = (d: number) => change([...blocks, { weekday: d, start: '16:00', end: '18:00', mode: 'BOTH' }]);
  const edit = (i: number, patch: Partial<WeeklyBlock>) => change(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const remove = (i: number) => change(blocks.filter((_, j) => j !== i));
  const save = () =>
    run(async () => {
      const r = await api.put<{ blocks: WeeklyBlock[] }>('/api/schedule/weekly', {
        blocks: blocks.map(({ weekday, start, end, mode }) => ({ weekday, start, end, mode })),
      });
      setBlocks(r.blocks);
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
        Hours can overlap. For example, set 9am–5pm as WhatsApp call, then add 10am–1pm as In person: from 10am to 1pm people choose either, and the rest of the day is calls only. Once a time is booked, it is gone for both.
      </p>
      <div className="week">
        {WEEKDAY.map((d, idx) => {
          const rows = forDay(d);
          const on = rows.length > 0;
          return (
            <div className="week-row" key={d}>
              <button type="button" role="switch" className="switch" aria-checked={on} aria-label={`Available on ${DAYS[idx]}`} onClick={() => toggleDay(d)} />
              <span className="week-day" style={{ color: on ? 'var(--ink)' : 'var(--faint)' }}>{DAYS[idx]}</span>
              {on ? (
                <div className="week-blocks">
                  {rows.map(({ b, i }) => (
                    <div className="block-row slide-in" key={i}>
                      <input className="input" type="time" aria-label="From" value={b.start} onChange={(e) => edit(i, { start: e.target.value })} />
                      <span className="muted">to</span>
                      <input className="input" type="time" aria-label="To" value={b.end} onChange={(e) => edit(i, { end: e.target.value })} />
                      <select className="select" aria-label="Meeting type" value={b.mode} onChange={(e) => edit(i, { mode: e.target.value as MeetingMode })}>
                        {(Object.keys(MODE_LABEL) as MeetingMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                      </select>
                      <button type="button" className="icon-btn" aria-label="Remove these hours" onClick={() => remove(i)}>
                        <Trash width={16} height={16} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="add-link" onClick={() => addBlock(d)}>+ Add more hours</button>
                </div>
              ) : (
                <span className="muted" style={{ paddingTop: 4, fontSize: 14 }}>Not available</span>
              )}
            </div>
          );
        })}
      </div>
      <FormStatus error={error} saved={saved} />
      {actions(save, busy)}
    </div>
  );
}
