/**
 * Migration 0148: MQI totals use latest-event source selection (AM-FEAT-015 decision 11).
 * Live-DB test: up is idempotent, down reverts only the two totals, 0146 is untouched.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../packages/api/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const up = read('0148_mqi_latest_event_selection.sql');
const down = read('0148_mqi_latest_event_selection_down.sql');

const stripComments = (s: string) =>
  s
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

const UNRELATED = `TEST_0148_UNRELATED_${Date.now()}`;
const UNRELATED_CONFIG = { dateMatchStrategy: 'latest_before', missingSourceBehavior: 'skip' };

const config = async (code: string) => {
  const rows: any = await db.execute(sql`SELECT calculation_config FROM site_metrics WHERE code = ${code}`);
  return (rows.rows ?? rows)[0]?.calculation_config;
};

describe('0148_mqi_latest_event_selection', () => {
  beforeAll(async () => {
    await db.execute(sql.raw(read('0146_seed_mqi_metrics.sql')));
    await db.execute(sql`
      INSERT INTO site_metrics (code, label, category, unit, metric_type, is_active, is_derived, formula, dependent_metrics, calculation_config)
      VALUES (${UNRELATED}, 'Unrelated derived', 'test', 'in', 'higher_is_better', true, true, 'VERTICAL_JUMP * 2',
              ARRAY['VERTICAL_JUMP'], ${JSON.stringify(UNRELATED_CONFIG)}::jsonb)
    `);
  });
  afterAll(async () => {
    await db.execute(sql`DELETE FROM site_metrics WHERE code = ${UNRELATED}`);
    await db.execute(sql.raw(up));
  });

  it('does not edit 0146 (0146 never sets sourceSelection itself)', () => {
    expect(stripComments(read('0146_seed_mqi_metrics.sql'))).not.toMatch(/sourceSelection/);
  });

  it('re-applying 0146 after 0148 keeps latest-event selection (0146 merges calculation_config)', async () => {
    await db.execute(sql.raw(up));
    await db.execute(sql.raw(read('0146_seed_mqi_metrics.sql')));
    for (const code of ['MQI_TOTAL', 'MQ_TRANSITION_TOTAL']) {
      expect((await config(code)).sourceSelection).toBe('latest_event');
    }
  });

  it('up sets sourceSelection on both totals, keeps existing keys, and is idempotent', async () => {
    await db.execute(sql.raw(up));
    await db.execute(sql.raw(up));
    for (const code of ['MQI_TOTAL', 'MQ_TRANSITION_TOTAL']) {
      const cfg = await config(code);
      expect(cfg.sourceSelection).toBe('latest_event');
      expect(cfg.dateMatchStrategy).toBe('same_date');
      expect(cfg.missingSourceBehavior).toBe('skip');
    }
  });

  it('does not touch base metrics or unrelated derived metrics', async () => {
    await db.execute(sql.raw(up));
    const base = await config('MQ_JUMP');
    expect(base?.sourceSelection).toBeUndefined();
    expect(await config(UNRELATED)).toEqual(UNRELATED_CONFIG);
    await db.execute(sql.raw(down));
    expect(await config(UNRELATED)).toEqual(UNRELATED_CONFIG);
  });

  it('down removes the key and is idempotent', async () => {
    await db.execute(sql.raw(up));
    await db.execute(sql.raw(down));
    await db.execute(sql.raw(down));
    for (const code of ['MQI_TOTAL', 'MQ_TRANSITION_TOTAL']) {
      const cfg = await config(code);
      expect(cfg.sourceSelection).toBeUndefined();
      expect(cfg.dateMatchStrategy).toBe('same_date');
    }
  });
});
