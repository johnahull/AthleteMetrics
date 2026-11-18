import { describe, it, expect } from 'vitest';
import { buildPrompt, buildSystemPrompt, stripAnalysisBlock, insightWordRange, INSIGHT_HEADINGS, type ReportData } from '../ai-insights-service';
import { sprintGoalLength, selectMeaningMetrics, belowAverageResults, aboveAverageResults, dropNoMeaningMetrics, meaningRules, MAX_MEANING_METRICS } from '../ai-insights-meaning';

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
    expect(s).toContain('names the metric and cites its value');
    expect(s).toContain('family report (parent, athlete) states a value only together with what it means');
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
  const t = (tierName: string, tiers: string[]) => ({ comparisonOperator: 'range', tierName, allTiers: tiers.map((x) => ({ tierName: x })) });
  it('ranks the bottom tier as below average even when its label says Average', () => {
    const r = belowAverageResults([m('DASH_40YD')], { DASH_40YD: [t('Average', ['Good', 'Average'])] });
    expect(r).toEqual([{ code: 'DASH_40YD', label: 'DASH_40YD', wording: 'at the bottom of the range for the comparison group' }]);
  });
  it('a bottom-half tier with another label is plainly below average', () => {
    expect(belowAverageResults([m('A')], { A: [t('Developing', ['Elite', 'Advanced', 'Developing'])] })[0].wording).toBe('below average for the comparison group');
    expect(belowAverageResults([m('A')], { A: [t('C', ['A', 'B', 'C', 'D'])] })[0].wording).toBe('below average for the comparison group');
  });
  it('a failed single-threshold benchmark is below average', () => {
    expect(belowAverageResults([m('A')], { A: [{ comparisonOperator: 'gte', meetsOrExceeds: false }] }).map((r) => r.code)).toEqual(['A']);
  });
  it('a Good-tier result at the 40th percentile is not below average (the benchmark decides)', () => {
    expect(belowAverageResults([m('A', 40)], { A: [t('Good', ['Good', 'Average'])] })).toEqual([]);
  });
  it('the percentile counts only without any benchmark comparison', () => {
    expect(belowAverageResults([m('A', 30), m('B', 50), m('C', 80), m('D')], {}).map((r) => r.code)).toEqual(['A']);
  });
});

describe('sprintGoalLength: not a sprint goal', () => {
  it.each(['squat 100 kg', 'a 40-inch vertical', 'throw 60 mph', 'the 40-man roster', 'top 100 recruit', 'bench 60 lb', 'make varsity'])('%s', (g) => {
    expect(sprintGoalLength(g)).toBeUndefined();
  });
  it('needs a sprint unit or a time before the distance; the longest distance wins', () => {
    expect(sprintGoalLength('run the 60 yd')).toBe('long');
    expect(sprintGoalLength('a 7.0 60')).toBe('long');
    expect(sprintGoalLength('sub 4.6 in the 40')).toBe('short');
    expect(sprintGoalLength('a 40-yard dash under 5.0 and a 60 yard sprint')).toBe('long');
    expect(sprintGoalLength('100m dash')).toBe('long');
  });
});

describe('selectMeaningMetrics: fly variants share one text', () => {
  it('counts the fly codes once so they do not crowd out other results', () => {
    const codes = ['FLY10_TIME_RI5', 'FLY10_TIME_RI10', 'FLY10_TIME_RI15', 'FLY10_TIME_RI30', 'DASH_40YD', 'AGILITY_5105', 'JUMP_BROAD'];
    const d = data({ metrics: codes.map((c) => metric(c, c, 1)), belowAverage: codes.map((c) => ({ code: c, label: c, wording: 'x' })) });
    const picked = selectMeaningMetrics(d, 'long');
    expect(picked.filter((c) => c.startsWith('FLY10'))).toHaveLength(1);
    expect(picked).toEqual(expect.arrayContaining(['DASH_40YD', 'AGILITY_5105', 'JUMP_BROAD']));
  });
  it('the short running starts are not goal results', () => {
    const d = data({ metrics: [metric('FLY10_TIME_RI5', 'f5', 1), metric('FLY10_TIME_RI30', 'f30', 1)], belowAverage: [] });
    expect(selectMeaningMetrics(d, 'long')).toEqual(['FLY10_TIME_RI30']);
  });
});

