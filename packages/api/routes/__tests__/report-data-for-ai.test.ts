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
    Object.fromEntries(codes.map(c => [c, ['FLY10_TIME', 'MILE_TIME'].includes(c) ? 'lower_is_better' : 'higher_is_better'])),
}));

import { buildReportDataForAI } from '../report-routes';
import { buildPrompt } from '../../services/ai-insights-service';

const labels = { VERTICAL_JUMP: 'Vertical Jump', FLY10_TIME: '10-Yard Fly', MILE_TIME: 'Mile' };

/** Single-value benchmark row (meetsOrExceeds is the real threshold). */
const single = (meets: boolean) => ({
  benchmarkName: 'Varsity', benchmarkValue: 26, athleteValue: 0, meetsOrExceeds: meets,
  percentageDiff: 0, comparisonOperator: 'gte',
});

const SPEED_TIERS = ['Elite', 'Advanced', 'Developing'];

/**
 * Tier row: benchmarkValue is the tier midpoint and meetsOrExceeds the upper half, neither a threshold.
 * tiers = the group's tier names best first (allTiers); null leaves allTiers out.
 */
const tier = (
  tierName: string | undefined, order: number, next: string | null, distance: number | null,
  group = 'Speed Tiers', tiers: string[] | null = SPEED_TIERS,
) => ({
  benchmarkName: group, benchmarkValue: 1.45, athleteValue: 0, meetsOrExceeds: true,
  percentageDiff: 0, comparisonOperator: 'range', tierName, tierOrder: order, tierGroupName: group,
  nextTierName: next, distanceToNextTier: distance, isBestTier: order === 1,
  ...(tiers ? { allTiers: tiers.map((t, i) => ({ tierName: t, tierColor: 'gray', tierOrder: i + 1, minValue: null, maxValue: null })) } : {}),
});
const CLUB_TIERS = ['Platinum', 'Gold', 'Silver', 'Bronze', 'Iron'];

function service(data: any) {
  return {
    generateTeamReport: async () => data,
    generateIndividualReport: async () => data,
    getMetricLabelsAndUnits: async () => ({ labels, units: { VERTICAL_JUMP: 'in', FLY10_TIME: 's', MILE_TIME: 's' } }),
  } as any;
}

const teamReport = { id: 'r1', name: 'Team Report', organizationId: 'o1', reportType: 'team', config: { timeframe: {}, metrics: [] } } as any;
const individualReport = { id: 'r2', name: 'Athlete Report', organizationId: 'o1', reportType: 'individual', config: { athleteId: 'a1', timeframe: {}, metrics: [] } } as any;

function teamData(overrides: Record<string, any> = {}) {
  const athlete = (userName: string, vj: number, meets: boolean, t: ReturnType<typeof tier>) => teamAthlete(userName, {
    VERTICAL_JUMP: [single(meets)], FLY10_TIME: [t],
  }, vj);
  return {
    teamStatistics: TEAM_STATS,
    // Ranked by composite (best first); the full roster, so athleteCount equals its length
    athleteRankings: [
      athlete('Alice Secret', 32, true, tier('Elite', 1, null, null)),
      athlete('Bob Hidden', 20, false, tier('Elite', 1, null, null)),
      athlete('Cara Private', 18, false, tier('Developing', 3, 'Advanced', 0.2)),
    ],
    athleteCount: 3,
    teamIds: ['t1'],
    metricLabels: labels,
    ...overrides,
  };
}

function teamAthlete(userName: string, benchmarkComparisons: Record<string, any[]>, vj = 25) {
  return {
    userId: userName, userName,
    measurements: { VERTICAL_JUMP: vj, FLY10_TIME: 1.4 },
    benchmarkComparisons,
  };
}

