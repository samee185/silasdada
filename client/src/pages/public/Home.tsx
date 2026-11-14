import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { PostCard, SeriesItem } from '../../api/types';
import { Backdrop } from '../../components/Backdrop';
import { MessageCard } from '../../components/MessageBits';
import { ScriptureCover } from '../../components/ScriptureCover';
import { useReveal } from '../../hooks/useReveal';
import { useSite } from '../../hooks/useSite';

const DEFAULT_VERSE = {
  text: 'They that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles.',
  ref: 'Isaiah 40:31 · KJV',
};
const THEMES = ['Messages', 'Counsel', 'Prayer', 'Faith', 'Hope', 'Grace'];

export function HomePage() {
  const { site } = useSite();
  const hero = useRef<HTMLElement>(null);
  const [posts, setPosts] = useState<PostCard[] | null>(null);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  useEffect(() => {
    api.get<{ posts: PostCard[] }>('/api/posts?limit=4').then((r) => setPosts(r.posts)).catch(() => setPosts([]));
    api.get<{ series: SeriesItem[] }>('/api/posts/series').then((r) => setSeries(r.series)).catch(() => {});
  }, []);
  useReveal([site, posts]);

  // Cursor spotlight + gentle parallax, written straight to CSS variables (no re-render per mouse move).
  const frame = useRef(0);
  function onMove(e: MouseEvent<HTMLElement>) {
    const el = hero.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${x}%`);
      el.style.setProperty('--my', `${y}%`);
      el.style.setProperty('--px', `${(((x - 50) / 50) * -10).toFixed(1)}px`);
      el.style.setProperty('--py', `${(((y - 50) / 50) * -8).toFixed(1)}px`);
    });
  }
  function onLeave() {
    const el = hero.current;
    if (!el) return;
    ['--mx', '--my', '--px', '--py'].forEach((p) => el.style.removeProperty(p));
  }

  if (!site) return <div className="page-loading"><span className="spinner" /></div>;

  const badge = site.titleLine.split('·')[0].trim();
  const verse = site.scripture ? { text: site.scripture, ref: site.scriptureRef ?? '' } : DEFAULT_VERSE;

  return (
    <>
      <section className="hero" ref={hero} onMouseMove={onMove} onMouseLeave={onLeave}>
        <div className="hero-spot" aria-hidden="true" />
        <Backdrop stars={18} rays={{ x: '72%', y: '42%', size: 1600 }} motes />
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="hero-badge rise">
              <span className="dot pulse" />
              {badge}
            </span>
            <p className="eyebrow on-dark rise d1">Messages · Counsel · Prayer</p>
            <h1>
              <span className="w rise d2">Words</span> <span className="w rise d3">that</span>{' '}
              <span className="w rise d4">steady</span> <em className="rise d5">the soul.</em>
            </h1>
            <p className="hero-lead rise d5">
              {site.welcomeLine ?? `Messages, counsel and prayer with ${site.displayName}.`}
            </p>
            <div className="hero-ctas rise d6">
              <Link className="btn btn-accent btn-lg shine" to="/messages">Read the messages</Link>
              <Link className="btn btn-outline-light btn-lg" to="/book">Book time with Pastor</Link>
            </div>
          </div>

          <div className="hero-art">
            <div className="hero-glow" aria-hidden="true" />
            <svg className="hero-ring" viewBox="0 0 470 470" aria-hidden="true">
              <circle cx="235" cy="235" r="226" fill="none" stroke="#D62839" strokeWidth="1.5" strokeDasharray="3 12" opacity=".7" />
              <circle cx="235" cy="9" r="6" fill="#FF8A94" />
            </svg>
            <div className="arch">
              {site.portraitUrl && <img src={site.portraitUrl} alt={site.displayName} fetchPriority="high" />}
            </div>
            <Link to="/book" className="float-card light float" style={{ textDecoration: 'none' }}>
              <span className="dot pulse" style={{ width: 12, height: 12 }} />
              <span>
                <small>Book a meeting</small>
                <strong>In person or WhatsApp call</strong>
              </span>
            </Link>
            {posts?.[0] ? (
              <Link to={`/messages/${posts[0].slug}`} className="float-card dark float" style={{ textDecoration: 'none', color: 'inherit' }}>
                <small>New message</small>
                <strong>{posts[0].title}</strong>
              </Link>
            ) : site.scriptureRef && (
              <div className="float-card dark float">
                <small>{site.scriptureRef}</small>
                <strong>{site.scripture && site.scripture.length > 70 ? `${site.scripture.slice(0, 70)}…` : site.scripture}</strong>
              </div>
            )}
          </div>
        </div>
        <div className="marquee-band" aria-hidden="true">
          <div className="marquee">
            {(() => { const names = series.length >= 3 ? series.map((x) => x.name) : THEMES; return [...names, ...names]; })().map((t, i) => (
              <span key={i} style={{ display: 'flex', gap: 48 }}>
                <span>{t}</span>
                <span className="sep">✦</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="messages">
        <div className="container">
          <div className="section-head" data-reveal>
            <div>
              <p className="eyebrow">Messages</p>
              <h2 className="section-title">Fresh from the pulpit</h2>
            </div>
            <Link to="/messages" style={{ fontWeight: 600, textDecoration: 'none' }}>All messages →</Link>
          </div>
          {posts && posts.length > 0 ? (
            <>
              <MessageCard p={posts[0]} big />
              {posts.length > 1 && (
                <div className="msg-grid" style={{ marginTop: 28 }}>
                  {posts.slice(1).map((p) => <MessageCard key={p.id} p={p} />)}
                </div>
              )}
            </>
          ) : (
          <div className="empty-feature" data-reveal>
            <ScriptureCover verse={verse.text} reference={verse.ref} />
            <div className="copy">
              <span className="pill pill-accent" style={{ alignSelf: 'flex-start' }}>Coming soon</span>
              <h3 style={{ fontSize: 34 }}>The first messages are on their way</h3>
              <p className="muted" style={{ fontSize: 17, lineHeight: 1.7 }}>
                {site.displayName} will share his messages here. Each one can be read, or listened to on your phone.
              </p>
            </div>
          </div>
          )}
        </div>
      </section>

      <section style={{ padding: '0 var(--page-x) 96px' }}>
        <div className="band" data-reveal>
          <div className="orb orb-b" aria-hidden="true" />
          <div className="band-copy">
            <p className="eyebrow on-dark">Meet with Pastor</p>
            <h2>Need to talk? Book a meeting in under a minute.</h2>
            <p>In person{site.meetingAddress ? ' at his office' : ''}, or by WhatsApp call. You're confirmed instantly by email and WhatsApp.</p>
            <Link className="btn btn-accent btn-lg shine" to="/book">See available times</Link>
          </div>
          <ol className="steps">
            {[
              ['Pick a time', "Only Pastor's free hours are shown"],
              ['Tell us briefly', 'Kept confidential, seen only by Pastor'],
              ["You're confirmed", 'Instantly, with reminders before you meet'],
            ].map(([title, sub], i) => (
              <li key={title}>
                <span className="step-num" style={{ animationDelay: `${i * 1.2}s` }}>{i + 1}</span>
                <span>
                  <strong>{title}</strong>
                  <span>{sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="about" style={{ padding: '0 var(--page-x) 112px' }}>
        <div className="about">
          {site.aboutPhotoUrl && (
            <div className="about-photo" data-reveal>
              <img src={site.aboutPhotoUrl} alt={`${site.displayName} ministering`} loading="lazy" />
              <span className="tag">{site.titleLine.split(',').slice(1).join(',').trim() || site.titleLine}</span>
            </div>
          )}
          <div className="about-copy" data-reveal>
            <p className="eyebrow">About</p>
            <h2>{site.displayName}</h2>
            <p className="lead">{site.titleLine}</p>
            {site.story && <p className="lead">{site.story}</p>}
            {site.scripture && (
              <blockquote className="quote">
                “{site.scripture}”
                {site.scriptureRef && <cite>{site.scriptureRef}</cite>}
              </blockquote>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
