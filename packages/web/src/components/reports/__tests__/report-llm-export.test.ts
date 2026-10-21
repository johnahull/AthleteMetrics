import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildReportLlmExport } from '../report-llm-export';

const report: any = {
  id: 'r1',
  name: 'Spring Eval',
  description: 'Spring testing',
  coachingInsights: null,
  coachingInsightsGeneratedAt: null,
};

const explanation = (title: string) => ({
  title,
  shortDescription: `${title} short`,
  whatItMeasures: 'measures',
  whyItMatters: 'matters',
  unitNote: 'note',
  directionOfBetter: 'higher',
});

function makeData(over: Record<string, any> = {}): any {
  return {
    reportType: 'individual',
    reportConfig: { metrics: ['VERTICAL_JUMP', 'FLY10_TIME', 'SPLIT'], charts: { trends: true, fvProfile: true } },
    generatedAt: '2024-03-15T00:00:00Z',
    metricLabels: { VERTICAL_JUMP: 'Vertical Jump', FLY10_TIME: '10-Yard Fly', SPLIT: 'Run' },
    metricUnits: { VERTICAL_JUMP: 'in', FLY10_TIME: 's', SPLIT: 's' },
    metricFormats: { SPLIT: { unit: 's', displayFormat: 'duration', decimalPrecision: 1 } },
    metricExplanations: {
      VERTICAL_JUMP: explanation('Vertical Jump'),
      FLY10_TIME: explanation('10-Yard Fly'),
      SPLIT: explanation('Run'),
      BROAD_JUMP: explanation('Broad Jump Secret'),
    },
    orgBranding: { orgName: 'Test Org' },
    eventContext: { eventName: 'Combine', eventDate: '2024-03-01T00:00:00.000Z' },
    athlete: {
      userId: 'ath-secret-id',
      userName: 'Test Athlete',
      age: 16,
      gender: 'Male',
      sports: ['Football'],
      teams: ['Varsity'],
      email: 'secret@example.com',
      shareBlockedUnder13: false,
      positions: ['QB-POS'],
      measurements: { VERTICAL_JUMP: 27.5, FLY10_TIME: 1.73, SPLIT: 402.5 },
      percentiles: { VERTICAL_JUMP: 80 },
      teamAverages: { VERTICAL_JUMP: 24 },
      benchmarkComparisons: {
        VERTICAL_JUMP: [
          {
            benchmarkName: 'Tiers',
            tierGroupName: 'HS Tiers',
            tierName: 'Gold',
            nextTierName: 'Platinum',
            distanceToNextTier: 2.5,
            coachingNote: 'Keep jumping',
            benchmarkValue: 26,
            athleteValue: 27.5,
            meetsOrExceeds: true,
          },
          { benchmarkName: 'D1 Min', benchmarkValue: 30, athleteValue: 27.5, meetsOrExceeds: false },
        ],
      },
    },
    trends: {
      VERTICAL_JUMP: {
        series: [{ date: '2024-01-01', value: 25 }, { date: '2024-03-01', value: 27.5 }],
        direction: 'higher',
        delta: { from: 25, to: 27.5, pct: 10 },
        benchmark: { kind: 'none' },
      },
    },
    distributions: { VERTICAL_JUMP: { values: [11.11, 22.22], athleteValue: 27.5, stats: {}, direction: 'higher' } },
    eventPercentiles: { VERTICAL_JUMP: 99 },
    compositeIndex: { score: 'COMPOSITE-SECRET' },
    fvProfile: {
      profileId: 'fv-secret-id',
      date: '2024-03-02',
      distanceUnit: 'yards',
      f0Rel: '7.1',
      v0: '9.2',
      pmaxRel: '16.3',
      fvSlope: '-0.77',
      fitR2: '0.98',
      analysisJson: null,
    },
    goals: [{ title: 'GOAL-SECRET' }],
    wellness: { x: 'WELLNESS-SECRET' },
    notes: ['NOTE-SECRET'],
    ...over,
  };
}

