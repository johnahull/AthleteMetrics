/**
 * Issue #539: the integration run must exit non-zero, naming the rows, when a test leaves rows behind.
 * Runs a nested vitest on tests/leak-fixtures/leaky.leakcase.ts (which leaks an organization on purpose)
 * through the real integration config and asserts on the exit code.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { purgeTestRows } from '../helpers/purge-test-rows';

const root = path.resolve(__dirname, '../..');
const runNested = (env: Record<string, string | undefined> = {}) =>
  spawnSync('npx', ['vitest', 'run', '--config', 'tests/leak-fixtures/vitest.config.ts'], {
    cwd: root,
    env: { ...process.env, SKIP_LEAK_CHECK: undefined, ...env },
    encoding: 'utf8',
    timeout: 90_000,
  });

describe('integration leak check exit code (issue #539)', () => {
  afterAll(async () => {
    await purgeTestRows({ orgNameLike: ['Leak Check Fixture %'] });
  });

  it('exits non-zero and names the leaked organization', () => {
    const result = runNested();
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/organizations: 1 left behind: Leak Check Fixture/);
  });

  it('SKIP_LEAK_CHECK=1 opts out', () => {
    const result = runNested({ SKIP_LEAK_CHECK: '1' });
    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('SKIP_LEAK_CHECK=1');
  });

  it('does not connect to a database that matches the production/staging guard', () => {
    const result = runNested({ DATABASE_URL: 'postgresql://u:p@staging.example.invalid:5432/db' });
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain('not connecting');
    expect(output).not.toContain('left behind');
  });
});
