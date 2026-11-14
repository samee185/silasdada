import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSite } from '../hooks/useSite';
import { Close, Menu } from './Icons';
import { ThemeToggle } from './ThemeToggle';

export const initials = (name: string) =>
  name
    .replace(/rev'?d\.?|rev\.?|pastor|dr\.?/gi, '')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && w.length > 1)
    .map((w) => w[0].toUpperCase())
    .filter((_, i, all) => i === 0 || i === all.length - 1)
    .join('') || 'SD';

export function SiteHeader() {
  const { site } = useSite();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const name = site?.displayName ?? "Rev'd Silas O. Dada";

  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="Main">
        <Link to="/" className="brand">
          <span className="monogram">{initials(name)}</span>
          <span className="brand-name">{name}</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className={`nav-links${open ? ' open' : ''}`} id="site-menu">
            <NavLink className="nav-link" to="/messages">Messages</NavLink>
            <a className="nav-link" href="/#about">About</a>
            <Link className="btn btn-accent shine" to="/book" style={{ padding: '12px 22px' }}>
              Book a meeting
            </Link>
          </div>
          <ThemeToggle />
          <button
            type="button"
            className="menu-btn"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <Close /> : <Menu />}
          </button>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const { site } = useSite();
  if (!site) return null;
  const socials = (
    [
      ['YouTube', site.socials.youtube],
      ['Facebook', site.socials.facebook],
      ['Instagram', site.socials.instagram],
      ['TikTok', site.socials.tiktok],
      ['X', site.socials.x],
    ] as const
  ).filter(([, url]) => url);

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div style={{ flex: '1 1 280px' }}>
          <p className="footer-name">{site.displayName}</p>
          <p style={{ fontSize: 15, lineHeight: 1.7 }}>{site.titleLine}</p>
          {site.meetingAddress && (
            <p style={{ fontSize: 15, lineHeight: 1.7, marginTop: 8, whiteSpace: 'pre-line' }}>
              {site.meetingAddress}
              {site.mapsUrl && (
                <>
                  {' · '}
                  <a href={site.mapsUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>Map</a>
                </>
              )}
            </p>
          )}
        </div>
        <div className="footer-cols">
          <div>
            <strong>Explore</strong>
            <Link to="/messages">Messages</Link>
            <a href="/#about">About</a>
            <Link to="/book">Book a meeting</Link>
          </div>
          {(site.publicEmail || site.publicPhone) && (
            <div>
              <strong>Contact</strong>
              {site.publicEmail && <a href={`mailto:${site.publicEmail}`}>{site.publicEmail}</a>}
              {site.publicPhone && <a href={`tel:${site.publicPhone.replace(/\s/g, '')}`}>{site.publicPhone}</a>}
            </div>
          )}
          {socials.length > 0 && (
            <div>
              <strong>Follow</strong>
              {socials.map(([label, url]) => (
                <a key={label} href={url!} target="_blank" rel="noreferrer">{label}</a>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="footer-legal">
        © {new Date().getFullYear()} {site.displayName} · silasdada.com.ng
      </p>
    </footer>
  );
}

/** Shown once per browser session on public pages: a crimson ring draws around the monogram. */
export function Preloader() {
  const { site } = useSite();
  const [show] = useState(() => {
    try {
      if (sessionStorage.getItem('sd-seen')) return false;
      sessionStorage.setItem('sd-seen', '1');
    } catch {
      /* ignore */
    }
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [gone, setGone] = useState(!show);
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setGone(true), 2600);
    return () => clearTimeout(t);
  }, [show]);
  if (gone) return null;
  const name = site?.displayName ?? "Rev'd Silas O. Dada";
  return (
    <div className="preloader" aria-hidden="true">
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r="58" fill="none" stroke="#232880" strokeWidth="2" />
        <circle className="draw" cx="66" cy="66" r="58" fill="none" stroke="#D62839" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 66 66)" />
        <text className="fade" x="66" y="77" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="34" fontWeight="600" fill="#FFFFFF">
          {initials(name)}
        </text>
      </svg>
      <span className="fade" style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--on-brand-2)', animationDelay: '.5s' }}>
        {name}
      </span>
    </div>
  );
}
