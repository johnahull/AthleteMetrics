import { describe, it, expect } from 'vitest';
import { athleteNoteInputSchema, athleteNoteUpdateSchema, ATHLETE_NOTE_CATEGORIES } from '../athlete-notes';

const ok = { body: 'Drives well off the first step', observedOn: '2026-11-01' };

describe('athleteNoteInputSchema', () => {
  it('accepts a minimal note and a full one', () => {
    expect(athleteNoteInputSchema.parse(ok)).toEqual(ok);
    const full = { ...ok, category: 'injury', flagged: true, eventId: '11111111-1111-4111-8111-111111111111' };
    expect(athleteNoteInputSchema.parse(full)).toEqual(full);
  });

  it('accepts every category and null category / eventId', () => {
    for (const category of ATHLETE_NOTE_CATEGORIES) expect(athleteNoteInputSchema.safeParse({ ...ok, category }).success).toBe(true);
    expect(ATHLETE_NOTE_CATEGORIES).toEqual(['technique', 'effort', 'readiness', 'injury', 'mindset', 'goal', 'other']);
    expect(athleteNoteInputSchema.safeParse({ ...ok, category: null, eventId: null }).success).toBe(true);
  });

  it('requires a body of 1..4000 characters after trimming', () => {
    expect(athleteNoteInputSchema.safeParse({ ...ok, body: '' }).success).toBe(false);
    expect(athleteNoteInputSchema.safeParse({ ...ok, body: '   \n ' }).success).toBe(false);
    expect(athleteNoteInputSchema.safeParse({ ...ok, body: 'x'.repeat(4000) }).success).toBe(true);
    expect(athleteNoteInputSchema.safeParse({ ...ok, body: 'x'.repeat(4001) }).success).toBe(false);
    expect(athleteNoteInputSchema.safeParse({ observedOn: ok.observedOn }).success).toBe(false);
  });

  it('strips control characters (newline and tab stay) and trims', () => {
    const parsed = athleteNoteInputSchema.parse({ ...ok, body: '  a\u0000b\u0007\nc\td\u007f ' });
    expect(parsed.body).toBe('ab\nc\td');
  });

  it('requires observedOn, a real YYYY-MM-DD date; past dates are fine', () => {
    expect(athleteNoteInputSchema.safeParse({ body: ok.body }).success).toBe(false);
    expect(athleteNoteInputSchema.safeParse({ ...ok, observedOn: '2019-01-31' }).success).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '11/01/2026', '2026-1-1', '', '2026-11-01T00:00:00Z']) {
      expect(athleteNoteInputSchema.safeParse({ ...ok, observedOn: bad }).success, bad).toBe(false);
    }
  });

  it('rejects unknown category, non-uuid eventId and unknown keys', () => {
    expect(athleteNoteInputSchema.safeParse({ ...ok, category: 'medical' }).success).toBe(false);
    expect(athleteNoteInputSchema.safeParse({ ...ok, eventId: 'abc' }).success).toBe(false);
    expect(athleteNoteInputSchema.safeParse({ ...ok, authorId: 'x' }).success).toBe(false);
    expect(athleteNoteInputSchema.safeParse({ ...ok, organizationId: 'x' }).success).toBe(false);
  });
});

describe('athleteNoteUpdateSchema', () => {
  it('accepts any subset but not an empty object', () => {
    expect(athleteNoteUpdateSchema.safeParse({ flagged: true }).success).toBe(true);
    expect(athleteNoteUpdateSchema.parse({ category: null })).toEqual({ category: null });
    expect(athleteNoteUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('keeps the field rules', () => {
    expect(athleteNoteUpdateSchema.safeParse({ body: '' }).success).toBe(false);
    expect(athleteNoteUpdateSchema.safeParse({ observedOn: '2026-02-30' }).success).toBe(false);
  });
});
