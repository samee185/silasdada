import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../../api/types';
import { Calendar, Clock, Close, Doc, Globe, Home, Lock, Menu, Sparkle, Users } from '../../components/Icons';
import { initials } from '../../components/SiteChrome';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useAuth } from '../../hooks/useAuth';
import { useSite } from '../../hooks/useSite';

type Item = { to: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; roles: Role[]; soon?: boolean; end?: boolean };

// Appointments and schedule are the pastor's alone; the secretary only sees content.
const ITEMS: Item[] = [
  { to: '/admin', label: 'Overview', icon: Home, roles: ['OWNER', 'SECRETARY'], end: true },
  { to: '/admin/appointments', label: 'Appointments', icon: Calendar, roles: ['OWNER'] },
  { to: '/admin/schedule', label: 'My schedule', icon: Clock, roles: ['OWNER'] },
  { to: '/admin/messages', label: 'Messages', icon: Doc, roles: ['OWNER', 'SECRETARY'] },
  { to: '/admin/ai', label: 'AI drafts', icon: Sparkle, roles: ['OWNER', 'SECRETARY'] },
  { to: '/admin/website', label: 'Website content', icon: Globe, roles: ['OWNER', 'SECRETARY'] },
  { to: '/admin/team', label: 'Secretary access', icon: Users, roles: ['OWNER'] },
  { to: '/admin/account', label: 'My account', icon: Lock, roles: ['OWNER', 'SECRETARY'] },
];

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const { site } = useSite();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [pathname]);
  if (!user) return null;
  const name = site?.displayName ?? user.name;

  return (
    <div className="admin">
      <div className="admin-top">
        <Link to="/admin" className="brand">
          <span className="monogram" style={{ width: 38, height: 38, fontSize: 14 }}>{initials(name)}</span>
          <span className="brand-name" style={{ fontSize: 17 }}>Pastor's Desk</span>
        </Link>
        <button type="button" className="menu-btn" style={{ display: 'inline-flex' }} aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu />
        </button>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Dashboard">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/admin" className="brand">
            <span className="monogram" style={{ width: 38, height: 38, fontSize: 14 }}>{initials(name)}</span>
            <span className="brand-name" style={{ fontSize: 18 }}>Pastor's Desk</span>
          </Link>
          {open && (
            <button type="button" className="menu-btn" style={{ display: 'inline-flex', marginBottom: 26 }} aria-label="Close menu" onClick={() => setOpen(false)}>
              <Close />
            </button>
          )}
        </div>
        <nav className="side-nav">
          {ITEMS.filter((i) => i.roles.includes(user.role)).map(({ to, label, icon: Icon, soon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
              <Icon />
              {label}
              {soon && <span className="soon">Soon</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="me-card">
            {user.role === 'OWNER' && site?.portraitUrl ? <img src={site.portraitUrl} alt="" /> : <span className="avatar">{initials(user.name)}</span>}
            <span>
              <strong>{user.role === 'OWNER' ? name : user.name}</strong>
              <span>{user.role === 'OWNER' ? 'Conference Pastor' : 'Secretary'}</span>
            </span>
          </div>
          <div className="side-row">
            <ThemeToggle />
            <a href="/" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>View site</a>
            <button
              type="button"
              className="signout"
              onClick={async () => {
                await signOut();
                navigate('/admin/login');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
