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
 * Executable repo guard: the retired exact tokens must not remain anywhere in
 * code, config, scripts or tests, except in the explicit ALLOWLIST below.
 * Word-bounded and case-insensitive. Underscore is a word character, so
 * \bAGILITY_505\b does NOT hit AGILITY_505_M, AGILITY_505_YD_L or AGILITY_505_UNRESOLVED.
 */
describe('repo guard: retired 5-0-5 tokens', () => {
  const root = path.resolve(__dirname, '../../..');
  const retiredRegex = /\bAGILITY_505(?:_L|_R|_LSI)?\b/i;
  const SCAN_ROOTS = ['packages', 'scripts', 'tests', '.github'];
  // Not scanned: dependencies/build output, SQL history, screenshots, and tests/migrations
  // (which legitimately reference the historical codes). docs/, .claude/ and specs/ are prose history.
  const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'migrations', 'screenshots', '.git']);
  const SKIP_PATHS = new Set(['tests/migrations']);
  const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|md|csv|sql|yml|yaml|sh|html)$/;

  // Files that intentionally name a retired code (negative assertions, "never emits" checks).
  const ALLOWLIST: Record<string, string> = {
    'packages/shared/__tests__/metric-codes-505.test.ts': 'this guard: RETIRED list and regex self-checks',
    'packages/api/services/parsers/__tests__/dashr-csv-parser.test.ts': 'asserts the parser never emits the retired codes',
    'packages/api/routes/__tests__/benchmark-analytics-metric-codes.test.ts': 'asserts the API rejects the retired code with 400',
    'packages/api/ocr/processors/__tests__/data-parser.test.ts': 'asserts OCR metric lists no longer contain the retired code',
    'packages/api/services/__tests__/lower-is-better-sql-codes.test.ts': 'asserts the SQL lower-is-better list dropped the retired code',
    'packages/api/services/__tests__/template-generator-sample-values.test.ts': 'asserts no sample value exists for the retired code',
    'packages/api/services/__tests__/achievement-service.test.ts': 'asserts the retired code does not count toward the all-around PR',
    'packages/web/src/__tests__/utils/metric-education-utils.test.ts': 'asserts the retired education entry is gone',
  };

  function walk(rel: string, out: string[]) {
    if (SKIP_PATHS.has(rel)) return;
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isFile()) {
      out.push(rel);
      return;
    }
    for (const name of fs.readdirSync(abs)) {
      if (SKIP_DIRS.has(name)) continue;
      walk(path.posix.join(rel, name), out);
    }
  }

  // Root-level config/script files (non-recursive); root prose .md files other than CLAUDE.md are skipped.
  function rootFiles(): string[] {
    return fs
      .readdirSync(root)
      .filter((n) => fs.statSync(path.join(root, n)).isFile())
      .filter((n) => !n.endsWith('.md') || n === 'CLAUDE.md');
  }

  function collect(): string[] {
    const files: string[] = [];
    for (const r of SCAN_ROOTS) walk(r, files);
    files.push(...rootFiles());
    return files.filter((f) => TEXT_EXT.test(f));
  }

  it('regex is word-bounded and case-insensitive (does not match the new codes)', () => {
    for (const ok of [
      'AGILITY_505_M',
      'AGILITY_505_M_L',
      'AGILITY_505_M_R',
      'AGILITY_505_YD',
      'AGILITY_505_YD_L',
      'AGILITY_505_YD_R',
      'AGILITY_505_M_LSI',
      'AGILITY_505_YD_LSI',
      'AGILITY_505_UNRESOLVED',
    ]) {
      expect(retiredRegex.test(ok), ok).toBe(false);
    }
    for (const bad of ["'AGILITY_505'", 'AGILITY_505_LSI,', 'agility_505', 'Agility_505_L', 'AGILITY_505_R)']) {
      expect(retiredRegex.test(bad), bad).toBe(true);
    }
  });

  it('walk is not vacuous (canaries)', () => {
    const files = collect();
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('packages/shared/schema/constants.ts');
    expect(files.some((f) => f.startsWith('tests/'))).toBe(true);
    expect(files.some((f) => f.startsWith('packages/web/'))).toBe(true);
    expect(files.some((f) => f.includes('/__tests__/') && /\.test\.tsx?$/.test(f))).toBe(true);
    expect(files.some((f) => f.startsWith('tests/migrations/'))).toBe(false);
  });

  it('every ALLOWLIST entry exists and still mentions a retired code', () => {
    for (const f of Object.keys(ALLOWLIST)) {
      const abs = path.join(root, f);
      expect(fs.existsSync(abs), `${f} missing`).toBe(true);
      expect(retiredRegex.test(fs.readFileSync(abs, 'utf8')), f).toBe(true);
    }
  });

  it('no retired token remains outside the allowlist', () => {
    const offenders: string[] = [];
    for (const f of collect()) {
      if (f in ALLOWLIST) continue;
      const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (retiredRegex.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
