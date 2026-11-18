import { describe, it, expect } from 'vitest';
import { findMeaningViolation, metricMeaningSchema, MAX_METRIC_MEANING_LENGTH } from '../metric-meaning';
import { insertSiteMetricSchema, updateSiteMetricSchema } from '../schema';

describe('findMeaningViolation', () => {
  it.each([
    'This test can diagnose a weak hamstring.',
    'A slow time may signal an injury risk.',
    'He is cleared to play.',
    'Ready to return to play after this.',
    'Shows he needs to lose weight.',
    'We predict a 7.0 sixty.',
    'His body fat is high.',
  ])('flags %s', (t) => expect(findMeaningViolation(t)).toMatch(/must not contain/));

  it.each([
    'How fast he gets going from a standstill. A quicker start helps every sprint.',
    'Shows how well the legs push off the ground.',
    '',
  ])('passes %s', (t) => expect(findMeaningViolation(t)).toBeNull());
});

describe('metricMeaningSchema', () => {
  it('trims and caps length', () => {
    expect(metricMeaningSchema({ scan: false }).parse('  hi  ')).toBe('hi');
    expect(metricMeaningSchema({ scan: false }).safeParse('x'.repeat(MAX_METRIC_MEANING_LENGTH + 1)).success).toBe(false);
    expect(metricMeaningSchema({ scan: false }).safeParse('x'.repeat(MAX_METRIC_MEANING_LENGTH)).success).toBe(true);
  });
  it('scan mode rejects forbidden wording, plain mode does not', () => {
    expect(metricMeaningSchema({ scan: true }).safeParse('cleared to play').success).toBe(false);
    expect(metricMeaningSchema({ scan: false }).safeParse('cleared to play').success).toBe(true);
  });
});

describe('site metric schemas accept meaning', () => {
  it('create: optional, max 400', () => {
    const base = { code: 'X_TEST', label: 'X' };
    expect(insertSiteMetricSchema.parse({ ...base, meaning: 'Hello' }).meaning).toBe('Hello');
    expect(insertSiteMetricSchema.safeParse({ ...base, meaning: 'x'.repeat(401) }).success).toBe(false);
  });
  it('update: null clears, max 400', () => {
    expect(updateSiteMetricSchema.parse({ meaning: null }).meaning).toBeNull();
    expect(updateSiteMetricSchema.safeParse({ meaning: 'x'.repeat(401) }).success).toBe(false);
  });
});
