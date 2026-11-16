import { describe, it, expect } from 'vitest';
import { coachNotesSchema } from '../coach-notes';

describe('coachNotesSchema', () => {
  it('accepts an empty object and a full object', () => {
    expect(coachNotesSchema.safeParse({}).success).toBe(true);
    const full = {
      goals: 'Sub 5.0 40', seasonPhase: 'pre', trainingAgeYears: 2.5, maturation: 'circa',
      restriction: { area: 'left ankle', status: 'no sprinting', ptCleared: false },
      testDayFlags: ['surface', 'weather'], limiterOverride: 'DASH_40YD', sessionsPerWeek: 3,
      nextRetestDate: '2026-12-01', whatISaw: 'Short first steps',
    };
    expect(coachNotesSchema.parse(full)).toEqual(full);
  });

  it('rejects unknown keys (strict), at top level and inside restriction', () => {
    expect(coachNotesSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(coachNotesSchema.safeParse({ restriction: { area: 'a', status: 'b', ptCleared: true, x: 1 } }).success).toBe(false);
  });

  it.each([
    ['goals too long', { goals: 'x'.repeat(1001) }],
    ['whatISaw too long', { whatISaw: 'x'.repeat(1501) }],
    ['bad seasonPhase', { seasonPhase: 'summer' }],
    ['bad maturation', { maturation: 'late' }],
    ['training age negative', { trainingAgeYears: -1 }],
    ['training age over 30', { trainingAgeYears: 31 }],
    ['sessions fractional', { sessionsPerWeek: 2.5 }],
    ['sessions over 14', { sessionsPerWeek: 15 }],
    ['bad flag', { testDayFlags: ['rain'] }],
    ['duplicate flags', { testDayFlags: ['surface', 'surface'] }],
    ['too many flags', { testDayFlags: ['surface', 'weather', 'poor_wellness', 'protocol_deviation', 'surface'] }],
    ['bad date', { nextRetestDate: '12/01/2026' }],
    ['impossible date', { nextRetestDate: '2026-02-31' }],
    ['restriction missing ptCleared', { restriction: { area: 'a', status: 'b' } }],
    ['empty limiter', { limiterOverride: '' }],
  ])('rejects %s', (_n, body) => {
    expect(coachNotesSchema.safeParse(body).success).toBe(false);
  });

  it('accepts boundary values', () => {
    expect(coachNotesSchema.safeParse({ goals: 'x'.repeat(1000), whatISaw: 'x'.repeat(1500), trainingAgeYears: 0, sessionsPerWeek: 14 }).success).toBe(true);
    expect(coachNotesSchema.safeParse({ trainingAgeYears: 30, sessionsPerWeek: 0 }).success).toBe(true);
  });
});

describe('generic write schemas never accept the coach-notes / style-example columns', () => {
  it('insertReportSchema and insertOrganizationSchema drop them', async () => {
    const { insertReportSchema, insertOrganizationSchema } = await import('../schema-original');
    expect(insertReportSchema.shape).not.toHaveProperty('coachNotes');
    expect(insertOrganizationSchema.shape).not.toHaveProperty('aiStyleExample');
    expect(insertOrganizationSchema.shape).not.toHaveProperty('aiPromptOverrides');
  });
});
