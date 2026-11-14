import { Link } from 'react-router-dom';
import { ScriptureCover } from '../../components/ScriptureCover';

/** Placeholder for pages built in later stages (booking: stage 2, messages: stage 4). */
export function ComingSoonPage({ title, text }: { title: string; text: string }) {
  return (
    <section className="simple-page">
      <div className="box">
        <ScriptureCover
          verse="To every thing there is a season, and a time to every purpose under the heaven."
          reference="Ecclesiastes 3:1 · KJV"
          style={2}
          css={{ width: '100%', borderRadius: 24, padding: 32, minHeight: 220, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'left' }}
          verseSize="24px"
        />
        <h1 className="rise">{title}</h1>
        <p className="muted rise d1" style={{ fontSize: 17 }}>{text}</p>
        <Link className="btn btn-dark rise d2" to="/">Back to the home page</Link>
      </div>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="simple-page">
      <div className="box">
        <p className="eyebrow">Page not found</p>
        <h1>This page doesn't exist</h1>
        <p className="muted">The link may be old or mistyped.</p>
        <Link className="btn btn-accent" to="/">Go to the home page</Link>
      </div>
    </section>
  );
}
