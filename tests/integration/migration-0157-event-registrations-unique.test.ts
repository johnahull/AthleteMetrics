/**
 * Migration 0157: full UNIQUE (event_id, user_id) on event_registrations.
 *
 * The bulk-add route inserts with ON CONFLICT (event_id, user_id), which Postgres can only infer from a full
 * unique constraint. schema.ts declares event_registrations_event_user_unique (so db:push databases, like CI,
 * have it) but no migration created it: migration-built databases (staging) only had the partial index from
 * 0076, and bulk-add answered 500 (42P10). Every case runs in a transaction that is rolled back.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UP = fs.readFileSync(path.resolve(__dirname, '../../migrations/0157_add_event_registrations_unique.sql'), 'utf-8');
const DOWN = fs.readFileSync(path.resolve(__dirname, '../../migrations/0157_add_event_registrations_unique_down.sql'), 'utf-8');

const NAME = 'event_registrations_event_user_unique';

class Rollback extends Error {}

/** Run `fn` in a transaction that always rolls back, starting from the migration-built shape (no full constraint). */
async function inMigrationBuiltDb(fn: (tx: any) => Promise<void>) {
  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql.raw(`ALTER TABLE event_registrations DROP CONSTRAINT IF EXISTS ${NAME}`));
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

const hasConstraint = async (tx: any) => {
  const r = await tx.execute(sql`SELECT 1 FROM pg_constraint WHERE conname = ${NAME} AND conrelid = 'event_registrations'::regclass`);
  return (r.rows ?? r).length > 0;
};

// Plans (and so infers the arbiter for) the exact ON CONFLICT clause bulk-add uses; inserts no row.
const bulkAddConflictClause = (tx: any) =>
  tx.execute(sql`
    INSERT INTO event_registrations (event_id, user_id)
    SELECT NULL, NULL WHERE false
    ON CONFLICT (event_id, user_id) DO NOTHING`);

describe('migration 0157: event_registrations (event_id, user_id) unique', () => {
  it('without it, the bulk-add ON CONFLICT clause cannot be planned', async () => {
    await inMigrationBuiltDb(async (tx) => {
      await tx.execute(sql`SAVEPOINT s`);
      await expect(bulkAddConflictClause(tx)).rejects.toThrow();
    });
  });

  it('creates the constraint and the bulk-add ON CONFLICT clause works', async () => {
    await inMigrationBuiltDb(async (tx) => {
      await tx.execute(sql.raw(UP));
      expect(await hasConstraint(tx)).toBe(true);
      await bulkAddConflictClause(tx);
    });
  });

  it('is idempotent', async () => {
    await inMigrationBuiltDb(async (tx) => {
      await tx.execute(sql.raw(UP));
      await tx.execute(sql.raw(UP));
      expect(await hasConstraint(tx)).toBe(true);
    });
  });

  it('down removes the constraint', async () => {
    await inMigrationBuiltDb(async (tx) => {
      await tx.execute(sql.raw(UP));
      await tx.execute(sql.raw(DOWN));
      expect(await hasConstraint(tx)).toBe(false);
    });
  });
});
