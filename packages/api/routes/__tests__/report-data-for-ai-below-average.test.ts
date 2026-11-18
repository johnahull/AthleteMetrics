import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', () => {
  const row = { name: 'Lions', sport: 'Football', aiPromptContext: null };
  const chain: any = new Proxy({}, {
    get: (_t, prop) => (prop === 'then' ? (resolve: any) => resolve([row]) : () => chain),
  });
  return { db: chain };
});
vi.mock('../../utils/metric-type', () => ({
  getMetricTypes: async (codes: string[]) => Object.fromEntries(codes.map((c) => [c, 'lower_is_better'])),
}));

import { buildReportDataForAI } from '../report-routes';

const report = { id: 'r', name: 'R', organizationId: 'o1', reportType: 'individual', config: { athleteId: 'a1', timeframe: {}, metrics: [] } } as any;
const service = (data: any) => ({ generateIndividualReport: async () => data, getMetricLabelsAndUnits: async () => ({ labels: {}, units: { DASH_40YD: 's', AGILITY_5105: 's' } }) }) as any;

const tier = (tierName: string) => ({
  benchmarkName: 'HS Boys', benchmarkValue: 5, athleteValue: 0, meetsOrExceeds: false, percentageDiff: 0, comparisonOperator: 'range',
  tierName, tierOrder: 1, tierGroupName: 'HS Boys Tiers', nextTierName: null, distanceToNextTier: null, isBestTier: false,
  allTiers: ['Good', 'Average'].map((t, i) => ({ tierName: t, tierColor: 'gray', tierOrder: i + 1, minValue: null, maxValue: null })),
});

describe('buildReportDataForAI: below-average results', () => {
  it('ranks the bottom tier as below average even when it is labelled Average; a better tier is not listed', async () => {
    const data = await buildReportDataForAI(report, 'u1', service({
      athlete: {
        userId: 'a1', userName: 'Casey Moore', measurements: { DASH_40YD: 5.26, AGILITY_5105: 4.5 },
        percentiles: {}, teamAverages: {}, benchmarkComparisons: { DASH_40YD: [tier('Average')], AGILITY_5105: [tier('Good')] },
      },
      metricLabels: { DASH_40YD: '40-Yard Dash', AGILITY_5105: '5-10-5 Agility' },
    }));
    expect(data.belowAverage).toEqual([{ code: 'DASH_40YD', label: '40-Yard Dash', wording: 'at the bottom of the range for the comparison group' }]);
  });

  it('team reports carry none', async () => {
    const team = { ...report, reportType: 'team', config: { timeframe: {}, metrics: [] } };
    const data = await buildReportDataForAI(team, 'u1', { generateTeamReport: async () => ({ teamStatistics: [], athleteRankings: [], athleteCount: 0, metricLabels: {} }) } as any);
    expect(data.belowAverage).toBeUndefined();
  });
});
