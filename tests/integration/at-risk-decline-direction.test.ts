/**
 * At-risk decline detection reads each measurement's direction from its own metric row: site_metrics, else the
 * custom org metric of the measurement's organization. The SQL used to bind a hard-coded code list, so a custom
 * org lower-is-better metric (a slower time) never counted as a decline.
 *
 * Runs on the CI DB shape (db:push + default seed): every metric this test relies on, apart from the seeded
 * VERTICAL_JUMP, is created here, with codes that were never in the old hard-coded list.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { customOrgMetrics, measurements, organizations, siteMetrics, teams, users, userTeams } from '@shared/schema';
import { AnalyticsService } from '../../packages/api/services/analytics-service';
import { purgeTestRows } from '../helpers/purge-test-rows';

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const SITE_MILE = `MILE_RUN_DECL_${suffix}`;
const ORG_RUN = `ORG_RUN_DECL_${suffix}`;
const ORG_JUMP = `ORG_JUMP_DECL_${suffix}`;
const UNKNOWN = `NO_ROW_DECL_${suffix}`;

const orgIds: string[] = [];
const userIds: string[] = [];

async function orgWithAthlete(label: string): Promise<{ orgId: string; athleteId: string }> {
  const [org] = await db.insert(organizations).values({ name: `Decline ${label} ${suffix}` }).returning();
  orgIds.push(org.id);
  const [team] = await db.insert(teams).values({ organizationId: org.id, name: `Decline Team ${label}` }).returning();
  const [athlete] = await db.insert(users).values({
    username: `decline_${label}_${suffix}`.toLowerCase(),
    emails: [`decline_${label}_${suffix}@test.com`.toLowerCase()],
    firstName: 'Decline',
    lastName: label,
    fullName: `Decline ${label}`,
  } as any).returning();
  userIds.push(athlete.id);
  await db.insert(userTeams).values({ userId: athlete.id, teamId: team.id });
  return { orgId: org.id, athleteId: athlete.id };
}

/** Six verified values, oldest first: the last three average against the first three. */
async function addSeries(orgId: string, athleteId: string, metric: string, values: number[]): Promise<void> {
  await db.insert(measurements).values(values.map((value, i) => ({
    userId: athleteId,
    submittedBy: athleteId,
    organizationId: orgId,
    date: `2026-0${i + 1}-15`,
    age: 17,
    metric,
    value: value.toFixed(3),
    units: 's',
    isVerified: true,
  })) as any);
}

const rising = [300, 300, 300, 360, 360, 360];

describe('getAtRiskAthletes decline direction', () => {
  let main: { orgId: string; athleteId: string };
  let higherOnly: { orgId: string; athleteId: string };

  beforeAll(async () => {
    main = await orgWithAthlete('Main');
    higherOnly = await orgWithAthlete('HigherOnly');
    await db.insert(siteMetrics).values({ code: SITE_MILE, label: 'Mile', unit: 's', metricType: 'lower_is_better' } as any);
    await db.insert(customOrgMetrics).values([
      { organizationId: main.orgId, code: ORG_RUN, label: 'Org Run', unit: 's', metricType: 'lower_is_better' },
      { organizationId: main.orgId, code: ORG_JUMP, label: 'Org Jump', unit: 'in', metricType: 'higher_is_better' },
      // The same code is higher-is-better in the other organization; it must not change the main org's rows.
      { organizationId: higherOnly.orgId, code: ORG_RUN, label: 'Org Run B', unit: 's', metricType: 'higher_is_better' },
    ] as any);

    for (const metric of [SITE_MILE, ORG_RUN, ORG_JUMP, 'VERTICAL_JUMP', UNKNOWN]) {
      await addSeries(main.orgId, main.athleteId, metric, rising);
    }
    await addSeries(higherOnly.orgId, higherOnly.athleteId, 'VERTICAL_JUMP', rising);
  });

  afterAll(async () => {
    await db.delete(siteMetrics).where(inArray(siteMetrics.code, [SITE_MILE]));
    await purgeTestRows({ userIds, orgIds });
  });

  it('reports rising times as a decline for site and custom lower-is-better metrics only', async () => {
    const result = await new AnalyticsService().getAtRiskAthletes(main.orgId);
    const declined = result.declining.filter((d) => d.athleteId === main.athleteId).map((d) => d.metric).sort();
    expect(declined).toEqual([ORG_RUN, SITE_MILE].sort());
    const orgRun = result.declining.find((d) => d.metric === ORG_RUN);
    expect(orgRun?.declinePercent).toBe(20);
  });

  it('works when no measured metric is lower-is-better (a rising jump is not a decline)', async () => {
    const result = await new AnalyticsService().getAtRiskAthletes(higherOnly.orgId);
    expect(result.declining).toEqual([]);
  });
});
