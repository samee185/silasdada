import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PostCard } from '../api/types';
import { fmtDate } from '../lib/format';
import { ScriptureCover } from './ScriptureCover';

export const postDate = (p: PostCard) => (p.preachedOn ? p.preachedOn.slice(0, 10) : p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 10) : null);

/** Cover text: the chosen verse, else the excerpt, else the title. */
export const coverOf = (p: PostCard) => ({
  verse: p.coverVerse || p.excerpt || p.title,
  ref: p.coverRef || p.scriptureRefs?.split(/[;,]/)[0]?.trim() || p.series?.name || 'Message',
});

export function MessageCard({ p, big = false }: { p: PostCard; big?: boolean }) {
  const c = coverOf(p);
  const d = postDate(p);
  if (big) {
    return (
      <Link to={`/messages/${p.slug}`} className="msg-feature lift" data-reveal>
        <ScriptureCover verse={c.verse} reference={c.ref} style={p.coverStyle} className="msg-feature-cover">
          <span className="listen-pill">
            <Wave bars={5} height={18} /> Listen · {p.readMinutes} min
          </span>
        </ScriptureCover>
        <div className="msg-feature-copy">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {p.series && <span className="pill pill-accent">{p.series.name}{p.seriesPart ? ` · Part ${p.seriesPart}` : ''}</span>}
            {p.scriptureRefs && <span className="pill pill-muted">{p.scriptureRefs.split(/[;,]/)[0]}</span>}
          </div>
          <h3>{p.title}</h3>
          {p.excerpt && <p className="muted" style={{ fontSize: 17, lineHeight: 1.7 }}>{p.excerpt}</p>}
          <p className="muted" style={{ marginTop: 'auto', fontSize: 14 }}>
            {d ? fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''} · {p.readMinutes} min read
          </p>
        </div>
      </Link>
    );
  }
  return (
    <Link to={`/messages/${p.slug}`} className="msg-card lift" data-reveal>
      <div className="msg-card-cover">
        <ScriptureCover verse={c.verse.length > 90 ? `${c.verse.slice(0, 88)}…` : c.verse} reference={c.ref} style={p.coverStyle} verseSize="21px" />
      </div>
      <div className="msg-card-copy">
        <span className="kicker">{[p.series?.name, p.scriptureRefs?.split(/[;,]/)[0]].filter(Boolean).join(' · ') || 'Message'}</span>
        <h3>{p.title}</h3>
        <p className="muted" style={{ fontSize: 14 }}>
          {d ? fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : ''} · {p.readMinutes} min read
        </p>
      </div>
    </Link>
  );
}

export function Wave({ bars, height, paused = false, color }: { bars: number; height: number; paused?: boolean; color?: string }) {
  const list = useMemo(() => {
    let s = bars * 7 + height;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: bars }, () => ({ h: Math.round(height * (0.3 + r() * 0.7)), d: (r() * 1.1).toFixed(2) }));
  }, [bars, height]);
  return (
    <span className={`wave${paused ? ' is-paused' : ''}`} aria-hidden="true" style={{ height, color }}>
      {list.map((b, i) => <i key={i} style={{ height: b.h, animationDelay: `-${b.d}s` }} />)}
    </span>
  );
}

/** Splits text into pieces short enough for every browser's speech engine. */
function chunks(text: string) {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*["”’]?\s*/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > 220 && cur) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Reads the message aloud with the voice already on the visitor's phone or computer (free, no audio files). */
export function ListenPlayer({ text, minutes }: { text: string; minutes: number }) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const parts = useMemo(() => chunks(text), [text]);
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [idx, setIdx] = useState(0);
  const [rate, setRate] = useState(1);
  const idxRef = useRef(0);
  const stopped = useRef(false);

  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);

  function voice() {
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => v.lang === 'en-NG') ?? voices.find((v) => v.lang === 'en-GB') ?? voices.find((v) => v.lang.startsWith('en'));
  }

  function speakFrom(i: number, r = rate) {
    const synth = window.speechSynthesis;
    synth.cancel();
    stopped.current = false;
    const say = (n: number) => {
      if (stopped.current || n >= parts.length) {
        if (n >= parts.length) { setState('idle'); setIdx(0); idxRef.current = 0; }
        return;
      }
      idxRef.current = n;
      setIdx(n);
      const u = new SpeechSynthesisUtterance(parts[n]);
      const v = voice();
      if (v) u.voice = v;
      u.rate = r;
      u.onend = () => say(n + 1);
      synth.speak(u);
    };
    setState('playing');
    say(i);
  }

  function toggle() {
    if (!supported) return;
    if (state === 'playing') {
      stopped.current = true;
      window.speechSynthesis.cancel(); // pause() is unreliable on Android; resume from the same sentence instead
      setState('paused');
    } else speakFrom(idxRef.current);
  }

  function cycleRate() {
    const next = rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : 1;
    setRate(next);
    if (state === 'playing') speakFrom(idxRef.current, next);
  }

  const pct = parts.length ? Math.round((idx / parts.length) * 100) : 0;
  return (
    <div className="player">
      <button type="button" className={`play${state !== 'playing' ? ' pulse' : ''}`} onClick={toggle} disabled={!supported} aria-label={state === 'playing' ? 'Pause' : 'Listen to this message'}>
        {state === 'playing' ? (
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="#fff" /></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="#fff" /></svg>
        )}
      </button>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
          <strong>Listen to this message</strong>
          <span style={{ opacity: 0.8 }}>{!supported ? 'Not available on this browser' : state === 'playing' ? 'Reading aloud…' : state === 'paused' ? 'Paused' : `${minutes} min · read by your device`}</span>
        </div>
        <Wave bars={90} height={28} paused={state !== 'playing'} color="var(--accent-glow)" />
        <span className="track"><span style={{ width: `${pct}%` }} /></span>
      </div>
      <button type="button" className="rate" onClick={cycleRate} aria-label="Reading speed">{rate}×</button>
    </div>
  );
}

export function ShareBar({ url, caption }: { url: string; caption: string }) {
  const [copied, setCopied] = useState(false);
  const wa = `https://wa.me/?text=${encodeURIComponent(`${caption}\n\n${url}`)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  return (
    <div className="share">
      <span>Share</span>
      <a className="share-btn wa" href={wa} target="_blank" rel="noreferrer" aria-label="Share on WhatsApp">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12z" /><path d="M9 9.5c.5 2 2 3.6 4.5 4.6l1-1.1 2 .9c-.3 1-1 1.6-2 1.6-3 0-6.5-3.4-6.5-6.5 0-1 .6-1.7 1.6-2l.9 2z" /></svg>
      </a>
      <a className="share-btn" href={fb} target="_blank" rel="noreferrer" aria-label="Share on Facebook">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z" /></svg>
      </a>
      <button
        type="button"
        className="share-btn"
        aria-label="Copy link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            window.prompt('Copy this link:', url);
          }
        }}
      >
        {copied ? '✓' : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
        )}
      </button>
    </div>
  );
}
