import { describe, it, expect } from 'vitest';
import {
  assembleEvalReportModel,
  computeEvalDefaults,
  evalInputErrorResponse,
  type EvalReportInputErrorCode,
  type EvalAssemblyInput,
  type EvalMeasurementRow,
} from '../eval-report-service';
import type { TierCandidateRow } from '../eval-report';

const ORG = 'org-1';
const EVENT = 'event-now';
const ATHLETE = 'ath-1';

const row = (metric: string, value: number, over: Partial<EvalMeasurementRow> = {}): EvalMeasurementRow => ({
  eventId: EVENT,
  userId: ATHLETE,
  organizationId: ORG,
  metric,
  value: String(value),
  units: metric.includes('LSI') ? '%' : metric.includes('CMJ') ? 'in' : 's',
  teamNameSnapshot: null,
  ...over,
});

const average = (metricCode: string, value: string, operator: 'lte' | 'gte', over: Partial<TierCandidateRow> = {}): TierCandidateRow => ({
  metricCode,
  gender: 'Female',
  sport: 'Soccer',
  level: 'HS',
  ageMin: 11,
  ageMax: 18,
  name: 'Average',
  tierName: 'Average',
  benchmarkValue: value,
  comparisonOperator: operator,
  displayOrder: 1,
  _source: 'site',
  ...over,
});

const META = new Map([
  ['DASH_10YD', { unit: 's', lowerIsBetter: true }],
  ['FLY10_TIME', { unit: 's', lowerIsBetter: true }],
  ['JUMP_CMJ_HOH', { unit: 'in', lowerIsBetter: false }],
  ['AGILITY_505_YD', { unit: 's', lowerIsBetter: true }],
  ['AGILITY_505_YD_L', { unit: 's', lowerIsBetter: true }],
  ['AGILITY_505_YD_R', { unit: 's', lowerIsBetter: true }],
  ['AGILITY_505_YD_LSI', { unit: '%', lowerIsBetter: false }],
  ['MQI_TOTAL', { unit: 'pts', lowerIsBetter: false }],
  ['TOP_SPEED', { unit: 'mph', lowerIsBetter: false }],
  ['JUMP_BROAD', { unit: 'in', lowerIsBetter: false }],
]);

function input(over: Partial<EvalAssemblyInput> = {}): EvalAssemblyInput {
  return {
    event: { id: EVENT, organizationId: ORG, date: '2026-05-01' },
    athlete: { id: ATHLETE, name: 'Ava Test', birthDate: '2011-03-01', gender: 'Female', graduationYear: 2029, sport: 'Soccer' },
    rows: [row('DASH_10YD', 2.0), row('JUMP_CMJ_HOH', 14)],
    priorEvent: null,
    metricMeta: META,
    benchmarks: [average('DASH_10YD', '1.95', 'lte'), average('JUMP_CMJ_HOH', '13', 'gte')],
    selection: {},
    load: null,
    coachNote: null,
    overrides: {},
    ...over,
  };
}

const metric = (model: ReturnType<typeof assembleEvalReportModel>, code: string) => model.metrics.find((m) => m.code === code);

describe('assembleEvalReportModel: event scoping', () => {
  it('uses only this event, this athlete and this organization, and the best attempt', () => {
    const model = assembleEvalReportModel(
      input({
        rows: [
          row('DASH_10YD', 2.0),
          row('DASH_10YD', 1.9),
          row('DASH_10YD', 1.7, { userId: 'other-athlete' }),
          row('DASH_10YD', 1.75, { organizationId: 'foreign-org' }),
          row('DASH_10YD', 1.8, { eventId: 'event-earlier' }),
        ],
      }),
    );
    expect(metric(model, 'DASH_10YD')?.value).toBe(1.9);
  });

  it('reports the event calendar date, not today', () => {
    expect(assembleEvalReportModel(input()).eventDate).toBe('2026-05-01');
  });

  it('computes the age at the event date', () => {
    expect(assembleEvalReportModel(input()).athlete.age).toBe(15);
  });

  it('takes the team from the event rows', () => {
    const model = assembleEvalReportModel(input({ rows: [row('DASH_10YD', 2.0, { teamNameSnapshot: 'U15 Girls' })] }));
    expect(model.athlete.team).toBe('U15 Girls');
  });
});

