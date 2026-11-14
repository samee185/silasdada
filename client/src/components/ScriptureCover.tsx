import type { CSSProperties, ReactNode } from 'react';

/** Cover palettes in the logo colours; each message picks one by its coverStyle number. */
export const COVER_STYLES = [
  { bg: '#10134A', sun: '#D62839', ring: false },
  { bg: '#D62839', sun: '#10134A', ring: true },
  { bg: '#2D33B5', sun: '#FF8A94', ring: false },
  { bg: '#0A0C36', sun: '#D62839', ring: true },
];

type Props = {
  verse: string;
  reference: string;
  style?: number;
  className?: string;
  verseSize?: string;
  children?: ReactNode;
  css?: CSSProperties;
};

/** Auto-generated scripture artwork: the verse in large serif over slowly turning light rays. */
export function ScriptureCover({ verse, reference, style = 0, className = '', verseSize, children, css }: Props) {
  const c = COVER_STYLES[style % COVER_STYLES.length];
  return (
    <div className={`cover ${className}`} style={{ background: c.bg, ...css }}>
      <div className="cover-rays" aria-hidden="true" />
      <div
        className="cover-sun"
        aria-hidden="true"
        style={
          c.ring
            ? { border: `22px solid ${c.sun}`, width: 200, height: 200, right: -50, top: -50 }
            : { background: c.sun, boxShadow: `0 0 90px 14px ${c.sun}` }
        }
      />
      <span className="cover-ref">{reference}</span>
      <p className="cover-verse" style={verseSize ? { fontSize: verseSize } : undefined}>
        “{verse}”
      </p>
      {children}
    </div>
  );
}
