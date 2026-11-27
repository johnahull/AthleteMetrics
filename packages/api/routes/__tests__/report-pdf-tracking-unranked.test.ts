import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportService } from '../../services/report-service';

// No DB: every metric reads as higher is better
vi.mock('../../utils/metric-type', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/metric-type')>()),
  isLowerBetter: vi.fn(async () => false),
}));

import { generatePDF } from '../report-routes';

// The served data is already ordered and stripped (orderForResponse); these tests only check layout
beforeEach(() => {
  vi.spyOn(ReportService.prototype, 'orderForResponse').mockImplementation(async (d: any) => d);
});

type Doc = Awaited<ReturnType<typeof generatePDF>>;

function allText(doc: Doc): string[] {
  const out: string[] = [];
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    const ops = ((doc as any).internal.pages[p] as string[]).join('\n');
    out.push(...[...ops.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, '$1')));
  }
  return out;
}

const athlete = (userName: string, value: number) => ({
  userId: userName, userName, measurements: { BODY_WEIGHT: value }, percentiles: {}, benchmarkComparisons: {},
});

const team = (unrankedMetrics: string[] | undefined) => ({
  reportType: 'team',
  reportConfig: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['BODY_WEIGHT'] },
  generatedAt: '2026-11-01T02:30:00.000Z',
  athleteCount: 3,
  teamStatistics: [{ metric: 'BODY_WEIGHT', average: 176.67, median: 180, min: 150, max: 200, units: 'lbs' }],
  athleteRankings: [athlete('Bob', 180), athlete('Cy', 200), athlete('Ann', 150)],
  metricLabels: { BODY_WEIGHT: 'Body Weight' },
  metricUnits: { BODY_WEIGHT: 'lbs' },
  unrankedMetrics,
});

const report = { name: 'R', organizationId: 'org-1' };

describe('team PDF: a tracking metric is listed, not ranked', () => {
  it('"Individual Performance by Metric" has no Rank or Percentile column and lists athletes by name', async () => {
    const text = allText(await generatePDF(report, team(['BODY_WEIGHT'])));
    expect(text).not.toContain('Rank');
    expect(text).not.toContain('Percentile');
    expect(text).toContain('Benchmarks Met');
    const names = text.filter((t) => ['Ann', 'Bob', 'Cy'].includes(t));
    expect(names).toEqual(['Ann', 'Bob', 'Cy']);
  });

  it('the Performance Snapshot shows a dash for its top performer', async () => {
    const text = allText(await generatePDF(report, team(['BODY_WEIGHT'])));
    const snapshotRow = text.slice(text.indexOf('Top Performer'));
    expect(snapshotRow.slice(0, 8)).toContain('-');
    expect(snapshotRow.slice(0, 8)).not.toContain('N/A');
  });

  it('a ranked metric keeps its Rank and Percentile columns (data without the field)', async () => {
    const text = allText(await generatePDF(report, team(undefined)));
    expect(text).toContain('Rank');
    expect(text).toContain('Percentile');
    expect(text.filter((t) => ['Ann', 'Bob', 'Cy'].includes(t))).toEqual(['Cy', 'Bob', 'Ann']); // by value: 200, 180, 150
  });
});