describe('assembleEvalReportModel: retest', () => {
  const prior = (value: number, units = 's') => ({
    event: { id: 'event-earlier', date: '2026-03-01', userId: ATHLETE, organizationId: ORG },
    rows: [row('DASH_10YD', value, { eventId: 'event-earlier', units })],
  });

  it('shows the current value and a declined trend when an earlier event was better', () => {
    const model = assembleEvalReportModel(input({ rows: [row('DASH_10YD', 2.0)], priorEvent: prior(1.8) }));
    const m = metric(model, 'DASH_10YD')!;
    expect(m.value).toBe(2.0);
    expect(m.trend).toEqual({ change: 0.2, direction: 'declined' });
  });

  it('shows an improved trend', () => {
    const model = assembleEvalReportModel(input({ rows: [row('DASH_10YD', 2.0)], priorEvent: prior(2.1) }));
    expect(metric(model, 'DASH_10YD')!.trend).toEqual({ change: -0.1, direction: 'improved' });
  });

  it('skips the trend when the unit differs', () => {
    const model = assembleEvalReportModel(input({ priorEvent: prior(2.1, 'ms') }));
    expect(metric(model, 'DASH_10YD')!.trend).toBeNull();
  });

  it('skips the trend when the section is off or there is no prior event', () => {
    expect(metric(assembleEvalReportModel(input()), 'DASH_10YD')!.trend).toBeNull();
    const off = assembleEvalReportModel(input({ priorEvent: prior(2.1), selection: { sections: { retestTrend: false } } }));
    expect(metric(off, 'DASH_10YD')!.trend).toBeNull();
  });
});

describe('assembleEvalReportModel: derived metrics', () => {
  const legs = [row('AGILITY_505_YD_L', 2.6), row('AGILITY_505_YD_R', 2.8), row('AGILITY_505_YD_LSI', 50)];

  it('recomputes the LSI from the per-leg bests and agrees with the balance line', () => {
    const model = assembleEvalReportModel(
      input({ rows: legs, selection: { metricKeys: ['505', '505_LSI'] } }),
    );
    const lsi = metric(model, 'AGILITY_505_YD_LSI')!;
    expect(lsi.value).toBeCloseTo((2.6 / 2.8) * 100, 6);
    expect(model.freshAndHealthy.balance?.lsiPercent).toBeCloseTo(lsi.value, 6);
    expect(metric(model, 'AGILITY_505_YD')!.value).toBe(2.6);
  });

  it('omits the balance line when only one leg was tested', () => {
    const model = assembleEvalReportModel(input({ rows: [row('AGILITY_505_YD_L', 2.6), row('AGILITY_505_YD_LSI', 99)] }));
    expect(model.freshAndHealthy.balance).toBeUndefined();
    expect(model.metrics.find((m) => m.code === 'AGILITY_505_YD_LSI')).toBeUndefined();
  });
});

describe('assembleEvalReportModel: comparisons', () => {
  it('compares to the age-group average for a female athlete with a date of birth', () => {
    const c = metric(assembleEvalReportModel(input()), 'DASH_10YD')!.comparison;
    expect(c).toMatchObject({ kind: 'average', status: 'below' });
  });

  it('falls back to value only for a male athlete', () => {
    const m = metric(assembleEvalReportModel(input({ athlete: { ...input().athlete, gender: 'Male' } })), 'DASH_10YD')!;
    expect(m.comparison).toBeNull();
    expect(m.collegeStandard).toBeNull();
    expect(m.value).toBe(2.0);
    expect(m.unit).toBe('s');
  });

  it('falls back to value only with no gender or no date of birth', () => {
    for (const athlete of [
      { ...input().athlete, gender: null },
      { ...input().athlete, birthDate: null },
    ]) {
      const model = assembleEvalReportModel(input({ athlete }));
      expect(metric(model, 'DASH_10YD')!.comparison).toBeNull();
      expect(metric(model, 'DASH_10YD')!.value).toBe(2.0);
    }
    expect(assembleEvalReportModel(input({ athlete: { ...input().athlete, birthDate: null } })).athlete.age).toBeNull();
  });

  it('shows the college gauge only for the metric/report the coach switched on', () => {
    const d1 = average('DASH_10YD', '1.8', 'lte', { level: 'D1', ageMin: null, ageMax: null });
    const base = input({ benchmarks: [average('DASH_10YD', '1.95', 'lte'), d1] });
    expect(metric(assembleEvalReportModel(base), 'DASH_10YD')!.collegeGauge).toBe(false);
    const on = assembleEvalReportModel({ ...base, selection: { collegeGauge: true } });
    expect(metric(on, 'DASH_10YD')!.collegeGauge).toBe(true);
    expect(metric(on, 'DASH_10YD')!.collegeStandard).toMatchObject({ kind: 'average' });
    const perMetric = assembleEvalReportModel({ ...base, selection: { metricCollegeGauge: { DASH_10: true } } });
    expect(metric(perMetric, 'DASH_10YD')!.collegeGauge).toBe(true);
  });
});

