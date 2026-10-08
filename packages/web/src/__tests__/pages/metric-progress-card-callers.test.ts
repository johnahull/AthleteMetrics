/**
 * Source-level guard: every page that renders <MetricProgressCard> must pass metricType,
 * otherwise tracking metrics (e.g. MOMENTUM, WEIGHT_LBS) show improving/declining trends.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const srcRoot = path.resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(full);
  }
  return out;
}

describe('MetricProgressCard callers', () => {
  const callers = walk(srcRoot).filter(
    (f) => !f.endsWith(path.join('athlete', 'MetricProgressCard.tsx')) && /<MetricProgressCard[\s>]/.test(fs.readFileSync(f, 'utf-8'))
  );

  it('finds the known callers', () => {
    expect(callers.length).toBeGreaterThanOrEqual(3);
  });

  it.each(callers.map((f) => [path.relative(srcRoot, f), f]))('%s passes metricType', (_name, file) => {
    const src = fs.readFileSync(file as string, 'utf-8');
    const usages = src.split('<MetricProgressCard').slice(1);
    for (const u of usages) {
      const props = u.slice(0, u.indexOf('/>'));
      expect(props).toMatch(/metricType=/);
    }
  });
});
