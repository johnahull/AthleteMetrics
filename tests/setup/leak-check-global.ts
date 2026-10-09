/**
 * Vitest globalSetup for vitest.integration.config.ts only (issue #539).
 *
 * Integration files run one at a time against one database, so any organization, user, team or measurement
 * that exists after the run but not before it was left behind by a test. Rows left behind pollute later files
 * (they broke the 0144/0145 migration tests and made join-code pass only by accident), so the run fails and
 * names them. Ids are compared, not counts, so pre-existing rows and rows a test deletes cannot flake it.
 * The bootstrap admin user is created by the app on first start and is not a test leak.
 */
import postgres from 'postgres';
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
      if (message) throw new Error(message);
    } finally {
      await after.end();
    }
  };
}