const TEAM_STATS = [
  { metric: 'VERTICAL_JUMP', average: 25, median: 24.5, min: 18, max: 32, standardDeviation: 3.25, units: 'in',
    topPerformer: { userId: 'x', userName: 'Secret Star', value: 32 } },
  { metric: 'FLY10_TIME', average: 1.4, median: 1.41, min: 1.2, max: 1.6, standardDeviation: 0.1, units: 's' },
];

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

  it('key facts are aggregate, no names; single benchmarks and tier groups ranked separately', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData()));
    expect(data.keyFacts).toEqual([
      'Strongest benchmark result: Vertical Jump, 33% of athletes meet Varsity (1/3)',
      'Best tier result: 10-Yard Fly, 67% of athletes above the bottom tier (Developing) of Speed Tiers (2/3)',
    ]);
  });

  it('data confidence states roster size, no history and benchmark coverage', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData()));
    expect(data.dataConfidence).toBe('3 athletes; no history over time in this report (best value per athlete); benchmarks for 2 of 2 metrics');
  });

  it('data confidence says history exists when team trends are present', async () => {
    const data = await buildReportDataForAI({ ...teamReport, config: { ...teamReport.config, charts: { trends: true } } }, 'u1', service(teamData({
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
      { metric: 'Vertical Jump', concern: 'Below Elite VJ benchmark (30.00 in); athlete 27.50 in' },
      { metric: '10-Yard Fly', concern: 'Developing tier of Speed Tiers; needs 0.12 s less to reach Advanced' },
    ]);
    // Tier midpoint is never presented as a threshold
    expect(JSON.stringify(data.concerns)).not.toContain('1.45');
  });

  it('benchmark summary is tier-aware', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', service(individualData()));
    expect(data.benchmarkComparisons).toEqual([
      { metric: 'Vertical Jump', performance: 'Meets 0/1 benchmarks' },
      { metric: '10-Yard Fly', performance: 'Developing tier of Speed Tiers; needs 0.12 s less to reach Advanced' },
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

    const withTrends = await buildReportDataForAI({ ...individualReport, config: { ...individualReport.config, charts: { trends: true } } }, 'u1', service(individualData({
      trends: { VERTICAL_JUMP: { series: [{ date: '2024-01-15', value: 24 }, { date: '2024-03-15', value: 27.5 }] } },
    })));
    expect(withTrends.dataConfidence).toBe('2 testing sessions; history over time for 1 metric; benchmarks for 2 of 2 metrics');
  });
});

describe('buildReportDataForAI — team benchmark aggregates', () => {
  const fly = (rows: any[][]) => service(teamData({
    athleteRankings: rows.map((r, i) => teamAthlete(`Athlete ${i}`, { FLY10_TIME: r })),
  }));

  it('a low top-tier share does not beat a single-benchmark miss for the gap', async () => {
    const fast = { ...single(true), benchmarkName: 'Fast' };
    const rows = [
      { VERTICAL_JUMP: [single(true)], FLY10_TIME: [fast, tier('Developing', 3, 'Advanced', 0.2)] },
      { VERTICAL_JUMP: [single(false)], FLY10_TIME: [fast, tier('Advanced', 2, 'Elite', 0.1)] },
      { VERTICAL_JUMP: [single(false)], FLY10_TIME: [fast, tier('Advanced', 2, 'Elite', 0.1)] },
    ];
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData({
      athleteRankings: rows.map((r, i) => teamAthlete(`Athlete ${i}`, r)),
    })));
    expect(data.keyFacts).toEqual([
      'Strongest benchmark result: 10-Yard Fly, 100% of athletes meet Fast (3/3)',
      'Biggest benchmark gap: Vertical Jump, 33% of athletes meet Varsity (1/3)',
      'Best tier result: 10-Yard Fly, 67% of athletes above the bottom tier (Developing) of Speed Tiers (2/3)',
    ]);
  });

  it('raises an aggregate concern when more than half sit in the bottom tier', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', fly([
      [tier('Elite', 1, null, null)],
      [tier('Developing', 3, 'Advanced', 0.2)],
      [tier('Developing', 3, 'Advanced', 0.3)],
    ]));
    expect(data.concerns).toEqual([
      { metric: '10-Yard Fly', concern: '67% of athletes in the bottom tier (Developing) of Speed Tiers (2/3)' },
    ]);
    for (const name of ['Athlete 0', 'Athlete 1', 'Athlete 2']) expect(buildPrompt(data)).not.toContain(name);
  });

  it('no bottom-tier concern at exactly half', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', fly([
      [tier('Elite', 1, null, null)],
      [tier('Developing', 3, 'Advanced', 0.2)],
    ]));
    expect(data.concerns).toEqual([]);
  });

  it('without allTiers: distribution only, no tier share or concern', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', fly([
      [tier('Developing', 3, 'Advanced', 0.2, 'Speed Tiers', null)],
      [tier('Developing', 3, 'Advanced', 0.2, 'Speed Tiers', null)],
    ]));
    expect(data.benchmarkComparisons).toEqual([{ metric: '10-Yard Fly', performance: 'Speed Tiers: Developing 2 (of 2 athletes)' }]);
    expect(data.concerns).toEqual([]);
    expect(data.keyFacts).toEqual([]);
    expect(JSON.stringify(data)).not.toContain('(top)');
  });

  it('an unmatched tier row shows as Unknown and is not counted in the bottom tier', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', fly([
      [tier('Developing', 3, 'Advanced', 0.2)],
      [tier(undefined, 9, null, null)],
    ]));
    expect(data.benchmarkComparisons).toEqual([
      { metric: '10-Yard Fly', performance: 'Speed Tiers: Developing 1, Unknown 1 (of 2 athletes)' },
    ]);
    expect(data.keyFacts).toEqual(['Best tier result: 10-Yard Fly, 50% of athletes above the bottom tier (Developing) of Speed Tiers (1/2)']);
  });

  it('several tier groups on one metric each get a distribution', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', fly([
      [tier('Elite', 1, null, null), tier('Gold', 2, 'Platinum', 0.1, 'Club Tiers', CLUB_TIERS)],
      [tier('Advanced', 2, 'Elite', 0.1), tier('Iron', 5, 'Bronze', 0.3, 'Club Tiers', CLUB_TIERS)],
    ]));
    expect(data.benchmarkComparisons).toEqual([
      { metric: '10-Yard Fly', performance: 'Speed Tiers: Elite 1, Advanced 1 (of 2 athletes)' },
      { metric: '10-Yard Fly', performance: 'Club Tiers: Gold 1, Iron 1 (of 2 athletes)' },
    ]);
  });

  it('no benchmarks and no athletes: no facts, no concerns, honest confidence line', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData({ athleteRankings: [], athleteCount: 0 })));
    expect(data.concerns).toEqual([]);
    expect(data.benchmarkComparisons).toEqual([]);
    expect(data.keyFacts).toEqual([]);
    expect(data.dataConfidence).toBe('0 athletes; no history over time in this report (best value per athlete); no benchmarks');
  });
});

