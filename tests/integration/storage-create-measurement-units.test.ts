/**
 * Integration tests: storage.createMeasurement resolves `units`
 *
 * Regression: units were derived from a hard-coded list (FLY10_TIME/T_TEST/DASH_40YD -> "s",
 * RSI -> "ratio", everything else -> "in"), ignoring both the caller's units and the
 * metric's configured site_metrics.unit. Requires a seeded site_metrics table.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { users, measurements, siteMetrics } from '@shared/schema';

let userId: string;
let configured: Record<string, string | null> = {};

const create = async (metric: string, extra: Record<string, unknown> = {}) =>
  storage.createMeasurement(
    { userId, date: '2025-01-15', metric, value: 2.45, ...extra } as any,
    userId,
  );

describe('storage.createMeasurement units resolution', () => {
  beforeAll(async () => {
    const [u] = await db.insert(users).values({
      username: `units_${Date.now()}`,
      password: '$2b$10$abcdefg',
      firstName: 'Units',
      lastName: 'Test',
      fullName: 'Units Test',
      emails: [`units_${Date.now()}@test.com`],
      isSiteAdmin: true,
      isActive: true,
    }).returning();
    userId = u.id;
    // Self-contained custom metrics (CI seeds only 8 default metrics)
    await db.insert(siteMetrics).values([
      { code: 'ZZ_UNITS_TIME', label: 'Units test time', unit: 's' },
      { code: 'ZZ_UNITS_PCT', label: 'Units test percent', unit: '%' },
    ]).onConflictDoNothing();
    const rows = await db.select({ code: siteMetrics.code, unit: siteMetrics.unit }).from(siteMetrics);
    configured = Object.fromEntries(rows.map(r => [r.code, r.unit]));
  });

  afterAll(async () => {
    await db.delete(measurements).where(eq(measurements.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(siteMetrics).where(inArray(siteMetrics.code, ['ZZ_UNITS_TIME', 'ZZ_UNITS_PCT']));
  });

  it('seeded site_metrics are present', () => {
    expect(configured.AGILITY_505).toBe('s');
    expect(configured.TOP_SPEED).toBeTruthy();
  });

  it.each([
    ['FLY10_TIME', 's'],
    ['T_TEST', 's'],
    ['DASH_40YD', 's'],
    ['VERTICAL_JUMP', 'in'],
    ['RSI', 'ratio'], // site_metrics.unit is '' for RSI: legacy 'ratio' is kept
  ])('keeps existing units for %s -> %s', async (metric, expected) => {
    expect((await create(metric)).units).toBe(expected);
  });

  it.each(['AGILITY_505', 'AGILITY_5105', 'ZZ_UNITS_TIME'])(
    'regression: time metric %s without units is not stored as "in"',
    async (metric) => {
      const m = await create(metric);
      expect(m.units).not.toBe('in');
      expect(m.units).toBe('s');
    },
  );

  it('uses the configured unit for TOP_SPEED', async () => {
    expect((await create('TOP_SPEED')).units).toBe(configured.TOP_SPEED);
  });

  it('uses configured non-time, non-inch units (percent metric)', async () => {
    expect((await create('ZZ_UNITS_PCT')).units).toBe('%');
  });

  it('a caller-supplied non-empty units value wins', async () => {
    expect((await create('ZZ_UNITS_TIME', { units: 'ms' })).units).toBe('ms');
  });

  it('an empty caller-supplied units falls through to the metric unit', async () => {
    expect((await create('ZZ_UNITS_TIME', { units: '' })).units).toBe('s');
  });

  it('an unknown metric code falls back to the legacy mapping', async () => {
    expect((await create('ZZ_UNKNOWN_METRIC')).units).toBe('in');
  });
});
