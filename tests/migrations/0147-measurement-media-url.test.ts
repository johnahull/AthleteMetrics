/**
 * Migration 0147: add nullable measurements.media_url (AM-FEAT-015 Phase 2)
 * Hand-written SQL, idempotent up, down drops the column. No index.
 * Live checks apply the migrations inside a transaction that is rolled back, and
 * only run against a disposable test DB (NODE_ENV=test on localhost, or CI): the
 * down migration DROPs a column, so it must never touch a shared database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const UP = path.join(root, 'migrations', '0147_add_measurement_media_url.sql');
const DOWN = path.join(root, 'migrations', '0147_add_measurement_media_url_down.sql');

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

const constraintInfo = `SELECT pg_get_constraintdef(oid) AS def, convalidated FROM pg_constraint
  WHERE conrelid = 'measurements'::regclass AND conname = 'measurements_media_url_length_check'`;

const colInfo = `SELECT data_type, is_nullable FROM information_schema.columns
  WHERE table_name = 'measurements' AND column_name = 'media_url'`;

describe('Migration 0147: measurements.media_url', () => {
  let upSql: string;
  let downSql: string;
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    upSql = fs.existsSync(UP) ? fs.readFileSync(UP, 'utf-8') : '';
    downSql = fs.existsSync(DOWN) ? fs.readFileSync(DOWN, 'utf-8') : '';
    if (isDisposableTestDb) sql = postgres(dbUrl, { max: 1 });
  });

  afterAll(async () => {
    if (sql) await sql.end();
  });

  it('up and down files exist', () => {
    expect(fs.existsSync(UP)).toBe(true);
    expect(fs.existsSync(DOWN)).toBe(true);
  });

  it('up SQL is idempotent text, nullable, and creates no index', () => {
    expect(upSql).toMatch(/ADD COLUMN IF NOT EXISTS media_url text/i);
    expect(upSql).not.toMatch(/NOT NULL/i);
    expect(upSql).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
  });

  it('up SQL bounds its lock wait with a transaction-local lock_timeout', () => {
    expect(upSql).toMatch(/^\s*SET LOCAL lock_timeout = '5s';/m);
    expect(upSql.indexOf('SET LOCAL lock_timeout')).toBeLessThan(upSql.indexOf('ALTER TABLE'));
  });

  it('down SQL drops the column if exists', () => {
    expect(downSql).toMatch(/DROP COLUMN IF EXISTS media_url/i);
  });

  it('up SQL adds a 2048-char CHECK constraint (idempotently) and down drops it', () => {
    expect(upSql).toMatch(/ADD CONSTRAINT measurements_media_url_length_check\s+CHECK \(char_length\(media_url\) <= 2048\)\s+NOT VALID/i);
    // apply-manual-migrations.js runs the whole file in one transaction, so a VALIDATE
    // here would scan the table while ADD COLUMN's ACCESS EXCLUSIVE lock is still held.
    // The column is new (all NULL), so NOT VALID is sufficient; new writes are checked.
    expect(upSql).not.toMatch(/VALIDATE CONSTRAINT/i);
    expect(upSql).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/i);
    expect(downSql).toMatch(/DROP CONSTRAINT IF EXISTS measurements_media_url_length_check/i);
  });

  it.skipIf(!isDisposableTestDb)('up creates the length CHECK constraint, re-apply keeps exactly one (rolled back)', async () => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(downSql);
        await tx.unsafe(upSql);
        await tx.unsafe(upSql);
        const rows = await tx.unsafe(constraintInfo);
        expect(rows).toHaveLength(1);
        expect(rows[0].def).toMatch(/char_length\(media_url\) <= 2048/);
        // NOT VALID constraints are still enforced for new writes
        const [m] = await tx.unsafe(`SELECT id FROM measurements LIMIT 1`);
        if (m) {
          await expect(
            tx.unsafe(`UPDATE measurements SET media_url = repeat('a', 2049) WHERE id = $1`, [m.id]),
          ).rejects.toThrow(/measurements_media_url_length_check/);
        }
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  });

  it.skipIf(!isDisposableTestDb)('up is idempotent and down drops the column (rolled-back transaction)', async () => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        // Start from a known-absent state, then apply up twice
        await tx.unsafe(downSql);
        expect((await tx.unsafe(colInfo)).length).toBe(0);

        await tx.unsafe(upSql);
        await tx.unsafe(upSql); // second run must not error
        const rows = await tx.unsafe(colInfo);
        expect(rows.length).toBe(1);
        expect(rows[0].data_type).toBe('text');
        expect(rows[0].is_nullable).toBe('YES');

        await tx.unsafe(downSql);
        await tx.unsafe(downSql); // down also idempotent
        expect((await tx.unsafe(colInfo)).length).toBe(0);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  });

  it.skipIf(!isDisposableTestDb)('preserves existing data on re-apply (does not clobber values)', async () => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(upSql);
        const [{ n }] = await tx.unsafe(`SELECT count(*)::int AS n FROM measurements WHERE media_url IS NOT NULL`);
        await tx.unsafe(upSql);
        const [{ n: n2 }] = await tx.unsafe(`SELECT count(*)::int AS n FROM measurements WHERE media_url IS NOT NULL`);
        expect(n2).toBe(n);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  });
});
