import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVAL_METRIC_CODES, metricCode } from '../metric-key-map';

// Codes the spec names that no seed migration creates yet; they stay plain string keys until one does.
const CODES_NOT_YET_IN_MIGRATIONS = ['RSI_105', 'JUMP_CMJ_SL_L', 'JUMP_CMJ_SL_R', 'JUMP_CMJ_SL_ASYM', 'MOMENTUM'];

const migrationsDir = resolve(__dirname, '../../../../../migrations') + '/';
// Only the INSERT INTO site_metrics statements count, not any other mention of a code in a migration.
const siteMetricInserts = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('_down.sql'))
  .flatMap((f) => readFileSync(migrationsDir + f, 'utf8').match(/INSERT INTO\s+"?site_metrics"?[\s\S]*?;[ \t]*$/gim) ?? [])
  .join('\n');
const isSeeded = (code: string) => new RegExp(`\\(\\s*'${code}'\\s*,`).test(siteMetricInserts);

describe('metric-key-map', () => {
  it('maps logical keys to protocol-aware yard codes', () => {
    expect(metricCode('505_LEFT')).toBe('AGILITY_505_YD_L');
    expect(metricCode('505_RIGHT')).toBe('AGILITY_505_YD_R');
    expect(metricCode('505_LSI')).toBe('AGILITY_505_YD_LSI');
    expect(metricCode('505')).toBe('AGILITY_505_YD');
    expect(metricCode('FLY_10')).toBe('FLY10_TIME');
  });

  it('never maps a yard key to a meter code', () => {
    for (const code of Object.values(EVAL_METRIC_CODES)) {
      expect(code).not.toMatch(/_M(_|$)/);
    }
  });

  it('every mapped code exists in the seed migrations, except the documented gaps', () => {
    const missing = Object.values(EVAL_METRIC_CODES).filter((code) => !isSeeded(code));
    expect(missing.sort()).toEqual([...CODES_NOT_YET_IN_MIGRATIONS].sort());
  });
});
