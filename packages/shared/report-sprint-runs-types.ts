// packages/shared/report-sprint-runs-types.ts

/**
 * One device-imported dash row as the sprint runs display needs it. Reports freeze this payload verbatim into
 * public snapshots, so it carries only what grouping needs: no import file names, coach ids or free-text notes.
 * A full `Measurement` row is assignable to it, so the athlete dashboard uses the same type.
 */
export interface SprintRunMeasurement {
  metric: string;
  value: string;
  date: string;
  isVerified: boolean;
  organizationId: string | null;
  importBatchId: string | null;
  /** Only the "Split from DASH_xx" marker survives in reports; any other note is dropped */
  notes: string | null;
  calculationMetadata: { formula?: string; parentMetric?: string; runId?: string } | null;
}
