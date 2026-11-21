/** Migration 0184: organizations.ai_prompt_overrides. Runs in a rolled-back transaction on a disposable DB. */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0184_add_org_ai_prompt_overrides.sql');
const DOWN = read('0184_add_org_ai_prompt_overrides_down.sql');

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

class Rollback extends Error {}

describe.skipIf(!isDisposableTestDb)('Migration 0184 against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => { sql = postgres(dbUrl, { max: 1, onnotice: () => {} }); });
  afterAll(async () => { await sql.end(); });

  const cols = async (tx: any) =>
    (await tx`SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'organizations' AND column_name = 'ai_prompt_overrides'`) as Array<{ data_type: string; is_nullable: string }>;

  it('adds a nullable jsonb column, is re-runnable, and the down migration removes it', async () => {
    try {
      await sql.begin(async (tx: any) => {
        await tx.unsafe(DOWN);
        expect(await cols(tx)).toEqual([]);
        await tx.unsafe(UP);
        await tx.unsafe(UP);
        expect(await cols(tx)).toEqual([{ data_type: 'jsonb', is_nullable: 'YES' }]);
        await tx.unsafe(DOWN);
        expect(await cols(tx)).toEqual([]);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  });
});
