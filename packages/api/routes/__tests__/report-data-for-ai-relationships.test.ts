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

const service = (data: any) => ({
  generateIndividualReport: async () => data,
  getMetricLabelsAndUnits: async () => ({ labels: {}, units: { JUMP_CMJ_HOH: 'in', JUMP_SJ_HEIGHT: 'in' } }),
}) as any;

const gate = (metric: string, value: number, runId?: string) => ({
  metric, value: String(value), date: '2026-02-01', isVerified: true, organizationId: 'o1', importBatchId: null, notes: null,
  calculationMetadata: runId ? { formula: 'direct_import_split', runId } : null,
});
const run = (runId: string, t: number[]) => [10, 20, 30, 40].map((d, i) => gate(`DASH_${d}YD`, t[i], runId));

const athlete = (measurements: Record<string, number>) => ({
  userId: 'a1', userName: 'Casey Moore', measurements, percentiles: {}, teamAverages: {}, benchmarkComparisons: {},
});

describe('buildReportDataForAI: relationships and split facts', () => {
  it('fires the dip relationship from the full measurements even when MAX_METRICS drops its inputs', async () => {
    // 20 filler metrics first, so the three inputs sit past the cut
    const filler = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`FILL_${i}`, 1]));
    const data = await buildReportDataForAI(report, 'u1', service({
      athlete: athlete({ ...filler, POWER_EUR: 1.01, JUMP_CMJ_HOH: 19.1, JUMP_SJ_HEIGHT: 18.9 }),
      metricLabels: {},
    }));
    expect(data.metrics.some((m) => m.code === 'POWER_EUR')).toBe(false);
    expect(data.connections).toEqual([expect.stringContaining('not gaining from the dip')]);
  });

  it('builds split facts and the speed-shape connection from one run', async () => {
    const data = await buildReportDataForAI(report, 'u1', service({
      athlete: athlete({ DASH_40YD: 5.26 }),
      metricLabels: {},
      sprintRunMeasurements: run('a', [1.74, 3.01, 4.14, 5.26]),
    }));
    expect(data.splitFacts?.[1]).toBe('Fastest 10 yards of that run: 1.12 s (yards 30-40), about 18.3 mph');
    expect(data.connections?.join(' ')).toContain('Speed stopped rising after about 20 yards');
  });

  it('never builds splits from best-per-code values or from gates of different runs', async () => {
    const mixed = [gate('DASH_10YD', 1.7, 'a'), gate('DASH_20YD', 3.0, 'a'), gate('DASH_30YD', 4.1, 'b'), gate('DASH_40YD', 5.2, 'b')];
    const data = await buildReportDataForAI(report, 'u1', service({
      athlete: athlete({ DASH_10YD: 1.7, DASH_20YD: 3.0, DASH_30YD: 4.1, DASH_40YD: 5.2 }),
      metricLabels: {},
      sprintRunMeasurements: mixed,
    }));
    expect(data.splitFacts).toBeUndefined();
    expect(data.connections).toBeUndefined();
  });

  it('is silent when the sprint runs are not in the report', async () => {
    const data = await buildReportDataForAI(report, 'u1', service({ athlete: athlete({ DASH_40YD: 5.26 }), metricLabels: {} }));
    expect(data.splitFacts).toBeUndefined();
    expect(data.connections).toBeUndefined();
  });

  it('asks for units only when both jump codes are present, and survives a failed lookup', async () => {
    let calls = 0;
    const svc = (data: any, fail = false) => ({
      generateIndividualReport: async () => data,
      getMetricLabelsAndUnits: async (codes: string[]) => {
        if (codes.includes('JUMP_CMJ_HOH') && codes.length === 2) {
          calls++;
          if (fail) throw new Error('db down');
        }
        return { labels: {}, units: { JUMP_CMJ_HOH: 'in', JUMP_SJ_HEIGHT: 'in' } };
      },
    }) as any;
    await buildReportDataForAI(report, 'u1', svc({ athlete: athlete({ DASH_40YD: 5.26 }), metricLabels: {} }));
    expect(calls).toBe(0);
    const both = { athlete: athlete({ POWER_EUR: 1.01, JUMP_CMJ_HOH: 19.1, JUMP_SJ_HEIGHT: 18.9 }), metricLabels: {} };
    expect((await buildReportDataForAI(report, 'u1', svc(both))).connections).toHaveLength(1);
    const failed = await buildReportDataForAI(report, 'u1', svc(both, true));
    expect(failed.connections).toBeUndefined();
    expect(calls).toBe(2);
  });

  it('a dip relationship from best values of different days stays silent', async () => {
    const data = await buildReportDataForAI(report, 'u1', service({ athlete: athlete({ POWER_EUR: 1.01, JUMP_CMJ_HOH: 19.1, JUMP_SJ_HEIGHT: 17 }), metricLabels: {} }));
    expect(data.connections).toBeUndefined();
  });
});