describe('dropNoMeaningMetrics keeps look-alike labels', () => {
  it('removes only the exact labels of NO_MEANING metrics', () => {
    const d = data({
      audience: 'parent',
      metrics: [
        metric('PEAK_POWER_W', 'Peak Power (Sayers)', 3200, 'W', false),
        metric('PEAK_POWER_REL', 'Relative Peak Power (Sayers)', 48, 'W/kg', false),
        metric('HEIGHT_IN', 'Height', 64, 'in', false),
        metric('JUMP_CMJ_HOH', 'Countermovement Jump Height', 16, 'in', false),
      ],
      keyFacts: ['Strongest metric: Peak Power (Sayers), 90th percentile', 'Biggest gap: Relative Peak Power (Sayers), 20th percentile', 'Biggest gap: Height, 5th percentile', 'Strongest metric: Countermovement Jump Height, 60th percentile'],
      concerns: [{ metric: 'Relative Peak Power (Sayers)', concern: 'c' }, { metric: 'Peak Power (Sayers)', concern: 'c' }],
    });
    const out = dropNoMeaningMetrics(d);
    expect(out.metrics.map((x) => x.code)).toEqual(['PEAK_POWER_REL', 'JUMP_CMJ_HOH']);
    expect(out.keyFacts).toEqual(['Biggest gap: Relative Peak Power (Sayers), 20th percentile', 'Strongest metric: Countermovement Jump Height, 60th percentile']);
    expect(out.concerns).toEqual([{ metric: 'Relative Peak Power (Sayers)', concern: 'c' }]);
  });
});

describe('coach prompt is unchanged by the family blocks', () => {
  it('has no vetted or below-average block', () => {
    const p = buildPrompt(data({ audience: 'coach' }));
    expect(p).not.toContain('## What the metrics mean (vetted)');
    expect(p).not.toContain('## Below Average Results');
  });
});

describe('family rule text', () => {
  const p = buildPrompt(data());
  it('overrides the checklist examples, bans goal speeds, teammate comparisons and promises', () => {
    expect(p).toContain('override the checklist examples');
    expect(p).toContain('Never work out a goal speed or predicted time');
    expect(p).toContain('named teammates');
    expect(p).toContain('scholarships');
  });
  it('explains the bottom of the range only when used, and says "from one 40-yard run"', () => {
    expect(p).toContain('it means the lowest group for that age and sex, not pass or fail');
    expect(p).toContain('"from one 40-yard run"');
  });
  it('the long-goal focus line says distance, not race', () => {
    expect(buildPrompt(data({ coachNotes: { goals: 'a 7.0 60' } }))).toContain('more than half the distance is run near top speed');
  });
  it('the LSI swap does not say left-right balance, and there is no "How results connect" clause without that section', () => {
    expect(p).toContain("LSI -> how close the two legs' results are");
    expect(p).not.toContain('left-right balance');
    expect(p).not.toContain('a result that explains a limiter');
  });
});

describe('legacy and new parent heading together', () => {
  it('drops the second big picture with its body', () => {
    const t = '## What the numbers mean\nold\n## The big picture\nnew\n## What to Work On\ny';
    expect(stripAnalysisBlock(t, 'parent')).toBe('## The big picture\nold\n## What to Work On\ny');
  });
});

