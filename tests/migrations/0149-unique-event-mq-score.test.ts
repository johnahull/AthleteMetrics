/**
 * Migration 0149: partial unique index, one Movement Quality score per
 * (athlete, metric, event), with de-dup of existing duplicates (newest kept).
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0149_unique_event_mq_score.sql');
const DOWN = read('0149_unique_event_mq_score_down.sql');

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0149: one MQ score per athlete/metric/event', () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    if (isDisposableTestDb) sql = postgres(dbUrl, { max: 1 });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  it('creates a partial unique index scoped to non-calculated MQ event rows, idempotently', () => {
    expect(UP).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS measurements_event_mq_score_unique/);
    expect(UP).toMatch(/\(user_id, metric, event_id\)/);
    expect(UP).toMatch(/WHERE event_id IS NOT NULL AND is_calculated = false AND metric LIKE 'MQ\\_%'/);
    expect(UP.indexOf('DELETE FROM measurements')).toBeLessThan(UP.indexOf('CREATE UNIQUE INDEX'));
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS measurements_event_mq_score_unique/);
  });

  it.skipIf(!isDisposableTestDb)('de-dups (newest kept), then rejects a second row; other metrics unaffected (rolled back)', async () => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(DOWN);
        const row = (metric: string, value: string, createdAt: string) => tx`
          INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units, event_id, created_at)
          VALUES ('u-0149', 'c-0149', '2026-07-01', 17, ${metric}, ${value}, 'score', 'ev-0149', ${createdAt}::timestamp)
          RETURNING id`;
        await row('MQ_JUMP', '1', '2026-07-01T09:00:00');
        const [newest] = await row('MQ_JUMP', '3', '2026-07-01T10:00:00');
        await row('VERTICAL_JUMP', '30', '2026-07-01T09:00:00');
        await row('VERTICAL_JUMP', '31', '2026-07-01T10:00:00');

        await tx.unsafe(UP);
        await tx.unsafe(UP);

        const mq = await tx`SELECT id, value FROM measurements WHERE user_id = 'u-0149' AND metric = 'MQ_JUMP'`;
        expect(mq).toHaveLength(1);
        expect(mq[0].id).toBe(newest.id);
        const vj = await tx`SELECT id FROM measurements WHERE user_id = 'u-0149' AND metric = 'VERTICAL_JUMP'`;
        expect(vj).toHaveLength(2);

        await tx.unsafe('SAVEPOINT dup');
        await expect(row('MQ_JUMP', '2', '2026-07-01T11:00:00')).rejects.toThrow(/measurements_event_mq_score_unique/);
        await tx.unsafe('ROLLBACK TO SAVEPOINT dup');
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  });
});
