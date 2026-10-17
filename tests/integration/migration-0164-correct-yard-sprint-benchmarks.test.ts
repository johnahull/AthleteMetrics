/**
 * Migration 0164 (AM-FEAT-022): the women's-soccer 20 / 30 / 40 yd benchmarks are re-sourced from
 * Vescovi 2011 or switched off. Every case runs in a transaction that is rolled back.
 *
 * Each case first writes the PRODUCTION state of the rows (values and descriptions as selected read-only
 * from prod on 2026-10-17, identical to 0129 / 0132) with an upsert on (metric_code, name), so the test is
 * deterministic on a CI-shaped database (db:push + seed, no benchmark rows) and on a migrated one.
 * Ids are 36-char UUIDs and the id column is pinned to varchar(36) like the real database.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { ALL_CODES, CHANGED, OTHER, UNTOUCHED, VAR_NAME, baseline } from '../helpers/yard-sprint-benchmark-fixtures';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UP = fs.readFileSync(path.resolve(__dirname, '../../migrations/0164_correct_yard_sprint_benchmarks.sql'), 'utf-8');
const DOWN = fs.readFileSync(path.resolve(__dirname, '../../migrations/0164_correct_yard_sprint_benchmarks_down.sql'), 'utf-8');

class Rollback extends Error {}

/** Run `fn` in a transaction and always roll it back. */
async function inRolledBackTx(fn: (tx: any) => Promise<void>) {
  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`ALTER TABLE site_benchmarks ALTER COLUMN id TYPE varchar(36)`);
      for (const code of ALL_CODES) {
        await tx.execute(sql`INSERT INTO site_metrics (code, label) VALUES (${code}, 'x') ON CONFLICT (code) DO NOTHING`);
      }
      await baseline(tx);
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

type Snap = Record<string, any>;
const keyOf = (code: string, name: string) => `${code}|${name}`;

async function snapshot(tx: any, keys: { code: string; name: string }[]): Promise<Map<string, Snap>> {
  const out = new Map<string, Snap>();
  for (const k of keys) {
    const r: any = await tx.execute(sql`SELECT to_jsonb(b) AS j FROM site_benchmarks b WHERE metric_code = ${k.code} AND name = ${k.name}`);
    const rows = r.rows ?? r;
    expect(rows).toHaveLength(1);
    out.set(keyOf(k.code, k.name), rows[0].j);
  }
  return out;
}

const changedKeys = CHANGED.map((r) => ({ code: r.code, name: r.name }));
const untouchedKeys = [...UNTOUCHED, ...OTHER].map((r) => ({ code: r.code, name: r.name }));
const row = (m: Map<string, Snap>, code: string, name: string) => m.get(keyOf(code, name))!;

