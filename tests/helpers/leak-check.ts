/**
 * Pure helpers for the integration-run leak check (issue #539, tests/setup/leak-check-global.ts).
 *
 * A snapshot records the ids of the rows tests tend to leave behind. Comparing ids (not counts) means rows
 * that existed before the run, and rows a test legitimately deletes, can never produce a false alarm: only
 * a row that exists after the run and did not exist before it is a leak.
 */
export type LeakTable = 'organizations' | 'users' | 'teams' | 'measurements';

export type Snapshot = Record<LeakTable, Map<string, string>>; // id -> human readable label

export const LEAK_TABLES: LeakTable[] = ['organizations', 'users', 'teams', 'measurements'];

export const emptySnapshot = (): Snapshot => ({
  organizations: new Map(),
  users: new Map(),
  teams: new Map(),
  measurements: new Map(),
});

export function diffSnapshots(before: Snapshot, after: Snapshot): Record<LeakTable, string[]> {
  const leaks = { organizations: [], users: [], teams: [], measurements: [] } as Record<LeakTable, string[]>;
  for (const table of LEAK_TABLES) {
    for (const [id, label] of after[table]) {
      if (!before[table].has(id)) leaks[table].push(label);
    }
  }
  return leaks;
}

export function formatLeaks(leaks: Record<LeakTable, string[]>, sample = 10): string | null {
  const parts = LEAK_TABLES.filter((t) => leaks[t].length > 0).map((t) => {
    const shown = leaks[t].slice(0, sample).join(', ');
    const more = leaks[t].length > sample ? `, ... (${leaks[t].length - sample} more)` : '';
    return `  ${t}: ${leaks[t].length} left behind: ${shown}${more}`;
  });
  if (parts.length === 0) return null;
  return `Integration run leaked rows (issue #539). Clean them up in the test's afterAll with tests/helpers/purge-test-rows.ts:\n${parts.join('\n')}`;
}