const EXCLUDED = [
  'Broad Jump Secret',
  'secret@example.com',
  'ath-secret-id',
  'fv-secret-id',
  'QB-POS',
  'COMPOSITE-SECRET',
  'GOAL-SECRET',
  'WELLNESS-SECRET',
  'NOTE-SECRET',
  '11.11',
  'shareBlockedUnder13',
  'eventPercentiles',
  'distributions',
];

describe('buildReportLlmExport — markdown', () => {
  const md = buildReportLlmExport(report, makeData(), 'markdown');

  it('has header details', () => {
    expect(md.mimeType).toMatch(/markdown/);
    for (const s of ['Spring Eval', 'Spring testing', 'Test Athlete', '16', 'Male', 'Football', 'Varsity', 'Test Org', 'Combine', '2024-03-01']) {
      expect(md.content).toContain(s);
    }
  });

  it('lists only report metrics, formatted like the table', () => {
    expect(md.content).toContain('27.50 in');
    expect(md.content).toContain('1.73 s (');
    expect(md.content).toContain('mph');
    expect(md.content).toContain('6:42.5');
  });

  it('includes group average and percentile when comparison is on', () => {
    expect(md.content).toContain('24.00 in');
    expect(md.content).toContain('80.0');
  });

  it('renders tiered and plain benchmarks', () => {
    for (const s of ['HS Tiers', 'Gold', 'Platinum', '2.5', 'Keep jumping', 'D1 Min', '30.00 in', 'below']) {
      expect(md.content).toContain(s);
    }
  });

  it('includes trends and F-V profile when selected', () => {
    expect(md.content).toContain('2024-01-01');
    expect(md.content).toContain('9.2');
    expect(md.content).toContain('0.98');
  });

  it('limits the glossary to report metrics and leaks nothing else', () => {
    expect(md.content).toContain('Vertical Jump short');
    for (const s of EXCLUDED) expect(md.content).not.toContain(s);
  });

  it('builds the filename from athlete, report and date', () => {
    expect(md.filename).toMatch(/^test-athlete-spring-eval-\d{4}-\d{2}-\d{2}\.md$/);
  });
});

describe('buildReportLlmExport — json', () => {
  const out = buildReportLlmExport(report, makeData(), 'json');
  const parsed = JSON.parse(out.content);

  it('is pretty-printed JSON with raw numbers and units', () => {
    expect(out.mimeType).toMatch(/json/);
    expect(out.filename).toMatch(/\.json$/);
    expect(out.content).toContain('\n  ');
    const jump = JSON.stringify(parsed).includes('27.5');
    expect(jump).toBe(true);
    expect(parsed.athlete.name).toBe('Test Athlete');
  });

  it('leaks nothing outside the report', () => {
    for (const s of EXCLUDED) expect(out.content).not.toContain(s);
  });
});

describe('buildReportLlmExport — gates', () => {
  it('hides group average and percentile when groupComparison is false', () => {
    const data = makeData();
    data.reportConfig.groupComparison = false;
    const md = buildReportLlmExport(report, data, 'markdown').content;
    expect(md).not.toContain('24.00 in');
    expect(md).not.toContain('80.0');
    const json = buildReportLlmExport(report, data, 'json').content;
    expect(json).not.toContain('"percentile"');
    expect(json).not.toContain('groupAverage');
  });

  it('omits trends and F-V when the charts are off', () => {
    const data = makeData();
    data.reportConfig.charts = { trends: false, fvProfile: false };
    const md = buildReportLlmExport(report, data, 'markdown').content;
    expect(md).not.toContain('2024-01-01');
    expect(md).not.toContain('0.98');
  });
});

describe('buildReportLlmExport — coaching insights', () => {
  it('labels the date "Evaluation Written:"', () => {
    const r = { ...report, coachingInsights: 'Great work', coachingInsightsGeneratedAt: '2024-03-16T00:00:00Z' };
    const md = buildReportLlmExport(r, makeData(), 'markdown').content;
    expect(md).toContain('Great work');
    expect(md).toContain('Evaluation Written:');
    expect(md).not.toContain('Generated on:');
  });

  it('omits the section when there are none', () => {
    expect(buildReportLlmExport(report, makeData(), 'markdown').content).not.toContain('Evaluation Written:');
  });
});

afterEach(() => vi.useRealTimers());
