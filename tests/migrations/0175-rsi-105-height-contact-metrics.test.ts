/**
 * Migration 0175: RSI_105_HEIGHT (avg jump height, in) and RSI_105_GCT (avg ground contact time, s) for the 10/5 repeat hop.
 * They are plain entered metrics recorded next to RSI_105, never used to compute it: the device's RSI is the average of
 * per-hop ratios, so it cannot be rebuilt from the two averages.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0175_add_rsi_105_height_and_contact_time.sql');
const DOWN = read('0175_add_rsi_105_height_and_contact_time_down.sql');

const CODES = ['RSI_105_HEIGHT', 'RSI_105_GCT'];
const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0175: static analysis', () => {
  it('inserts both site metrics with inline VALUES and never overwrites a row', () => {
    expect(UP).toMatch(/INSERT INTO site_metrics/);
    expect(UP).toMatch(/\('RSI_105_HEIGHT',/);
    expect(UP).toMatch(/\('RSI_105_GCT',/);
    expect(UP).toMatch(/ON CONFLICT \(code\) DO NOTHING/);
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('creates entered metrics: no derived formula and no paired-input config', () => {
    const insert = UP.match(/INSERT INTO site_metrics[\s\S]*?;[ \t]*$/m)?.[0] ?? '';
    expect(insert).not.toBe('');
    expect(insert).not.toMatch(/\b(is_derived|formula|dependent_metrics|calculation_config|auxiliary_input_config)\b/);
  });
  it('copies from RSI_105 and enables the codes for organizations that enable RSI_105', () => {
    expect(UP).toMatch(/JOIN site_metrics src ON src\.code = 'RSI_105'/);
    expect(UP).toMatch(/om\.metric_code = 'RSI_105' AND om\.is_enabled = true/);
    expect(UP).toMatch(/ON CONFLICT \(organization_id, metric_code\) DO NOTHING/);
  });
  it('warns against a manual re-run', () => {
    expect(UP).toMatch(/^-- Do not re-run by hand/m);
  });
  it('down forgets its manual_migrations row and refuses while the codes are in use', () => {
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0175_add_rsi_105_height_and_contact_time'/);
    for (const table of ['measurements', 'goals', 'event_metrics', 'report_benchmarks', 'custom_benchmarks', 'site_benchmarks']) {
      expect(DOWN).toMatch(new RegExp(`FROM ${table}`));
    }
    expect(DOWN).toMatch(/FROM reports\b/);
    expect(DOWN).toMatch(/FROM report_templates\b/);
    expect(DOWN).toMatch(/RAISE EXCEPTION/);
    expect(DOWN).toMatch(/DELETE FROM site_metrics WHERE code = ANY\(v_codes\)/);
    expect(DOWN).not.toMatch(/'RSI_105'\s*[,)\]]/); // RSI_105 itself is never touched
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0175: against a disposable DB (rolled back)', () => {
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
        await tx`SET LOCAL session_replication_role = replica`; // fixtures skip FK checks
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  };

  const clear = (tx: any) => tx`DELETE FROM site_metrics WHERE code IN ('RSI_105', 'RSI_105_HEIGHT', 'RSI_105_GCT')`;

  // RSI_105 is created by 0156 in real databases; the test supplies it so it does not depend on migration order.
  const seed = async (tx: any) => {
    await clear(tx);
    await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, display_order, decimal_precision, color, icon,
                                       description, short_description, what_it_measures, why_it_matters, is_system_default, is_active,
                                       available_org_types, sport_associations)
             VALUES ('RSI_105', 'RSI Bilateral', 'Power', 'ratio', 'higher_is_better', 71, 2, 'purple', 'Zap',
                     'rsi text', 'rsi text', 'rsi text', 'rsi text', true, true, ARRAY['college', 'club'], ARRAY['soccer'])`;
    await tx`INSERT INTO organization_metrics (organization_id, metric_code, is_enabled) VALUES
               ('org-on', 'RSI_105', true), ('org-off', 'RSI_105', false)`;
  };

  const metricRows = (tx: any) => tx`SELECT * FROM site_metrics WHERE code IN ('RSI_105_HEIGHT', 'RSI_105_GCT') ORDER BY code`;
  const num = (v: unknown) => Number(v);

  it('creates height in inches and contact time in seconds with the right direction, range and precision', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const [gct, height] = await metricRows(tx); // ordered by code: GCT, HEIGHT
      expect(gct).toMatchObject({
        code: 'RSI_105_GCT', unit: 's', metric_type: 'lower_is_better', decimal_precision: 3, is_derived: false, is_active: true,
      });
      expect([num(gct.validation_min), num(gct.validation_max)]).toEqual([0.05, 1]);
      expect(height).toMatchObject({
        code: 'RSI_105_HEIGHT', unit: 'in', metric_type: 'higher_is_better', decimal_precision: 1, is_derived: false, is_active: true,
      });
      expect([num(height.validation_min), num(height.validation_max)]).toEqual([1, 40]);
      expect(gct.auxiliary_input_config).toBeNull();
      expect(height.auxiliary_input_config).toBeNull();
    });
  });

  it('copies category, org-type availability, sports and styling from RSI_105 but writes its own text', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      for (const row of await metricRows(tx)) {
        expect(row).toMatchObject({ category: 'Power', color: 'purple', is_system_default: true, display_format: 'decimal' });
        expect(row.available_org_types).toEqual(['college', 'club']);
        expect(row.sport_associations).toEqual(['soccer']);
        for (const col of ['label', 'description', 'short_description', 'what_it_measures', 'why_it_matters']) {
          expect(row[col]).toBeTruthy();
          expect(row[col]).not.toBe('rsi text');
        }
        expect(row.description).toMatch(/10\/5/);
      }
    });
  });

  // Columns that are NULL on purpose for an entered, migration-seeded metric
  const NULL_ON_PURPOSE = new Set([
    'formula', 'dependent_metrics', 'calculation_config', 'auxiliary_input_config', 'created_by', 'updated_at',
  ]);

  it('fills every column except those that are NULL on purpose', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const rows = await metricRows(tx);
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        const empty = Object.keys(row).filter((c) => row[c] === null && !NULL_ON_PURPOSE.has(c));
        expect(empty, `${row.code} has empty columns`).toEqual([]);
        expect(row.is_derived).toBe(false);
      }
      const byCode = Object.fromEntries(rows.map((r: any) => [r.code, r]));
      expect(byCode.RSI_105_HEIGHT.icon).toBe('TrendingUp');
      expect(byCode.RSI_105_GCT.icon).toBe('Timer');
      expect(byCode.RSI_105_HEIGHT.display_order).toBe(72);
      expect(byCode.RSI_105_GCT.display_order).toBe(73);
    });
  });

  it('still fills color and sports when the RSI_105 row has none, and keeps NULL org types (all org types)', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx`UPDATE site_metrics SET color = NULL, sport_associations = NULL, available_org_types = NULL WHERE code = 'RSI_105'`;
      await tx.unsafe(UP);
      for (const row of await metricRows(tx)) {
        expect(row.color).toBe('orange');
        expect(row.sport_associations).toEqual(['Soccer']);
        expect(row.available_org_types).toBeNull();
      }
    });
  });

  it('enables both codes only for organizations that enable RSI_105', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const orgs = await tx`SELECT organization_id, metric_code FROM organization_metrics WHERE metric_code LIKE 'RSI_105\_%' ORDER BY 2, 1`;
      expect(orgs.map((o: any) => [o.metric_code, o.organization_id])).toEqual([
        ['RSI_105_GCT', 'org-on'],
        ['RSI_105_HEIGHT', 'org-on'],
      ]);
    });
  });

  it('is skipped, not guessed, when RSI_105 does not exist', async () => {
    await rollbackable(async (tx) => {
      await clear(tx);
      await tx.unsafe(UP);
      expect(await metricRows(tx)).toHaveLength(0);
    });
  });

  it('never modifies an existing row and a second run adds nothing', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, display_order, is_system_default, is_active)
               VALUES ('RSI_105_GCT', 'Admin label', 'Power', 'ms', 'lower_is_better', 5, false, true)`;
      await tx.unsafe(UP);
      const first = await metricRows(tx);
      expect(first.find((r: any) => r.code === 'RSI_105_GCT')).toMatchObject({ label: 'Admin label', unit: 'ms' });
      await tx.unsafe(UP);
      expect(await metricRows(tx)).toHaveLength(2);
    });
  });

  it('down removes both codes and their org rows, and leaves RSI_105 alone', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      await tx.unsafe(DOWN);
      expect(await metricRows(tx)).toHaveLength(0);
      expect(await tx`SELECT 1 FROM organization_metrics WHERE metric_code IN ${tx(CODES)}`).toHaveLength(0);
      expect(await tx`SELECT 1 FROM site_metrics WHERE code = 'RSI_105'`).toHaveLength(1);
      expect(await tx`SELECT 1 FROM organization_metrics WHERE metric_code = 'RSI_105'`).toHaveLength(2);
    });
  });

  it.each([
    ['a report template', 'RSI_105_HEIGHT', (tx: any, code: string) =>
      tx`INSERT INTO report_templates (organization_id, name, metrics) VALUES ('org-on', 'T', ${tx.json([code])})`],
    ['a saved report', 'RSI_105_GCT', (tx: any, code: string) =>
      tx`INSERT INTO reports (organization_id, name, report_type, config) VALUES ('org-on', 'R', 'custom', ${tx.json({ metrics: [code] })})`],
  ])('down refuses while %s names one of the codes', async (_label, code, insertRef) => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      await insertRef(tx, code);
      await expect(tx.unsafe(DOWN)).rejects.toThrow(/refused|refusing/i);
    });
  });

  it('down does not trip on a report that only names RSI_105 itself', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      await tx`INSERT INTO report_templates (organization_id, name, metrics) VALUES ('org-on', 'T', ${tx.json(['RSI_105'])})`;
      await tx.unsafe(DOWN);
      expect(await metricRows(tx)).toHaveLength(0);
    });
  });

  it('down refuses while a measurement uses one of the codes', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      await tx`INSERT INTO measurements (user_id, metric, value, units, date, age, submitted_by)
               VALUES ('u1', 'RSI_105_HEIGHT', 15.4, 'in', now(), 16, 'u1')`;
      await expect(tx.unsafe(DOWN)).rejects.toThrow(/refused/i);
    });
  });
});
