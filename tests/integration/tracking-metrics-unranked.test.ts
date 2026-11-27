/**
 * Issue #805: a 'tracking' metric (body weight, height...) has no better direction, so athletes are never
 * ranked on it: no leaderboard, percentile, event percentile, top performer, composite weight or peer
 * distribution. Values and averages stay. Every case seeds a lower-is-better control metric so it fails if
 * the rule is applied to every metric. The metrics are this file's own rows (CI DB = db:push + default seed).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { AnalyticsService } from '../../packages/api/services/analytics-service';
import { ReportService } from '../../packages/api/services/report-service';
import {
  measurements, organizations, teams, userTeams, users, userOrganizations, siteMetrics, customOrgMetrics, reports,
} from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const TRACK = `TST_TRACK_${suffix}`; // site metric, tracking
const CTRACK = `TST_CTRACK_${suffix}`; // the organization's custom metric, tracking
const CTRL = `TST_CTRL_${suffix}`; // site metric, lower is better (control)
const EVENT_ID = `trk-event-${suffix}`;
const DATE = '2026-03-10';

describe('tracking metrics are never ranked across athletes (#805)', () => {
  const app = express();
  let orgId: string;
  let coachId: string;
  let adminId: string;
  let adminCookie: string;
  let athleteIds: string[];
  const reportIds: string[] = [];

  beforeAll(async () => {
    app.use(express.json());
    await registerRoutes(app);

    const [org] = await db.insert(organizations).values({ name: `Tracking Org ${suffix}` }).returning();
    orgId = org.id;
    await db.insert(siteMetrics).values([
      { code: TRACK, label: 'Test Weight', unit: 'lbs', metricType: 'tracking' },
      { code: CTRL, label: 'Test Sprint', unit: 's', metricType: 'lower_is_better' },
    ]);
    await db.insert(customOrgMetrics).values({
      organizationId: orgId, code: CTRACK, label: 'Test Custom Tracking', unit: 'cm', metricType: 'tracking',
    });

    const mk = async (tag: string, extra: Record<string, unknown> = {}) =>
      (
        await db
          .insert(users)
          .values({
            username: `trk-${tag}-${suffix}`.toLowerCase(),
            emails: [`trk-${tag}-${suffix}@test.com`.toLowerCase()],
            password: 'x',
            firstName: 'T',
            lastName: tag,
            fullName: `T ${tag}`,
            ...extra,
          } as any)
          .returning()
      )[0].id;
    coachId = await mk('coach');
    adminId = await mk('admin', { isSiteAdmin: true, password: await bcrypt.hash('TrkRoute123!', 10) });
    athleteIds = [await mk('a1'), await mk('a2'), await mk('a3')];

    await db.insert(userOrganizations).values({ userId: coachId, organizationId: orgId, role: 'coach' } as any);
    const [team] = await db.insert(teams).values({ name: 'Tracking Team', organizationId: orgId, level: 'Club' }).returning();
    const rows: any[] = [];
    for (const [i, userId] of athleteIds.entries()) {
      await db.insert(userOrganizations).values({ userId, organizationId: orgId, role: 'athlete' } as any);
      await db.insert(userTeams).values({ userId, teamId: team.id, joinedAt: new Date('2020-01-01'), isActive: true });
      const base = { userId, submittedBy: coachId, date: DATE, age: 17, isVerified: true, organizationId: orgId, eventId: EVENT_ID };
      rows.push({ ...base, metric: TRACK, value: String(150 + i * 10), units: 'lbs' });
      rows.push({ ...base, metric: TRACK, value: String(140 + i * 10), units: 'lbs', date: '2026-03-12' });
      rows.push({ ...base, metric: CTRACK, value: String(170 + i), units: 'cm' });
      rows.push({ ...base, metric: CTRL, value: (1.5 + i / 10).toFixed(2), units: 's' });
      rows.push({ ...base, metric: CTRL, value: (1.4 + i / 10).toFixed(2), units: 's', date: '2026-03-12' });
    }
    await db.insert(measurements).values(rows);

    const login = await request(app).post('/api/auth/login').send({ username: `trk-admin-${suffix}`.toLowerCase(), password: 'TrkRoute123!' });
    adminCookie = login.headers['set-cookie'][0];
  });

  afterAll(async () => {
    const all = [coachId, adminId, ...athleteIds];
    if (reportIds.length) await db.delete(reports).where(inArray(reports.id, reportIds));
    await db.delete(measurements).where(inArray(measurements.userId, all));
    await db.delete(userTeams).where(inArray(userTeams.userId, all));
    await db.delete(teams).where(eq(teams.organizationId, orgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, orgId));
    await db.delete(siteMetrics).where(inArray(siteMetrics.code, [TRACK, CTRL]));
    await db.delete(users).where(inArray(users.id, all));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const createReport = async (reportType: 'team' | 'individual', config: Record<string, unknown>) => {
    const [row] = await db
      .insert(reports)
      .values({
        name: `Tracking ${reportType} ${suffix}`,
        organizationId: orgId,
        reportType,
        config: { timeframe: { type: 'custom', customStart: '2026-03-01', customEnd: '2026-03-31' }, metrics: [TRACK, CTRACK, CTRL], ...config },
        createdBy: coachId,
      } as any)
      .returning();
    reportIds.push(row.id);
    return row.id;
  };

  it('leaderboard and most-improved reject a tracking metric; the control still ranks', async () => {
    const svc = new AnalyticsService();
    await expect(svc.getLeaderboard(orgId, TRACK)).rejects.toThrow(/not available for leaderboards/i);
    await expect(svc.getMostImproved(orgId, TRACK)).rejects.toThrow(/not available for improvement rankings/i);
    expect((await svc.getLeaderboard(orgId, CTRL)).rankings.length).toBe(3);
  });

  it.each(['leaderboard', 'most-improved'])('GET /api/analytics/%s with a tracking metric -> 400', async (route) => {
    const res = await request(app)
      .get(`/api/analytics/${route}`)
      .query({ organizationId: orgId, metric: TRACK })
      .set('Cookie', adminCookie);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(new RegExp(`${TRACK} is not available`));
  });

  it('individual percentiles and event percentiles skip tracking metrics; team averages keep them', async () => {
    const svc = new ReportService();
    const performances = { [TRACK]: 160, [CTRACK]: 171, [CTRL]: 1.5 };
    const metrics = Object.keys(performances);
    const { percentiles, teamAverages, peerValues } = await svc.calculatePercentilesAndAverages(
      athleteIds[1], orgId, metrics, performances, '2026-03-01', '2026-03-31',
    );
    expect(Object.keys(percentiles)).toEqual([CTRL]);
    expect(Object.keys(peerValues)).toEqual([CTRL]);
    expect(Object.keys(teamAverages).sort()).toEqual([TRACK, CTRACK, CTRL].sort());
    const events = await svc.calculateEventPercentiles(athleteIds[1], EVENT_ID, metrics, performances, orgId);
    expect(Object.keys(events.percentiles)).toEqual([CTRL]);
  });

  it('team report: no percentile, top performer or distribution for tracking metrics; values and averages stay', async () => {
    const reportId = await createReport('team', {
      eventId: EVENT_ID,
      includeEventPercentiles: true,
      compositeIndex: { enabled: true, weights: { [TRACK]: 1, [CTRACK]: 1 } },
      charts: { boxSwarm: true },
    });
    const data: any = await new ReportService().generateTeamReport(reportId, coachId);

    const stat = (code: string) => data.teamStatistics.find((s: any) => s.metric === code);
    expect(stat(TRACK).topPerformer).toBeUndefined();
    expect(stat(CTRACK).topPerformer).toBeUndefined();
    expect(stat(TRACK).average).toBeGreaterThan(0);
    expect(stat(CTRL).topPerformer).toBeDefined();
    expect(data.athleteRankings).toHaveLength(3);
    for (const a of data.athleteRankings) {
      expect(Object.keys(a.percentiles)).toEqual([CTRL]);
      expect(Object.keys(a.eventPercentiles)).toEqual([CTRL]);
      expect(a.measurements[TRACK]).toBeDefined();
      expect(a.teamAverages[TRACK]).toBeDefined();
      // Only tracking metrics are weighted: no composite score at all, rather than 0
      expect(a.compositeIndex).toBeUndefined();
    }
    expect(Object.keys(data.teamDistributions)).toEqual([CTRL]);
  });

  it('team report composite weights only the ranked metrics and sorts by them', async () => {
    const reportId = await createReport('team', { compositeIndex: { enabled: true, weights: { [TRACK]: 5, [CTRL]: 1 } } });
    const data: any = await new ReportService().generateTeamReport(reportId, coachId);
    for (const a of data.athleteRankings) expect(a.compositeIndex).toBe(a.percentiles[CTRL]);
    const scores = data.athleteRankings.map((a: any) => a.compositeIndex);
    expect(scores).toEqual([...scores].sort((x: number, y: number) => y - x));
  });

  it('individual report: no percentile or distribution for tracking metrics', async () => {
    const reportId = await createReport('individual', { charts: { distribution: true } });
    const data: any = await new ReportService().generateIndividualReport(reportId, coachId, athleteIds[1]);
    expect(Object.keys(data.athlete.percentiles)).toEqual([CTRL]);
    expect(data.athlete.measurements[TRACK]).toBeDefined();
    expect(data.athlete.teamAverages[TRACK]).toBeDefined();
    expect(Object.keys(data.distributions)).toEqual([CTRL]);
  });

  it('served data lists the tracking metrics and strips ranking from data stored before the rule', async () => {
    const athlete = (pct: number) => ({
      measurements: { [TRACK]: 150, [CTRACK]: 170, [CTRL]: 1.5 },
      percentiles: { [TRACK]: pct, [CTRACK]: pct, [CTRL]: pct },
      eventPercentiles: { [TRACK]: pct, [CTRL]: pct },
      teamAverages: { [TRACK]: 160, [CTRL]: 1.6 },
    });
    const dist = { values: [1, 2], athleteValue: 1, stats: {}, direction: 'higher' };
    const team = {
      reportType: 'team',
      reportConfig: { metrics: [TRACK, CTRACK, CTRL] },
      teamStatistics: [
        { metric: TRACK, average: 160, topPerformer: { userId: 'x', userName: 'X', value: 170 } },
        { metric: CTRL, average: 1.6, topPerformer: { userId: 'y', userName: 'Y', value: 1.4 } },
      ],
      athleteRankings: [athlete(90), athlete(10)],
      teamDistributions: { [TRACK]: dist, [CTRL]: dist },
    };
    const individual = {
      reportType: 'individual',
      reportConfig: { metrics: [TRACK, CTRACK, CTRL] },
      athlete: athlete(50),
      distributions: { [TRACK]: dist, [CTRL]: dist },
    };

    const [t, ind, ev]: any[] = await new ReportService().orderManyForResponse([team, individual, { reportType: 'eval' }], orgId);

    for (const d of [t, ind]) expect([...d.unrankedMetrics].sort()).toEqual([TRACK, CTRACK].sort());
    expect(t.teamStatistics.find((s: any) => s.metric === TRACK).topPerformer).toBeUndefined();
    expect(t.teamStatistics.find((s: any) => s.metric === TRACK).average).toBe(160);
    expect(t.teamStatistics.find((s: any) => s.metric === CTRL).topPerformer.userName).toBe('Y');
    for (const a of [...t.athleteRankings, ind.athlete]) {
      expect(Object.keys(a.percentiles)).toEqual([CTRL]);
      expect(Object.keys(a.eventPercentiles)).toEqual([CTRL]);
      expect(Object.keys(a.measurements)).toHaveLength(3);
      expect(a.teamAverages[TRACK]).toBe(160);
    }
    expect(Object.keys(t.teamDistributions)).toEqual([CTRL]);
    expect(Object.keys(ind.distributions)).toEqual([CTRL]);
    expect(ev).toEqual({ reportType: 'eval' });
    // The stored input is not mutated
    expect(team.athleteRankings[0].percentiles[TRACK]).toBe(90);
  });

  it('a report with no tracking metric serves an empty list and keeps its rankings', async () => {
    const data = { reportType: 'individual', athlete: { measurements: { [CTRL]: 1.5 }, percentiles: { [CTRL]: 40 } } };
    const out: any = await new ReportService().orderForResponse(data, orgId);
    expect(out.unrankedMetrics).toEqual([]);
    expect(out.athlete.percentiles).toEqual({ [CTRL]: 40 });
  });
});
