/**
 * Report builds resolve metric direction, label and unit for the REPORT's organization.
 * ReportService.getMetricInfo used to read site_metrics only (a custom code defaulted to lower-is-better) and
 * cached by code alone on a process-lifetime instance, so one org's custom metric could be served to another.
 * The AI report data builder read site_metrics only, so every custom metric was "higher is better".
 * Custom codes are unique per organization only: SHARED is lower-is-better in orgA and higher-is-better in orgB.
 */

// Set environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { customOrgMetrics, measurements, organizations, reports, userOrganizations, users } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { ReportService } from '../../packages/api/services/report-service';
import { buildReportDataForAI } from '../../packages/api/routes/report-routes';

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const SHARED = `ORG_RPTMI_SHARED_${suffix}`;
const SITE = 'FLY10_TIME';

describe('report metric info is resolved per report organization', () => {
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const reportIds: Record<string, { team: string; individual: string }> = {};
  let coachId: string;
  let fastId: string;
  let otherId: string;
  // One instance across both orgs, as in report-routes.ts, so a cache keyed by code alone would collide
  const service = new ReportService();

  const newUser = async (name: string) => {
    const [u] = await db.insert(users).values({
      username: `rptmi_${name}_${suffix}`.toLowerCase(),
      emails: [`rptmi_${name}_${suffix}@test.com`.toLowerCase()],
      firstName: 'Rptmi', lastName: name, fullName: `Rptmi ${name}`,
    } as any).returning();
    userIds.push(u.id);
    return u.id;
  };

  beforeAll(async () => {
    const [a] = await db.insert(organizations).values({ name: `Rptmi A ${suffix}` }).returning();
    const [b] = await db.insert(organizations).values({ name: `Rptmi B ${suffix}` }).returning();
    orgIds.push(a.id, b.id);
    await db.insert(customOrgMetrics).values([
      { organizationId: a.id, code: SHARED, label: 'Shared A', unit: 's', metricType: 'lower_is_better' },
      { organizationId: b.id, code: SHARED, label: 'Shared B', unit: 'in', metricType: 'higher_is_better' },
    ] as any);

    coachId = await newUser('coach');
    fastId = await newUser('x');
    otherId = await newUser('y');
    for (const org of orgIds) {
      await db.insert(userOrganizations).values([
        { userId: coachId, organizationId: org, role: 'coach' },
        { userId: fastId, organizationId: org, role: 'athlete' },
        { userId: otherId, organizationId: org, role: 'athlete' },
      ]);
      const row = (userId: string, metric: string, value: string) => ({
        userId, submittedBy: coachId, date: '2024-02-15', age: 17, metric, value, units: 's',
        organizationId: org, isVerified: true,
      });
      await db.insert(measurements).values([
        row(fastId, SHARED, '360.000'),
        row(fastId, SHARED, '400.000'),
        row(otherId, SHARED, '380.000'),
        row(fastId, SITE, '1.500'),
        row(fastId, SITE, '1.600'),
        row(otherId, SITE, '1.550'),
      ] as any);
      const base = { timeframe: { type: 'preset', preset: 'all_time' }, metrics: [SHARED, SITE] };
      const [team] = await db.insert(reports).values({
        name: 'Rptmi team', organizationId: org, reportType: 'team', config: base, createdBy: coachId,
      } as any).returning();
      const [individual] = await db.insert(reports).values({
        name: 'Rptmi individual', organizationId: org, reportType: 'individual',
        config: { ...base, athleteId: fastId }, createdBy: coachId,
      } as any).returning();
      reportIds[org] = { team: team.id, individual: individual.id };
    }
  });

  afterAll(async () => {
    await db.delete(reports).where(inArray(reports.organizationId, orgIds));
    await db.delete(measurements).where(inArray(measurements.userId, userIds));
    await db.delete(userOrganizations).where(inArray(userOrganizations.userId, userIds));
    await db.delete(customOrgMetrics).where(inArray(customOrgMetrics.organizationId, orgIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  });

  it('team report: a custom lower-is-better metric picks the fastest, with its own label and unit', async () => {
    const [orgA, orgB] = orgIds;
    const a = await service.generateTeamReport(reportIds[orgA].team, coachId);
    const statA = a.teamStatistics.find(s => s.metric === SHARED)!;
    expect(statA.topPerformer?.value).toBe(360);
    expect(a.metricLabels[SHARED]).toBe('Shared A');
    expect(a.metricUnits[SHARED]).toBe('s');
    const fastA = a.athleteRankings.find(r => r.userId === fastId)!;
    const otherA = a.athleteRankings.find(r => r.userId === otherId)!;
    expect(fastA.measurements[SHARED]).toBe(360);
    expect(fastA.percentiles[SHARED]).toBeGreaterThan(otherA.percentiles[SHARED]);

    // Same code, same service instance, other org: higher is better there
    const b = await service.generateTeamReport(reportIds[orgB].team, coachId);
    const statB = b.teamStatistics.find(s => s.metric === SHARED)!;
    expect(statB.topPerformer?.value).toBe(400);
    expect(b.metricLabels[SHARED]).toBe('Shared B');
    expect(b.metricUnits[SHARED]).toBe('in');
    expect(b.athleteRankings.find(r => r.userId === fastId)!.measurements[SHARED]).toBe(400);
  });

  it('team report: a site metric is unchanged (FLY10_TIME keeps the fastest, site label)', async () => {
    const a = await service.generateTeamReport(reportIds[orgIds[0]].team, coachId);
    expect(a.teamStatistics.find(s => s.metric === SITE)!.topPerformer?.value).toBe(1.5);
    expect(a.metricLabels[SITE]).not.toBe(SITE);
  });

  it('individual report: best performance follows the report organization', async () => {
    const [orgA, orgB] = orgIds;
    const a = await service.generateIndividualReport(reportIds[orgA].individual, coachId, fastId);
    expect(a.athlete.measurements[SHARED]).toBe(360);
    expect(a.athlete.measurements[SITE]).toBe(1.5);
    const b = await service.generateIndividualReport(reportIds[orgB].individual, coachId, fastId);
    expect(b.athlete.measurements[SHARED]).toBe(400);
    expect(b.metricLabels[SHARED]).toBe('Shared B');
  });

  it('AI report data: lowerIsBetter comes from the report organization', async () => {
    const [orgA, orgB] = orgIds;
    const rows = await db.select().from(reports).where(inArray(reports.organizationId, orgIds));
    const find = (id: string) => rows.find(r => r.id === id)!;
    const dir = async (reportId: string) => {
      const data = await buildReportDataForAI(find(reportId), coachId, service);
      return Object.fromEntries(data.metrics.map(m => [m.code, m.lowerIsBetter]));
    };
    expect(await dir(reportIds[orgA].team)).toMatchObject({ [SHARED]: true, [SITE]: true });
    expect(await dir(reportIds[orgB].team)).toMatchObject({ [SHARED]: false, [SITE]: true });
    expect(await dir(reportIds[orgA].individual)).toMatchObject({ [SHARED]: true, [SITE]: true });
    expect(await dir(reportIds[orgB].individual)).toMatchObject({ [SHARED]: false, [SITE]: true });
  });
});
