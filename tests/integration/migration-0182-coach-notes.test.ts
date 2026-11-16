/** Migration 0182: reports.coach_notes + organizations.ai_style_example. Runs in a rolled-back transaction on a disposable DB. */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0182_add_coach_notes_and_ai_style_example.sql');
const DOWN = read('0182_add_coach_notes_and_ai_style_example_down.sql');

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

class Rollback extends Error {}

describe.skipIf(!isDisposableTestDb)('Migration 0182 against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => { sql = postgres(dbUrl, { max: 1, onnotice: () => {} }); });
  afterAll(async () => { await sql.end(); });

  const cols = async (tx: any) =>
    (await tx`SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE (table_name = 'reports' AND column_name = 'coach_notes') OR (table_name = 'organizations' AND column_name = 'ai_style_example')
      ORDER BY table_name`) as Array<{ table_name: string; data_type: string }>;

  it('adds both nullable columns, is re-runnable, and the down migration removes them', async () => {
    try {
      await sql.begin(async (tx: any) => {
        await tx.unsafe(DOWN);
        expect(await cols(tx)).toEqual([]);
        await tx.unsafe(UP);
        await tx.unsafe(UP);
        expect((await cols(tx)).map((c) => `${c.table_name}:${c.data_type}`)).toEqual(['organizations:text', 'reports:jsonb']);
        await tx.unsafe(DOWN);
        expect(await cols(tx)).toEqual([]);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  });
});
