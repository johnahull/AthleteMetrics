import { describe, it, expect, vi } from 'vitest';

// The org and team lookups are the only direct db reads; every chained query resolves to one row.
vi.mock('../../db', () => {
  const row = { name: 'Lions', sport: 'Soccer', aiPromptContext: null };
  const chain: any = new Proxy({}, {
    get: (_t, prop) => (prop === 'then' ? (resolve: any) => resolve([row]) : () => chain),
  });
  return { db: chain };
});
vi.mock('../../utils/metric-type', () => ({
  getMetricTypes: async (codes: string[]) =>
    Object.fromEntries(codes.map(c => [c, c === 'FLY10_TIME' ? 'lower_is_better' : 'higher_is_better'])),
}));

import { buildReportDataForAI } from '../report-routes';
import { buildPrompt } from '../../services/ai-insights-service';

const labels = { VERTICAL_JUMP: 'Vertical Jump', FLY10_TIME: '10-Yard Fly' };

/** Single-value benchmark row (meetsOrExceeds is the real threshold). */
const single = (meets: boolean) => ({
  benchmarkName: 'Varsity', benchmarkValue: 26, athleteValue: 0, meetsOrExceeds: meets,
  percentageDiff: 0, comparisonOperator: 'gte',
});

/** Tier row: benchmarkValue is the tier midpoint and meetsOrExceeds the upper half, neither a threshold. */
const tier = (tierName: string, order: number, next: string | null, distance: number | null) => ({
  benchmarkName: 'Speed Tiers', benchmarkValue: 1.45, athleteValue: 0, meetsOrExceeds: true,
  percentageDiff: 0, comparisonOperator: 'range', tierName, tierOrder: order, tierGroupName: 'Speed Tiers',
  nextTierName: next, distanceToNextTier: distance, isBestTier: order === 1,
});

function service(data: any) {
  return {
    generateTeamReport: async () => data,
    generateIndividualReport: async () => data,
    getMetricLabelsAndUnits: async () => ({ labels, units: { VERTICAL_JUMP: 'in', FLY10_TIME: 's' } }),
  } as any;
}

const teamReport = { id: 'r1', name: 'Team Report', organizationId: 'o1', reportType: 'team', config: { timeframe: {}, metrics: [] } } as any;
const individualReport = { id: 'r2', name: 'Athlete Report', organizationId: 'o1', reportType: 'individual', config: { athleteId: 'a1', timeframe: {}, metrics: [] } } as any;

function teamData(overrides: Record<string, any> = {}) {
  const athlete = (userName: string, vj: number, meets: boolean, t: ReturnType<typeof tier>) => ({
    userId: userName, userName,
    measurements: { VERTICAL_JUMP: vj, FLY10_TIME: 1.4 },
    benchmarkComparisons: { VERTICAL_JUMP: [single(meets)], FLY10_TIME: [t] },
  });
  return {
    teamStatistics: [
      { metric: 'VERTICAL_JUMP', average: 25, median: 24.5, min: 18, max: 32, standardDeviation: 3.25, units: 'in',
        topPerformer: { userId: 'x', userName: 'Secret Star', value: 32 } },
      { metric: 'FLY10_TIME', average: 1.4, median: 1.41, min: 1.2, max: 1.6, standardDeviation: 0.1, units: 's' },
    ],
    // Ranked by composite (best first), and capped upstream: not the full roster
    athleteRankings: [
      athlete('Alice Secret', 32, true, tier('Elite', 1, null, null)),
      athlete('Bob Hidden', 20, false, tier('Elite', 1, null, null)),
      athlete('Cara Private', 18, false, tier('Developing', 3, 'Advanced', 0.2)),
    ],
    athleteCount: 40,
    teamIds: ['t1'],
    metricLabels: labels,
    ...overrides,
  };
}

function individualData(overrides: Record<string, any> = {}) {
  return {
    athlete: {
      userId: 'a1', userName: 'Jordan Smith', positions: ['Forward', 'Midfielder'], age: 16,
      measurements: { VERTICAL_JUMP: 27.5, FLY10_TIME: 1.52 },
      percentiles: { VERTICAL_JUMP: 85, FLY10_TIME: 30 },
      teamAverages: { VERTICAL_JUMP: 24, FLY10_TIME: 1.45 },
      benchmarkComparisons: {
        VERTICAL_JUMP: [{ ...single(false), benchmarkName: 'Elite VJ', benchmarkValue: 30 }],
        FLY10_TIME: [tier('Developing', 3, 'Advanced', 0.12)],
      },
    },
    metricLabels: labels,
    comparisonLabel: 'Varsity Boys',
    ...overrides,
  };
}