describe('migration 0164: yard sprint benchmark correction', () => {
  it('sets the new values and is_active on the 15 rows', async () => {
    await inRolledBackTx(async (tx) => {
      await tx.execute(sql.raw(UP));
      const after = await snapshot(tx, changedKeys);
      for (const r of CHANGED) {
        const s = row(after, r.code, r.name);
        expect(Number(s.benchmark_value), `${r.code} ${r.name}`).toBe(r.newValue);
        expect(s.is_active, `${r.code} ${r.name}`).toBe(r.newActive);
        if (!r.newDescription) expect(s.description).toBe(r.description);
      }
    });
  });

  it('rewrites each re-sourced description with source, cohort, convention and provisional label', async () => {
    await inRolledBackTx(async (tx) => {
      await tx.execute(sql.raw(UP));
      const after = await snapshot(tx, changedKeys);
      const resourced = CHANGED.filter((r) => r.newDescription);
      expect(resourced).toHaveLength(7);
      for (const r of resourced) {
        const d: string = row(after, r.code, r.name).description;
        for (const part of [
          'Vescovi 2011',
          'Scand J Med Sci Sports 21:670-678',
          'n=113',
          'Brower',
          'upright self-start',
          'first-movement trigger',
          'time = distance / speed',
          'provisional - replace with BTA internal data at N>=30',
        ]) {
          expect(d, `${r.code} ${r.name} lacks "${part}"`).toContain(part);
        }
        expect(d.length).toBeLessThan(1000);
      }
      const d = (code: string, name: string) => row(after, code, name).description as string;
      expect(d('DASH_40YD', 'Soccer D1 Average')).toContain('18-21');
      expect(d('DASH_40YD', 'Soccer D1 Top 25%')).toContain('6.42 m/s');
      expect(d('DASH_40YD', 'HS MS Female Soccer (Ages 11-13) Average')).toContain('12-13');
      expect(d('DASH_40YD', 'HS JV Female Soccer (Ages 14-15) Average')).toContain('14-17');
      expect(d('DASH_40YD', `${VAR_NAME} Average`)).toMatch(/approximate/i);
    });
  });

  it('leaves every other row (10 yd, DII/DIII 20 yd, HS 20/30 yd, fly 10, other sex or sport) byte-identical', async () => {
    await inRolledBackTx(async (tx) => {
      const before = await snapshot(tx, untouchedKeys);
      await tx.execute(sql.raw(UP));
      expect(await snapshot(tx, untouchedKeys)).toEqual(before);
    });
  });

  it('touches no other Female SOCCER yard row than the 15 named', async () => {
    await inRolledBackTx(async (tx) => {
      const listing = async () => {
        const r: any = await tx.execute(sql`
          SELECT to_jsonb(b) AS j FROM site_benchmarks b
           WHERE metric_code IN ('DASH_10YD','DASH_20YD','DASH_30YD','DASH_40YD') ORDER BY metric_code, name`);
        return (r.rows ?? r).map((x: any) => x.j);
      };
      const before = await listing();
      await tx.execute(sql.raw(UP));
      const after = await listing();
      const changed = new Set(changedKeys.map((k) => keyOf(k.code, k.name)));
      const differing = after
        .filter((a: Snap, i: number) => JSON.stringify(a) !== JSON.stringify(before[i]))
        .map((a: Snap) => keyOf(a.metric_code, a.name));
      expect(differing.every((k: string) => changed.has(k))).toBe(true);
      expect(differing.length).toBe(CHANGED.length);
    });
  });

  it('is idempotent', async () => {
    await inRolledBackTx(async (tx) => {
      await tx.execute(sql.raw(UP));
      const once = await snapshot(tx, changedKeys);
      await tx.execute(sql.raw(UP));
      expect(await snapshot(tx, changedKeys)).toEqual(once);
    });
  });

  it('down restores the full prior row of every changed row, and a second down changes nothing', async () => {
    await inRolledBackTx(async (tx) => {
      const before = await snapshot(tx, changedKeys);
      await tx.execute(sql.raw(UP));
      expect(await snapshot(tx, changedKeys)).not.toEqual(before);
      await tx.execute(sql.raw(DOWN));
      expect(await snapshot(tx, changedKeys)).toEqual(before);
      await tx.execute(sql.raw(DOWN));
      expect(await snapshot(tx, changedKeys)).toEqual(before);
    });
  });

  it('up raises when an expected row is missing (a renamed prod row fails loudly)', async () => {
    await inRolledBackTx(async (tx) => {
      await tx.execute(sql`UPDATE site_benchmarks SET name = 'T0164 renamed' WHERE metric_code = 'DASH_40YD' AND name = 'Soccer D1 Average'`);
      await tx.execute(sql`SAVEPOINT s`);
      await expect(tx.execute(sql.raw(UP))).rejects.toThrow(/0164|expected 1 row/i);
      await tx.execute(sql`ROLLBACK TO SAVEPOINT s`);
    });
  });

  it('down raises when an expected row is missing', async () => {
    await inRolledBackTx(async (tx) => {
      await tx.execute(sql`UPDATE site_benchmarks SET name = 'T0164 renamed' WHERE metric_code = 'DASH_30YD' AND name = 'Soccer DII Threshold'`);
      await tx.execute(sql`SAVEPOINT s`);
      await expect(tx.execute(sql.raw(DOWN))).rejects.toThrow(/0164|expected 1 row/i);
      await tx.execute(sql`ROLLBACK TO SAVEPOINT s`);
    });
  });
});
