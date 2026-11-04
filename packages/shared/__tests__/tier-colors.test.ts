import { describe, it, expect } from 'vitest';
import { TIER_PALETTE, resolveTierFill, resolveTierText, resolveTierTint } from '../tier-colors';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const NAMES = ['gold', 'emerald', 'silver', 'blue', 'bronze', 'amber', 'slate', 'gray', 'red', 'green', 'yellow', 'orange'];

describe('tier colors', () => {
  it('covers the wizard names and the CSS names found in data', () => {
    for (const name of NAMES) expect(TIER_PALETTE[name], name).toBeDefined();
  });

  it.each(NAMES)('%s: slate-900 text on the fill passes WCAG AA', (name) => {
    expect(contrast('#0f172a', TIER_PALETTE[name].fill)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NAMES)('%s: the text shade on white passes WCAG AA', (name) => {
    expect(contrast(TIER_PALETTE[name].text, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('maps a known name case-insensitively to its palette fill, not the raw CSS color', () => {
    expect(resolveTierFill('blue')).toBe(TIER_PALETTE.blue.fill);
    expect(resolveTierFill('Blue')).toBe(TIER_PALETTE.blue.fill);
    expect(resolveTierFill('blue')).not.toBe('blue');
    expect(resolveTierText('RED')).toBe(TIER_PALETTE.red.text);
  });

  it('falls back to gray for unknown, empty and missing values', () => {
    for (const v of ['purple', '#xyz', '', undefined, null]) {
      expect(resolveTierFill(v)).toBe(TIER_PALETTE.gray.fill);
      expect(resolveTierText(v)).toBe(TIER_PALETTE.gray.text);
      expect(resolveTierTint(v)).toEqual(resolveTierTint('gray'));
    }
  });

  it('passes a stored hex color through (3 or 6 digits) instead of graying it', () => {
    expect(resolveTierFill('#86efac')).toBe('#86efac');
    expect(resolveTierFill('#FB0')).toBe('#ffbb00');
    expect(resolveTierText('#86efac')).toBe('#86efac');
    expect(resolveTierTint('#86efac')).not.toEqual(resolveTierTint('gray'));
  });

  it('tints the 500-level base shade 70% toward white', () => {
    const [r, g, b] = hexToRgb(TIER_PALETTE.green.base);
    expect(resolveTierTint('green')).toEqual([
      Math.round(r * 0.3 + 255 * 0.7),
      Math.round(g * 0.3 + 255 * 0.7),
      Math.round(b * 0.3 + 255 * 0.7),
    ]);
  });

  it('keeps the colored tints visibly distinct from each other and from white', () => {
    const colored = ['gold', 'emerald', 'blue', 'bronze', 'red', 'green', 'yellow'];
    for (const name of colored) {
      expect(Math.min(...resolveTierTint(name)), name).toBeLessThanOrEqual(240);
    }
    for (let i = 0; i < colored.length; i++) {
      for (let j = i + 1; j < colored.length; j++) {
        const [a, b] = [resolveTierTint(colored[i]), resolveTierTint(colored[j])];
        const dist = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        expect(dist, `${colored[i]} vs ${colored[j]}`).toBeGreaterThan(8);
      }
    }
  });
});
