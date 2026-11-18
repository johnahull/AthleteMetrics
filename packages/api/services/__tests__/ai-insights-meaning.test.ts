import { describe, it, expect } from 'vitest';
import { buildPrompt, buildSystemPrompt, stripAnalysisBlock, insightWordRange, INSIGHT_HEADINGS, type ReportData } from '../ai-insights-service';
import { sprintGoalLength, selectMeaningMetrics, belowAverageResults, MAX_MEANING_METRICS } from '../ai-insights-meaning';

const metric = (code: string, label: string, value: number, unit = 's', lowerIsBetter = true) => ({ code, label, values: [value], unit, lowerIsBetter });

function data(overrides: Partial<ReportData> = {}): ReportData {
  return {
    reportType: 'individual',
    reportName: 'Test',
    organizationName: 'Test Org',
    timeframe: 'Current Season',
    athleteName: 'Chris Lee',
    athleteSport: 'Football',
    metrics: [
      metric('DASH_40YD', '40-Yard Dash', 5.26),
      metric('FLY10_TIME_RI30', '10-Yard Fly (30 yd run-in)', 1.12),
      metric('JUMP_CMJ_HOH', 'Countermovement Jump', 19.1, 'in', false),
      metric('WEIGHT_LBS', 'Body Weight', 194, 'lb', false),
    ],
    belowAverage: [
      { code: 'DASH_40YD', label: '40-Yard Dash', wording: 'at the bottom of the range for the comparison group' },
      { code: 'JUMP_CMJ_HOH', label: 'Countermovement Jump', wording: 'below average for the comparison group' },
    ],
    audience: 'parent',
    ...overrides,
  };
}

