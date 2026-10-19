/**
 * Migration 0167: rename the 16 EUR / RSI tier rows seeded by 0137 to `<Group> - <Tier>` so
 * deriveTierGroupName() yields one clean group label (EUR, RSI Left, RSI Right, RSI Asymmetry).
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { deriveTierGroupName } from '../../packages/shared/benchmark-utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0167_rename_eur_rsi_tier_groups';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

/** [id, metric code, 0137 name, 0167 name, expected group] */
const ROWS = [
  ['bench-eur-elite-reactive', 'POWER_EUR', 'EUR Elite Reactive (>1.25)', 'EUR - Elite Reactive (>1.25)', 'EUR'],
  ['bench-eur-trained-reactive', 'POWER_EUR', 'EUR Trained Reactive (1.15-1.25)', 'EUR - Trained Reactive (1.15–1.25)', 'EUR'],
  ['bench-eur-functional-ssc', 'POWER_EUR', 'EUR Functional SSC Use (1.05-1.15)', 'EUR - Functional SSC Use (1.05–1.15)', 'EUR'],
  ['bench-eur-concentric-dominant', 'POWER_EUR', 'EUR Concentric-Dominant (<1.05)', 'EUR - Concentric Dominant (<1.05)', 'EUR'],
  ['bench-rsi-l-elite', 'RSI_L', 'RSI_L Elite (≥1.5)', 'RSI Left - Elite (≥1.5)', 'RSI Left'],
  ['bench-rsi-l-trained', 'RSI_L', 'RSI_L Trained (1.1-1.5)', 'RSI Left - Trained (1.1–1.5)', 'RSI Left'],
  ['bench-rsi-l-general', 'RSI_L', 'RSI_L General (0.5-1.1)', 'RSI Left - General (0.5–1.1)', 'RSI Left'],
  ['bench-rsi-l-floor', 'RSI_L', 'RSI_L Below Floor (<0.5)', 'RSI Left - Below Floor (<0.5)', 'RSI Left'],
  ['bench-rsi-r-elite', 'RSI_R', 'RSI_R Elite (≥1.5)', 'RSI Right - Elite (≥1.5)', 'RSI Right'],
  ['bench-rsi-r-trained', 'RSI_R', 'RSI_R Trained (1.1-1.5)', 'RSI Right - Trained (1.1–1.5)', 'RSI Right'],
  ['bench-rsi-r-general', 'RSI_R', 'RSI_R General (0.5-1.1)', 'RSI Right - General (0.5–1.1)', 'RSI Right'],
  ['bench-rsi-r-floor', 'RSI_R', 'RSI_R Below Floor (<0.5)', 'RSI Right - Below Floor (<0.5)', 'RSI Right'],
  ['bench-rsi-asym-symmetric', 'RSI_ASYM', 'RSI Symmetrical (<10%)', 'RSI Asymmetry - Symmetrical (<10%)', 'RSI Asymmetry'],
  ['bench-rsi-asym-borderline', 'RSI_ASYM', 'RSI Borderline (10-15%)', 'RSI Asymmetry - Borderline (10–15%)', 'RSI Asymmetry'],
  ['bench-rsi-asym-significant', 'RSI_ASYM', 'RSI Significant Deficit (15-20%)', 'RSI Asymmetry - Significant Deficit (15–20%)', 'RSI Asymmetry'],
  ['bench-rsi-asym-redflag', 'RSI_ASYM', 'RSI Clinical Red Flag (>20%)', 'RSI Asymmetry - Clinical Red Flag (>20%)', 'RSI Asymmetry'],
] as const;

describe('Migration 0167: static analysis', () => {
  it('renames all 16 rows by id with an old-name guard, both ways, with no transaction control', () => {
    for (const [id, , oldName, newName] of ROWS) {
      expect(UP).toContain(`'${id}'`);
      expect(UP).toContain(`'${oldName}'`);
      expect(UP).toContain(`'${newName}'`);
      expect(DOWN).toContain(`'${id}'`);
      expect(DOWN).toContain(`'${oldName}'`);
    }
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(DOWN).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('every new name derives its group label', () => {
    for (const [, , , newName, group] of ROWS) expect(deriveTierGroupName(newName)).toBe(group);
  });
  it('down forgets its manual_migrations row', () => {
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });
});

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe.skipIf(!isDisposableTestDb)('Migration 0167: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1 });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  // Everything the test creates is discarded by the rollback.
  const rollbackable = async (fn: (tx: any) => Promise<void>) => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        for (const code of ['POWER_EUR', 'RSI_L', 'RSI_R', 'RSI_ASYM']) {
          await tx`INSERT INTO site_metrics (code, label, metric_type, unit) VALUES (${code}, ${code}, 'higher_is_better', 'ratio') ON CONFLICT (code) DO NOTHING`;
        }
        // The state 0137 leaves behind (any existing rows are reset to the 0137 name)
        await tx`DELETE FROM site_benchmarks WHERE id = ANY(${ROWS.map(([id]) => id)})`;
        for (const [id, code, oldName] of ROWS) {
          await tx`INSERT INTO site_benchmarks (id, metric_code, name, comparison_operator, min_value, max_value, tier_name, is_active)
                   VALUES (${id}, ${code}, ${oldName}, 'range', 0, 1, 't', true)`;
        }
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  };
  const names = async (tx: any) => {
    const rows = await tx`SELECT id, name FROM site_benchmarks WHERE id = ANY(${ROWS.map(([id]) => id)})`;
    return Object.fromEntries(rows.map((r: any) => [r.id, r.name]));
  };

  it('renames the 16 rows so every tier of a group derives the same label; twice is a no-op', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const after = await names(tx);
      await tx.unsafe(UP);
      expect(await names(tx)).toEqual(after);
      for (const [id, , , newName, group] of ROWS) {
        expect(after[id]).toBe(newName);
        expect(deriveTierGroupName(after[id])).toBe(group);
      }
    });
  });

  it('down restores the 0137 names', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      await tx.unsafe(DOWN);
      const after = await names(tx);
      for (const [id, , oldName] of ROWS) expect(after[id]).toBe(oldName);
    });
  });
});
