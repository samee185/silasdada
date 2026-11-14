import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { SermonDraft } from '../../api/types';
import { Sparkle } from '../../components/Icons';
import { ScriptureCover } from '../../components/ScriptureCover';
import { fmtShort, fmtTime } from '../../lib/format';

/** The "paste your notes" box, on the dashboard home and the AI drafts page. */
export function DraftBox({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ id: string }>('/api/ai/sermon-draft', { notes });
      navigate(`/admin/ai/${r.id}`);
      setNotes('');
    } catch (e) {
      setError(e instanceof ApiError ? e.fields.notes ?? e.message : 'Could not create the draft.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ai-box">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Sparkle width={22} height={22} style={{ color: 'var(--accent-glow)' }} />
        <h2 style={{ fontSize: 22 }}>Turn Sunday's sermon into a message</h2>
      </div>
      <label className="field" style={{ color: 'var(--on-brand-3)', fontWeight: 400 }}>
        Paste your sermon notes or a transcript
        <textarea
          className="textarea"
          rows={compact ? 4 : 10}
          placeholder="e.g. Isaiah 40:31 — waiting is not wasting. Three things God does while we wait…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
        />
      </label>
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <button type="button" className="btn shimmer" disabled={busy || notes.trim().length < 80} onClick={run}>
          {busy ? 'Writing your draft…' : 'Draft with AI'}
        </button>
        {busy ? (
          <span className="thinking"><i /><i /><i /> This takes about 20–40 seconds</span>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--on-brand-3)' }}>Saved as a draft. Nothing is published until you approve it.</span>
        )}
      </div>
    </section>
  );
}

type DraftDetail = { id: string; createdAt: string; postId: string | null; notes: string; draft: SermonDraft };
type DraftRow = { id: string; createdAt: string; postId: string | null; title: string; preview: string };

export function AiDraftsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [detail, setDetail] = useState<DraftDetail | null>(null);
  const [titleIndex, setTitleIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ drafts: DraftRow[] }>('/api/ai/drafts').then((r) => setRows(r.drafts)).catch(() => {});
  }, [id]);
  useEffect(() => {
    setDetail(null);
    setTitleIndex(0);
    if (id) api.get<DraftDetail>(`/api/ai/drafts/${id}`).then(setDetail).catch(() => setDetail(null));
  }, [id]);

  async function toPost() {
    if (!detail) return;
    setBusy(true);
    try {
      const r = await api.post<{ postId: string }>(`/api/ai/drafts/${detail.id}/post`, { titleIndex });
      navigate(`/admin/messages/${r.postId}`);
    } finally {
      setBusy(false);
    }
  }

  const d = detail?.draft;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>AI drafts</h1>
          <p>Paste your notes and get a first draft in your own words. You check and edit everything before it goes live.</p>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!id && <DraftBox />}
          {id && !d && <div className="card page-loading" style={{ minHeight: 220 }}><span className="spinner" /></div>}
          {d && (
            <div className="card draft-view slide-in">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="pill pill-accent">✦ AI draft · {fmtShort(detail!.createdAt)}, {fmtTime(detail!.createdAt)}</span>
                {detail!.postId ? (
                  <Link className="btn btn-dark btn-sm" to={`/admin/messages/${detail!.postId}`}>Open the message</Link>
                ) : (
                  <button type="button" className="btn btn-accent btn-sm shine" disabled={busy} onClick={toPost}>{busy && <span className="spinner" />} Create message from this draft</button>
                )}
              </div>
              <div>
                <p className="step-label" style={{ color: 'var(--muted)' }}>Pick a title</p>
                <div className="title-opts">
                  {d.titles.map((t, i) => (
                    <button key={i} type="button" aria-pressed={titleIndex === i} onClick={() => setTitleIndex(i)}>{t}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <ScriptureCover verse={d.coverVerse || d.excerpt} reference={d.coverRef || d.scriptureRefs[0] || 'Message'} className="mini-cover" verseSize="19px" css={{ flex: '1 1 260px' }} />
                <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p className="step-label" style={{ color: 'var(--muted)' }}>Summary</p>
                  <p>{d.excerpt}</p>
                  {d.scriptureRefs.length > 0 && (
                    <div className="alert alert-info">
                      <strong>Scriptures mentioned:</strong> {d.scriptureRefs.join('; ')}
                      <br />
                      <span style={{ fontSize: 13 }}>Please check each reference and the cover verse against your Bible.</span>
                    </div>
                  )}
                </div>
              </div>
              {d.keyPoints.length > 0 && (
                <div>
                  <p className="step-label" style={{ color: 'var(--muted)' }}>Key points</p>
                  <ol style={{ margin: 0, paddingLeft: 22 }}>{d.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ol>
                </div>
              )}
              <div>
                <p className="step-label" style={{ color: 'var(--muted)' }}>The message</p>
                <div className="prose" style={{ fontSize: 17, maxWidth: 'none' }} dangerouslySetInnerHTML={{ __html: d.bodyHtml }} />
              </div>
              {d.discussion.length > 0 && (
                <div className="discussion" style={{ marginTop: 0 }}>
                  <h2 style={{ fontSize: 20 }}>Questions for cell groups</h2>
                  <ol>{d.discussion.map((q, i) => <li key={i}>{q}</li>)}</ol>
                </div>
              )}
              <details>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>WhatsApp caption and Google description</summary>
                <p style={{ marginTop: 10 }}><strong>WhatsApp:</strong> {d.shareCaption}</p>
                <p style={{ marginTop: 6 }}><strong>Google:</strong> {d.seoDescription}</p>
              </details>
            </div>
          )}
        </div>
        <aside className="card" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ fontSize: 20 }}>Earlier drafts</h2>
            {id && <Link to="/admin/ai" className="btn btn-ghost btn-sm">+ New</Link>}
          </div>
          {!rows.length ? (
            <p className="muted" style={{ fontSize: 14 }}>Your drafts will be listed here.</p>
          ) : (
            <div className="table-list">
              {rows.map((r) => (
                <Link key={r.id} to={`/admin/ai/${r.id}`} className="row" style={{ textDecoration: 'none', color: 'var(--ink)', background: r.id === id ? 'var(--surface-2)' : undefined, borderRadius: 10 }}>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{r.title}</strong>
                    <span className="muted" style={{ fontSize: 13 }}>{fmtShort(r.createdAt)}{r.postId ? ' · made into a message' : ''}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
