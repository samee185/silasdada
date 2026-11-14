import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ThemeToggle } from '../../components/ThemeToggle';
import { useAuth } from '../../hooks/useAuth';
import { useSite } from '../../hooks/useSite';
import { ContactForm, MeetingRulesForm, ProfileForm, WeekForm } from './forms';

const STEPS = [
  { title: 'Your profile', sub: 'Photos, story, scripture', heading: 'Tell visitors about yourself', lead: 'This fills your home page and About section, in your own words.' },
  { title: 'Contact & socials', sub: 'Email, address, links', heading: 'How people can reach you', lead: "Shown in your site's footer. Leave any field empty to hide it." },
  { title: 'Meeting rules', sub: 'Length, breaks, notice', heading: 'How your meetings work', lead: 'These rules decide which times people can pick.' },
  { title: 'Your usual week', sub: 'Free days and hours', heading: 'Your usual week', lead: "Turn on the days you're free. You can still change any single day later." },
  { title: 'Finish', sub: 'Go live', heading: '', lead: '' },
];

/** First-time setup: Rev'd Dada fills in everything personal himself. */
export function SetupPage() {
  const { setOnboarded } = useAuth();
  const { site } = useSite();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  if (!site) return <div className="page-loading"><span className="spinner" /></div>;

  const next = async (save: () => Promise<boolean>) => {
    if (!(await save())) return;
    if (step === 3) {
      setFinishing(true);
      await api.post('/api/site/onboarded').catch(() => {});
      setOnboarded(true);
      setFinishing(false);
    }
    setStep((s) => Math.min(4, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const actions = (save: () => Promise<boolean>, busy: boolean) => (
    <div className="setup-actions">
      <button type="button" className="btn btn-ghost" style={{ visibility: step > 0 ? 'visible' : 'hidden' }} onClick={() => setStep((s) => s - 1)}>
        Back
      </button>
      <button type="button" className="btn btn-accent shine" disabled={busy || finishing} onClick={() => next(save)}>
        {(busy || finishing) && <span className="spinner" />}
        {step === 3 ? 'Finish setup' : 'Save and continue'}
      </button>
    </div>
  );
  const s = STEPS[step];

  return (
    <div className="setup">
      <aside className="setup-side">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, color: '#fff' }}>Welcome, Rev'd Dada</span>
          <ThemeToggle />
        </div>
        <div>
          <p style={{ fontSize: 13, marginBottom: 10 }}>Setup progress · {Math.round((step / 4) * 100)}%</p>
          <div className="progress"><span style={{ width: `${(step / 4) * 100}%` }} /></div>
        </div>
        <ol className="steps-nav">
          {STEPS.map((x, i) => (
            <li key={x.title}>
              <button type="button" aria-current={i === step ? 'step' : undefined} onClick={() => i < 4 && setStep(i)}>
                <span className={`num${i <= step ? ' on' : ''}`}>{i < step ? '✓' : i + 1}</span>
                <span>
                  <strong>{x.title}</strong>
                  <small>{x.sub}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p style={{ marginTop: 'auto', fontSize: 13, color: 'var(--on-brand-3)', lineHeight: 1.6 }}>Everything here can be changed later.</p>
      </aside>

      <main className="setup-main">
        <div className="inner">
          {step < 4 ? (
            <div key={step} className="slide-in">
              <p className="step-label">Step {step + 1} of 5</p>
              <h1>{s.heading}</h1>
              <p className="sub">{s.lead}</p>
              {step === 0 && <ProfileForm actions={actions} />}
              {step === 1 && <ContactForm actions={actions} />}
              {step === 2 && <MeetingRulesForm actions={actions} />}
              {step === 3 && <WeekForm actions={actions} />}
            </div>
          ) : (
            <div className="done">
              {[
                ['30%', '#D62839', '0s'],
                ['62%', '#2D33B5', '.35s'],
                ['45%', '#1E7A4E', '.5s'],
                ['72%', '#FF8A94', '.2s'],
              ].map(([left, bg, delay]) => (
                <span key={left} className="confetti" aria-hidden="true" style={{ left, background: bg, animationDelay: delay }} />
              ))}
              <div className="tick">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
              <h1 className="rise d1">You're all set</h1>
              <p className="rise d2 muted" style={{ maxWidth: 520, fontSize: 17 }}>Your website is ready, with your photos, story and contact details.</p>
              <div className="tiles rise d3" style={{ width: '100%', maxWidth: 720, textAlign: 'left', marginTop: 12 }}>
                <a className="tile" href="/" target="_blank" rel="noreferrer"><h3>See your site</h3><p>Opens in a new tab</p></a>
                <Link className="tile" to="/admin/team"><h3>Invite a secretary</h3><p>Messages and website only, never your appointments</p></Link>
              </div>
              <Link className="btn btn-dark btn-lg rise d4" to="/admin">Go to my dashboard</Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