const block = (p: string) => p.match(/## What the metrics mean \(vetted\)\n([\s\S]*?)\n\n/)?.[1] ?? '';

describe('vetted meanings block', () => {
  it('lists meaning text for metrics that have one, labelled', () => {
    const b = block(buildPrompt(data()));
    expect(b).toContain('40-Yard Dash:');
    expect(b).toContain('Overall straight-line speed');
  });
  it('is absent when no metric has a meaning', () => {
    const p = buildPrompt(data({ metrics: [metric('MQI_TOTAL', 'MQI', 70)], belowAverage: [{ code: 'MQI_TOTAL', label: 'MQI', wording: 'below average' }] }));
    expect(p).not.toContain('## What the metrics mean (vetted)');
  });
  it('is capped at 6 metrics', () => {
    const codes = ['DASH_10YD', 'DASH_20YD', 'DASH_30YD', 'DASH_40YD', 'T_TEST', 'AGILITY_5105', 'JUMP_BROAD', 'TOP_SPEED'];
    const d = data({ metrics: codes.map((c) => metric(c, c, 1)), belowAverage: codes.map((c) => ({ code: c, label: c, wording: 'below average' })) });
    expect(selectMeaningMetrics(d)).toHaveLength(MAX_MEANING_METRICS);
    expect(block(buildPrompt(d)).split('\n').filter((l) => l.startsWith('- '))).toHaveLength(MAX_MEANING_METRICS);
  });
  it('picks results the goal is built from first', () => {
    const d = data({ coachNotes: { goals: 'run a 7.0 60' } });
    expect(selectMeaningMetrics(d, 'long')[0]).toBe('FLY10_TIME_RI30');
  });
  it('is not sent for a result without a meaning even when below average', () => {
    expect(selectMeaningMetrics(data({ belowAverage: [{ code: 'WEIGHT_LBS', label: 'Body Weight', wording: 'x' }] }))).toEqual([]);
  });
});

describe('NO_MEANING metrics', () => {
  it('never reach a parent or athlete prompt', () => {
    for (const audience of ['parent', 'athlete'] as const) {
      const p = buildPrompt(data({ audience, keyFacts: ['Strongest metric: Body Weight, 90th percentile'], history: [{ code: 'WEIGHT_LBS', label: 'Body Weight', points: [{ date: '2025-01-01', value: 190 }, { date: '2025-02-01', value: 194 }] }] }));
      expect(p).not.toContain('Body Weight');
      expect(p).not.toContain('194');
    }
  });
  it('stay in a coach prompt', () => {
    expect(buildPrompt(data({ audience: 'coach' }))).toContain('Body Weight');
  });
});

describe('below-average results', () => {
  it('are listed with the given wording', () => {
    const p = buildPrompt(data());
    expect(p).toContain('## Below Average Results');
    expect(p).toContain('40-Yard Dash: at the bottom of the range for the comparison group');
  });
});

describe('locked family rules', () => {
  it('parent and athlete get NEVER SAY and meaning rules; coach does not', () => {
    for (const audience of ['parent', 'athlete'] as const) {
      const p = buildPrompt(data({ audience }));
      expect(p).toContain('NEVER SAY:');
      expect(p).toContain('WHAT RESULTS MEAN:');
      expect(p).toContain('No bare numbers');
      expect(p).not.toContain('Give one number per bullet');
      expect(p.indexOf('NEVER SAY:')).toBeGreaterThan(p.indexOf('</report_data>'));
    }
    const coach = buildPrompt(data({ audience: 'coach' }));
    expect(coach).not.toContain('NEVER SAY:');
    expect(coach).not.toContain('WHAT RESULTS MEAN:');
  });
  it('the jargon swap list in the prompt is short', () => {
    const line = buildPrompt(data()).split('\n').find((l) => l.startsWith('- Swap coach terms')) ?? '';
    expect(line.split(';').length).toBeLessThanOrEqual(12);
  });
});

describe('parent structure', () => {
  it('uses The big picture heading and asks for focus results', () => {
    const p = buildPrompt(data());
    expect(p).toContain('\n## The big picture\n');
    expect(p).not.toContain('What the numbers mean\n');
    expect(INSIGHT_HEADINGS.parent[0]).toBe('The big picture');
  });
  it('adds the goal-length focus line only for a sprint goal', () => {
    expect(buildPrompt(data({ coachNotes: { goals: 'Chris wants a 7.0-7.1 60' } }))).toContain('long sprint (60 yards or longer)');
    expect(buildPrompt(data({ coachNotes: { goals: 'a 4.6 40 yard dash' } }))).toContain('short sprint (40 yards or shorter)');
    expect(buildPrompt(data({ coachNotes: { goals: 'make varsity' } }))).not.toContain('Goal focus:');
  });
  it('sprintGoalLength reads the distance, not the time', () => {
    expect(sprintGoalLength('7.0-7.1 s 60')).toBe('long');
    expect(sprintGoalLength('run 7.0 in the 60 yard dash')).toBe('long');
    expect(sprintGoalLength('sub 5.0 in the 40')).toBe('short');
    expect(sprintGoalLength('a 4.60 time')).toBeUndefined();
    expect(sprintGoalLength('make varsity')).toBeUndefined();
  });
  it('athlete word range is 180-240', () => {
    expect(insightWordRange('individual', 'athlete')).toEqual([180, 240]);
    expect(buildPrompt(data({ audience: 'athlete' }))).toContain('180-240 words');
  });
});

describe('test-day line', () => {
  const withFlags = (flags: string[]) => data({ coachNotes: { testDayFlags: flags as never } });
  it('appears for surface, weather and protocol_deviation only', () => {
    for (const f of ['surface', 'weather', 'protocol_deviation']) expect(buildPrompt(withFlags([f]))).toContain('Test conditions (surface, weather or setup)');
    expect(buildPrompt(withFlags(['poor_wellness']))).not.toContain('Test conditions (surface');
    expect(buildPrompt(data())).not.toContain('Test conditions (surface');
  });
  it('is not added for the coach audience', () => {
    expect(buildPrompt({ ...withFlags(['surface']), audience: 'coach' })).not.toContain('Test conditions (surface');
  });
});

describe('system prompt', () => {
  it('lets sport-meaning claims come from the vetted sections, audience-neutrally', () => {
    const s = buildSystemPrompt();
    expect(s).not.toContain('Every observation names the metric and cites its value');
    expect(s).not.toContain('Focus only on what the numbers show');
    expect(s).toContain('sport-meaning claims only from the vetted sections');
  });
});

describe('legacy parent heading', () => {
  it('maps the old heading to The big picture for one release', () => {
    expect(stripAnalysisBlock('## What the numbers mean\nx\n## What to Work On\ny', 'parent')).toBe('## The big picture\nx\n## What to Work On\ny');
  });
  it('does not map it for other audiences', () => {
    expect(() => stripAnalysisBlock('## What the numbers mean\nx', 'coach')).toThrow();
  });
});

describe('belowAverageResults', () => {
  const m = (code: string, percentile?: number) => ({ ...metric(code, code, 1), percentile });
  it('ranks the bottom tier as below average even when its label says Average', () => {
    const r = belowAverageResults([m('DASH_40YD')], { DASH_40YD: 'Average' });
    expect(r).toEqual([{ code: 'DASH_40YD', label: 'DASH_40YD', wording: 'at the bottom of the range for the comparison group' }]);
  });
  it('a bottom tier with another label is plainly below average', () => {
    expect(belowAverageResults([m('DASH_40YD')], { DASH_40YD: 'Developing' })[0].wording).toBe('below average for the comparison group');
  });
  it('without a tier, a percentile under 50 is below average and 50 or more is not', () => {
    expect(belowAverageResults([m('A', 30), m('B', 50), m('C', 80), m('D')], {}).map((r) => r.code)).toEqual(['A']);
  });
});
