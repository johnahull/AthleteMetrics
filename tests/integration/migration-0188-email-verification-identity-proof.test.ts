/** Migration 0188: email_verification_tokens.identity_proof_at. Runs in a rolled-back transaction on a disposable DB. */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0188_add_email_verification_identity_proof.sql');
const DOWN = read('0188_add_email_verification_identity_proof_down.sql');

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

class Rollback extends Error {}

describe.skipIf(!isDisposableTestDb)('Migration 0188 against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => { sql = postgres(dbUrl, { max: 1, onnotice: () => {} }); });
  afterAll(async () => { await sql.end(); });

  const col = async (tx: any) =>
    (await tx`SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'email_verification_tokens' AND column_name = 'identity_proof_at'`) as Array<{ data_type: string; is_nullable: string; column_default: string | null }>;

  it('adds a nullable identity_proof_at with no default (existing tokens prove nothing), is re-runnable, and the down migration removes it', async () => {
    try {
      await sql.begin(async (tx: any) => {
        await tx.unsafe(DOWN);
        expect(await col(tx)).toEqual([]);
        await tx.unsafe(UP);
        await tx.unsafe(UP);
        expect((await col(tx)).map((c) => `${c.data_type}:${c.is_nullable}:${c.column_default}`)).toEqual([
          'timestamp without time zone:YES:null',
        ]);
        await tx.unsafe(DOWN);
        expect(await col(tx)).toEqual([]);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  });
});
