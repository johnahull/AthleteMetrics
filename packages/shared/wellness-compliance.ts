/**
 * Day-based compliance for standing (anytime) wellness requests (AM-FEAT-027).
 *
 * A day counts when the athlete has at least one live entry dated that UTC day. The window is the last
 * `windowDays` COMPLETE UTC days, ending yesterday: athletes send their local date, so west of UTC they cannot
 * have reached "today" yet. Entries dated today or later are ignored. The window is clipped to the request's
 * creation day so a new request is not scored against days before it existed (0 possible days if created today).
 */

export interface DayCompliance {
  /** min(windowDays, UTC days from the created date through yesterday, inclusive); 0 if created today */
  possibleDays: number;
  /** Sum of every targeted athlete's distinct entry days */
  entryDays: number;
  /** Targeted athletes x possibleDays */
  totalPossibleDays: number;
  percentage: number;
  perAthlete: { userId: string; entryDays: number }[];
}

/** GET .../completion-rate: one-time requests return only the first three fields. */
export interface RequestCompletionRate {
  completed: number;
  total: number;
  percentage: number;
  standing?: true;
  windows?: { last7: DayCompliance; last28: DayCompliance };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export function computeDayCompliance(input: {
  createdAt: Date;
  now: Date;
  windowDays: number;
  targetUserIds: string[];
  entries: { userId: string; date: string }[];
}): DayCompliance {
  const today = utcDay(input.now);
  const created = utcDay(input.createdAt);
  const completeDaysSinceCreated = Math.round((Date.parse(today) - Date.parse(created)) / DAY_MS);
  const possibleDays = Math.max(0, Math.min(input.windowDays, completeDaysSinceCreated));
  const firstDay = utcDay(new Date(Date.parse(today) - possibleDays * DAY_MS));

  const datesByUser = new Map(input.targetUserIds.map(id => [id, new Set<string>()]));
  for (const { userId, date } of input.entries) {
    if (date >= firstDay && date < today) datesByUser.get(userId)?.add(date);
  }

  const perAthlete = [...datesByUser].map(([userId, dates]) => ({ userId, entryDays: dates.size }));
  const entryDays = perAthlete.reduce((sum, a) => sum + a.entryDays, 0);
  const totalPossibleDays = perAthlete.length * possibleDays;

  return {
    possibleDays,
    entryDays,
    totalPossibleDays,
    percentage: totalPossibleDays > 0 ? Math.round((entryDays / totalPossibleDays) * 100) : 0,
    perAthlete,
  };
}
