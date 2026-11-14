/** "HH:MM" helpers shared by the schedule APIs (and the slot engine in stage 2). */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export type TimeBlock = { start: string; end: string; mode?: string };

/**
 * Returns an error message if blocks are reversed, or if two blocks of the same meeting type overlap, else null.
 * In-person hours and WhatsApp hours may overlap: those times are offered as either.
 */
export function blockProblem(blocks: TimeBlock[]): string | null {
  for (const b of blocks) {
    if (toMinutes(b.end) <= toMinutes(b.start)) return `${b.start}–${b.end}: the end time must be after the start time.`;
  }
  for (const mode of new Set(blocks.map((b) => b.mode))) {
    const sorted = blocks.filter((b) => b.mode === mode).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    for (let i = 0; i + 1 < sorted.length; i++) {
      const b = sorted[i];
      const next = sorted[i + 1];
      if (toMinutes(next.start) < toMinutes(b.end)) return `${b.start}–${b.end} overlaps ${next.start}–${next.end}.`;
    }
  }
  return null;
}
