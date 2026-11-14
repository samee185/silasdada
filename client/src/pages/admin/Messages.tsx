import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { api, ApiError } from '../../api/client';
import type { AdminPost, PostFull, SeriesItem } from '../../api/types';
import { SelectField, TextArea, TextField } from '../../components/Field';
import { COVER_STYLES, ScriptureCover } from '../../components/ScriptureCover';
import { fmtShort, fmtTime } from '../../lib/format';
import { Modal, Toast } from './Appointments';

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'pill-muted' },
  SCHEDULED: { label: 'Scheduled', cls: 'pill-accent' },
  PUBLISHED: { label: 'Published', cls: 'pill-success' },
};

export function AdminMessagesPage() {
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'DRAFT' | 'SCHEDULED' | 'PUBLISHED'>('ALL');
  const [seriesOpen, setSeriesOpen] = useState(false);
  const load = () => {
    api.get<{ posts: AdminPost[] }>('/api/admin/posts').then((r) => setPosts(r.posts));
    api.get<{ series: SeriesItem[] }>('/api/admin/posts/series').then((r) => setSeries(r.series));
  };
  useEffect(load, []);
  const shown = (posts ?? []).filter((p) => filter === 'ALL' || p.status === filter);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p>Write, schedule and publish messages. Each one gets its own scripture cover and a Listen button.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setSeriesOpen(true)}>Series ({series.length})</button>
          <Link className="btn btn-ghost" to="/admin/ai">✦ Draft with AI</Link>
          <Link className="btn btn-dark" to="/admin/messages/new">+ New message</Link>
        </div>
      </div>
      <div className="tabs">
        {(['ALL', 'DRAFT', 'SCHEDULED', 'PUBLISHED'] as const).map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'ALL' ? 'All' : STATUS[f].label}
          </button>
        ))}
      </div>
      <div className="card">
        {!posts ? (
          <div className="page-loading" style={{ minHeight: 160 }}><span className="spinner" /></div>
        ) : !shown.length ? (
          <p className="muted">No messages here yet. Start with “Draft with AI” — paste Sunday's notes and get a ready-to-edit message.</p>
        ) : (
          shown.map((p) => (
            <div className="post-row" key={p.id}>
              <span style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0, flex: '1 1 300px' }}>
                <span className="swatch" style={{ background: COVER_STYLES[p.coverStyle % 4].bg }} />
                <span style={{ minWidth: 0 }}>
                  <Link to={`/admin/messages/${p.id}`} style={{ fontWeight: 600, fontSize: 17, color: 'var(--ink)', textDecoration: 'none' }}>{p.title}</Link>
                  <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                    {[p.series?.name, p.scriptureRefs].filter(Boolean).join(' · ') || 'No series'} · edited {fmtShort(p.updatedAt)}
                    {p.status === 'SCHEDULED' && p.publishedAt ? ` · goes live ${fmtShort(p.publishedAt)}, ${fmtTime(p.publishedAt)}` : ''}
                  </span>
                </span>
              </span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className={`pill ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                {p.status === 'PUBLISHED' && <a className="btn btn-ghost btn-sm" href={`/messages/${p.slug}`} target="_blank" rel="noreferrer">View</a>}
                <Link className="btn btn-dark btn-sm" to={`/admin/messages/${p.id}`}>Edit</Link>
              </span>
            </div>
          ))
        )}
      </div>
      {seriesOpen && <SeriesManager series={series} onClose={() => setSeriesOpen(false)} onChange={load} />}
    </>
  );
}

function SeriesManager({ series, onClose, onChange }: { series: SeriesItem[]; onClose: () => void; onChange: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function add() {
    setError(null);
    try {
      await api.post('/api/admin/posts/series', { name, description });
      setName('');
      setDescription('');
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.fields.name ?? e.message : 'Could not add.');
    }
  }
  return (
    <Modal title="Series" onClose={onClose}>
      <p className="muted" style={{ fontSize: 14 }}>Group messages that belong together, e.g. “Faith for Hard Seasons”.</p>
      <div className="table-list">
        {series.map((s) => (
          <div className="row" key={s.id}>
            <span><strong>{s.name}</strong> <span className="muted" style={{ fontSize: 13 }}>· {s.count} message{s.count === 1 ? '' : 's'}</span></span>
            <button type="button" className="btn-link" onClick={async () => { if (window.confirm(`Delete the series “${s.name}”? Its messages stay, just without a series.`)) { await api.del(`/api/admin/posts/series/${s.id}`); onChange(); } }}>Delete</button>
          </div>
        ))}
      </div>
      <TextField label="New series name" value={name} onChange={(e) => setName(e.target.value)} />
      <TextArea label="Short description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Done</button>
        <button type="button" className="btn btn-dark" disabled={name.trim().length < 2} onClick={add}>Add series</button>
      </div>
    </Modal>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const b = (label: string, on: boolean, run: () => void, title: string) => (
    <button type="button" aria-pressed={on} title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={run}>{label}</button>
  );
  const c = () => editor.chain().focus();
  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      {b('B', editor.isActive('bold'), () => c().toggleBold().run(), 'Bold')}
      {b('I', editor.isActive('italic'), () => c().toggleItalic().run(), 'Italic')}
      {b('U', editor.isActive('underline'), () => c().toggleUnderline().run(), 'Underline')}
      {b('H2', editor.isActive('heading', { level: 2 }), () => c().toggleHeading({ level: 2 }).run(), 'Heading')}
      {b('H3', editor.isActive('heading', { level: 3 }), () => c().toggleHeading({ level: 3 }).run(), 'Smaller heading')}
      {b('• List', editor.isActive('bulletList'), () => c().toggleBulletList().run(), 'Bullet list')}
      {b('1. List', editor.isActive('orderedList'), () => c().toggleOrderedList().run(), 'Numbered list')}
      {b('“ Quote', editor.isActive('blockquote'), () => c().toggleBlockquote().run(), 'Scripture or quote block')}
      {b('Link', editor.isActive('link'), () => {
        const prev = editor.getAttributes('link').href as string | undefined;
        const url = window.prompt('Link address (leave empty to remove):', prev ?? 'https://');
        if (url === null) return;
        if (!url || url === 'https://') c().unsetLink().run();
        else c().setLink({ href: url }).run();
      }, 'Link')}
      {b('↶', false, () => c().undo().run(), 'Undo')}
      {b('↷', false, () => c().redo().run(), 'Redo')}
    </div>
  );
}

type Form = {
  title: string; slug: string; excerpt: string; body: string; scriptureRefs: string; coverVerse: string; coverRef: string; coverStyle: number;
  seriesId: string; seriesPart: string; preachedOn: string; tags: string; discussion: string[]; status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED';
  publishAt: string; seoTitle: string; seoDescription: string; shareCaption: string;
};

const blank: Form = {
  title: '', slug: '', excerpt: '', body: '', scriptureRefs: '', coverVerse: '', coverRef: '', coverStyle: 0, seriesId: '', seriesPart: '',
  preachedOn: '', tags: '', discussion: ['', '', ''], status: 'DRAFT', publishAt: '', seoTitle: '', seoDescription: '', shareCaption: '',
};

/** ISO → "2026-11-15T09:00" in Lagos time for <input type="datetime-local">. */
const toLocalInput = (iso: string) => new Date(new Date(iso).getTime() + 3600_000).toISOString().slice(0, 16);
const fromLocalInput = (v: string) => new Date(`${v}:00+01:00`).toISOString();

export function PostEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState<Form | null>(id ? null : blank);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false } })],
    content: '',
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: e }) => setF((cur) => (cur ? { ...cur, body: e.getHTML() } : cur)),
  });

  useEffect(() => {
    api.get<{ series: SeriesItem[] }>('/api/admin/posts/series').then((r) => setSeries(r.series));
    if (!id) return;
    api.get<{ post: PostFull }>(`/api/admin/posts/${id}`).then(({ post: p }) => {
      setSlug(p.status === 'PUBLISHED' ? p.slug : null);
      const disc = [...p.discussion];
      while (disc.length < 3) disc.push('');
      setF({
        title: p.title, slug: p.slug, excerpt: p.excerpt ?? '', body: p.body, scriptureRefs: p.scriptureRefs ?? '', coverVerse: p.coverVerse ?? '',
        coverRef: p.coverRef ?? '', coverStyle: p.coverStyle, seriesId: p.seriesId ?? '', seriesPart: p.seriesPart ? String(p.seriesPart) : '',
        preachedOn: p.preachedOn ? p.preachedOn.slice(0, 10) : '', tags: p.tags ?? '', discussion: disc, status: p.status,
        publishAt: p.status === 'SCHEDULED' && p.publishedAt ? toLocalInput(p.publishedAt) : '', seoTitle: p.seoTitle ?? '',
        seoDescription: p.seoDescription ?? '', shareCaption: p.shareCaption ?? '',
      });
    });
  }, [id]);

  // load the body into the editor once the post arrives
  useEffect(() => {
    if (editor && f && editor.getHTML() !== f.body && (editor.isEmpty || !editor.isFocused)) editor.commands.setContent(f.body || '', { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, f === null]);

  if (!f || !editor) return <div className="page-loading"><span className="spinner" /></div>;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save(status: Form['status']) {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        title: f.title, slug: f.slug, excerpt: f.excerpt, body: editor!.getHTML(), scriptureRefs: f.scriptureRefs, coverVerse: f.coverVerse,
        coverRef: f.coverRef, coverStyle: f.coverStyle, seriesId: f.seriesId, seriesPart: f.seriesPart ? Number(f.seriesPart) : null,
        preachedOn: f.preachedOn, tags: f.tags, discussion: f.discussion.map((d) => d.trim()).filter(Boolean), status,
        publishedAt: status === 'SCHEDULED' && f.publishAt ? fromLocalInput(f.publishAt) : null,
        seoTitle: f.seoTitle, seoDescription: f.seoDescription, shareCaption: f.shareCaption,
      };
      const r = id ? await api.put<{ post: PostFull }>(`/api/admin/posts/${id}`, body) : await api.post<{ post: PostFull }>('/api/admin/posts', body);
      setF({ ...f, status: r.post.status, slug: r.post.slug });
      setSlug(r.post.status === 'PUBLISHED' ? r.post.slug : null);
      setToast(status === 'PUBLISHED' ? 'Published. It is live on your site.' : status === 'SCHEDULED' ? 'Scheduled. It will go live at the chosen time.' : 'Draft saved.');
      if (!id) navigate(`/admin/messages/${r.post.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!id || !window.confirm('Delete this message for good?')) return;
    await api.del(`/api/admin/posts/${id}`);
    navigate('/admin/messages');
  }

  const err = error?.fields ?? {};
  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/admin/messages" style={{ fontSize: 14, textDecoration: 'none', color: 'var(--muted)' }}>← All messages</Link>
          <p style={{ marginTop: 6 }}><span className={`pill ${STATUS[f.status].cls}`}>{STATUS[f.status].label}</span></p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {slug && <a className="btn btn-ghost btn-sm" href={`/messages/${slug}`} target="_blank" rel="noreferrer">View on site</a>}
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save('DRAFT')}>{f.status === 'PUBLISHED' ? 'Unpublish (save as draft)' : 'Save draft'}</button>
          <button type="button" className="btn btn-accent btn-sm shine" disabled={busy} onClick={() => save('PUBLISHED')}>{busy && <span className="spinner" />} {f.status === 'PUBLISHED' ? 'Update' : 'Publish now'}</button>
        </div>
      </div>
      {error && !Object.keys(err).length && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error.message}</div>}

      <div className="editor-wrap">
        <div className="editor-main">
          <input className="title-input" placeholder="Message title" value={f.title} onChange={set('title')} aria-label="Title" />
          {err.title && <span className="error" style={{ color: 'var(--danger-text)', fontSize: 13 }}>{err.title}</span>}
          <TextArea label="Summary (shown on the message cards)" rows={2} value={f.excerpt} onChange={set('excerpt')} error={err.excerpt} />
          <div className="editor-box">
            <Toolbar editor={editor} />
            <EditorContent editor={editor} />
          </div>
          {err.body && <div className="alert alert-error">{err.body}</div>}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <strong>Questions for reflection and cell groups</strong>
            {f.discussion.map((q, i) => (
              <input key={i} className="input" placeholder={`Question ${i + 1}`} value={q} onChange={(e) => setF({ ...f, discussion: f.discussion.map((x, j) => (j === i ? e.target.value : x)) })} />
            ))}
            {f.discussion.length < 6 && <button type="button" className="add-link" onClick={() => setF({ ...f, discussion: [...f.discussion, ''] })}>+ Add a question</button>}
          </div>
        </div>

        <aside className="editor-side">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong>Scripture cover</strong>
            <ScriptureCover verse={f.coverVerse || f.excerpt || f.title || 'Your verse appears here'} reference={f.coverRef || f.scriptureRefs.split(/[;,]/)[0] || 'Reference'} style={f.coverStyle} className="mini-cover" verseSize="19px" />
            <div className="style-picks" role="group" aria-label="Cover colours">
              {COVER_STYLES.map((c, i) => (
                <button key={i} type="button" aria-pressed={f.coverStyle === i} aria-label={`Colour ${i + 1}`} style={{ background: `linear-gradient(135deg, ${c.bg} 60%, ${c.sun} 60%)` }} onClick={() => setF({ ...f, coverStyle: i })} />
              ))}
            </div>
            <TextArea label="Cover verse or line" rows={3} value={f.coverVerse} onChange={set('coverVerse')} hint="Type the verse exactly from your Bible." />
            <TextField label="Cover reference" placeholder="e.g. Isaiah 40:31 · KJV" value={f.coverRef} onChange={set('coverRef')} />
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong>Details</strong>
            <TextField label="Scriptures referenced" placeholder="Isaiah 40:31; Psalm 27:14" value={f.scriptureRefs} onChange={set('scriptureRefs')} />
            <SelectField label="Series" value={f.seriesId} onChange={set('seriesId')}>
              <option value="">No series</option>
              {series.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectField>
            {f.seriesId && <TextField label="Part number" type="number" min={1} value={f.seriesPart} onChange={set('seriesPart')} />}
            <TextField label="Date preached" type="date" value={f.preachedOn} onChange={set('preachedOn')} />
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <strong>Schedule</strong>
            <TextField label="Publish automatically on (Lagos time)" type="datetime-local" value={f.publishAt} onChange={set('publishAt')} error={err.publishedAt} />
            <button type="button" className="btn btn-dark btn-sm" disabled={busy || !f.publishAt} onClick={() => save('SCHEDULED')}>Schedule</button>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button type="button" className="add-link" onClick={() => setMore(!more)}>{more ? '− Hide' : '+ Show'} sharing and Google settings</button>
            {more && (
              <>
                <TextArea label="WhatsApp share caption" rows={3} value={f.shareCaption} onChange={set('shareCaption')} />
                <TextField label="Title for Google (optional)" value={f.seoTitle} onChange={set('seoTitle')} />
                <TextArea label="Description for Google" rows={3} maxLength={300} value={f.seoDescription} onChange={set('seoDescription')} hint="About 150 characters." />
                <TextField label="Web address ending" value={f.slug} onChange={set('slug')} hint={`silasdada.com.ng/messages/${f.slug || '…'}`} />
              </>
            )}
          </div>
          {id && <button type="button" className="btn-link" onClick={remove} style={{ alignSelf: 'flex-start' }}>Delete this message</button>}
        </aside>
      </div>
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </>
  );
}
