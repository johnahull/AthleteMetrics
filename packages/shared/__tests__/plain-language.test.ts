import { describe, it, expect } from 'vitest';
import { JARGON_SWAPS, findJargon } from '../plain-language';

describe('findJargon', () => {
  it('finds terms case-insensitively', () => {
    expect(findJargon('His RSI and a flying 10 were good.')).toEqual(['RSI', 'flying 10']);
  });

  it('matches whole words only', () => {
    expect(findJargon('The first rounds of the splitting wood')).toEqual([]);
  });

  it('lists each term once, in order of appearance', () => {
    expect(findJargon('RSI, then rsi again, then EUR')).toEqual(['RSI', 'EUR']);
  });

  it('returns nothing for plain text', () => {
    expect(findJargon('He ran the 40 in 5.26 seconds.')).toEqual([]);
  });

  it('finds multi-word and hyphenated terms', () => {
    expect(findJargon('Add maximum velocity work and eccentric loading; check ground contact.')).toEqual([
      'maximum velocity',
      'eccentric',
      'ground contact',
    ]);
  });
});

describe('findJargon false positives', () => {
  it('leaves everyday words alone', () => {
    expect(findJargon('Split the difference; training volume; the protocol; Reactive Strength Index')).toEqual([]);
  });

  it('finds terms after punctuation and at the start of a line', () => {
    expect(findJargon('RSI\n(EUR), "SSC"')).toEqual(['RSI', 'EUR', 'SSC']);
  });
});

describe('JARGON_SWAPS', () => {
  it('no swap text contains jargon itself', () => {
    for (const [term, plain] of Object.entries(JARGON_SWAPS)) expect(findJargon(plain), term).toEqual([]);
  });

  it('gives every term a plain phrase', () => {
    for (const [term, plain] of Object.entries(JARGON_SWAPS)) {
      expect(plain.length, term).toBeGreaterThan(0);
      expect(plain.toLowerCase(), term).not.toBe(term.toLowerCase());
    }
  });

  it('does not turn flying 10 into top-speed sprint (it drops the running start)', () => {
    expect(JARGON_SWAPS['flying 10']).toContain('running start');
  });
});
