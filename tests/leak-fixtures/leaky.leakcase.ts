/**
 * Fixture for tests/integration/leak-check-exit-code.test.ts. It leaves an organization behind on purpose and
 * is only matched by tests/leak-fixtures/vitest.config.ts, never by the normal unit or integration lanes.
 */
import { it } from 'vitest';
import { db } from '../../packages/api/db';
import { organizations } from '@shared/schema';

it('leaks an organization on purpose', async () => {
  await db.insert(organizations).values({ name: `Leak Check Fixture ${Date.now()}` });
});
