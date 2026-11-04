/**
 * Migration 0177: sport- and unit-neutral APPROACH_JUMP explanation text.
 * 0159 wrote volleyball copy ("attacking", "hitting point") and "inches", but the metric is used across sports and its
 * unit is the metric's own. 0177 rewrites what_it_measures / why_it_matters only while they still equal the 0159 text,
 * so a site admin's edit is kept. Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0177_neutral_approach_jump_explanation';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

const OLD_WHAT = 'Approach jump is your approach reach minus your standing reach, so it is the number of inches you add by jumping off a run-up.';
const OLD_WHY = 'This is the jump that matters for attacking. A bigger approach jump means a higher hitting point.';

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0177: static analysis', () => {
  it('touches APPROACH_JUMP only, guarded by the exact 0159 text', () => {
    expect(UP).toMatch(/code = 'APPROACH_JUMP'/);
    expect(UP).toContain(OLD_WHAT);
    expect(UP).toContain(OLD_WHY);
  });
  it('down restores the 0159 text only while the 0177 text is unchanged, and forgets its manual_migrations row', () => {
    expect(DOWN).toContain(OLD_WHAT);
    expect(DOWN).toContain(OLD_WHY);
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });
  it('is transaction-safe', () => {
    for (const sql of [UP, DOWN]) {
      expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
      expect(sql).not.toMatch(/TRUNCATE|CONCURRENTLY|DROP /i);
    }
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0177: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  const rollbackable = async (fn: (tx: any) => Promise<void>) => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  };

  // CI DB has no seeded metrics: create the row
  const seed = async (tx: any, what: string, why: string) => {
    await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, display_order, is_system_default, is_active, what_it_measures, why_it_matters)
             VALUES ('APPROACH_JUMP', 'Approach Jump', 'Power', 'in', 'higher_is_better', 70, true, true, ${what}, ${why})
             ON CONFLICT (code) DO UPDATE SET what_it_measures = EXCLUDED.what_it_measures, why_it_matters = EXCLUDED.why_it_matters`;
  };
  const text = async (tx: any) =>
    (await tx`SELECT what_it_measures, why_it_matters FROM site_metrics WHERE code = 'APPROACH_JUMP'`)[0];

  it('rewrites the 0159 text with neutral copy, and down puts it back', async () => {
    await rollbackable(async (tx) => {
      await seed(tx, OLD_WHAT, OLD_WHY);
      await tx.unsafe(UP);
      const after = await text(tx);
      expect(after.what_it_measures).not.toMatch(/inches/);
      expect(after.why_it_matters).not.toMatch(/attack|hitting/i);
      await tx.unsafe(UP); // a second run changes nothing
      expect(await text(tx)).toEqual(after);
      await tx.unsafe(DOWN);
      expect(await text(tx)).toEqual({ what_it_measures: OLD_WHAT, why_it_matters: OLD_WHY });
    });
  });

  it('keeps a site admin edit, field by field', async () => {
    await rollbackable(async (tx) => {
      await seed(tx, 'Admin text.', OLD_WHY);
      await tx.unsafe(UP);
      const after = await text(tx);
      expect(after.what_it_measures).toBe('Admin text.');
      expect(after.why_it_matters).not.toBe(OLD_WHY);
    });
  });
});
