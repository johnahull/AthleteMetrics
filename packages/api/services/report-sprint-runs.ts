// packages/api/services/report-sprint-runs.ts
import type { Measurement } from '@shared/schema';
import type { SprintRunMeasurement } from '@shared/report-sprint-runs-types';

// The marker the oldest device imports left in notes (see groupSprintRuns); the rest of the note holds the file name
const SPLIT_NOTE = /^Split from DASH_\d+(?:YD|M)\b/;

/**
 * Slim a stored dash row to what the sprint runs display needs. The result is frozen verbatim into public report
 * snapshots, so import file names, the coach's user id and free-text notes are dropped here.
 */
export function toReportSprintRunRow(
  row: Pick<Measurement, 'metric' | 'value' | 'date' | 'isVerified' | 'organizationId' | 'importBatchId' | 'notes' | 'calculationMetadata'>,
): SprintRunMeasurement {
  const meta = row.calculationMetadata;
  return {
    metric: row.metric,
    value: row.value,
    date: row.date,
    isVerified: row.isVerified,
    organizationId: row.organizationId,
    importBatchId: row.importBatchId,
    notes: row.notes ? (SPLIT_NOTE.exec(row.notes)?.[0] ?? null) : null,
    calculationMetadata: meta
      ? { formula: meta.formula, parentMetric: meta.parentMetric, runId: meta.runId }
      : null,
  };
}
