export interface EventRef {
  id: string;
  /** Event calendar date, YYYY-MM-DD */
  date: string;
  userId: string;
  organizationId: string;
}

/** The latest event strictly before `current` for the same athlete and organization. */
export function selectPriorEvent(current: EventRef, events: readonly EventRef[]): EventRef | null {
  let prior: EventRef | null = null;
  for (const e of events) {
    if (e.id === current.id || e.userId !== current.userId || e.organizationId !== current.organizationId) continue;
    if (e.date >= current.date) continue;
    if (prior === null || e.date > prior.date) prior = e;
  }
  return prior;
}

export interface RetestSide {
  code: string;
  unit: string;
  value: number;
}

export interface RetestTrend {
  change: number;
  direction: "improved" | "declined" | "unchanged";
}

/** Change since the prior event; null (skip) unless both events used the same metric code and unit. */
export function retestTrend(current: RetestSide, prior: RetestSide | null, lowerIsBetter: boolean): RetestTrend | null {
  if (prior === null || current.code !== prior.code || current.unit !== prior.unit) return null;
  const change = Math.round((current.value - prior.value) * 10000) / 10000;
  if (change === 0) return { change, direction: "unchanged" };
  const improved = lowerIsBetter ? change < 0 : change > 0;
  return { change, direction: improved ? "improved" : "declined" };
}
