import { useMemo } from 'react';

/** Seeded random, so the stars sit in the same places on every render. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

type Props = { stars?: number; rays?: { x: string; y: string; size: number }; beam?: boolean; motes?: boolean; seed?: number };

/** The animated hero background: drifting glows, turning light rays, a sweeping beam, twinkling stars, rising lights. */
export function Backdrop({ stars = 14, rays, beam = true, motes = false, seed = 11 }: Props) {
  const starList = useMemo(() => {
    const r = seeded(seed);
    return Array.from({ length: stars }, () => ({
      left: `${3 + r() * 94}%`,
      top: `${4 + r() * 86}%`,
      delay: `-${(r() * 3.2).toFixed(2)}s`,
      dur: `${(2.4 + r() * 2.2).toFixed(1)}s`,
    }));
  }, [stars, seed]);

  return (
    <>
      <div className="orb orb-a" aria-hidden="true" />
      <div className="orb orb-b" aria-hidden="true" />
      {rays && (
        <div
          className="rays"
          aria-hidden="true"
          style={{ left: rays.x, top: rays.y, width: rays.size, height: rays.size, margin: `-${rays.size / 2}px 0 0 -${rays.size / 2}px` }}
        />
      )}
      {beam && <div className="beam" aria-hidden="true" />}
      {starList.map((s, i) => (
        <span key={i} className="star" aria-hidden="true" style={{ left: s.left, top: s.top, animationDelay: s.delay, animationDuration: s.dur }} />
      ))}
      {motes &&
        [
          [8, 40, 0, 6],
          [22, 120, 1.5, 4],
          [38, 10, 3, 5],
          [55, 80, 0.8, 3],
          [72, 30, 2.2, 6],
          [90, 100, 4, 4],
        ].map(([x, b, d, w], i) => (
          <span key={`m${i}`} className="mote" aria-hidden="true" style={{ left: `${x}%`, bottom: b, animationDelay: `${d}s`, width: w, height: w }} />
        ))}
    </>
  );
}
