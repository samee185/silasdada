import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Role } from '../../api/types';
import { Backdrop } from '../../components/Backdrop';
import { TextField } from '../../components/Field';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useAuth } from '../../hooks/useAuth';
import { useSite } from '../../hooks/useSite';

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { site } = useSite();
  return (
    <div className="auth-page">
      <Backdrop stars={14} rays={{ x: '50%', y: '20%', size: 1400 }} />
      <div style={{ position: 'absolute', top: 20, right: 20 }}>
        <ThemeToggle />
      </div>
      <div className="auth-card pop">
        <div className="who">
          {site?.portraitUrl && <img src={site.portraitUrl} alt="" />}
          <span>
            <strong style={{ display: 'block' }}>{site?.displayName ?? "Rev'd Silas O. Dada"}</strong>
            <span className="muted" style={{ fontSize: 13 }}>Dashboard</span>
          </span>
        </div>
        <div>
          <h1>{title}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{subtitle}</p>
        </div>
        {children}
        <Link to="/" style={{ fontSize: 14, textDecoration: 'none', color: 'var(--muted)' }}>← Back to the website</Link>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/admin'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/login', { email, password });
      await refresh();
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage your messages and appointments.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && !Object.keys(error.fields).length && <div className="alert alert-error">{error.message}</div>}
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={error?.fields.email} />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={error?.fields.password} />
        <button className="btn btn-accent btn-lg shine" disabled={busy}>
          {busy && <span className="spinner" />} Sign in
        </button>
        <Link to="/admin/forgot" style={{ fontSize: 14, textDecoration: 'none', alignSelf: 'flex-start' }}>Forgot your password?</Link>
      </form>
    </AuthShell>
  );
}

/** One-time page to create the owner account from the browser (needs SETUP_TOKEN in .env). */
export function ClaimPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [form, setForm] = useState({ token: '', name: "Rev'd Silas O. Dada", email: '', password: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ available: boolean }>('/api/auth/claim').then((r) => setAvailable(r.available)).catch(() => setAvailable(false));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/claim', form);
      await refresh();
      navigate('/admin/setup', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not create the account.'));
    } finally {
      setBusy(false);
    }
  }

  if (available === null) return <AuthShell title="One moment…" subtitle="Checking setup."><span className="spinner" /></AuthShell>;
  if (!available)
    return (
      <AuthShell title="Already set up" subtitle="The pastor's account exists. Please sign in.">
        <Link className="btn btn-accent" to="/admin/login">Go to sign in</Link>
      </AuthShell>
    );

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <AuthShell title="Create the pastor's account" subtitle="This page works once. Use the setup code from the server settings.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && !Object.keys(error.fields).length && <div className="alert alert-error">{error.message}</div>}
        <TextField label="Setup code" required value={form.token} onChange={set('token')} error={error?.fields.token} />
        <TextField label="Name" required value={form.name} onChange={set('name')} error={error?.fields.name} />
        <TextField label="Email he will sign in with" type="email" required value={form.email} onChange={set('email')} error={error?.fields.email} />
        <TextField label="Password" type="password" autoComplete="new-password" required minLength={10} value={form.password} onChange={set('password')} error={error?.fields.password} hint="At least 10 characters." />
        <button className="btn btn-accent btn-lg" disabled={busy}>{busy && <span className="spinner" />} Create account</button>
      </form>
    </AuthShell>
  );
}

/** Guards dashboard routes. Sends the pastor to first-time setup until it's finished. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user, loading, onboarded } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-loading"><span className="spinner" /></div>;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (user.role === 'OWNER' && !onboarded && location.pathname !== '/admin/setup') return <Navigate to="/admin/setup" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/forgot', { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not send the link.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send you a link to choose a new one.">
      {sent ? (
        <>
          <div className="alert alert-success">If an account uses {email}, a reset link is on its way. It works once and expires in 1 hour. Check your spam folder too.</div>
          <Link className="btn btn-dark" to="/admin/login">Back to sign in</Link>
        </>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && !error.fields.email && <div className="alert alert-error">{error.message}</div>}
          <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={error?.fields.email} />
          <button className="btn btn-accent btn-lg" disabled={busy}>{busy && <span className="spinner" />} Send reset link</button>
          <Link to="/admin/login" style={{ fontSize: 14, textDecoration: 'none' }}>Remembered it? Sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPage() {
  const { token = '' } = useParams();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(new ApiError(400, 'Some fields need attention.', { confirm: 'The two passwords do not match.' }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/reset', { token, password });
      await refresh();
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Could not reset the password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 10 characters. A short sentence is easy to remember and hard to guess.">
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && !Object.keys(error.fields).length && (
          <div className="alert alert-error">
            {error.message} <Link to="/admin/forgot">Get a new link</Link>
          </div>
        )}
        <TextField label="New password" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} error={error?.fields.password} />
        <TextField label="Type it again" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={error?.fields.confirm} />
        <button className="btn btn-accent btn-lg" disabled={busy}>{busy && <span className="spinner" />} Save and sign in</button>
      </form>
    </AuthShell>
  );
}
