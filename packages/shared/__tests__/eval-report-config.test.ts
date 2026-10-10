import { describe, it, expect } from 'vitest';
import {
  EVAL_REPORT_TYPE,
  evalReportConfigSchema,
  evalReportRequestSchema,
} from '../eval-report-config';

const model = {
  athlete: { name: 'Ava Test', age: 15, graduationYear: 2028, sport: 'Soccer', team: null },
  eventDate: '2026-05-01',
  metrics: [],
  freshAndHealthy: {},
  strengths: [],
  developmentAreas: [],
  limiter: null,
  coachNote: null,
  selection: { preset: 'high_school', noteFirst: false },
};

const config = {
  eventId: 'e1',
  athleteId: 'a1',
  metrics: ['DASH_10YD'],
  selection: { preset: 'high_school' },
  load: null,
  coachNote: null,
  model,
};

describe('evalReportConfigSchema', () => {
  it('uses the eval report type literal', () => {
    expect(EVAL_REPORT_TYPE).toBe('eval');
  });

  it('accepts a complete config and keeps the top-level keys', () => {
    const parsed = evalReportConfigSchema.parse(config);
    expect(parsed.eventId).toBe('e1');
    expect(parsed.athleteId).toBe('a1');
    expect(parsed.metrics).toEqual(['DASH_10YD']);
    expect(parsed.model.eventDate).toBe('2026-05-01');
  });

  it.each(['eventId', 'athleteId', 'metrics', 'model'])('requires %s', (key) => {
    const { [key]: _omit, ...rest } = config as Record<string, unknown>;
    expect(evalReportConfigSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an unknown load level and an over-long note', () => {
    expect(evalReportConfigSchema.safeParse({ ...config, load: 'extreme' }).success).toBe(false);
    expect(evalReportConfigSchema.safeParse({ ...config, coachNote: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('rejects a model that carries a wellness field at any depth', () => {
    const bad = { ...model, freshAndHealthy: { soreness: 3 } };
    expect(evalReportConfigSchema.safeParse({ ...config, model: bad }).success).toBe(false);
    const nested = { ...model, athlete: { ...model.athlete, extra: [{ Sleep_hours: 6 }] } };
    expect(evalReportConfigSchema.safeParse({ ...config, model: nested }).success).toBe(false);
  });
});

describe('evalReportRequestSchema', () => {
  it('strips unknown keys', () => {
    const parsed = evalReportRequestSchema.parse({ load: 'light', sleep: 4, selection: { preset: 'senior', junk: 1 } });
    expect(parsed).not.toHaveProperty('sleep');
    expect(parsed.selection).not.toHaveProperty('junk');
    expect(parsed.load).toBe('light');
  });

  it('strips control characters from the coach note, keeps newlines, and caps the length', () => {
    const parsed = evalReportRequestSchema.parse({ coachNote: 'Good\u0000 work\u0007\nnext line\u007f' });
    expect(parsed.coachNote).toBe('Good work\nnext line');
    expect(evalReportRequestSchema.safeParse({ coachNote: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('accepts a note of exactly 2000 characters, rejects 2001, and null clears the note', () => {
    expect(evalReportRequestSchema.safeParse({ coachNote: 'x'.repeat(2000) }).success).toBe(true);
    expect(evalReportRequestSchema.safeParse({ coachNote: 'x'.repeat(2001) }).success).toBe(false);
    expect(evalReportRequestSchema.parse({ coachNote: null }).coachNote).toBeNull();
  });

  it('restricts college gauge and metric keys to identifiers, and accepts a development override', () => {
    expect(evalReportRequestSchema.safeParse({ selection: { metricCollegeGauge: { 'bad key!': true } } }).success).toBe(false);
    expect(evalReportRequestSchema.safeParse({ selection: { metricCollegeGauge: { DASH_10: true, TOP_SPEED: false } } }).success).toBe(true);
    expect(evalReportRequestSchema.safeParse({ selection: { metricKeys: ['TOP_SPEED', 'DASH_10'] } }).success).toBe(true);
    expect(evalReportRequestSchema.safeParse({ limiterOverride: 'not valid' }).success).toBe(false);
    expect(evalReportRequestSchema.parse({ developmentAreasOverride: ['DASH_10'] }).developmentAreasOverride).toEqual(['DASH_10']);
  });

  it('requires noteFirst in the frozen model selection', () => {
    const bad = { ...model, selection: { preset: 'high_school' } };
    expect(evalReportConfigSchema.safeParse({ ...config, model: bad }).success).toBe(false);
  });

  it('accepts an empty body', () => {
    expect(evalReportRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe('strengths and development area overrides', () => {
  it('accepts valid metric ids', () => {
    const r = evalReportRequestSchema.safeParse({
      strengthsOverride: ['DASH_10', 'TOP_SPEED'],
      developmentAreasOverride: ['FLY_10'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects a junk key in strengthsOverride', () => {
    expect(evalReportRequestSchema.safeParse({ strengthsOverride: ['bad key!'] }).success).toBe(false);
  });

  it('rejects a junk key in developmentAreasOverride', () => {
    expect(evalReportRequestSchema.safeParse({ developmentAreasOverride: ['DASH_10', 'bad key!'] }).success).toBe(false);
  });
});
