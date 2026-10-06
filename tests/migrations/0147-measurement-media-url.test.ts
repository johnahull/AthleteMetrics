/**
 * Migration 0147: add nullable measurements.media_url (AM-FEAT-015 Phase 2)
 * Hand-written SQL, idempotent up, down drops the column. No index.
 * Requires a live DATABASE_URL (migrations are applied inside a transaction that is rolled back).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const UP = path.join(root, 'migrations', '0147_add_measurement_media_url.sql');
const DOWN = path.join(root, 'migrations', '0147_add_measurement_media_url_down.sql');

const colInfo = `SELECT data_type, is_nullable FROM information_schema.columns
  WHERE table_name = 'measurements' AND column_name = 'media_url'`;

describe('Migration 0147: measurements.media_url', () => {
  let upSql: string;
  let downSql: string;
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    upSql = fs.existsSync(UP) ? fs.readFileSync(UP, 'utf-8') : '';
    downSql = fs.existsSync(DOWN) ? fs.readFileSync(DOWN, 'utf-8') : '';
    sql = postgres(process.env.DATABASE_URL!, { max: 1 });
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

  it('down SQL drops the column if exists', () => {
    expect(downSql).toMatch(/DROP COLUMN IF EXISTS media_url/i);
  });

  it('up is idempotent and down drops the column (rolled-back transaction)', async () => {
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

  it('preserves existing data on re-apply (does not clobber values)', async () => {
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
