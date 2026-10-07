import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isLowerIsBetterMetric } from '../analytics-types';

describe('5-0-5 lower-is-better direction (exact lookup)', () => {
  it.each([
    'AGILITY_505_M',
    'AGILITY_505_YD',
    'AGILITY_505_M_L',
    'AGILITY_505_M_R',
    'AGILITY_505_YD_L',
    'AGILITY_505_YD_R',
  ])('%s is lower-is-better', (code) => {
    expect(isLowerIsBetterMetric(code)).toBe(true);
  });

  it.each(['AGILITY_505_M_LSI', 'AGILITY_505_YD_LSI'])(
    '%s (a % symmetry index, higher_is_better in site_metrics) is NOT lower-is-better',
    (code) => {
      expect(isLowerIsBetterMetric(code)).toBe(false);
    },
  );
});

describe('web pages use the shared lower-is-better lookup, not local copies', () => {
  const root = path.resolve(__dirname, '../../web/src/pages');
  it.each(['publish.tsx', 'analytics.tsx', 'my-peer-comparison.tsx'])('%s has no hard-coded list', (file) => {
    const src = fs.readFileSync(path.join(root, file), 'utf-8');
    expect(src).not.toMatch(new RegExp(`['"]FLY10_TIME['"],\\s*['"]AGILITY_5`));
    expect(src).toMatch(/isLowerIsBetterMetric/);
  });
});

describe('lower-is-better time codes defined as lower_is_better in site_metrics migrations', () => {
  it.each([
    'AGILITY_5105_L',
    'AGILITY_5105_R',
    'DASH_5YD',
    'DASH_20YD',
    'DASH_30YD',
    'DASH_10M',
    'DASH_20M',
    'DASH_30M',
    'DASH_40M',
    'FLY10M_TIME',
    'AGILITY_COD_DEFICIT_M',
    'AGILITY_COD_DEFICIT_YD',
  ])('%s is lower-is-better', (code) => {
    expect(isLowerIsBetterMetric(code)).toBe(true);
  });
});
