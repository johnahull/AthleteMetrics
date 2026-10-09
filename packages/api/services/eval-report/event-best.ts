/**
 * Best value per metric for ONE athlete in ONE event (AM-FEAT-019 Part 1). The caller passes the event's
 * rows; rows from any other event, athlete or organization are ignored, so a retest never shows an earlier
 * event's better value and a group event never mixes athletes.
 * The report date is the event's calendar date: callers pass eventCalendarDate(event), not today.
 */
export interface EventMeasurementRow {
  eventId: string | null;
  userId: string;
  organizationId: string | null;
  metric: string;
  value: string | number;
}

export function eventBests(
  scope: { eventId: string; userId: string; organizationId: string },
  rows: readonly EventMeasurementRow[],
  isLowerBetter: (metric: string) => boolean,
): Map<string, number> {
  const bests = new Map<string, number>();
  for (const row of rows) {
    if (row.eventId !== scope.eventId || row.userId !== scope.userId || row.organizationId !== scope.organizationId) continue;
    const value = typeof row.value === "number" ? row.value : parseFloat(row.value);
    if (!Number.isFinite(value)) continue;
    const current = bests.get(row.metric);
    const better = current === undefined || (isLowerBetter(row.metric) ? value < current : value > current);
    if (better) bests.set(row.metric, value);
  }
  return bests;
}
