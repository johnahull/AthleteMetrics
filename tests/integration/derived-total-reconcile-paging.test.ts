/**
 * Issue #526 review finding: reconcileDerivedTotals loaded every source and total row of a derived metric
 * before applying the repair limit. It now processes athletes in pages (options.athletePageSize), so memory is
 * bounded by the page, while the counts (drifted, repaired, ...) stay exact because every page is scanned.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { reconcileDerivedTotals } from '../../packages/api/services/derived-total-reconciliation';
import { measurements, organizations, userOrganizations, users } from '@shared/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-04-21';
const PATTERNS = [
  'MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE',
  'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP',
];

describe('reconcileDerivedTotals paging', () => {
  let orgId: string;
  let coachId: string;
  let athleteIds: string[] = [];
  const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  beforeAll(async () => {
    // Other suites delete derived site_metrics rows from a shared database: re-apply the idempotent seeds.
    for (const file of ['0146_seed_mqi_metrics.sql', '0148_mqi_latest_event_selection.sql']) {
      await db.execute(sql.raw(fs.readFileSync(path.resolve(__dirname, '../../migrations', file), 'utf-8')));
    }
    const [org] = await db.insert(organizations).values({ name: `Paging Org ${ts}`, isActive: true } as any).returning();
    orgId = org.id;
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `pg_${tag}_${ts}`,
            emails: [`pg_${tag}_${ts}@test.com`],
            password: 'x',
            firstName: tag,
            lastName: 'Paging',
            fullName: `${tag} Paging`,
            birthDate: '2008-01-01',
            birthYear: 2008,
          } as any)
          .returning()
      )[0];
    coachId = (await mk('coach')).id;
    athleteIds = [(await mk('a1')).id, (await mk('a2')).id, (await mk('a3')).id];
    await db.insert(userOrganizations).values([
      { userId: coachId, organizationId: orgId, role: 'coach' },
      ...athleteIds.map((userId) => ({ userId, organizationId: orgId, role: 'athlete' })),
    ] as any);
    // Verified scores with no total: the state left by a failed post-commit recalculation
    await db.insert(measurements).values(
      athleteIds.flatMap((userId) =>
        PATTERNS.map((metric) => ({
          userId,
          organizationId: orgId,
          submittedBy: coachId,
          isVerified: true,
          metric,
          value: '2',
          units: 'score',
          age: 17,
          date: DATE,
        }))
      ) as any
    );
  });

  afterAll(async () => {
    const ids = [coachId, ...athleteIds].filter(Boolean);
    await db.delete(measurements).where(inArray(measurements.userId, ids));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, ids));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  /** A db handle that counts select statements, to prove the data is read in pages. */
  const countingDb = () => {
    const counter = { selects: 0 };
    const proxy = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'select' || prop === 'selectDistinct') counter.selects++;
        return Reflect.get(target, prop, receiver);
      },
    });
    return { proxy: proxy as typeof db, counter };
  };

  const totalsOf = (userId: string) =>
    db
      .select()
      .from(measurements)
      .where(and(eq(measurements.userId, userId), eq(measurements.metric, 'MQI_TOTAL'), eq(measurements.date, DATE)));

  it('reports the same drift whatever the page size, reading in more, smaller queries when paged', async () => {
    const unpaged = countingDb();
    const full = await reconcileDerivedTotals(unpaged.proxy, { organizationId: orgId, metricCode: 'MQI_TOTAL', dryRun: true });
    const paged = countingDb();
    const small = await reconcileDerivedTotals(paged.proxy, {
      organizationId: orgId,
      metricCode: 'MQI_TOTAL',
      dryRun: true,
      athletePageSize: 1,
    });

    expect(full.drifted).toBe(3);
    expect(small.drifted).toBe(full.drifted);
    const key = (r: typeof full) => r.findings.map((f) => `${f.userId}|${f.date}|${f.reason}`).sort();
    expect(key(small)).toEqual(key(full));
    expect(paged.counter.selects).toBeGreaterThan(unpaged.counter.selects);
  });

  it('repairs every drifted athlete across pages', async () => {
    const result = await reconcileDerivedTotals(db, {
      organizationId: orgId,
      metricCode: 'MQI_TOTAL',
      athletePageSize: 2,
    });

    expect(result.repaired).toBe(3);
    expect(result.failed).toBe(0);
    for (const userId of athleteIds) {
      const totals = await totalsOf(userId);
      expect(totals, userId).toHaveLength(1);
      expect(Number(totals[0].value)).toBe(16);
    }
  });
});