describe('buildReportDataForAI — team', () => {
  it('uses full-roster teamStatistics for metric stats, not capped athleteRankings values', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData()));
    const vj = data.metrics.find(m => m.code === 'VERTICAL_JUMP')!;
    expect(vj).toMatchObject({ average: 25, median: 24.5, min: 18, max: 32, standardDeviation: 3.25, values: [] });
  });

  it('puts no athlete names anywhere in the prompt', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData()));
    const prompt = buildPrompt(data);
    for (const name of ['Alice', 'Bob', 'Cara', 'Secret Star']) expect(prompt).not.toContain(name);
  });

  it('concerns are aggregate benchmark misses, never per athlete', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData()));
    expect(data.concerns).toEqual([{ metric: 'Vertical Jump', concern: '33% of athletes meet Varsity (1/3)' }]);
  });

  it('tiered benchmarks report the tier distribution, not meetsOrExceeds', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData()));
    const fly = data.benchmarkComparisons!.find(b => b.metric === '10-Yard Fly')!;
    expect(fly.performance).toBe('Speed Tiers: Elite 2, Developing 1 (of 3 athletes)');
    expect(fly.performance).not.toContain('100%');
  });

  it('key facts are aggregate: best and worst benchmark share, no names', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData()));
    expect(data.keyFacts).toEqual([
      'Strongest benchmark result: 10-Yard Fly, 67% of athletes in the top tier (Elite) of Speed Tiers (2/3)',
      'Biggest gap: Vertical Jump, 33% of athletes meet Varsity (1/3)',
    ]);
  });

  it('data confidence states roster size, no history and benchmark coverage', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData()));
    expect(data.dataConfidence).toBe('40 athletes; no history over time in this report (best value per athlete); benchmarks for 2 of 2 metrics');
  });

  it('data confidence says history exists when team trends are present', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData({
      teamTrends: { VERTICAL_JUMP: { teamSeries: [{ date: '2024-01-01', value: 1 }, { date: '2024-02-01', value: 2 }] } },
    })));
    expect(data.dataConfidence).toContain('history over time for 1 metric');
  });
});

describe('buildReportDataForAI — individual', () => {
  it('reads athlete.positions (array) for the position', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', service(individualData()));
    expect(data.athletePosition).toBe('Forward, Midfielder');
  });

  it('builds concerns from athlete benchmark rows, tier-aware', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', service(individualData()));
    expect(data.concerns).toEqual([
      { metric: 'Vertical Jump', concern: 'Below Elite VJ benchmark (30 in); athlete 27.50 in' },
      { metric: '10-Yard Fly', concern: 'Developing tier of Speed Tiers; needs 0.12 s less to reach Advanced' },
    ]);
    // Tier midpoint is never presented as a threshold
    expect(JSON.stringify(data.concerns)).not.toContain('1.45');
  });

  it('benchmark summary is tier-aware', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', service(individualData()));
    expect(data.benchmarkComparisons).toEqual([
      { metric: 'Vertical Jump', performance: 'Meets 0/1 benchmarks' },
      { metric: '10-Yard Fly', performance: 'Developing tier of Speed Tiers' },
    ]);
  });

  it('passes the comparison label through', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', service(individualData()));
    expect(data.comparisonLabel).toBe('Varsity Boys');
    expect(buildPrompt(data)).toContain('compared to Varsity Boys');
  });

  it('key facts: strongest by percentile, biggest gap tier-aware with direction applied', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', service(individualData()));
    expect(data.keyFacts).toEqual([
      'Strongest metric: Vertical Jump, 85th percentile vs Varsity Boys',
      'Biggest gap: 10-Yard Fly, Developing tier of Speed Tiers; needs 0.12 s less to reach Advanced',
    ]);
  });

  it('key facts fall back to percentile for the gap when there are no tiers', async () => {
    const d = individualData();
    d.athlete.benchmarkComparisons = {} as any;
    const data = await buildReportDataForAI(individualReport, 'u1', service({ ...d, comparisonLabel: undefined }));
    expect(data.keyFacts).toEqual([
      'Strongest metric: Vertical Jump, 85th percentile vs all athletes in organization',
      'Biggest gap: 10-Yard Fly, 30th percentile vs all athletes in organization',
    ]);
  });

  it('data confidence: no history without trends; sessions counted from trends', async () => {
    const none = await buildReportDataForAI(individualReport, 'u1', service(individualData()));
    expect(none.dataConfidence).toBe('Best value per metric only; no history over time in this report; benchmarks for 2 of 2 metrics');

    const withTrends = await buildReportDataForAI(individualReport, 'u1', service(individualData({
      trends: { VERTICAL_JUMP: { series: [{ date: '2024-01-15', value: 24 }, { date: '2024-03-15', value: 27.5 }] } },
    })));
    expect(withTrends.dataConfidence).toBe('2 testing sessions; history over time for 1 metric; benchmarks for 2 of 2 metrics');
  });
});
