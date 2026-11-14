import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { PostCard, PostFull, SeriesItem } from '../../api/types';
import { Backdrop } from '../../components/Backdrop';
import { coverOf, ListenPlayer, MessageCard, postDate, ShareBar } from '../../components/MessageBits';
import { ScriptureCover } from '../../components/ScriptureCover';
import { useReveal } from '../../hooks/useReveal';
import { useSite } from '../../hooks/useSite';
import { fmtDate } from '../../lib/format';

function setTitle(t: string) {
  document.title = t;
}

export function MessagesPage() {
  const { site } = useSite();
  const [params, setParams] = useSearchParams();
  const series = params.get('series') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [posts, setPosts] = useState<PostCard[] | null>(null);
  const [allSeries, setAllSeries] = useState<SeriesItem[]>([]);
  useReveal([posts]);

  useEffect(() => {
    api.get<{ series: SeriesItem[] }>('/api/posts/series').then((r) => setAllSeries(r.series)).catch(() => {});
  }, []);
  useEffect(() => {
    setPosts(null);
    const t = setTimeout(() => {
      const qs = new URLSearchParams();
      if (series) qs.set('series', series);
      if (q.trim()) qs.set('q', q.trim());
      api.get<{ posts: PostCard[] }>(`/api/posts?${qs}`).then((r) => setPosts(r.posts)).catch(() => setPosts([]));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [series, q]);
  useEffect(() => {
    if (site) setTitle(`Messages · ${site.displayName}`);
  }, [site]);

  const [first, ...rest] = posts ?? [];
  const filtering = Boolean(series || q.trim());

  return (
    <>
      <section className="page-hero" style={{ paddingBottom: 72 }}>
        <Backdrop stars={12} rays={{ x: '80%', y: '30%', size: 1300 }} />
        <div className="page-hero-inner">
          <div>
            <p className="eyebrow on-dark rise">Messages</p>
            <h1 className="rise d1">Fresh from the pulpit</h1>
            <p className="rise d2" style={{ marginTop: 14, color: 'var(--on-brand-2)', fontSize: 17, maxWidth: 560 }}>
              Read or listen to messages from {site?.displayName ?? "Rev'd Silas O. Dada"}.
            </p>
          </div>
          <label className="search rise d3">
            <span className="sr-only">Search messages</span>
            <input className="input" type="search" placeholder="Search by title or scripture" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          {allSeries.length > 0 && (
            <div className="chips" style={{ marginBottom: 32 }}>
              <button type="button" className="chip" aria-pressed={!series} onClick={() => setParams({})}>All messages</button>
              {allSeries.map((s) => (
                <button key={s.slug} type="button" className="chip" aria-pressed={series === s.slug} onClick={() => setParams({ series: s.slug })}>
                  {s.name} <span style={{ opacity: 0.6 }}>· {s.count}</span>
                </button>
              ))}
            </div>
          )}
          {!posts ? (
            <div className="page-loading" style={{ minHeight: 240 }}><span className="spinner" /></div>
          ) : !posts.length ? (
            <div className="empty-feature">
              <ScriptureCover verse="Thy word is a lamp unto my feet, and a light unto my path." reference="Psalm 119:105 · KJV" />
              <div className="copy">
                <h3 style={{ fontSize: 30 }}>{filtering ? 'No messages match that search' : 'The first messages are on their way'}</h3>
                <p className="muted" style={{ fontSize: 17 }}>{filtering ? 'Try another word or series.' : 'Please check back soon.'}</p>
              </div>
            </div>
          ) : (
            <>
              {!filtering && first && <MessageCard p={first} big />}
              <div className="msg-grid" style={{ marginTop: !filtering && first ? 28 : 0 }}>
                {(filtering ? posts : rest).map((p) => <MessageCard key={p.id} p={p} />)}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

export function MessagePage() {
  const { slug = '' } = useParams();
  const { site } = useSite();
  const [data, setData] = useState<{ post: PostFull; inSeries: PostCard[]; more: PostCard[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useReveal([data]);

  useEffect(() => {
    setData(null);
    setError(null);
    api.get<{ post: PostFull; inSeries: PostCard[]; more: PostCard[] }>(`/api/posts/${slug}`)
      .then((r) => {
        setData(r);
        setTitle(`${r.post.title} · ${site?.displayName ?? "Rev'd Silas O. Dada"}`);
        window.scrollTo(0, 0);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this message.'));
  }, [slug, site?.displayName]);

  // reading progress bar
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      setProgress(Math.min(100, (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const listenText = useMemo(() => {
    if (!data) return '';
    const div = document.createElement('div');
    div.innerHTML = data.post.body;
    return `${data.post.title}. ${div.innerText || div.textContent || ''}`;
  }, [data]);

  if (error)
    return (
      <section className="simple-page">
        <div className="box">
          <h1>Message not found</h1>
          <p className="muted">{error}</p>
          <Link className="btn btn-accent" to="/messages">See all messages</Link>
        </div>
      </section>
    );
  if (!data) return <div className="page-loading"><span className="spinner" /></div>;

  const { post, inSeries, more } = data;
  const c = coverOf(post);
  const d = postDate(post);
  const url = `${window.location.origin}/messages/${post.slug}`;
  const words = c.verse.split(/\s+/);

  return (
    <>
      <div className="read-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      <section className="msg-hero">
        <Backdrop stars={12} rays={{ x: '50%', y: '90%', size: 1500 }} />
        <div className="msg-hero-inner">
          {post.series && (
            <Link className="eyebrow on-dark rise" to={`/messages?series=${post.series.slug}`} style={{ textDecoration: 'none' }}>
              {post.series.name}{post.seriesPart ? ` · Part ${post.seriesPart}` : ''}
            </Link>
          )}
          <h1 className="rise d1">{post.title}</h1>
          <div className="msg-meta rise d2">
            <span>{site?.displayName}</span>
            {d && <><i>•</i><span>{fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span></>}
            <i>•</i><span>{post.readMinutes} min read</span>
            {post.scriptureRefs && <><i>•</i><span style={{ color: 'var(--accent-glow)' }}>{post.scriptureRefs}</span></>}
          </div>
        </div>
      </section>

      <div style={{ padding: '0 var(--page-x)' }}>
        <ScriptureCover verse="" reference={c.ref} style={post.coverStyle} className="msg-big-cover rise d3">
          <p className="cover-verse big-verse">
            “{words.map((w, i) => <span key={i} className="w" style={{ animationDelay: `${0.5 + i * 0.06}s` }}>{i < words.length - 1 ? `${w} ` : w}</span>)}”
          </p>
          <ListenPlayer text={listenText} minutes={post.readMinutes} />
        </ScriptureCover>
      </div>

      <div className="msg-body-wrap">
        <ShareBar url={url} caption={post.shareCaption ?? post.title} />
        <article className="prose">
          {post.excerpt && <p className="lede">{post.excerpt}</p>}
          <div dangerouslySetInnerHTML={{ __html: post.body }} />
          {post.discussion.length > 0 && (
            <div className="discussion" data-reveal>
              <h2>For reflection and cell groups</h2>
              <ol>{post.discussion.map((q, i) => <li key={i}>{q}</li>)}</ol>
            </div>
          )}
        </article>
        <aside className="msg-aside">
          <div className="card author">
            {site?.portraitUrl && <img src={site.portraitUrl} alt="" />}
            <span>
              <strong>{site?.displayName}</strong>
              <span className="muted">{site?.titleLine}</span>
            </span>
          </div>
          <div className="aside-cta">
            <p className="t">Want to talk about this?</p>
            <p>Book a short meeting with Rev'd Dada, in person or by WhatsApp call.</p>
            <Link className="btn btn-accent btn-sm shine" to="/book">See free times</Link>
          </div>
          {inSeries.length > 1 && (
            <div className="card">
              <p style={{ fontWeight: 600, marginBottom: 12 }}>In this series</p>
              <ol className="series-list">
                {inSeries.map((s) => (
                  <li key={s.id} className={s.id === post.id ? 'on' : ''}>
                    {s.id === post.id ? <span>{s.seriesPart ? `${s.seriesPart} · ` : ''}{s.title}</span> : <Link to={`/messages/${s.slug}`}>{s.seriesPart ? `${s.seriesPart} · ` : ''}{s.title}</Link>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>

      {more.length > 0 && (
        <section className="section" style={{ background: 'var(--surface)', borderTop: '1px solid var(--line)' }}>
          <div className="container">
            <h2 className="section-title" style={{ fontSize: 34, marginBottom: 28 }}>Keep reading</h2>
            <div className="msg-grid">{more.map((p) => <MessageCard key={p.id} p={p} />)}</div>
          </div>
        </section>
      )}
    </>
  );
}
