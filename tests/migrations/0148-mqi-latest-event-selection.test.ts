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

const config = async (code: string) => {
  const rows: any = await db.execute(sql`SELECT calculation_config FROM site_metrics WHERE code = ${code}`);
  return (rows.rows ?? rows)[0]?.calculation_config;
};

describe('0148_mqi_latest_event_selection', () => {
  beforeAll(async () => {
    await db.execute(sql.raw(read('0146_seed_mqi_metrics.sql')));
  });
  afterAll(async () => {
    await db.execute(sql.raw(up));
  });

  it('does not edit 0146 (no sourceSelection there)', () => {
    expect(read('0146_seed_mqi_metrics.sql')).not.toContain('sourceSelection');
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