describe('meaningRules: live-eval fixes', () => {
  const rules = meaningRules(true);
  it('keeps a below-average result out of What is Going Well', () => {
    expect(rules).toContain('"What\'s Going Well" only holds results listed under "Going Well Candidates"');
    expect(rules).toContain('No result is above average yet');
  });
  it('gives percentiles one direction only', () => {
    expect(rules).toContain('faster or higher than about N out of 100');
    expect(rules).toMatch(/Never write "lower N%", "top N%" or "bottom N%"/);
  });
  it('joins two metrics only through a "How results connect" line', () => {
    expect(rules).toContain('Never join two metrics in your own words unless a "How results connect" line does it');
  });
  it('drops meta caveats, tier names and flagged-style words', () => {
    expect(rules).toContain('Never mention how many metrics have benchmarks');
    expect(rules).toContain('This shows one test day, not change over time.');
    expect(rules).toContain('Never print tier names');
    expect(rules).toContain('Never say "flagged"');
  });
  it('explains "bottom of the range" only when the phrase is used', () => {
    expect(rules).toContain('If you use the phrase "bottom of the range"');
    expect(rules).not.toContain('Say once that "bottom of the range"');
  });
  it('asks for short sentences and one name for the jump test', () => {
    expect(rules).toContain('At most 20 words per sentence');
    expect(rules).toContain('"jump with a quick dip" every time');
  });
  it('paraphrases a fired connection with its consequence only when connections exist', () => {
    expect(rules).toContain('paraphrase it with its consequence');
    expect(meaningRules(false)).not.toContain('paraphrase it with its consequence');
  });
});

describe('aboveAverageResults and the Going Well Candidates block', () => {
  const tiers = [{ tierName: 'Good' }, { tierName: 'Average' }];
  const tier = (tierName: string) => ({ comparisonOperator: 'range', tierName, allTiers: tiers });
  const metric = (code: string, percentile?: number) => ({ code, label: code, values: [1], unit: 's', lowerIsBetter: true, percentile }) as never;
  it('lists a result that is not below average, with the wording the standing allows', () => {
    const out = aboveAverageResults([metric('A', 70), metric('B', 30), metric('C', 20), metric('D')], { A: [tier('Good')], B: [tier('Good')], C: [tier('Average')] });
    expect(out.map((o) => o.code)).toEqual(['A', 'B']);
    expect(out.find((o) => o.code === 'A')!.wording).toBe('above average for the comparison group');
    // a Good tier with a 30th percentile meets the standard but is never called above average
    expect(out.find((o) => o.code === 'B')!.wording).toBe('meets the group standard');
  });
  it('a percentile-only metric counts from the median', () => {
    expect(aboveAverageResults([metric('A', 55), metric('B', 45)], {}).map((o) => o.code)).toEqual(['A']);
  });
  it('rules ban report-lacks wording, splits/KPI/noise, extra tests; one-test-day line stays in the big picture', () => {
    const r = meaningRules(false);
    expect(r).toContain('Never say the report lacks or does not provide');
    expect(r).toContain('Never say "flagged", "splits", "KPI" or "noise". State the goal once.');
    expect(r).toContain('Never recommend a test or exercise that is not already in the data');
    expect(r).toContain('Put the "one test day" sentence in the big picture only');
  });
});

describe('Going Well Candidates in the family prompt', () => {
  it('prints the block for parent and athlete only, and omits it when empty', () => {
    const base = { reportType: 'individual', reportName: 'E', organizationName: 'O', timeframe: 't', athleteName: 'Casey Lee', athleteAge: 16, metrics: [{ code: 'DASH_10YD', label: '10-Yard Dash', values: [1.7], unit: 's', lowerIsBetter: true }], keyFacts: [], aboveAverage: [{ code: 'DASH_10YD', label: '10-Yard Dash', wording: 'meets the group standard' }] } as never as ReportData;
    expect(buildPrompt({ ...base, audience: 'parent' })).toContain('## Going Well Candidates\n- 10-Yard Dash: meets the group standard');
    expect(buildPrompt({ ...base, audience: 'athlete' })).toContain('## Going Well Candidates');
    expect(buildPrompt({ ...base, audience: 'coach' })).not.toContain('## Going Well Candidates');
    expect(buildPrompt({ ...base, audience: 'parent', aboveAverage: [] })).not.toContain('## Going Well Candidates');
  });
});