describe('assembleEvalReportModel: Fresh & Healthy', () => {
  it('reads the movement band from this event MQI, not another event', () => {
    const withMqi = assembleEvalReportModel(
      input({
        rows: [row('DASH_10YD', 2.0), row('MQI_TOTAL', 16)],
        priorEvent: {
          event: { id: 'event-earlier', date: '2026-03-01', userId: ATHLETE, organizationId: ORG },
          rows: [row('MQI_TOTAL', 6, { eventId: 'event-earlier' })],
        },
      }),
    );
    expect(withMqi.freshAndHealthy.movement).toBe('Efficient');
    expect(withMqi.metrics.find((m) => m.code === 'MQI_TOTAL')).toBeUndefined();

    const without = assembleEvalReportModel(
      input({ rows: [row('DASH_10YD', 2.0), row('MQI_TOTAL', 22, { eventId: 'event-earlier' })] }),
    );
    expect(without.freshAndHealthy.movement).toBeUndefined();
  });

  it('carries the load pick, and omits it when unset or the panel is off', () => {
    expect(assembleEvalReportModel(input({ load: 'medium' })).freshAndHealthy.load).toBe('medium');
    expect(assembleEvalReportModel(input()).freshAndHealthy.load).toBeUndefined();
    const off = assembleEvalReportModel(input({ load: 'heavy', selection: { sections: { freshAndHealthy: false } } }));
    expect(off.freshAndHealthy).toEqual({});
  });
});

describe('assembleEvalReportModel: selection, note and overrides', () => {
  it('defaults to the headline metrics that have data, in report order', () => {
    const model = assembleEvalReportModel(input({ rows: [row('JUMP_CMJ_HOH', 14), row('DASH_10YD', 2.0), row('FLY10_TIME', 1.5)] }));
    expect(model.metrics.map((m) => m.key)).toEqual(['DASH_10', 'FLY_10', 'CMJ_HOH']);
    expect(model.selection.metricKeys).toEqual(['DASH_10', 'FLY_10', 'CMJ_HOH']);
  });

  it('honors an explicit metric list and drops keys without data or unknown keys', () => {
    const model = assembleEvalReportModel(input({ selection: { metricKeys: ['CMJ_HOH', 'DASH_40', 'NOPE'] } }));
    expect(model.metrics.map((m) => m.key)).toEqual(['CMJ_HOH']);
  });

  it('resolves the preset from the graduation year unless the coach picks one', () => {
    expect(assembleEvalReportModel(input()).selection.preset).toBe('high_school');
    expect(assembleEvalReportModel(input({ selection: { preset: 'senior' } })).selection.preset).toBe('senior');
  });

  it('includes the coach note only when the section is on', () => {
    expect(assembleEvalReportModel(input({ coachNote: 'Great effort' })).coachNote).toBe('Great effort');
    const off = assembleEvalReportModel(input({ coachNote: 'Great effort', selection: { sections: { coachNote: false } } }));
    expect(off.coachNote).toBeNull();
  });

  it('applies coach overrides to the strengths and the limiter', () => {
    const model = assembleEvalReportModel(
      input({ overrides: { strengths: ['CMJ_HOH', 'NOPE'], limiter: 'DASH_10' } }),
    );
    expect(model.strengths).toEqual(['CMJ_HOH']);
    expect(model.limiter).toBe('DASH_10');
    expect(assembleEvalReportModel(input({ overrides: { limiter: null } })).limiter).toBeNull();
    expect(() => assembleEvalReportModel(input({ overrides: { limiter: 'FLY_10' } }))).toThrow(/invalid_override/);
  });
});

describe('assembleEvalReportModel: privacy', () => {
  const WELLNESS = /sleep|soreness|stress|energy|cycle|wellness|mood|readiness|pain/i;
  const walk = (value: unknown, found: string[]): string[] => {
    if (Array.isArray(value)) value.forEach((v) => walk(v, found));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (WELLNESS.test(k)) found.push(k);
        walk(v, found);
      }
    } else if (typeof value === 'string' && WELLNESS.test(value)) found.push(value);
    return found;
  };

  it('has no survey-related key or label anywhere in the model JSON', () => {
    const model = assembleEvalReportModel(
      input({
        rows: [
          row('DASH_10YD', 2.0),
          row('FLY10_TIME', 1.5),
          row('JUMP_CMJ_HOH', 14),
          row('AGILITY_505_YD_L', 2.6),
          row('AGILITY_505_YD_R', 2.8),
          row('MQI_TOTAL', 16),
        ],
        load: 'light',
        selection: { metricKeys: ['DASH_10', 'FLY_10', 'CMJ_HOH', '505', '505_LSI'] },
      }),
    );
    expect(walk(JSON.parse(JSON.stringify(model)), [])).toEqual([]);
  });
});

