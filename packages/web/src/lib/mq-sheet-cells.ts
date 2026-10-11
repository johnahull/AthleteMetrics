/**
 * Movement Quality scores loaded from a recording sheet (pure). They are cells in the import model
 * (ImportableCell), kept per athlete apart from the numeric grid, and saved one athlete at a time
 * through PUT /api/events/:id/athletes/:userId/movement-quality with scores only (no notes or clip,
 * so the saved ones stay).
 */
import type { Measurement } from "@shared/schema";
import type { ImportableCell } from "@/lib/recording-sheet-import";

export interface MqCell extends ImportableCell {
  userId: string;
  metricCode: string;
}

export type MqGrid = Record<string, { measurements: Record<string, MqCell> }>;

/**
 * One cell per athlete and sheet Movement Quality code, from the saved scores. Rows come newest first;
 * the first row is the one the server's upsert edits (legacy duplicates are older). Unsaved file values
 * and pending conflicts of `prev` are kept, the same rule as the numeric grid on a refetch.
 */
export function buildMqCells(prev: MqGrid, saved: Measurement[], athleteIds: string[], codes: string[]): MqGrid {
  const wanted = new Set(codes);
  const savedValue = new Map<string, number>();
  for (const m of saved) {
    const key = `${m.userId}-${m.metric}`;
    if (!wanted.has(m.metric) || m.value == null || savedValue.has(key)) continue;
    savedValue.set(key, Number(m.value));
  }

  const grid: MqGrid = {};
  for (const userId of athleteIds) {
    const measurements: Record<string, MqCell> = {};
    for (const metricCode of codes) {
      const originalValue = savedValue.get(`${userId}-${metricCode}`);
      const cell: MqCell = { userId, metricCode, value: originalValue?.toString() ?? "", originalValue, isDirty: false };
      const previous = prev[userId]?.measurements[metricCode];
      if (previous?.isDirty) {
        measurements[metricCode] = {
          ...cell,
          value: previous.value,
          error: previous.error,
          // Numeric, like the grid: "2.0" from a file and a saved 2 are the same score
          isDirty: previous.value === "" ? originalValue !== undefined : Number(previous.value) !== originalValue,
          fromImport: previous.fromImport,
        };
      } else if (previous?.importedValue !== undefined) {
        measurements[metricCode] = { ...cell, importedValue: previous.importedValue };
      } else {
        measurements[metricCode] = cell;
      }
    }
    grid[userId] = { measurements };
  }
  return grid;
}

export const isSendableMqCell = (cell: MqCell) => cell.isDirty && cell.value !== "" && !isNaN(Number(cell.value));

/** One save request per athlete with unsaved scores: upserts are { metric, value } only */
export function mqSaveRequests(grid: MqGrid): Array<{ userId: string; upserts: Array<{ metric: string; value: number }>; cells: MqCell[] }> {
  return Object.entries(grid).flatMap(([userId, row]) => {
    const cells = Object.values(row.measurements).filter(isSendableMqCell);
    return cells.length > 0 ? [{ userId, upserts: cells.map((c) => ({ metric: c.metricCode, value: Number(c.value) })), cells }] : [];
  });
}

/**
 * How a failed athlete save affects the rest: per-score errors and other 400s (e.g. the athlete is not
 * a member) stay on that athlete; a rate limit, access error, server error, network error or a frozen
 * event stops the loop, since the next athlete would fail the same way.
 */
export function mqSaveFailure(error: unknown): { stop: boolean; message: string; errors?: Record<string, string> } {
  const e = (error ?? {}) as { message?: string; status?: number; errors?: Array<{ metric: string; error: string }> };
  const message = e.message || "Failed to save Movement Quality scores";
  if (Array.isArray(e.errors)) {
    return { stop: false, message, errors: Object.fromEntries(e.errors.map((x) => [x.metric, x.error])) };
  }
  if (e.status === 400 && !/frozen/i.test(message)) return { stop: false, message };
  return { stop: true, message };
}
