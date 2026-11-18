/**
 * Coach jargon and the plain words families understand. Prompt guidance and editor flags only:
 * never run it as find-and-replace, it would mangle metric labels such as "10-Yard Fly".
 */
export const JARGON_SWAPS: Record<string, string> = {
  'flying 10': '10 yards timed after a running start',
  'fly 10': '10 yards timed after a running start',
  'run-in': 'running start',
  'maximum velocity': 'top speed',
  'max velocity': 'top speed',
  acceleration: 'getting up to speed (for the first 10 yards: the start, the first steps)',
  RSI: 'quick-bounce score (hop height compared with time on the ground)',
  EUR: 'how much the dip helps the jump',
  'eccentric utilization': 'how much the dip helps the jump',
  'ground contact': 'time on the ground',
  stiffness: 'springiness',
  elasticity: 'springiness',
  concentric: 'pushing phase',
  eccentric: 'lowering (braking) phase',
  SSC: 'leg spring',
  plyometric: 'hop and jump training',
  CMJ: 'jump with a quick dip',
  'squat jump': 'jump from a paused squat',
  HOH: 'hands on hips',
  LSI: 'left-right balance',
  asymmetry: 'left-right balance',
  unilateral: 'one-leg',
  bilateral: 'two-leg',
  buildups: 'gradual speed-ups',
  deceleration: 'slowing down',
  isometric: 'hold',
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const JARGON_RE = new RegExp(
  `(?:^|[^\\w-])(${Object.keys(JARGON_SWAPS)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')})(?![\\w-])`,
  'gi',
);

/** Jargon terms in the text as written, each once, in order of appearance. */
export function findJargon(text: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const m of text.matchAll(JARGON_RE)) {
    const key = m[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(m[1]);
  }
  return found;
}
