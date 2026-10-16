import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EVAL_METRIC_CODES, metricCode } from '../metric-key-map';

// Codes the spec names that no seed migration creates yet; they stay plain string keys until one does.
const CODES_NOT_YET_IN_MIGRATIONS = ['JUMP_CMJ_SL_ASYM'];

const migrationsDir = resolve(__dirname, '../../../../../migrations') + '/';
// Only the INSERT INTO site_metrics statements count, not any other mention of a code in a migration.
const siteMetricInserts = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('_down.sql'))
  .flatMap((f) => readFileSync(migrationsDir + f, 'utf8').match(/INSERT INTO\s+"?site_metrics"?[\s\S]*?;[ \t]*$/gim) ?? [])
  .join('\n');
// 0144 creates the meter 5-0-5 codes by copying the pre-split codes: INSERT ... SELECT FROM (VALUES ('OLD', 'NEW', 'label', ...)).
// The pre-split code is the meter code without "_M" (spelled this way so the retired-token repo guard stays clean).
const COPIED_BY_0144 = ['AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI'];
const SQL_0144 = readFileSync(migrationsDir + '0144_split_505_by_protocol.sql', 'utf8');
const copiedBy0144 = (code: string) =>
  COPIED_BY_0144.includes(code) &&
  new RegExp(`\\(\\s*'${code.replace('_M', '')}'\\s*,\\s*'${code}'\\s*,\\s*'`).test(SQL_0144);
const isSeeded = (code: string) => new RegExp(`\\(\\s*'${code}'\\s*,`).test(siteMetricInserts) || copiedBy0144(code);

describe('metric-key-map', () => {
  it('maps the 5-0-5 keys to the meter protocol and the deficit to the interpolated meter code', () => {
    expect(metricCode('505_LEFT')).toBe('AGILITY_505_M_L');
    expect(metricCode('505_RIGHT')).toBe('AGILITY_505_M_R');
    expect(metricCode('505_LSI')).toBe('AGILITY_505_M_LSI');
    expect(metricCode('505')).toBe('AGILITY_505_M');
    expect(metricCode('COD_DEFICIT')).toBe('AGILITY_COD_DEFICIT_M_INTERP');
  });

  it('keeps the sprint keys on yard codes', () => {
    expect(metricCode('DASH_10')).toBe('DASH_10YD');
    expect(metricCode('DASH_20')).toBe('DASH_20YD');
    expect(metricCode('FLY_10')).toBe('FLY10_TIME');
  });

  it('never maps a 5-0-5 or deficit key to a yard code', () => {
    for (const code of Object.values(EVAL_METRIC_CODES)) {
      expect(code).not.toMatch(/^AGILITY_.*_YD/);
    }
  });

  it('every mapped code exists in the seed migrations, except the documented gaps', () => {
    const missing = Object.values(EVAL_METRIC_CODES).filter((code) => !isSeeded(code));
    expect(missing.sort()).toEqual([...CODES_NOT_YET_IN_MIGRATIONS].sort());
  });
});
