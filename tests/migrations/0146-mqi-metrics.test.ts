/**
 * Test suite for Migration 0146: MQI (Movement Quality Index) metrics seed
 *
 * Spec: AM-FEAT-015 (MQI capture)
 *
 *   1. Static SQL file analysis  - runs unconditionally, no DB needed
 *   2. Formula evaluation        - 8/8 sums, 7/8 yields nothing, transitions excluded
 *   3. Live DB checks            - re-apply the (idempotent) up-migration, then inspect
 *                                  rows and the down-migration guard. Only runs against
 *                                  a disposable test DB (localhost or CI), never a shared one.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../packages/api/db';
import { sql } from 'drizzle-orm';
import { evaluateFormula, validateFormula } from '../../packages/api/services/formula-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0146_seed_mqi_metrics.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0146_seed_mqi_metrics_down.sql');

const PATTERN_CODES = [
  'MQ_LIN_ACCEL',
  'MQ_MAX_VELO',
  'MQ_DECEL',
  'MQ_SHUFFLE',
  'MQ_LATRUN',
  'MQ_HIPTURN',
  'MQ_BACKPEDAL',
  'MQ_JUMP',
];
const TRANSITION_CODES = [
  'MQ_TRANS_DECEL_CUT',
  'MQ_TRANS_GAS_BRAKE',
  'MQ_TRANS_BACKPEDAL_TURN',
  'MQ_TRANS_LAT_LINEAR',
];
const MQI_FORMULA = PATTERN_CODES.join(' + ');
const TRANSITION_FORMULA = TRANSITION_CODES.join(' + ');

// postgres-js returns a row array directly; node-pg returns { rows }
const rowsOf = (result: any): any[] => (Array.isArray(result) ? result : result.rows);

const stripComments = (s: string) =>
  s
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

// The up-migration is idempotent (ON CONFLICT upserts). Re-apply it so these tests do not
// depend on suite ordering: other suites delete derived site_metrics rows from the shared DB.
const seedMqiMetrics = async () => {
  const upSql = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
  await db.execute(sql.raw(upSql));
};

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0146: MQI metrics seed', () => {
  describe('Up-migration SQL file', () => {
    it('exists at expected path', () => {
      expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
    });

    it('declares all 12 base metrics and 2 derived totals', () => {
      const upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      for (const code of [...PATTERN_CODES, ...TRANSITION_CODES, 'MQI_TOTAL', 'MQ_TRANSITION_TOTAL']) {
        expect(upSql).toContain(`'${code}'`);
      }
    });

    it('MQI_TOTAL formula sums exactly the 8 pattern codes and never a transition', () => {
      const upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).toContain(`'${MQI_FORMULA}'`);
      expect(upSql).toContain(`ARRAY[${PATTERN_CODES.map((c) => `'${c}'`).join(', ')}]`);
      expect(upSql).toContain(`'${TRANSITION_FORMULA}'`);
      expect(upSql).toContain(`ARRAY[${TRANSITION_CODES.map((c) => `'${c}'`).join(', ')}]`);
      // The formula and dependents actually written for MQI_TOTAL must not mention MQ_TRANS
      const mqiBlock = upSql.slice(upSql.indexOf("'MQI_TOTAL',"), upSql.indexOf("'MQ_TRANSITION_TOTAL',"));
      const formula = mqiBlock.match(/true,\s*'([^']+)',\s*ARRAY\[([^\]]+)\]/);
      expect(formula, 'MQI_TOTAL formula/dependents in SQL').not.toBeNull();
      expect(formula![1]).toBe(MQI_FORMULA);
      expect(formula![1]).not.toContain('MQ_TRANS');
      expect(formula![2]).not.toContain('MQ_TRANS');
    });

    it.each([...PATTERN_CODES, ...TRANSITION_CODES])(
      '%s is seeded as a 0-3 score with precision 0 in Movement Quality',
      (code) => {
        const upSql = stripComments(fs.readFileSync(UP_SQL_PATH, 'utf-8'));
        const row = new RegExp(
          `\\('${code}', '[^']+', 'Movement Quality', 'score', 'higher_is_better', true, true, \\d+,\\s*'[^']*',\\s*0, '\\w+', 'Activity', 0, 3\\)`,
        );
        expect(upSql).toMatch(row);
      },
    );

    it('re-applying does not clobber calculation_config keys added later (e.g. 0148 sourceSelection)', () => {
      const upSql = stripComments(fs.readFileSync(UP_SQL_PATH, 'utf-8'));
      expect(upSql).not.toMatch(/calculation_config = EXCLUDED\.calculation_config/);
      expect((upSql.match(/calculation_config = COALESCE\(site_metrics\.calculation_config, '\{\}'::jsonb\) \|\| EXCLUDED\.calculation_config/g) || []).length).toBe(2);
    });

    it('uses same_date / skip calculation config for derived totals', () => {
      const upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).toContain('"dateMatchStrategy":"same_date"');
      expect(upSql).toContain('"missingSourceBehavior":"skip"');
    });

    it('is idempotent: every INSERT has ON CONFLICT (code) DO UPDATE', () => {
      const sqlOnly = stripComments(fs.readFileSync(UP_SQL_PATH, 'utf-8'));
      const insertCount = (sqlOnly.match(/INSERT INTO/g) || []).length;
      const conflictCount = (sqlOnly.match(/ON CONFLICT \(code\)\s+DO UPDATE/g) || []).length;
      expect(insertCount).toBeGreaterThan(0);
      expect(conflictCount).toBe(insertCount);
    });

    it('is non-destructive and emits a RAISE NOTICE summary', () => {
      const upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).not.toMatch(/DROP TABLE/i);
      expect(upSql).not.toMatch(/TRUNCATE/i);
      expect(stripComments(upSql)).not.toMatch(/DELETE FROM/i);
      expect(upSql).toMatch(/RAISE NOTICE 'Migration 0146/);
    });
  });

  describe('Down-migration SQL file', () => {
    it('exists at expected path', () => {
      expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
    });

    it('refuses to run (RAISE EXCEPTION) when MQ measurements exist, before any delete', () => {
      const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      const exceptionIdx = downSql.indexOf('RAISE EXCEPTION');
      const deleteIdx = downSql.indexOf('DELETE FROM site_metrics');
      expect(exceptionIdx).toBeGreaterThan(-1);
      expect(deleteIdx).toBeGreaterThan(exceptionIdx);
      expect(downSql).toMatch(/FROM measurements/);
    });

    it.each(['measurements', 'goals', 'report_benchmarks', 'event_metrics'])(
      'refuses when %s rows reference MQ metrics',
      (table) => {
        const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
        expect(downSql.slice(0, downSql.indexOf('DELETE FROM site_metrics'))).toMatch(new RegExp(`FROM ${table}\\b`));
      },
    );

    it('deletes only the 14 MQ codes', () => {
      const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      for (const code of [...PATTERN_CODES, ...TRANSITION_CODES, 'MQI_TOTAL', 'MQ_TRANSITION_TOTAL']) {
        expect(downSql).toContain(`'${code}'`);
      }
    });
  });

  describe('Derived formula evaluation', () => {
    const allEights = Object.fromEntries(PATTERN_CODES.map((c) => [c.toLowerCase(), 3]));

    it('validates against the 8 pattern codes', () => {
      const result = validateFormula(MQI_FORMULA, PATTERN_CODES);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('8 of 8 scores sums to the total (24 max)', () => {
      expect(evaluateFormula(MQI_FORMULA, allEights)).toBe(24);
      const mixed = Object.fromEntries(PATTERN_CODES.map((c, i) => [c.toLowerCase(), i % 4]));
      // 0+1+2+3+0+1+2+3
      expect(evaluateFormula(MQI_FORMULA, mixed)).toBe(12);
    });

    it('an all-zero (all Absent) set sums to 0, not null', () => {
      const zeros = Object.fromEntries(PATTERN_CODES.map((c) => [c.toLowerCase(), 0]));
      expect(evaluateFormula(MQI_FORMULA, zeros)).toBe(0);
    });

    it('7 of 8 scores yields no total', () => {
      const seven = { ...allEights } as Record<string, number>;
      delete seven['mq_jump'];
      expect(evaluateFormula(MQI_FORMULA, seven)).toBeNull();
    });

    it('transition scores never influence MQI_TOTAL', () => {
      const withTransitions = {
        ...allEights,
        ...Object.fromEntries(TRANSITION_CODES.map((c) => [c.toLowerCase(), 3])),
      };
      expect(evaluateFormula(MQI_FORMULA, withTransitions)).toBe(24);
    });

    it('MQ_TRANSITION_TOTAL sums 4 transitions and needs all 4', () => {
      const four = Object.fromEntries(TRANSITION_CODES.map((c) => [c.toLowerCase(), 2]));
      expect(evaluateFormula(TRANSITION_FORMULA, four)).toBe(8);
      const three = { ...four } as Record<string, number>;
      delete three['mq_trans_lat_linear'];
      expect(evaluateFormula(TRANSITION_FORMULA, three)).toBeNull();
    });
  });

  describe.skipIf(!isDisposableTestDb)('Database state', () => {
    beforeAll(seedMqiMetrics);

    it('re-applying the up-migration preserves an added calculation_config key', async () => {
      await db.execute(sql`
        UPDATE site_metrics
           SET calculation_config = calculation_config || '{"sourceSelection":"latest_event"}'::jsonb
         WHERE code = 'MQI_TOTAL'
      `);
      try {
        await seedMqiMetrics();
        const result = await db.execute(sql`SELECT calculation_config FROM site_metrics WHERE code = 'MQI_TOTAL'`);
        expect(rowsOf(result)[0].calculation_config).toEqual({
          dateMatchStrategy: 'same_date',
          missingSourceBehavior: 'skip',
          sourceSelection: 'latest_event',
        });
      } finally {
        await db.execute(sql`
          UPDATE site_metrics SET calculation_config = calculation_config - 'sourceSelection' WHERE code = 'MQI_TOTAL'
        `);
      }
    });

    it('down-migration refuses while a goal references an MQ metric', async () => {
      const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      const suffix = `${Date.now()}`;
      const err: any = await db
        .transaction(async (tx) => {
          const [u] = rowsOf(
            await tx.execute(sql`
              INSERT INTO users (username, emails, password, first_name, last_name, full_name)
              VALUES (${`mq-down-${suffix}`}, ARRAY[${`mq-down-${suffix}@test.com`}], 'x', 'M', 'Down', 'M Down')
              RETURNING id
            `),
          );
          await tx.execute(sql`
            INSERT INTO goals (user_id, metric, goal_type, target_value, baseline_value, current_value, target_date)
            VALUES (${u.id}, 'MQI_TOTAL', 'target_value', 20, 10, 10, '2026-12-31')
          `);
          await tx.execute(sql.raw(downSql));
        })
        .catch((e) => e);
      // Assert on the Postgres error itself: drizzle's wrapper message embeds the
      // whole SQL text (including the RAISE string), which would match anything.
      const pgMessage = String((err?.cause ?? err)?.message);
      expect(pgMessage).toMatch(/^Migration 0146 \(down\) refused: .*goals/);
      const result = await db.execute(sql`SELECT COUNT(*)::int AS n FROM site_metrics WHERE code = 'MQI_TOTAL'`);
      expect(rowsOf(result)[0].n).toBe(1);
    });

    it('seeds 14 MQ metrics with expected config', async () => {
      const result = await db.execute(sql`
        SELECT code, unit, metric_type, category, validation_min, validation_max,
               decimal_precision, is_derived, formula, dependent_metrics,
               calculation_config, is_active
          FROM site_metrics
         WHERE code LIKE 'MQ\_%' OR code = 'MQI_TOTAL'
         ORDER BY code
      `);
      const rows = rowsOf(result);
      expect(rows).toHaveLength(14);
      const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));

      for (const code of [...PATTERN_CODES, ...TRANSITION_CODES]) {
        const r = byCode[code];
        expect(r, code).toBeDefined();
        expect(r.unit).toBe('score');
        expect(r.metric_type).toBe('higher_is_better');
        expect(r.category).toBe('Movement Quality');
        expect(Number(r.validation_min)).toBe(0);
        expect(Number(r.validation_max)).toBe(3);
        expect(Number(r.decimal_precision)).toBe(0);
        expect(r.is_derived).toBe(false);
        expect(r.is_active).toBe(true);
      }

      const mqi = byCode['MQI_TOTAL'];
      expect(mqi.is_derived).toBe(true);
      expect(mqi.unit).toBe('score');
      expect(mqi.formula).toBe(MQI_FORMULA);
      expect(mqi.dependent_metrics).toEqual(PATTERN_CODES);
      expect(mqi.calculation_config).toMatchObject({
        dateMatchStrategy: 'same_date',
        missingSourceBehavior: 'skip',
      });
      expect(Number(mqi.validation_min)).toBe(0);
      expect(Number(mqi.validation_max)).toBe(24);

      const trans = byCode['MQ_TRANSITION_TOTAL'];
      expect(trans.is_derived).toBe(true);
      expect(trans.formula).toBe(TRANSITION_FORMULA);
      expect(trans.dependent_metrics).toEqual(TRANSITION_CODES);
      expect(Number(trans.validation_max)).toBe(12);
    });

    it('MQI_TOTAL dependents never include a transition code', async () => {
      const result = await db.execute(sql`
        SELECT dependent_metrics FROM site_metrics WHERE code = 'MQI_TOTAL'
      `);
      const deps = rowsOf(result)[0].dependent_metrics as string[];
      expect(deps.filter((d) => d.startsWith('MQ_TRANS_'))).toEqual([]);
      expect(deps).toHaveLength(8);
    });
  });
});