describe('computeEvalDefaults', () => {
  it('suggests the preset, the headline selection and the offered metrics', () => {
    const d = computeEvalDefaults(input({ rows: [row('DASH_10YD', 2.0), row('JUMP_CMJ_HOH', 14), row('AGILITY_505_YD_L', 2.6)] }));
    expect(d.selection.preset).toBe('high_school');
    expect(d.selection.metricKeys).toEqual(['DASH_10', 'CMJ_HOH']);
    expect(computeEvalDefaults(input({ rows: [row('DASH_10YD', 2.0), row('MQI_TOTAL', 10)] })).selection.metricKeys).toEqual(['DASH_10', 'MQI']);
    expect(d.load).toBeNull();
    expect(d.coachNote).toBeNull();
    expect(d.offered.headline.map((o) => o.code)).toEqual(['DASH_10YD', 'JUMP_CMJ_HOH']);
    expect(d.offered.available.map((o) => o.code)).toContain('AGILITY_505_YD_L');
  });
});

describe('H3: metrics outside the key map', () => {
  const other = () =>
    input({
      rows: [row('TOP_SPEED', 15.5, { units: 'mph' }), row('JUMP_BROAD', 60, { units: 'in' }), row('DASH_10YD', 2.0)],
      athlete: { ...input().athlete, birthDate: '2011-03-01' },
      benchmarks: [average('TOP_SPEED', '14', 'gte'), average('JUMP_BROAD', '57.1', 'gte'), average('DASH_10YD', '2.05', 'lte')],
    });

  it('shows a checked measured code with its label, unit and age-group comparison', () => {
    const model = assembleEvalReportModel({ ...other(), selection: { metricKeys: ['TOP_SPEED', 'JUMP_BROAD', 'DASH_10'] } });
    const top = metric(model, 'TOP_SPEED')!;
    expect(top).toMatchObject({ key: null, label: 'Top speed', unit: 'mph', value: 15.5 });
    expect(top.comparison).toMatchObject({ kind: 'average', status: 'at_or_better' });
    expect(metric(model, 'JUMP_BROAD')).toMatchObject({ key: null, label: 'Broad jump' });
    expect(model.selection.metricKeys).toEqual(['TOP_SPEED', 'JUMP_BROAD', 'DASH_10']);
  });

  it('accepts a mapped code and treats it as its logical key', () => {
    const model = assembleEvalReportModel({ ...other(), selection: { metricKeys: ['DASH_10YD'] } });
    expect(metric(model, 'DASH_10YD')!.key).toBe('DASH_10');
  });

  it('drops a code with no data and never ranks unmapped metrics', () => {
    const model = assembleEvalReportModel({ ...other(), selection: { metricKeys: ['TOP_SPEED', 'WEIGHT', 'DASH_10'] } });
    expect(model.metrics.map((m) => m.code)).toEqual(['TOP_SPEED', 'DASH_10YD']);
    expect([...model.strengths, ...model.developmentAreas, model.limiter]).not.toContain(null as never);
    expect(model.limiter).toBe('DASH_10');
  });

  it('labels an unknown code with the code itself', () => {
    const model = assembleEvalReportModel(
      input({ rows: [row('SOME_NEW_CODE', 3)], selection: { metricKeys: ['SOME_NEW_CODE'] } }),
    );
    expect(model.metrics[0]).toMatchObject({ key: null, label: 'SOME_NEW_CODE' });
  });
});

describe('M1: strengths and development areas', () => {
  const three = () =>
    input({
      rows: [row('DASH_10YD', 1.8), row('FLY10_TIME', 1.6), row('JUMP_CMJ_HOH', 10)],
      benchmarks: [average('DASH_10YD', '2.05', 'lte'), average('FLY10_TIME', '1.5', 'lte'), average('JUMP_CMJ_HOH', '14', 'gte')],
    });

  it('keeps the two lists disjoint when the coach overrides strengths', () => {
    const model = assembleEvalReportModel({ ...three(), overrides: { strengths: ['CMJ_HOH'] } });
    expect(model.strengths).toEqual(['CMJ_HOH']);
    expect(model.developmentAreas).not.toContain('CMJ_HOH');
  });

  it('applies a development areas override (shown keys only) and removes overlap with strengths', () => {
    const model = assembleEvalReportModel({ ...three(), overrides: { strengths: ['DASH_10'], developmentAreas: ['DASH_10', 'FLY_10', 'NOPE'] } });
    expect(model.strengths).toEqual(['DASH_10']);
    expect(model.developmentAreas).toEqual(['FLY_10']);
  });
});

