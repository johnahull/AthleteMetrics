import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { FLY10_RUN_IN_YD } from '../fly-run-in';

const root = path.resolve(__dirname, '../../..');
const seed = fs.readFileSync(path.join(root, 'scripts/seed-default-metrics.ts'), 'utf-8');
const migration = fs.readFileSync(path.join(root, 'migrations/0150_add_fly10_run_in_variants.sql'), 'utf-8');

describe('scripts/seed-default-metrics.ts seeds the FLY10 run-in variants consistently with migration 0150', () => {
  const variants = Object.entries(FLY10_RUN_IN_YD).filter(([code]) => code !== 'FLY10_TIME');

  it.each(variants)('%s (%i yd) is seeded with the migration label and description', (code, yd) => {
    const label = `10-Yard Fly, ${yd} yd run-in`;
    expect(migration).toContain(`'${code}'`);
    expect(migration).toContain(`'${label}'`);
    const block = seed.slice(seed.indexOf(`code: '${code}'`));
    expect(seed).toContain(`code: '${code}'`);
    expect(block.slice(0, 700)).toContain(`label: '${label}'`);
    expect(block.slice(0, 700)).toContain(`after a ${yd}-yard run-in`);
    expect(block.slice(0, 700)).toContain("metricType: 'lower_is_better'");
  });

  it('seeds the FLY10_TIME label the migration sets', () => {
    expect(seed).toContain("label: '10-Yard Fly, 20 yd run-in'");
  });
});
