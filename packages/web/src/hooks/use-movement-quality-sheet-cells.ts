import { useCallback, useEffect, useRef, useState } from "react";
import type { Measurement } from "@shared/schema";
import { buildMqCells, mqSaveFailure, mqSaveRequests, type MqCell, type MqGrid } from "@/lib/mq-sheet-cells";

export interface MqSaveOutcome {
  /** Athletes with unsaved scores */
  athletes: number;
  saved: number;
  /** Athletes whose request was refused (their cells show why) */
  failed: number;
  /** Set when a request failed in a way the next ones would too; the rest were not sent */
  stopped?: { message: string; rateLimited: boolean };
}

/**
 * Movement Quality scores from an uploaded recording sheet, per athlete of the grid: rebuilt from the
 * saved measurements on every refetch (unsaved file values and conflicts are kept), and saved one athlete
 * at a time with save(send).
 */
export function useMovementQualitySheetCells(saved: Measurement[] | undefined, athleteIds: string[], codes: string[]) {
  const [mqGrid, setMqGrid] = useState<MqGrid>({});
  // The grid as last rendered, for an upload applied after its (async) read
  const mqGridRef = useRef(mqGrid);
  mqGridRef.current = mqGrid;

  useEffect(() => {
    setMqGrid((prev) => buildMqCells(prev, saved ?? [], athleteIds, codes));
  }, [saved, athleteIds, codes]);

  const update = useCallback(
    (fn: (cell: MqCell) => MqCell, userId?: string, metricCode?: string) =>
      setMqGrid((prev) => {
        const next = { ...prev };
        Object.entries(prev).forEach(([id, row]) => {
          if (userId && id !== userId) return;
          const measurements = { ...row.measurements };
          Object.entries(measurements).forEach(([code, cell]) => {
            if (!metricCode || code === metricCode) measurements[code] = fn(cell);
          });
          next[id] = { measurements };
        });
        return next;
      }),
    []
  );

  /** Patch the cells that were sent, leaving any changed meanwhile (other value) alone */
  const patchSent = useCallback((cells: MqCell[], patch: (sent: MqCell) => Partial<MqCell>) =>
    setMqGrid((prev) => {
      const next = { ...prev };
      cells.forEach((sent) => {
        const current = next[sent.userId]?.measurements[sent.metricCode];
        if (!current || current.value !== sent.value) return;
        next[sent.userId] = { measurements: { ...next[sent.userId].measurements, [sent.metricCode]: { ...current, ...patch(sent) } } };
      });
      return next;
    }), []);

  const save = useCallback(async (send: (userId: string, upserts: Array<{ metric: string; value: number }>) => Promise<unknown>): Promise<MqSaveOutcome> => {
    const requests = mqSaveRequests(mqGridRef.current);
    const outcome: MqSaveOutcome = { athletes: requests.length, saved: 0, failed: 0 };
    for (const { userId, upserts, cells } of requests) {
      patchSent(cells, () => ({ error: undefined }));
      try {
        await send(userId, upserts);
        patchSent(cells, (sent) => ({ originalValue: Number(sent.value), isDirty: false, error: undefined }));
        outcome.saved++;
      } catch (error) {
        const failure = mqSaveFailure(error);
        if (failure.stop) {
          outcome.stopped = { message: failure.message, rateLimited: (error as { status?: number })?.status === 429 };
          break;
        }
        // The athlete's request was rolled back as a whole; its cells stay unsaved
        outcome.failed++;
        patchSent(cells, (sent) => ({ error: failure.errors ? failure.errors[sent.metricCode] : failure.message }));
      }
    }
    return outcome;
  }, [patchSent]);

  return { mqGrid, mqGridRef, setMqGrid, update, save };
}
