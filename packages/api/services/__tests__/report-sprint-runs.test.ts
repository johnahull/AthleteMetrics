import { describe, it, expect } from 'vitest';
import { toReportSprintRunRow } from '../report-sprint-runs';

const row = {
  metric: 'DASH_10YD',
  value: '1.800',
  date: '2026-03-01',
  isVerified: true,
  organizationId: 'org-1',
  importBatchId: 'batch-1',
  notes: 'Split from DASH_30YD — imported from private-team-file.csv',
  calculationMetadata: {
    formula: 'direct_import_split',
    sourceValues: { a: 1 },
    calculatedAt: '2026-03-01T00:00:00Z',
    parentMetric: 'DASH_30YD',
    runId: 'run-1',
    triggeredBy: { event: 'bulk_import' as const, userId: 'coach-secret-id' },
  },
};

describe('toReportSprintRunRow', () => {
  it('keeps the fields run grouping reads', () => {
    expect(toReportSprintRunRow(row)).toEqual({
      metric: 'DASH_10YD',
      value: '1.800',
      date: '2026-03-01',
      isVerified: true,
      organizationId: 'org-1',
      importBatchId: 'batch-1',
      notes: 'Split from DASH_30YD',
      calculationMetadata: { formula: 'direct_import_split', parentMetric: 'DASH_30YD', runId: 'run-1' },
    });
  });

  it('drops file names, coach ids and free-text notes', () => {
    const json = JSON.stringify(toReportSprintRunRow(row));
    expect(json).not.toContain('private-team-file');
    expect(json).not.toContain('coach-secret-id');
    expect(json).not.toContain('triggeredBy');
    expect(json).not.toContain('sourceValues');
  });

  it('drops a free-text note that is not a split marker', () => {
    expect(toReportSprintRunRow({ ...row, notes: 'felt a tweak in hamstring' }).notes).toBeNull();
    expect(toReportSprintRunRow({ ...row, notes: null }).notes).toBeNull();
  });

  it('maps missing metadata to null', () => {
    expect(toReportSprintRunRow({ ...row, calculationMetadata: null }).calculationMetadata).toBeNull();
  });
});
