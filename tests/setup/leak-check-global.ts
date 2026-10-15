/**
 * Vitest globalSetup for vitest.integration.config.ts only (issue #539).
 *
 * Integration files run one at a time against one database, so any organization, user, team or measurement
 * that exists after the run but not before it was left behind by a test. Rows left behind pollute later files
 * (they broke the 0144/0145 migration tests and made join-code pass only by accident), so the run fails and
 * names them. Ids are compared, not counts, so pre-existing rows and rows a test deletes cannot flake it.
 * The bootstrap admin user is created by the app on first start and is not a test leak.
 *
 * Scope: only the integration lane (vitest.integration.config.ts). Files under packages/api/__tests__ and
 * packages/api/routes/__tests__ run in the unit lane, so this check does NOT cover them; their cleanup is
 * verified by running each file alone against a throwaway database (see issue #539).
 *
 * Needs a dedicated database: any other process writing to the same database during the run (a dev server,
 * another worktree's tests) shows up as a leak. Set SKIP_LEAK_CHECK=1 to opt out when sharing a local DB.
 * It never connects to a database whose URL matches the production/staging guard (tests/helpers/forbidden-db-url.ts).
 */
import postgres from 'postgres';
import { findForbiddenPattern } from '../helpers/forbidden-db-url';
import { diffSnapshots, emptySnapshot, formatLeaks, type Snapshot } from '../helpers/leak-check';

const connectionString = process.env.DATABASE_URL;

// Same SSL rule as packages/api/db.ts: integration runs use a local, non-SSL database
const connect = (url: string) => postgres(url, { max: 1, ssl: url.includes('localhost') || process.env.NODE_ENV === 'test' ? false : 'require' });

async function takeSnapshot(sql: postgres.Sql): Promise<Snapshot> {
  const adminUsername = process.env.ADMIN_USER || 'admin';
  const snapshot = emptySnapshot();
  for (const r of await sql`select id, name from organizations`) snapshot.organizations.set(r.id, r.name);
  for (const r of await sql`select id, username from users where username <> ${adminUsername}`) snapshot.users.set(r.id, r.username);
  for (const r of await sql`select id, name from teams`) snapshot.teams.set(r.id, r.name);
  for (const r of await sql`select id, metric, user_id from measurements`) snapshot.measurements.set(r.id, `${r.metric} of user ${r.user_id}`);
  return snapshot;
}

export default async function setup(): Promise<(() => Promise<void>) | void> {
  if (!connectionString) return; // integration-setup.ts reports the missing DATABASE_URL
  if (process.env.SKIP_LEAK_CHECK === '1') {
    console.warn('leak check: skipped because SKIP_LEAK_CHECK=1');
    return;
  }
  // integration-setup.ts rejects these URLs, but globalSetup runs first: never read rows from such a database
  const forbidden = findForbiddenPattern(connectionString);
  if (forbidden) {
    console.warn(`leak check: skipping, DATABASE_URL matches the forbidden pattern "${forbidden}" (not connecting)`);
    return;
  }

  const sql = connect(connectionString);
  let before: Snapshot;
  try {
    before = await takeSnapshot(sql);
  } finally {
    await sql.end();
  }

  return async () => {
    const after = connect(connectionString);
    try {
      const message = formatLeaks(diffSnapshots(before, await takeSnapshot(after)));
      if (message) {
        // Print and set the exit code rather than throw: a thrown teardown error is labelled "Startup Error"
        console.error(`\n${message}\n`);
        process.exitCode = 1;
      }
    } finally {
      await after.end();
    }
  };
}
