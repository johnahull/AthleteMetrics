/**
 * Migration 0153 (AM-FEAT-019 P2): eval battery templates and org eval report settings.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { resolveTemplateKey, isLogicalKey } from '../../packages/api/services/eval-report/template-keys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0153_add_eval_report_templates.sql');
const DOWN = read('0153_add_eval_report_templates_down.sql');

const SEED_NAME = 'Soccer eval (yards)';
const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0153: static analysis', () => {
  it('is idempotent in form', () => {
    expect(UP.match(/CREATE TABLE/g)).toHaveLength(2);
    expect(UP.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(2);
    for (const m of UP.match(/CREATE (UNIQUE )?INDEX[^\n]*/g) ?? []) expect(m).toContain('IF NOT EXISTS');
    expect(UP).toMatch(/WHERE NOT EXISTS/);
  });
  it('uses varchar(36) ids with gen_random_uuid() and never derives an id', () => {
    expect(UP).toMatch(/id VARCHAR\(36\) PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    expect(UP).not.toMatch(/\bid\b[^\n]*\|\|/); // the only || is the NOTICE text
  });
  it('seeds only logical keys whose code matches the key map, and no derived metric', () => {
    const rows = [...UP.matchAll(/^\s*\('([A-Z0-9_]+)',\s*'([A-Z0-9_]+)',\s*(true|false),\s*(\d+)\)/gm)];
    expect(rows.length).toBeGreaterThan(30);
    for (const [, key, code] of rows) {
      expect(isLogicalKey(key), key).toBe(true);
      expect(resolveTemplateKey(key), key).toBe(code);
    }
    const codes = rows.map((r) => r[2]);
    // No guessed codes: every seeded code is created by some other migration (RSI_105 and JUMP_CMJ_SL_L/R by 0156),
    // except these, which are allowed because they were named codes that would exist later (MOMENTUM from AM-FEAT-018)
    // or are canonical codes created outside migrations (HEIGHT_IN, WEIGHT_LBS exist on staging and production).
    const ALLOWED_WITHOUT_MIGRATION = ['MOMENTUM', 'HEIGHT_IN', 'WEIGHT_LBS'];
    const otherMigrations = fs
      .readdirSync(path.resolve(__dirname, '../../migrations'))
      .filter((f) => f.endsWith('.sql') && !f.startsWith('0153_'))
      .map((f) => read(f))
      .join('\n');
    for (const c of codes) {
      if (ALLOWED_WITHOUT_MIGRATION.includes(c)) continue;
      expect(otherMigrations, `${c} is created by no migration`).toContain(`'${c}'`);
    }
    for (const guessed of ['RSI_105_GCT', 'RSI_105_FLIGHT', 'SITTING_HEIGHT']) expect(codes).not.toContain(guessed);
    for (const banned of ['HEIGHT', 'WEIGHT', 'AGILITY_505_YD', 'AGILITY_505_YD_LSI', 'MQI_TOTAL', 'MQ_TRANSITION_TOTAL', 'RSI', 'SQUAT_1RM_KG']) {
      expect(codes, banned).not.toContain(banned);
    }
    const required = (c: string) => rows.find((r) => r[2] === c)?.[3] === 'true';
    for (const c of ['HEIGHT_IN', 'WEIGHT_LBS', 'JUMP_SJ_HEIGHT', 'JUMP_CMJ_HOH', 'VERTICAL_JUMP', 'RSI_105', 'DASH_40YD', 'FLY10_TIME', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'MQ_LIN_ACCEL', 'MQ_TRANS_LAT_LINEAR']) {
      expect(required(c), c).toBe(true);
    }
    for (const c of ['RSI_L', 'RSI_R', 'JUMP_CMJ_SL_L', 'JUMP_CMJ_SL_R', 'SQUAT_1RM', 'BENCH_1RM', 'DEADLIFT_1RM', 'OHP_1RM', 'MOMENTUM']) {
      expect(rows.find((r) => r[2] === c)?.[3], c).toBe('false');
    }
  });

  it('creates the partial eval lookup index on reports idempotently and drops it on down', () => {
    expect(UP).toMatch(/CREATE INDEX IF NOT EXISTS reports_eval_athlete_event_idx\s+ON reports \(\(config->>'athleteId'\), \(config->>'eventId'\)\)\s+WHERE report_type = 'eval'/);
    expect(DOWN).toMatch(/DROP INDEX IF EXISTS reports_eval_athlete_event_idx/);
  });

  it('seed joins site_metrics so a missing code is skipped, and down refuses to drop user data', () => {
    expect(UP).toMatch(/JOIN site_metrics sm ON sm\.code = b\.code/);
    expect(DOWN).toMatch(/RAISE EXCEPTION/);
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0153_add_eval_report_templates'/);
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0153: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  const notices: string[] = [];
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1, onnotice: (n) => notices.push(String(n.message)) });
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

  // CI builds its DB with db:push and the default seed only, so most codes the seed names do not exist there.
  // Create the missing ones inside the rolled-back transaction so the checks do not depend on manual migrations.
  const SEED_CODES = [...new Set([...UP.matchAll(/^\s*\('([A-Z0-9_]+)',\s*'([A-Z0-9_]+)',\s*(?:true|false),\s*\d+\)/gm)].map((r) => r[2]))];
  // RSI_105 stays absent, as it is when 0153 runs (0156 creates it later), so the seed skips it.
  const ensureSeedCodes = async (tx: any) => {
    await tx`DELETE FROM site_metrics WHERE code = 'RSI_105'`;
    for (const code of SEED_CODES.filter((c) => c !== 'RSI_105')) {
      await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type) VALUES (${code}, ${code}, 'speed', 's', 'lower_is_better') ON CONFLICT (code) DO NOTHING`;
    }
  };

  // Back to the pre-0153 state inside the rolled-back transaction, whatever other files left behind.
  const resetToPre = async (tx: any) => {
    await ensureSeedCodes(tx);
    if ((await tx`SELECT to_regclass('eval_battery_templates') AS t`)[0].t) {
      await tx`DELETE FROM eval_battery_templates WHERE organization_id IS NOT NULL`;
      await tx`DELETE FROM org_eval_report_settings`;
    }
    await tx.unsafe(DOWN);
  };

  const seed = async (tx: any) =>
    (await tx`SELECT * FROM eval_battery_templates WHERE organization_id IS NULL AND name = ${SEED_NAME}`)[0];

  it('applies, is idempotent, seeds one global template whose keys all resolve to real codes', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      await tx.unsafe(UP);
      await tx.unsafe(UP);

      const rows = await tx`SELECT * FROM eval_battery_templates WHERE organization_id IS NULL`;
      expect(rows).toHaveLength(1);
      const t = rows[0];
      expect(t.sport).toBe('SOCCER');
      expect(t.id).toHaveLength(36);
      expect(t.archived_at).toBeNull();

      const metrics = t.metrics as Array<{ metricKey: string; isRequired: boolean; displayOrder: number }>;
      expect(metrics.length).toBeGreaterThan(0);
      const codes = metrics.map((m) => resolveTemplateKey(m.metricKey));
      const existing = await tx`SELECT code FROM site_metrics WHERE code = ANY(${codes})`;
      expect(existing.map((r: any) => r.code).sort()).toEqual([...codes].sort());
      expect(new Set(metrics.map((m) => m.metricKey)).size).toBe(metrics.length);
      expect(metrics.some((m) => m.isRequired)).toBe(true);
      expect(metrics.some((m) => !m.isRequired)).toBe(true);
      // yard protocol only
      expect(codes.filter((c) => c.startsWith('AGILITY_505'))).toEqual(
        expect.arrayContaining(['AGILITY_505_YD_L', 'AGILITY_505_YD_R']),
      );
      expect(codes.some((c) => /_M(_|$)/.test(c) && c.startsWith('AGILITY'))).toBe(false);
      // required first-class tests are there, derived totals are not
      expect(codes).toEqual(expect.arrayContaining(['JUMP_SJ_HEIGHT', 'JUMP_CMJ_HOH', 'VERTICAL_JUMP', 'DASH_40YD', 'FLY10_TIME', 'MQ_LIN_ACCEL']));
      expect(codes).not.toContain('MQI_TOTAL');
      expect(codes).not.toContain('AGILITY_505_YD_LSI');
      const derived = await tx`SELECT code FROM site_metrics WHERE code = ANY(${codes}) AND is_derived = true`;
      expect(derived).toHaveLength(0);
      const fly = metrics.find((m) => resolveTemplateKey(m.metricKey) === 'FLY10_TIME');
      expect(fly?.isRequired).toBe(true);
    });
  });

  it('seeds body height and weight as required metrics under their real codes', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      await tx.unsafe(UP);
      const metrics = (await seed(tx)).metrics as Array<{ metricKey: string; isRequired: boolean }>;
      for (const [key, code] of [['BODY_HEIGHT', 'HEIGHT_IN'], ['BODY_WEIGHT', 'WEIGHT_LBS']]) {
        expect(metrics.find((m) => m.metricKey === key)?.isRequired, key).toBe(true);
        expect(resolveTemplateKey(key)).toBe(code);
      }
    });
  });

  it('does not seed a metric whose site_metrics row is inactive, and the NOTICE names it', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      await tx`UPDATE site_metrics SET is_active = false WHERE code = 'DASH_40YD'`;
      notices.length = 0;
      await tx.unsafe(UP);
      const keys = ((await seed(tx)).metrics as Array<{ metricKey: string }>).map((m) => m.metricKey);
      expect(keys).not.toContain('DASH_40');
      expect(keys).toContain('DASH_30');
      expect(notices.find((n) => n.includes('Migration 0153 complete')) ?? '').toContain('DASH_40 (DASH_40YD)');
    });
  });

  it('creates reports_eval_athlete_event_idx on up and removes it on down', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      const idx = () => tx`SELECT indexdef FROM pg_indexes WHERE tablename = 'reports' AND indexname = 'reports_eval_athlete_event_idx'`;
      expect(await idx()).toHaveLength(0);
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      const [row] = await idx();
      expect(row.indexdef).toContain("config ->> 'athleteId'");
      expect(row.indexdef).toContain("config ->> 'eventId'");
      expect(row.indexdef).toContain("report_type)::text = 'eval'");
      await tx.unsafe(DOWN);
      expect(await idx()).toHaveLength(0);
    });
  });

  it('skips site_metrics codes that do not exist, without error', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      await tx`DELETE FROM site_metrics WHERE code = ANY(${['MQ_LIN_ACCEL', 'SQUAT_1RM', 'WEIGHT_LBS']})`;
      await tx.unsafe(UP);
      const keys = ((await seed(tx)).metrics as Array<{ metricKey: string }>).map((m) => m.metricKey);
      expect(keys).not.toContain('PATTERN_LIN_ACCEL');
      expect(keys).not.toContain('STRENGTH_SQUAT');
      expect(keys).not.toContain('BODY_WEIGHT');
      expect(keys).toContain('DASH_10');
    });
  });

  it('NOTICE names every skipped key', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      await tx`DELETE FROM site_metrics WHERE code = ANY(${['SQUAT_1RM', 'WEIGHT_LBS']})`;
      notices.length = 0;
      await tx.unsafe(UP);
      const msg = notices.find((n) => n.includes('Migration 0153 complete')) ?? '';
      for (const k of ['STRENGTH_SQUAT', 'BODY_WEIGHT', 'RSI_BILATERAL']) expect(msg, k).toContain(k);
      expect(msg).toContain('ground contact time, flight time, sitting height, RSI_105 (bilateral 10/5), momentum');
      expect(msg).not.toContain('DASH_10 ');
    });
  });

  it('does not create the template, and does not fail, when no code exists', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      await tx`DELETE FROM site_metrics`;
      await tx.unsafe(UP);
      expect(await seed(tx)).toBeUndefined();
    });
  });

  it('does not overwrite an edited seed template on re-apply', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      await tx.unsafe(UP);
      await tx`UPDATE eval_battery_templates SET description = 'edited' WHERE organization_id IS NULL`;
      await tx.unsafe(UP);
      expect((await seed(tx)).description).toBe('edited');
    });
  });

  it('does not insert a second global copy when the seed template is archived (renumbered rerun)', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      await tx.unsafe(UP);
      await tx`UPDATE eval_battery_templates SET archived_at = NOW() WHERE organization_id IS NULL`;
      await tx.unsafe(UP);
      expect(await tx`SELECT 1 FROM eval_battery_templates WHERE organization_id IS NULL AND name = ${SEED_NAME}`).toHaveLength(1);
    });
  });

  it('enforces name uniqueness per organization and for the global set, but not across archived rows', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      await tx.unsafe(UP);
      const [org] = await tx`INSERT INTO organizations (name) VALUES ('mig0153-org') RETURNING id`;
      expect(org.id).toHaveLength(36);
      const ins = (orgId: string | null, name: string) =>
        tx`INSERT INTO eval_battery_templates (organization_id, sport, name, metrics) VALUES (${orgId}, 'SOCCER', ${name}, '[]'::jsonb)`;
      await ins(org.id, 'dup');
      await expect(tx.savepoint((s: any) => s`INSERT INTO eval_battery_templates (organization_id, sport, name, metrics) VALUES (${org.id}, 'SOCCER', 'dup', '[]'::jsonb)`)).rejects.toThrow();
      await expect(tx.savepoint((s: any) => s`INSERT INTO eval_battery_templates (organization_id, sport, name, metrics) VALUES (NULL, 'SOCCER', ${SEED_NAME}, '[]'::jsonb)`)).rejects.toThrow();
      await tx`UPDATE eval_battery_templates SET archived_at = NOW() WHERE organization_id = ${org.id}`;
      await ins(org.id, 'dup');
    });
  });

  it('settings are unique per organization and cascade with it; columns are varchar(36)', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      await tx.unsafe(UP);
      const [org] = await tx`INSERT INTO organizations (name) VALUES ('mig0153-settings') RETURNING id`;
      await tx`INSERT INTO org_eval_report_settings (organization_id) VALUES (${org.id})`;
      await expect(tx.savepoint((s: any) => s`INSERT INTO org_eval_report_settings (organization_id) VALUES (${org.id})`)).rejects.toThrow();
      const cols = await tx`SELECT table_name, column_name, character_maximum_length FROM information_schema.columns
        WHERE table_name IN ('eval_battery_templates','org_eval_report_settings') AND column_name IN ('id','organization_id')`;
      for (const c of cols) expect(c.character_maximum_length, `${c.table_name}.${c.column_name}`).toBe(36);
      await tx`DELETE FROM organizations WHERE id = ${org.id}`;
      expect(await tx`SELECT 1 FROM org_eval_report_settings`).toHaveLength(0);
    });
  });

  it('down removes both tables, refuses while org data exists, and re-up works', async () => {
    await rollbackable(async (tx) => {
      await resetToPre(tx);
      await tx.unsafe(UP);
      const [org] = await tx`INSERT INTO organizations (name) VALUES ('mig0153-down') RETURNING id`;
      await tx`INSERT INTO org_eval_report_settings (organization_id) VALUES (${org.id})`;
      await expect(tx.savepoint((s: any) => s.unsafe(DOWN))).rejects.toThrow(/refused/);
      await tx`DELETE FROM org_eval_report_settings`;
      await tx.unsafe(DOWN);
      await tx.unsafe(DOWN);
      const gone = await tx`SELECT to_regclass('eval_battery_templates') AS a, to_regclass('org_eval_report_settings') AS b`;
      expect(gone[0].a).toBeNull();
      expect(gone[0].b).toBeNull();
      await tx.unsafe(UP);
      expect(await seed(tx)).toBeDefined();
    });
  });
});