describe('buildReportDataForAI — individual tier position and formatting', () => {
  const withRows = (benchmarkComparisons: Record<string, any[]>, extra: Record<string, any> = {}) => {
    const d = individualData();
    return service({ ...d, athlete: { ...d.athlete, benchmarkComparisons, ...extra } });
  };

  it('a tier in the upper half of its group is a next step, not a concern', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', withRows({ FLY10_TIME: [tier('Advanced', 2, 'Elite', 0.05)] }));
    expect(data.concerns).toEqual([]);
    expect(data.benchmarkComparisons).toEqual([
      { metric: '10-Yard Fly', performance: 'Advanced tier of Speed Tiers; needs 0.05 s less to reach Elite' },
    ]);
  });

  it('several tier groups on one metric: only the lower-half row is a concern', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', withRows({
      FLY10_TIME: [tier('Advanced', 2, 'Elite', 0.05), tier('Bronze', 4, 'Silver', 0.1, 'Club Tiers', CLUB_TIERS)],
    }));
    expect(data.concerns).toEqual([
      { metric: '10-Yard Fly', concern: 'Bronze tier of Club Tiers; needs 0.10 s less to reach Silver' },
    ]);
    expect(data.benchmarkComparisons).toHaveLength(2);
  });

  it("tier gap compares position within each row's own group, not raw tierOrder", async () => {
    // Silver is 3rd of 5 Club tiers (middle); Developing is 3rd of 3 Speed tiers (bottom). Same tierOrder.
    const data = await buildReportDataForAI(individualReport, 'u1', withRows({
      VERTICAL_JUMP: [tier('Developing', 3, 'Advanced', 1.5)],
      FLY10_TIME: [tier('Silver', 3, 'Gold', 0.1, 'Club Tiers', CLUB_TIERS)],
    }, { percentiles: {}, teamAverages: {} }));
    expect(data.keyFacts).toEqual([
      'Strongest metric: 10-Yard Fly, Silver tier of Club Tiers',
      'Biggest gap: Vertical Jump, Developing tier of Speed Tiers; needs 1.50 in more to reach Advanced',
    ]);
  });

  it('falls back to the percentile gap when the tier gap is on the strongest metric', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', withRows({ VERTICAL_JUMP: [tier('Developing', 3, 'Advanced', 1.5)] }));
    expect(data.keyFacts).toEqual([
      'Strongest metric: Vertical Jump, 85th percentile vs Varsity Boys',
      'Biggest gap: 10-Yard Fly, 30th percentile vs Varsity Boys',
    ]);
  });

  it('no double spaces when the unit is empty', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', withRows({
      RSI: [{ ...single(false), benchmarkName: 'RSI Goal', benchmarkValue: 2 }, tier('Developing', 3, 'Advanced', 0.3, 'RSI Tiers')],
    }, { measurements: { RSI: 1.8 }, percentiles: {}, teamAverages: {} }));
    expect(data.concerns).toEqual([
      { metric: 'RSI', concern: 'Below RSI Goal benchmark (2.00); athlete 1.80' },
      { metric: 'RSI', concern: 'Developing tier of RSI Tiers; needs 0.30 more to reach Advanced' },
    ]);
    expect(buildPrompt(data)).not.toMatch(/ {2}\S/);
  });

  it('a duration metric stays in seconds throughout (no mixed mm:ss)', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', withRows({
      MILE_TIME: [{ ...single(false), benchmarkName: 'Mile Standard', benchmarkValue: 360 }],
    }, { measurements: { MILE_TIME: 365.2 }, percentiles: {}, teamAverages: {} }));
    expect(data.concerns).toEqual([{ metric: 'Mile', concern: 'Below Mile Standard benchmark (360.00 s); athlete 365.20 s' }]);
    const prompt = buildPrompt(data);
    expect(prompt).toContain('- Mile: 365.20 s (lower is better)');
    expect(prompt).not.toMatch(/\d:\d\d/);
  });

  it('no measurements: the confidence line does not claim best values', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', withRows({}, { measurements: {} }));
    expect(data.metrics).toEqual([]);
    expect(data.dataConfidence).toBe('No measurements in this report; no history over time in this report; no benchmarks');
  });
});

