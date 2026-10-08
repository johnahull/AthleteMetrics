/**
 * Migration 0151: yard 5-0-5 benchmark copies carry wording that matches their yard value.
 *
 * 0144 copied the metric benchmark description verbatim into the yard twin, so a row
 * with value 2.450 could say "< 2.68s". 0151 rewrites those descriptions (and 0151_down
 * restores them). Every case runs inside a transaction that is rolled back, so the
 * database is left untouched. Ids are 36-char UUIDs and the id column is pinned to
 * varchar(36) like the real database (a push-built database has an unbounded varchar).
 * Works on a CI-shaped database (db:push + seed script: AGILITY_505_YD exists, 0144 not
 * applied) and on a migration-built one (0144 already inserted yard benchmarks).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UP = fs.readFileSync(path.resolve(__dirname, '../../migrations/0151_rewrite_yard_benchmark_descriptions.sql'), 'utf-8');
const DOWN = fs.readFileSync(path.resolve(__dirname, '../../migrations/0151_rewrite_yard_benchmark_descriptions_down.sql'), 'utf-8');

const PREFIX = 'Approximate: converted from metric-protocol research (x0.914); recalibrate with BTA data.';

class Rollback extends Error {}

/** Run `fn` in a transaction and always roll it back. */
async function inRolledBackTx(fn: (tx: any) => Promise<void>) {
  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`ALTER TABLE site_benchmarks ALTER COLUMN id TYPE varchar(36)`);
      // A CI-shaped database (seed script) only has the _M and _YD codes; the FK needs the rest.
      await tx.execute(sql`
        INSERT INTO site_metrics (code, label)
        VALUES ('AGILITY_505_M', 'x'), ('AGILITY_505_YD', 'x'), ('AGILITY_505_YD_L', 'x'),
               ('AGILITY_505_YD_R', 'x'), ('AGILITY_505_YD_LSI', 'x')
        ON CONFLICT (code) DO NOTHING`);
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

async function seed(
  tx: any,
  row: { code: string; name: string; op: string; value?: number; min?: number; max?: number; description: string | null },
) {
  const id = randomUUID();
  const { code, name, op, value = null, min = null, max = null, description } = row as any;
  await tx.execute(sql`
    INSERT INTO site_benchmarks (id, metric_code, name, description, comparison_operator, benchmark_value, min_value, max_value, is_system_default, is_active)
    VALUES (${id}, ${code}, ${name}, ${description}, ${op}, ${value}, ${min}, ${max}, true, true)`);
  return id;
}

async function descriptionOf(tx: any, id: string): Promise<string | null> {
  const r: any = await tx.execute(sql`SELECT description FROM site_benchmarks WHERE id = ${id}`);
  return (r.rows ?? r)[0].description;
}

