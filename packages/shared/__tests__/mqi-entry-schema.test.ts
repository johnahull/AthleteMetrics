/**
 * AM-FEAT-015 Phase 3: MQI entry schema + pure helpers
 */
import { describe, it, expect } from 'vitest';
import {
  MQI_PATTERNS,
  MQI_TRANSITIONS,
  MQI_RUBRIC,
  MQI_NOTES_MAX,
  mqiEntrySchema,
  emptyMqiEntry,
  computeMqiTotal,
  computeTransitionTotal,
  diffMqiEntry,
  type MqiEntryValues,
} from '../mqi-entry-schema';

const scoresFor = (codes: string[], v: number) => Object.fromEntries(codes.map((c) => [c, v]));
const patternCodes = MQI_PATTERNS.map((p) => p.code);
const transitionCodes = MQI_TRANSITIONS.map((t) => t.code);

describe('MQI definitions', () => {
  it('has 8 patterns, 4 transitions and the 0-3 rubric', () => {
    expect(MQI_PATTERNS).toHaveLength(8);
    expect(MQI_TRANSITIONS).toHaveLength(4);
    expect(patternCodes).toContain('MQ_LIN_ACCEL');
    expect(transitionCodes.every((c) => c.startsWith('MQ_TRANS_'))).toBe(true);
    expect(MQI_RUBRIC.map((r) => [r.score, r.label])).toEqual([
      [3, 'Efficient'],
      [2, 'Functional'],
      [1, 'Compensated'],
      [0, 'Absent'],
    ]);
  });
});

describe('computeMqiTotal / computeTransitionTotal', () => {
  it('sums 8 of 8 patterns', () => {
    expect(computeMqiTotal(scoresFor(patternCodes, 2))).toBe(16);
  });
  it('counts 0 as a real score (all zeros = 0, not incomplete)', () => {
    expect(computeMqiTotal(scoresFor(patternCodes, 0))).toBe(0);
  });
  it('returns null (incomplete) for 7 of 8, null or undefined', () => {
    const seven = scoresFor(patternCodes.slice(0, 7), 3);
    expect(computeMqiTotal(seven)).toBeNull();
    expect(computeMqiTotal({ ...seven, [patternCodes[7]]: null })).toBeNull();
    expect(computeMqiTotal({})).toBeNull();
  });
  it('never includes transition scores', () => {
    expect(computeMqiTotal({ ...scoresFor(patternCodes, 1), ...scoresFor(transitionCodes, 3) })).toBe(8);
  });
  it('transition total needs all 4 and ignores patterns', () => {
    expect(computeTransitionTotal(scoresFor(transitionCodes, 3))).toBe(12);
    expect(computeTransitionTotal(scoresFor(transitionCodes.slice(0, 3), 3))).toBeNull();
    expect(computeTransitionTotal({ ...scoresFor(patternCodes, 3) })).toBeNull();
  });
});

describe('mqiEntrySchema', () => {
  const valid = (): MqiEntryValues => {
    const v = emptyMqiEntry();
    v.rows.MQ_JUMP = { score: 3, mediaUrl: 'https://clips.example.com/a', notes: 'left side late' };
    return v;
  };

  it('emptyMqiEntry has a blank row for all 12 metrics', () => {
    const v = emptyMqiEntry();
    expect(Object.keys(v.rows)).toHaveLength(12);
    expect(v.rows.MQ_JUMP).toEqual({ score: null, mediaUrl: '', notes: '' });
  });

  it('accepts blank rows, 0 and 3', () => {
    const v = valid();
    v.rows.MQ_DECEL.score = 0;
    expect(mqiEntrySchema.safeParse(v).success).toBe(true);
    expect(mqiEntrySchema.safeParse(emptyMqiEntry()).success).toBe(true);
  });

  it.each([4, -1, 1.5])('rejects score %s', (score) => {
    const v = valid();
    v.rows.MQ_JUMP.score = score;
    expect(mqiEntrySchema.safeParse(v).success).toBe(false);
  });

  it.each(['http://clips.example.com/a', 'javascript:alert(1)', 'https://localhost/a', 'not a url'])(
    'rejects clip url %s',
    (mediaUrl) => {
      const v = valid();
      v.rows.MQ_JUMP.mediaUrl = mediaUrl;
      const r = mqiEntrySchema.safeParse(v);
      expect(r.success).toBe(false);
    },
  );

  it('trims clip url and rejects notes over the 1000 char limit', () => {
    const v = valid();
    v.rows.MQ_JUMP.mediaUrl = '  https://clips.example.com/a  ';
    const ok = mqiEntrySchema.safeParse(v);
    expect(ok.success && ok.data.rows.MQ_JUMP.mediaUrl).toBe('https://clips.example.com/a');
    v.rows.MQ_JUMP.notes = 'x'.repeat(MQI_NOTES_MAX + 1);
    expect(mqiEntrySchema.safeParse(v).success).toBe(false);
  });

  it('requires a score when a clip url or note is present', () => {
    const v = emptyMqiEntry();
    v.rows.MQ_JUMP.notes = 'note only';
    const r = mqiEntrySchema.safeParse(v);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['rows', 'MQ_JUMP', 'score']);
  });
});

describe('diffMqiEntry', () => {
  const date = '2026-03-10T10:00:00.000Z';
  const original = {
    MQ_JUMP: { id: 'm1', score: 2, mediaUrl: null, notes: null },
    MQ_DECEL: { id: 'm2', score: 1, mediaUrl: 'https://clips.example.com/d', notes: 'n' },
  };

  it('writes nothing when nothing changed', () => {
    const v = emptyMqiEntry();
    v.rows.MQ_JUMP = { score: 2, mediaUrl: '', notes: '' };
    v.rows.MQ_DECEL = { score: 1, mediaUrl: 'https://clips.example.com/d', notes: 'n' };
    expect(diffMqiEntry('u1', v, original, date)).toEqual({ upserts: [], deletes: [] });
  });

  it('upserts only changed rows with the event date, clearing clip/notes with null/empty', () => {
    const v = emptyMqiEntry();
    v.rows.MQ_JUMP = { score: 3, mediaUrl: '', notes: '' }; // score changed
    v.rows.MQ_DECEL = { score: 1, mediaUrl: '', notes: 'n' }; // clip cleared
    v.rows.MQ_SHUFFLE = { score: 0, mediaUrl: '', notes: '' }; // new, zero
    const { upserts, deletes } = diffMqiEntry('u1', v, original, date);
    expect(deletes).toEqual([]);
    expect(upserts).toEqual([
      { userId: 'u1', metric: 'MQ_DECEL', value: 1, date, notes: 'n', mediaUrl: null },
      { userId: 'u1', metric: 'MQ_SHUFFLE', value: 0, date, notes: '', mediaUrl: null },
      { userId: 'u1', metric: 'MQ_JUMP', value: 3, date, notes: '', mediaUrl: null },
    ]);
  });

  it('deletes a previously saved row whose score was cleared', () => {
    const v = emptyMqiEntry();
    v.rows.MQ_JUMP = { score: 2, mediaUrl: '', notes: '' };
    // MQ_DECEL left blank -> clear
    expect(diffMqiEntry('u1', v, original, date).deletes).toEqual(['m2']);
  });
});