describe('buildReportDataForAI — trends', () => {
  const trendsOn = (r: any) => ({ ...r, config: { ...r.config, charts: { trends: true } } });
  // Lower-is-better FLY10 went 1.60 -> 1.52 (5% better); higher-is-better VJ went 28 -> 27.5 (1.8% worse)
  const trends = {
    FLY10_TIME: { series: [{ date: '2024-01-15', value: 1.6 }, { date: '2024-03-15', value: 1.52 }], direction: 'lower', delta: { from: 1.6, to: 1.52, pct: 5 } },
    VERTICAL_JUMP: { series: [{ date: '2024-01-15', value: 28 }, { date: '2024-03-15', value: 27.5 }], direction: 'higher', delta: { from: 28, to: 27.5, pct: -1.7857 } },
  };

  it('individual: improvements and declines come from trend deltas, direction already applied', async () => {
    const data = await buildReportDataForAI(trendsOn(individualReport), 'u1', service(individualData({ trends })));
    expect(data.improvements).toEqual([{ metric: '10-Yard Fly', improvement: 'improved 5.0% (from 1.60 s to 1.52 s)' }]);
    expect(data.concerns).toContainEqual({ metric: 'Vertical Jump', concern: 'declined 1.8% (from 28.00 in to 27.50 in)' });
    expect(data.keyFacts).toContain('Biggest change: 10-Yard Fly, improved 5.0% (from 1.60 s to 1.52 s)');
  });

  it('individual: trends present but the trends chart is off, so the prompt shows no change and no history', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', service(individualData({ trends })));
    expect(data.improvements).toEqual([]);
    expect(JSON.stringify(data)).not.toContain('declined');
    expect(data.keyFacts!.join()).not.toContain('Biggest change');
    expect(data.dataConfidence).toContain('no history over time');
  });

  it('individual: legacy showTrends turns trends on', async () => {
    const legacy = { ...individualReport, config: { ...individualReport.config, showTrends: true } };
    const data = await buildReportDataForAI(legacy, 'u1', service(individualData({ trends })));
    expect(data.improvements).toHaveLength(1);
  });

  it('team: change comes from the team-average delta only, never athlete series', async () => {
    const teamTrends = {
      VERTICAL_JUMP: {
        teamSeries: [{ date: '2024-01-01', value: 24 }, { date: '2024-02-01', value: 25.2 }],
        athleteSeries: [{ athleteId: 'x', athleteName: 'Hidden Athlete', series: [{ date: '2024-01-01', value: 40 }] }],
        direction: 'higher', delta: { from: 24, to: 25.2, pct: 5 },
      },
    };
    const data = await buildReportDataForAI(trendsOn(teamReport), 'u1', service(teamData({ teamTrends })));
    expect(data.improvements).toEqual([{ metric: 'Vertical Jump', improvement: 'team average improved 5.0% (from 24.00 in to 25.20 in)' }]);
    expect(data.keyFacts).toContain('Biggest change: Vertical Jump, team average improved 5.0% (from 24.00 in to 25.20 in)');
    expect(data.dataConfidence).toContain('history over time for 1 metric');
    const prompt = buildPrompt(data);
    expect(prompt).not.toContain('Hidden Athlete');
    expect(prompt).not.toContain('40.00');
  });

  it('team: legacy report (no charts) shows no team trend', async () => {
    const teamTrends = { VERTICAL_JUMP: { teamSeries: [{ date: '2024-01-01', value: 24 }, { date: '2024-02-01', value: 25.2 }], athleteSeries: [], direction: 'higher', delta: { from: 24, to: 25.2, pct: 5 } } };
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData({ teamTrends })));
    expect(data.improvements).toEqual([]);
    expect(data.dataConfidence).toContain('no history over time');
  });
});

describe('buildReportDataForAI — event context', () => {
  // Calendar date stored as UTC midnight: must print as Mar 1, not Feb 29, west of UTC
  const eventContext = { eventId: 'e1', eventName: 'Spring Combine', eventDate: new Date('2024-03-01T00:00:00Z'), participantCount: 12 };

  it.each([['individual', individualReport, individualData], ['team', teamReport, teamData]] as const)(
    '%s: event name and UTC calendar date reach the prompt', async (_t, report, build) => {
      const data = await buildReportDataForAI(report, 'u1', service(build({ eventContext })));
      expect(data.eventName).toBe('Spring Combine');
      expect(data.eventDate).toBe('3/1/2024');
      expect(buildPrompt(data)).toContain('- Event: Spring Combine (3/1/2024)');
    });

  it('no event: no event line', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', service(individualData()));
    expect(buildPrompt(data)).not.toContain('- Event:');
  });
});
