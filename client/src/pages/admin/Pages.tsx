import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { User } from '../../api/types';
import { TextField } from '../../components/Field';
import { Trash } from '../../components/Icons';
import { useAuth } from '../../hooks/useAuth';
import { ContactForm, ProfileForm } from './forms';

const saveButton = (save: () => Promise<boolean>, busy: boolean) => (
  <div>
    <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void save()}>
      {busy && <span className="spinner" />} Save changes
    </button>
  </div>
);

/** Website content: Rev'd Dada and his secretary can both edit this. */
export function WebsiteContentPage() {
  const [tab, setTab] = useState<'profile' | 'contact'>('profile');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Website content</h1>
          <p>Changes show on the website as soon as you save.</p>
        </div>
      </div>
      <div className="chips" role="tablist" style={{ marginBottom: 24 }}>
        <button type="button" role="tab" className="chip" aria-selected={tab === 'profile'} aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>
          Profile and story
        </button>
        <button type="button" role="tab" className="chip" aria-selected={tab === 'contact'} aria-pressed={tab === 'contact'} onClick={() => setTab('contact')}>
          Contact and socials
        </button>
      </div>
      <div className="card" key={tab}>
        {tab === 'profile' ? <ProfileForm actions={saveButton} /> : <ContactForm actions={saveButton} />}
      </div>
    </>
  );
}

/** The pastor creates or removes his secretary's login. */
export function TeamPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<(User & { createdAt: string })[]>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get<{ users: (User & { createdAt: string })[] }>('/api/team').then((r) => setUsers(r.users));
  useEffect(() => {
    void load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post('/api/team', form);
      setNotice(`Login created for ${form.email}. Share the password with her privately. She can change it under My account after signing in.`);
      setForm({ name: '', email: '', password: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not create the login.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: User) {
    if (!window.confirm(`Remove ${u.name}'s login? She will no longer be able to sign in.`)) return;
    await api.del(`/api/team/${u.id}`);
    await load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Secretary access</h1>
          <p>Your secretary can upload messages and edit website content. She can never see your appointments.</p>
        </div>
      </div>
      <div className="grid-2">
        <section className="card">
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>Who can sign in</h2>
          <div className="table-list">
            {users.map((u) => (
              <div className="row" key={u.id}>
                <span>
                  <strong style={{ display: 'block' }}>{u.name}</strong>
                  <span className="muted" style={{ fontSize: 14 }}>{u.email}</span>
                </span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className={`pill ${u.role === 'OWNER' ? 'pill-accent' : 'pill-muted'}`}>{u.role === 'OWNER' ? 'Pastor' : 'Secretary'}</span>
                  {u.role !== 'OWNER' && u.id !== user?.id && (
                    <button type="button" className="icon-btn" aria-label={`Remove ${u.name}`} onClick={() => remove(u)}>
                      <Trash width={16} height={16} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
        <form className="card" onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 22 }}>Add a secretary</h2>
          {error && !Object.keys(error.fields).length && <div className="alert alert-error">{error.message}</div>}
          {notice && <div className="alert alert-success">{notice}</div>}
          <TextField label="Her name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={error?.fields.name} />
          <TextField label="Her email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={error?.fields.email} />
          <TextField label="Temporary password" type="text" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={error?.fields.password} hint="At least 10 characters." />
          <button className="btn btn-dark" disabled={busy}>{busy && <span className="spinner" />} Create login</button>
        </form>
      </div>
    </>
  );
}

export function SoonPage({ title, text }: { title: string; text: string }) {
  return (
    <>
      <div className="page-head"><div><h1>{title}</h1></div></div>
      <div className="card" style={{ maxWidth: 640 }}>
        <span className="pill pill-accent">Next update</span>
        <p style={{ marginTop: 12, fontSize: 16, color: 'var(--ink-2)' }}>{text}</p>
      </div>
    </>
  );
}

/** Name, email and password change. Everyone can open this page. */
export function AccountPage() {
  const { user } = useAuth();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    if (f.next !== f.confirm) {
      setError(new ApiError(400, 'Some fields need attention.', { confirm: 'The two new passwords do not match.' }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/password', { current: f.current, next: f.next });
      setDone(true);
      setF({ current: '', next: '', confirm: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not change the password.'));
    } finally {
      setBusy(false);
    }
  }
  if (!user) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My account</h1>
          <p>Signed in as {user.name} · {user.email}</p>
        </div>
      </div>
      <form className="card" onSubmit={submit} style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 22 }}>Change password</h2>
        <p className="muted" style={{ fontSize: 14 }}>You'll stay signed in here. Any other phone or computer signed in to this account will be signed out.</p>
        {error && !Object.keys(error.fields).length && <div className="alert alert-error">{error.message}</div>}
        {done && <div className="alert alert-success">Password changed.</div>}
        <TextField label="Current password" type="password" autoComplete="current-password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} error={error?.fields.current} />
        <TextField label="New password" type="password" autoComplete="new-password" required minLength={10} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} error={error?.fields.next} hint="At least 10 characters." />
        <TextField label="Type the new password again" type="password" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} error={error?.fields.confirm} />
        <button className="btn btn-dark" disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy && <span className="spinner" />} Change password</button>
      </form>
    </>
  );
}
