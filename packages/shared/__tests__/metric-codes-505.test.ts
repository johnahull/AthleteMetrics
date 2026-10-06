import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { VALID_METRICS, MetricType } from '../schema/constants';
import { LOWER_IS_BETTER_METRICS } from '../analytics-types';
import { COMMON_METRICS } from '../import-types';

const RETIRED = ['AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'];
const M_YD_CODES = [
  'AGILITY_505_M',
  'AGILITY_505_YD',
  'AGILITY_505_M_L',
  'AGILITY_505_M_R',
  'AGILITY_505_YD_L',
  'AGILITY_505_YD_R',
];
const DEFICIT_CODES = ['AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD'];

describe('AM-FEAT-016 metric codes', () => {
  const validKeys = VALID_METRICS.map((m) => m.key as string);

  it('VALID_METRICS holds the m/yd 5-0-5 codes and the deficit codes as lower_is_better', () => {
    for (const code of [...M_YD_CODES, ...DEFICIT_CODES]) {
      const entry = VALID_METRICS.find((m) => m.key === code);
      expect(entry, code).toBeDefined();
      expect(entry!.metricType).toBe('lower_is_better');
    }
  });

  it('VALID_METRICS and MetricType no longer contain the retired codes', () => {
    for (const code of RETIRED) {
      expect(validKeys).not.toContain(code);
      expect(Object.keys(MetricType)).not.toContain(code);
    }
  });

  it('MetricType exposes the deficit codes', () => {
    expect((MetricType as Record<string, string>).AGILITY_COD_DEFICIT_M).toBe('AGILITY_COD_DEFICIT_M');
    expect((MetricType as Record<string, string>).AGILITY_COD_DEFICIT_YD).toBe('AGILITY_COD_DEFICIT_YD');
  });

  it('LOWER_IS_BETTER_METRICS has AGILITY_505_M/_YD and the deficit codes, not the retired code', () => {
    const list = LOWER_IS_BETTER_METRICS as readonly string[];
    for (const code of ['AGILITY_505_M', 'AGILITY_505_YD', ...DEFICIT_CODES]) {
      expect(list).toContain(code);
    }
    for (const code of RETIRED) expect(list).not.toContain(code);
  });

  it('COMMON_METRICS points at the yard code (Q4)', () => {
    const list = COMMON_METRICS as readonly string[];
    expect(list).toContain('AGILITY_505_YD');
    expect(list).not.toContain('AGILITY_505');
  });
});

/**
 * Paths owned by a later step (OCR protocol choice, plan Step 4). They may keep the
 * retired/neutral token until that step lands; remove entries from here then.
 */
export const OCR_STEP_ALLOWLIST = [
  'packages/api/ocr/',
  'packages/shared/ocr-types.ts',
  'packages/api/routes/import-export-routes.ts', // photo import route
];

/**
 * Executable repo guard: the retired exact tokens must not remain in source.
 * Word-bounded: underscore is a word character, so \bAGILITY_505\b does NOT hit
 * AGILITY_505_M or AGILITY_505_YD_L.
 */
describe('repo guard: retired 5-0-5 tokens', () => {
  const root = path.resolve(__dirname, '../../..');
  const retiredRegex = /\bAGILITY_505(?:_L|_R|_LSI)?\b/;
  const SCAN_ROOTS = ['packages', 'scripts', 'tests/e2e/fixtures', 'CLAUDE.md'];
  const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', 'migrations', '.git', 'coverage']);
  const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|md|csv|sql)$/;

  function walk(rel: string, out: string[]) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      out.push(rel);
      return;
    }
    for (const name of fs.readdirSync(abs)) {
      if (SKIP_DIRS.has(name)) continue;
      walk(path.posix.join(rel, name), out);
    }
  }

  it('regex is word-bounded (does not match the new codes)', () => {
    expect(retiredRegex.test('AGILITY_505_M')).toBe(false);
    expect(retiredRegex.test('AGILITY_505_YD_L')).toBe(false);
    expect(retiredRegex.test('AGILITY_505_M_LSI')).toBe(false);
    expect(retiredRegex.test("'AGILITY_505'")).toBe(true);
    expect(retiredRegex.test('AGILITY_505_LSI,')).toBe(true);
  });

  it('no retired token remains outside migrations, tests, docs and the OCR allowlist', () => {
    const files: string[] = [];
    for (const r of SCAN_ROOTS) walk(r, files);
    const offenders: string[] = [];
    for (const f of files) {
      if (!TEXT_EXT.test(f)) continue;
      if (/\.(test|spec)\.[a-z]+$/.test(f)) continue;
      if (OCR_STEP_ALLOWLIST.some((a) => f === a || f.startsWith(a))) continue;
      const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (retiredRegex.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
