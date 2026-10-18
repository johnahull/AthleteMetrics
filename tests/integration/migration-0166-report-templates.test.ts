/**
 * Migration 0166: report_templates. Runs in a rolled-back transaction on a disposable DB.
 * Ids are full 36-char UUIDs.
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
const UP = read('0166_add_report_templates.sql');
const DOWN = read('0166_add_report_templates_down.sql');

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

class Rollback extends Error {}

describe('Migration 0166: static analysis', () => {
  it('is idempotent in form and uses varchar(36) ids', () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS report_templates/);
    expect(UP).toMatch(/CREATE INDEX IF NOT EXISTS report_templates_org_idx/);
    expect(UP).toMatch(/id VARCHAR\(36\) PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    expect(UP).toMatch(/CONSTRAINT report_templates_org_name_uniq UNIQUE \(organization_id, name\)/);
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0166: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  });
  afterAll(async () => {
    await sql.end();
  });

  async function rolledBack(fn: (tx: any) => Promise<void>) {
    try {
      await sql.begin(async (tx: any) => {
        await tx.unsafe('DROP TABLE IF EXISTS report_templates');
        await fn(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  }

  it('creates the table, applies defaults, enforces (organization, name) uniqueness, and is re-runnable', async () => {
    await rolledBack(async (tx) => {
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      const orgId = randomUUID();
      await tx`INSERT INTO organizations (id, name) VALUES (${orgId}, ${'mig0166-' + orgId})`;
      const [row] = await tx`INSERT INTO report_templates (organization_id, name, metrics) VALUES (${orgId}, 'T', '["FLY10_TIME"]'::jsonb) RETURNING *`;
      expect(row.id).toHaveLength(36);
      expect(row.benchmark_set_ids).toEqual([]);
      expect(row.charts).toEqual({});
      await expect(
        tx.savepoint((s: any) => s`INSERT INTO report_templates (organization_id, name, metrics) VALUES (${orgId}, 'T', '[]'::jsonb)`),
      ).rejects.toThrow(/report_templates_org_name_uniq/);
      // cascade on organization delete
      await tx`DELETE FROM organizations WHERE id = ${orgId}`;
      const [{ count }] = await tx`SELECT count(*)::int AS count FROM report_templates`;
      expect(count).toBe(0);
    });
  });

  it('down refuses while templates exist, then drops the table', async () => {
    await rolledBack(async (tx) => {
      await tx.unsafe(UP);
      const orgId = randomUUID();
      await tx`INSERT INTO organizations (id, name) VALUES (${orgId}, ${'mig0166-' + orgId})`;
      await tx`INSERT INTO report_templates (organization_id, name, metrics) VALUES (${orgId}, 'T', '[]'::jsonb)`;
      await expect(tx.savepoint((s: any) => s.unsafe(DOWN))).rejects.toThrow(/refused/);
      await tx`DELETE FROM report_templates`;
      await tx.unsafe(DOWN);
      const [{ t }] = await tx`SELECT to_regclass('report_templates') AS t`;
      expect(t).toBeNull();
    });
  });
});
