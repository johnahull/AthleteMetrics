/**
 * One palette for benchmark tier colors, shared by the web tier bars and the PDF tables.
 * Stored tier colors are names: the wizard names (gold, emerald, ...) and CSS names found in
 * seeded data (red, green, yellow, orange). Raw CSS names render as pure #0000FF etc. and the
 * wizard names emerald / bronze are not CSS colors at all, so never use the stored value directly.
 * `fill` is a mid-tone (Tailwind 300/400) that slate-900 text reads on; `text` is a 700 shade
 * for colored text on white.
 */
export const TIER_PALETTE: Record<string, { fill: string; text: string; base: string }> = {
  gold: { fill: '#fcd34d', text: '#b45309', base: '#f59e0b' }, // amber-300 / amber-700
  emerald: { fill: '#6ee7b7', text: '#047857', base: '#10b981' },
  silver: { fill: '#cbd5e1', text: '#334155', base: '#94a3b8' }, // slate-300 / slate-700
  blue: { fill: '#93c5fd', text: '#1d4ed8', base: '#3b82f6' },
  bronze: { fill: '#fb923c', text: '#c2410c', base: '#ea580c' }, // orange-400 / orange-700
  amber: { fill: '#fbbf24', text: '#b45309', base: '#d97706' }, // amber-400 / amber-700
  slate: { fill: '#94a3b8', text: '#334155', base: '#64748b' }, // slate-400 / slate-700
  gray: { fill: '#d1d5db', text: '#374151', base: '#6b7280' },
  red: { fill: '#fca5a5', text: '#b91c1c', base: '#ef4444' },
  green: { fill: '#86efac', text: '#15803d', base: '#22c55e' },
  yellow: { fill: '#fde047', text: '#a16207', base: '#eab308' },
  orange: { fill: '#fdba74', text: '#c2410c', base: '#f97316' },
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function lookup(color?: string | null): { fill: string; text: string; base: string } {
  const raw = (color ?? '').trim().toLowerCase();
  // Hex values can come from the API or imports; keep them rather than graying them
  if (HEX.test(raw)) {
    const hex = raw.length === 4 ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}` : raw;
    return { fill: hex, text: hex, base: hex };
  }
  return TIER_PALETTE[raw] ?? TIER_PALETTE.gray;
}

/** Background fill for a tier color; unknown values are gray. */
export function resolveTierFill(color?: string | null): string {
  return lookup(color).fill;
}

/** Text color for a tier color on a white background; unknown values are gray. */
export function resolveTierText(color?: string | null): string {
  return lookup(color).text;
}

/**
 * Light RGB tint for PDF table cells: the 500-level `base` shade blended 70% with white. Tinting
 * the already-light fill would leave silver, gray and slate almost white and indistinguishable.
 */
export function resolveTierTint(color?: string | null): [number, number, number] {
  const n = parseInt(lookup(color).base.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.3 + 255 * 0.7)) as [number, number, number];
}
