/**
 * Eval report: the 10 yd / 20 yd pair behind the COD deficit is chosen from one run, and two runs with identical
 * splits are told apart by recency (measurements.createdAt), which loadEvalReportInputs must therefore load.
 * The deficit is the same number whichever run wins a tie, so the choice is observed through the selection call.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { eq, inArray } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../../packages/api/db';
import { assembleEvalReportModel, loadEvalReportInputs } from '../../packages/api/services/eval-report-service';
import { events, measurements, organizations, siteMetrics, userOrganizations, users } from '@shared/schema';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/services/same-run-sources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/api/services/same-run-sources')>();
  return { ...actual, selectSameRunSources: vi.fn(actual.selectSameRunSources) };
});
import { selectSameRunSources } from '../../packages/api/services/same-run-sources';

describe('eval report same-run COD pair', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdMetrics: string[] = [];
  let orgId: string;
  let athleteId: string;
  let eventId: string;

  beforeAll(async () => {
    for (const code of ['DASH_10YD', 'DASH_20YD', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_COD_DEFICIT_M_INTERP']) {
      const inserted = await db
        .insert(siteMetrics)
        .values({ code, label: code, category: 'agility', unit: 's', metricType: 'lower_is_better' } as any)
        .onConflictDoNothing()
        .returning({ code: siteMetrics.code });
      if (inserted.length > 0) createdMetrics.push(code);
    }
    [{ id: orgId }] = await db.insert(organizations).values({ name: `EvalSameRun Org ${suffix}` }).returning();
    [{ id: athleteId }] = await db
      .insert(users)
      .values({
        username: `evalsr-${suffix}`, emails: [`evalsr-${suffix}@test.com`], password: 'x',
        firstName: 'Eval', lastName: 'SameRun', fullName: 'Eval SameRun', birthDate: '2011-03-01',
      } as any)
      .returning();
    await db.insert(userOrganizations).values({ userId: athleteId, organizationId: orgId, role: 'athlete' } as any);
    [{ id: eventId }] = await db
      .insert(events)
      .values({ organizationId: orgId, name: `Eval SR ${suffix}`, startDate: new Date('2026-05-01T10:00:00Z') } as any)
      .returning({ id: events.id });

    const row = (metric: string, value: number, createdAt: Date, runId?: string) => ({
      userId: athleteId, submittedBy: athleteId, date: '2026-05-01', age: 15, metric, value: String(value), units: 's',
      isVerified: true, eventId, organizationId: orgId, createdAt,
      calculationMetadata: runId ? { runId, formula: 'direct_import_split' } : null,
    });
    const older = new Date('2026-05-01T10:00:00Z');
    const newer = new Date('2026-05-01T11:00:00Z');
    await db.insert(measurements).values([
      row('AGILITY_505_M_L', 2.6, older), row('AGILITY_505_M_R', 2.7, older),
      // Identical splits in both runs
      row('DASH_10YD', 1.69, older, 'old-run'), row('DASH_20YD', 2.95, older, 'old-run'),
      row('DASH_10YD', 1.69, newer, 'new-run'), row('DASH_20YD', 2.95, newer, 'new-run'),
    ] as any);
  });

  afterAll(async () => {
    await db.delete(measurements).where(eq(measurements.eventId, eventId));
    await db.delete(events).where(eq(events.id, eventId));
    await purgeTestRows({ userIds: [athleteId], orgIds: [orgId] });
    if (createdMetrics.length > 0) await db.delete(siteMetrics).where(inArray(siteMetrics.code, createdMetrics));
  });

  it('loads createdAt and picks the newer of two runs with identical splits', async () => {
    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    const inputs = await loadEvalReportInputs(db, { event, athleteId });
    expect(inputs.rows.every((r) => r.createdAt instanceof Date)).toBe(true);

    vi.mocked(selectSameRunSources).mockClear();
    const model = assembleEvalReportModel({ ...inputs, selection: {}, load: null, coachNote: null, overrides: {} });

    const pair = vi.mocked(selectSameRunSources).mock.results.map((r) => r.value).find((v) => v !== null);
    expect((pair.get('DASH_10YD').calculationMetadata as any).runId).toBe('new-run');
    expect((pair.get('DASH_20YD').calculationMetadata as any).runId).toBe('new-run');
    expect(model.metrics.length).toBeGreaterThan(0);
  });
});