describe('M2: Movement follows the selection', () => {
  const rows = [row('DASH_10YD', 2.0), row('MQI_TOTAL', 16)];

  it('shows Movement by default and when MQI is in the requested list', () => {
    expect(assembleEvalReportModel(input({ rows })).freshAndHealthy.movement).toBe('Efficient');
    expect(assembleEvalReportModel(input({ rows, selection: { metricKeys: ['DASH_10', 'MQI'] } })).freshAndHealthy.movement).toBe('Efficient');
    expect(assembleEvalReportModel(input({ rows, selection: { metricKeys: ['MQI_TOTAL'] } })).freshAndHealthy.movement).toBe('Efficient');
  });

  it('omits Movement when MQI is unchecked, and keeps MQI out of the metrics', () => {
    const model = assembleEvalReportModel(input({ rows, selection: { metricKeys: ['DASH_10'] } }));
    expect(model.freshAndHealthy.movement).toBeUndefined();
    expect(model.metrics.some((m) => m.code === 'MQI_TOTAL')).toBe(false);
  });
});

describe('M3: noteFirst', () => {
  it('follows the preset unless overridden', () => {
    expect(assembleEvalReportModel(input({ selection: { preset: 'middle_school' } })).selection.noteFirst).toBe(true);
    expect(assembleEvalReportModel(input({ selection: { preset: 'senior' } })).selection.noteFirst).toBe(false);
    expect(assembleEvalReportModel(input({ selection: { preset: 'senior', sections: { noteFirst: true } } })).selection.noteFirst).toBe(true);
  });
});

describe('M4: balance wording and gender', () => {
  const lsi: TierCandidateRow = {
    metricCode: 'AGILITY_505_YD_LSI', gender: 'Female', sport: null, level: null, ageMin: null, ageMax: null,
    name: 'LSI Normal', tierName: 'Normal', minValue: 95, maxValue: 100, comparisonOperator: 'range', tierGroupId: 'g', tierOrder: 1, _source: 'site',
  };
  const legs = [row('AGILITY_505_YD_L', 2.6), row('AGILITY_505_YD_R', 3.0)];

  it('judges the balance from the LSI set for a female athlete with no sport', () => {
    const model = assembleEvalReportModel(input({ rows: legs, athlete: { ...input().athlete, sport: null }, benchmarks: [lsi] }));
    expect(model.freshAndHealthy.balance?.status).toBe('worth_working_on');
  });

  it('shows a neutral balance label without an LSI set, and never risk or injury wording', () => {
    const model = assembleEvalReportModel(input({ rows: legs, benchmarks: [] }));
    expect(model.freshAndHealthy.balance?.status).toBe('neutral');
    const bad = assembleEvalReportModel(input({ rows: legs, benchmarks: [lsi], load: 'heavy' }));
    expect(JSON.stringify(bad)).not.toMatch(/risk|injur/i);
  });

  it('treats Not Specified gender, and sport in any case, as expected', () => {
    const ns = assembleEvalReportModel(input({ athlete: { ...input().athlete, gender: 'Not Specified' } }));
    expect(metric(ns, 'DASH_10YD')!.comparison).toBeNull();
    const upper = assembleEvalReportModel(input({ athlete: { ...input().athlete, sport: 'SOCCER' } }));
    expect(metric(upper, 'DASH_10YD')!.comparison).not.toBeNull();
  });
});

describe('evalInputErrorResponse', () => {
  it('maps every known code to its status', () => {
    expect(evalInputErrorResponse('event_has_no_organization')).toEqual({ status: 409, message: 'Event has no organization' });
    expect(evalInputErrorResponse('invalid_override')).toEqual({ status: 400, message: 'Override names a metric that is not in the report' });
    expect(evalInputErrorResponse('athlete_not_found')).toEqual({ status: 404, message: 'Not found' });
  });
  it('answers 500, not 404, for a code it does not know', () => {
    const res = evalInputErrorResponse('brand_new_code' as EvalReportInputErrorCode);
    expect(res.status).toBe(500);
  });
});
