/** Migration 0187: wellness_requests.is_standing + wellness_responses.superseded_at. Runs in a rolled-back transaction on a disposable DB. */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0187_add_wellness_standing_requests.sql');
const DOWN = read('0187_add_wellness_standing_requests_down.sql');

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

class Rollback extends Error {}

describe.skipIf(!isDisposableTestDb)('Migration 0187 against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => { sql = postgres(dbUrl, { max: 1, onnotice: () => {} }); });
  afterAll(async () => { await sql.end(); });

  const cols = async (tx: any) =>
    (await tx`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE (table_name = 'wellness_requests' AND column_name = 'is_standing')
         OR (table_name = 'wellness_responses' AND column_name = 'superseded_at')
      ORDER BY table_name`) as Array<{ table_name: string; data_type: string; is_nullable: string; column_default: string | null }>;

  it('adds is_standing (not null, default false) and nullable superseded_at, is re-runnable, and the down migration removes them', async () => {
    try {
      await sql.begin(async (tx: any) => {
        await tx.unsafe(DOWN);
        expect(await cols(tx)).toEqual([]);
        await tx.unsafe(UP);
        await tx.unsafe(UP);
        expect((await cols(tx)).map((c) => `${c.table_name}:${c.data_type}:${c.is_nullable}:${c.column_default}`)).toEqual([
          'wellness_requests:boolean:NO:false',
          'wellness_responses:timestamp without time zone:YES:null',
        ]);
        await tx.unsafe(DOWN);
        expect(await cols(tx)).toEqual([]);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  });
});
