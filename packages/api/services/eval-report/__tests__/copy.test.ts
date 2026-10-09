import { describe, it, expect } from 'vitest';
import { templateStrings, metricLabel, formatValue } from '../copy';

const BANNED: [string, RegExp][] = [
  ['FIERCE', /fierce/i],
  ['prices', /\$\s*\d|\bprice|\bper (month|session)\b|\/\s*mo\b/i],
  ['D1 path', /d1 path|data-driven path|path to d1/i],
  ['injury or medical wording', /injur|\brisk|medical|diagnos|elevated/i],
  ['gendered pronouns', /\b(he|she|his|her|hers|him|himself|herself|boy|girl)\b/i],
];

describe('template copy lint', () => {
  const strings = templateStrings();

  it('has template strings to check', () => {
    expect(strings.length).toBeGreaterThan(15);
  });

  it.each(BANNED)('contains no %s', (_name, re) => {
    for (const s of strings) expect(s, s).not.toMatch(re);
  });

  it('speaks about "your athlete" in third person neutral', () => {
    expect(strings.some((s) => /your athlete/i.test(s))).toBe(true);
  });
});

describe('labels', () => {
  it('uses plain family-facing labels', () => {
    expect(metricLabel('DASH_10')).toBe('10-yard dash');
    expect(metricLabel('FLY_10')).toBe('Fly 10');
    expect(metricLabel('CMJ_HOH')).toBe('Jump height');
  });

  it('shows units with values', () => {
    expect(formatValue(1.93, 's')).toBe('1.93 s');
    expect(formatValue(21.5, 'in')).toBe('21.5 in');
    expect(formatValue(92, '%')).toBe('92%');
    expect(formatValue(1.9, 's')).toBe('1.90 s');
    expect(formatValue(2, 's')).toBe('2.00 s');
    expect(formatValue(18.2, 'in')).toBe('18.2 in');
  });
});