describe('migration 0151: yard benchmark description wording', () => {
  it('rewrites a copied row so the text agrees with the yard value, keeping the metric note labelled', async () => {
    await inRolledBackTx(async (tx) => {
      const id = await seed(tx, {
        code: 'AGILITY_505_YD', name: 'T0151 DII (Yard, approx.)', op: 'lte', value: 2.45,
        description: `${PREFIX} < 2.68s. Jones 2018 (D2 mean 2.64-2.68s). ICC 0.99`,
      });
      await tx.execute(sql.raw(UP));
      const d = await descriptionOf(tx, id);
      expect(d).toBe(
        'Approximate yard-protocol threshold of ≤ 2.450 s, converted from metric-protocol research (x0.914); recalibrate with BTA data.' +
          ' Metric-protocol source note (times in seconds, not converted): < 2.68s. Jones 2018 (D2 mean 2.64-2.68s). ICC 0.99',
      );
    });
  });

  it('handles gte, eq, range and no-note rows, and the _L / _R twins', async () => {
    await inRolledBackTx(async (tx) => {
      const gte = await seed(tx, { code: 'AGILITY_505_YD_L', name: 'T0151 gte', op: 'gte', value: 3.1, description: `${PREFIX} note` });
      const range = await seed(tx, { code: 'AGILITY_505_YD_R', name: 'T0151 range', op: 'range', min: 2.1, max: 2.4, description: PREFIX });
      await tx.execute(sql.raw(UP));
      expect(await descriptionOf(tx, gte)).toContain('threshold of ≥ 3.100 s,');
      expect(await descriptionOf(tx, gte)).toContain('not converted): note');
      const r = await descriptionOf(tx, range);
      expect(r).toBe(
        'Approximate yard-protocol range of 2.100 to 2.400 s, converted from metric-protocol research (x0.914); recalibrate with BTA data.',
      );
      expect(r).not.toContain('source note');
    });
  });

  it('leaves admin-edited text, other metrics and the unitless LSI tiers alone', async () => {
    await inRolledBackTx(async (tx) => {
      const edited = await seed(tx, { code: 'AGILITY_505_YD', name: 'T0151 edited', op: 'lte', value: 2.4, description: 'Recalibrated by BTA.' });
      const nul = await seed(tx, { code: 'AGILITY_505_YD', name: 'T0151 null', op: 'lte', value: 2.4, description: null });
      const metric = await seed(tx, { code: 'AGILITY_505_M', name: 'T0151 metric', op: 'lte', value: 2.68, description: `${PREFIX} x` });
      const lsi = await seed(tx, { code: 'AGILITY_505_YD_LSI', name: 'T0151 lsi', op: 'range', min: 90, max: 95, description: `${PREFIX} x` });
      await tx.execute(sql.raw(UP));
      expect(await descriptionOf(tx, edited)).toBe('Recalibrated by BTA.');
      expect(await descriptionOf(tx, nul)).toBeNull();
      expect(await descriptionOf(tx, metric)).toBe(`${PREFIX} x`);
      expect(await descriptionOf(tx, lsi)).toBe(`${PREFIX} x`);
    });
  });

  it('is idempotent and the down file restores the original text exactly, for every operator', async () => {
    await inRolledBackTx(async (tx) => {
      const rows = [
        { op: 'lte', value: 2.5, description: `${PREFIX} < 2.68s. Jones 2018` },
        { op: 'lte', value: 2.5, description: PREFIX },
        { op: 'lte', value: 2.5, description: `${PREFIX}  double space, trailing ` },
        { op: 'gte', value: 3.1, description: `${PREFIX} gte note` },
        { op: 'eq', value: 2.5, description: `${PREFIX} eq note` },
        { op: 'range', min: 2.1, max: 2.4, description: `${PREFIX} range note` },
        { op: 'range', min: 2.1, max: 2.4, description: PREFIX },
      ];
      const ids: string[] = [];
      for (const [i, r] of rows.entries()) {
        ids.push(await seed(tx, { code: 'AGILITY_505_YD', name: `T0151 rt ${i}`, ...r }));
      }
      const originals = rows.map((r) => r.description);
      await tx.execute(sql.raw(UP));
      const once = await Promise.all(ids.map((id) => descriptionOf(tx, id)));
      expect(once).not.toEqual(originals);
      await tx.execute(sql.raw(UP));
      expect(await Promise.all(ids.map((id) => descriptionOf(tx, id)))).toEqual(once);

      await tx.execute(sql.raw(DOWN));
      expect(await Promise.all(ids.map((id) => descriptionOf(tx, id)))).toEqual(originals);
      await tx.execute(sql.raw(DOWN));
      expect(await Promise.all(ids.map((id) => descriptionOf(tx, id)))).toEqual(originals);
    });
  });

  it('down leaves admin-edited rows and rows without the 0151 header alone', async () => {
    await inRolledBackTx(async (tx) => {
      const edited = await seed(tx, { code: 'AGILITY_505_YD', name: 'T0151 dn edited', op: 'lte', value: 2.4, description: 'Recalibrated by BTA.' });
      const metric = await seed(tx, {
        code: 'AGILITY_505_M', name: 'T0151 dn metric', op: 'lte', value: 2.68,
        description: 'Approximate yard-protocol threshold of \u2264 2.680 s, converted from metric-protocol research (x0.914); recalibrate with BTA data.',
      });
      const nul = await seed(tx, { code: 'AGILITY_505_YD', name: 'T0151 dn null', op: 'lte', value: 2.4, description: null });
      const before = await Promise.all([edited, metric, nul].map((id) => descriptionOf(tx, id)));
      await tx.execute(sql.raw(DOWN));
      expect(await Promise.all([edited, metric, nul].map((id) => descriptionOf(tx, id)))).toEqual(before);
    });
  });

  it('leaves no yard benchmark still carrying the verbatim-copy prefix after it runs', async () => {
    await inRolledBackTx(async (tx) => {
      // Seed a copy first: a CI-shaped database has no 0144 rows, which would make this vacuous.
      await seed(tx, { code: 'AGILITY_505_YD', name: 'T0151 seeded copy', op: 'lte', value: 2.5, description: `${PREFIX} note` });
      const count = async () => {
        const r: any = await tx.execute(sql`
          SELECT COUNT(*)::int AS n FROM site_benchmarks
           WHERE metric_code IN ('AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R')
             AND left(description, ${PREFIX.length}) = ${PREFIX}`);
        return (r.rows ?? r)[0].n;
      };
      expect(await count()).toBeGreaterThan(0);
      await tx.execute(sql.raw(UP));
      expect(await count()).toBe(0);
    });
  });
});
