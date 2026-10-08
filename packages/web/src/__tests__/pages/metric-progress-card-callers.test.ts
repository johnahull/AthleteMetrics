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

/**
 * Props text of every `<MetricProgressCard ...>` opening tag: from the tag name to its closing
 * `>` (or `/>`), skipping `>` and `/>` that occur inside JSX `{...}` expressions or strings
 * (e.g. arrow functions `=>`, generics, comparisons).
 */
export function openingTagProps(src: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = src.indexOf('<MetricProgressCard', from);
    if (start === -1) return out;
    let i = start + '<MetricProgressCard'.length;
    let depth = 0;
    let quote: string | null = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== '\\') quote = null;
      } else if (c === '"' || c === "'" || c === '`') {
        quote = c;
      } else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push(src.slice(start, i));
    from = i;
  }
}

describe('openingTagProps', () => {
  it('ignores > and /> inside braces and strings, and detects a missing prop', () => {
    const src = `<MetricProgressCard a={(x) => x > 1} b="/>" metricType={m?.metricType} />
      <MetricProgressCard a={items.map(i => <b />)} />`;
    const tags = openingTagProps(src);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toMatch(/metricType=/);
    expect(tags[1]).not.toMatch(/metricType=/);
  });
});

describe('MetricProgressCard callers', () => {
  const callers = walk(srcRoot).filter(
    (f) => !f.endsWith(path.join('athlete', 'MetricProgressCard.tsx')) && /<MetricProgressCard[\s>]/.test(fs.readFileSync(f, 'utf-8'))
  );

  it('finds the known callers', () => {
    expect(callers.length).toBeGreaterThanOrEqual(3);
  });

  it.each(callers.map((f) => [path.relative(srcRoot, f), f]))('%s passes metricType', (_name, file) => {
    const src = fs.readFileSync(file as string, 'utf-8');
    const tags = openingTagProps(src);
    expect(tags.length).toBeGreaterThan(0);
    for (const props of tags) {
      expect(props).toMatch(/metricType=/);
    }
  });
});
