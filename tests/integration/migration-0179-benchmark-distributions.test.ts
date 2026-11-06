/**
 * Migration 0179 (provisional number): benchmark_distribution_versions + benchmark_distributions.
 * Live checks run in a rolled-back transaction on a disposable DB; ids are real 36-char UUIDs.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0179_add_benchmark_distributions';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

class Rollback extends Error {}

describe('Migration 0179: static analysis', () => {
  it('is transaction-free and idempotent in form', () => {
    for (const sql of [UP, DOWN]) {
      expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
      expect(sql).not.toMatch(/TRUNCATE|CONCURRENTLY/i);
    }
    expect(UP).toMatch(/PROVISIONAL/);
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS benchmark_distribution_versions/);
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS benchmark_distributions/);
    expect(UP).toMatch(/DROP TRIGGER IF EXISTS/);
    expect(UP).toMatch(/DOUBLE PRECISION\[\]/);
    expect(UP).not.toMatch(/\bREAL\b/i);
  });
  it('names every constraint explicitly (<= 63 chars) identically in SQL and Drizzle, so db:push shows no drift', () => {
    const drizzle = fs.readFileSync(path.resolve(__dirname, '../../packages/shared/schema/tables/benchmarks.ts'), 'utf-8');
    for (const name of ['benchmark_distribution_versions_label_uniq', 'bdv_created_by_fk', 'bd_version_id_fk', 'bd_metric_code_fk', 'benchmark_distributions_band_uniq']) {
      expect(name.length).toBeLessThanOrEqual(63);
      expect(UP).toContain(name);
      expect(drizzle).toContain(name);
    }
  });
  it('puts the immutability trigger on distributions only, not on versions', () => {
    expect(UP).toMatch(/BEFORE UPDATE OR DELETE ON benchmark_distributions/);
    expect(UP).not.toMatch(/ON benchmark_distribution_versions\s+FOR EACH/);
  });
  it('down refuses while rows exist, drops both tables and forgets the tracking row', () => {
    expect(DOWN).toMatch(/refused/);
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS benchmark_distributions/);
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS benchmark_distribution_versions/);
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0179: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  async function rolledBack(fn: (tx: any) => Promise<void>) {
    try {
      await sql.begin(async (tx: any) => {
        await tx.unsafe('DROP TABLE IF EXISTS benchmark_distributions');
        await tx.unsafe('DROP TABLE IF EXISTS benchmark_distribution_versions');
        await tx.unsafe(UP);
        await fn(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  }

  const seed = async (tx: any) => {
    const code = `Z${randomUUID().slice(0, 8)}`;
    await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type) VALUES (${code}, ${code}, 'speed', 's', 'lower_is_better')`;
    const [v] = await tx`INSERT INTO benchmark_distribution_versions (label, source) VALUES (${'v-' + randomUUID()}, 'src') RETURNING *`;
    const [d] = await tx`INSERT INTO benchmark_distributions (version_id, metric_code, sex, age_min, age_max, n, values)
      VALUES (${v.id}, ${code}, 'male', 10, 12, 3, ${tx.array([1.1, 2.2, 3.3], 701)}) RETURNING *`;
    return { code, v, d };
  };

  it('is re-runnable, stores double precision, uses 36-char ids and enforces n = array length', async () => {
    await rolledBack(async (tx) => {
      await tx.unsafe(UP);
      const { code, v, d } = await seed(tx);
      expect(v.id).toHaveLength(36);
      expect(d.id).toHaveLength(36);
      expect(d.values).toEqual([1.1, 2.2, 3.3]);
      await expect(
        tx.savepoint((s: any) => s`INSERT INTO benchmark_distributions (version_id, metric_code, sex, age_min, age_max, n, values)
          VALUES (${v.id}, ${code}, 'female', 10, 12, 5, ${s.array([1, 2], 701)})`),
      ).rejects.toThrow();
    });
  });

  it('blocks UPDATE and DELETE on distributions, and the unique band key holds', async () => {
    await rolledBack(async (tx) => {
      const { code, v, d } = await seed(tx);
      await expect(tx.savepoint((s: any) => s`UPDATE benchmark_distributions SET n = 3 WHERE id = ${d.id}`)).rejects.toThrow();
      await expect(tx.savepoint((s: any) => s`DELETE FROM benchmark_distributions WHERE id = ${d.id}`)).rejects.toThrow();
      await expect(
        tx.savepoint((s: any) => s`INSERT INTO benchmark_distributions (version_id, metric_code, sex, age_min, age_max, n, values)
          VALUES (${v.id}, ${code}, 'male', 10, 11, 1, ${s.array([1], 701)})`),
      ).rejects.toThrow(/duplicate key/);
    });
  });

  it('does not block deleting the creating user (versions has no trigger; created_by is SET NULL)', async () => {
    await rolledBack(async (tx) => {
      const uid = randomUUID();
      await tx`INSERT INTO users (id, username, emails, password, first_name, last_name, full_name) VALUES (${uid}, ${'m0179-' + uid}, ${tx.array(['a@b.c'])}, 'x', 'A', 'B', 'A B')`;
      const [v] = await tx`INSERT INTO benchmark_distribution_versions (label, source, created_by) VALUES (${'v-' + uid}, 's', ${uid}) RETURNING id`;
      await tx`DELETE FROM users WHERE id = ${uid}`;
      const [r] = await tx`SELECT created_by FROM benchmark_distribution_versions WHERE id = ${v.id}`;
      expect(r.created_by).toBeNull();
    });
  });

  it('down refuses while rows exist, then drops both tables', async () => {
    await rolledBack(async (tx) => {
      await seed(tx);
      await expect(tx.savepoint((s: any) => s.unsafe(DOWN))).rejects.toThrow(/refused/);
    });
    await rolledBack(async (tx) => {
      await tx.unsafe(DOWN);
      const [{ a, b }] = await tx`SELECT to_regclass('benchmark_distributions') AS a, to_regclass('benchmark_distribution_versions') AS b`;
      expect(a).toBeNull();
      expect(b).toBeNull();
    });
  });
});
