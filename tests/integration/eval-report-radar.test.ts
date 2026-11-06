/**
 * AM-FEAT-024 P2: the percentile radar in the eval report. Preview and save build the radar for the coach's
 * comparison group (site norms, this event, a team), freeze it with provenance, and a later change to the
 * distributions never touches a saved report. Authorization is the existing canAccessEvalRow-style gate
 * (coach / org admin of the event's organization, otherwise 404).
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import express, { type Express } from 'express';
import { eq, inArray, like, sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { registerEventReportRoutes } from '../../packages/api/routes/event-report-routes';
import {
  benchmarkDistributions, benchmarkDistributionVersions, events, measurements, organizations, reports, siteMetrics, teams,
  userOrganizations, userTeams, users,
} from '@shared/schema';
import { buildEvalReportPdf } from '../../packages/api/utils/eval-report-pdf';
import { purgeTestRows } from '../helpers/purge-test-rows';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const AXIS_CODES = ['DASH_10YD', 'FLY10_TIME_RI30', 'JUMP_CMJ_HOH', 'RSI_105', 'AGILITY_505_M', 'JUMP_BROAD'] as const;
const LEG_CODES = ['AGILITY_505_M_L', 'AGILITY_505_M_R'] as const;
const METRICS: Array<[string, string, string, string]> = [
  ['DASH_10YD', 'speed', 's', 'lower_is_better'],
  ['FLY10_TIME_RI30', 'speed', 's', 'lower_is_better'],
  ['JUMP_CMJ_HOH', 'power', 'in', 'higher_is_better'],
  ['RSI_105', 'power', '', 'higher_is_better'],
  ['AGILITY_505_M', 'agility', 's', 'lower_is_better'],
  ['AGILITY_505_M_L', 'agility', 's', 'lower_is_better'],
  ['AGILITY_505_M_R', 'agility', 's', 'lower_is_better'],
  ['JUMP_BROAD', 'power', 'in', 'higher_is_better'],
];
const RADAR_ON = { sections: { radar: true } };

describe('eval report radar', () => {
  let app: Express;
  let orgA: string;
  let orgB: string;
  let eventA: string;
  let teamA: string;
  let teamB: string;
  let versionId: string;
  let laterThanAll: number;
  const eventIds: string[] = [];
  const teamIds: string[] = [];
  const createdMetricCodes: string[] = [];
  const u: Record<string, any> = {};
  let ipCounter = 0;

  const mkUser = async (tag: string, extra: Record<string, unknown> = {}) => {
    const [row] = await db
      .insert(users)
      .values({
        username: `evalradar-${tag}-${suffix}`, emails: [`evalradar-${tag}-${suffix}@test.com`], password: 'x',
        firstName: 'Radar', lastName: tag, fullName: `Radar ${tag}`, ...extra,
      } as any)
      .returning();
    u[tag] = row;
    return row;
  };
  const measure = (userId: string, metric: string, value: number, over: Record<string, unknown> = {}) =>
    db.insert(measurements).values({
      userId, submittedBy: u.coach.id, date: '2026-05-01', age: 13, metric, value: String(value), units: 's',
      isVerified: true, eventId: eventA, organizationId: orgA, ...over,
    } as any);
  const as = (userKey: string, method: 'get' | 'post', path: string) =>
    (request(app) as any)[method](path).set('x-test-user', u[userKey].id);
  const path = (eventId = eventA, athleteId = u.athlete?.id) => `/api/events/${eventId}/athletes/${athleteId}/eval-report`;
  const preview = (userKey: string, selection: object, eventId = eventA) =>
    as(userKey, 'post', `${path(eventId)}/preview`).send({ selection });
  const save = (userKey: string, selection: object, eventId = eventA) => as(userKey, 'post', path(eventId)).send({ selection });
  const axis = (model: any, id: string) => model.radar.axes.find((a: any) => a.axis === id);

  const mkVersion = async (label: string, values: (code: string) => number[], createdAt: Date, band: [number, number] = [13, 14]) => {
    const [v] = await db
      .insert(benchmarkDistributionVersions)
      .values({ label: `evalradar-${suffix}-${label}`, source: `Radar test ${label}`, createdAt } as any)
      .returning({ id: benchmarkDistributionVersions.id });
    await db.insert(benchmarkDistributions).values(
      AXIS_CODES.map((metricCode) => {
        const vals = values(metricCode);
        return { versionId: v.id, metricCode, sex: 'male', ageMin: band[0], ageMax: band[1], kind: 'raw', n: vals.length, values: vals };
      }) as any,
    );
    return v.id;
  };
  const range = (n: number, from = 1, step = 1) => Array.from({ length: n }, (_, i) => from + i * step);

  beforeAll(async () => {
    for (const [code, category, unit, metricType] of METRICS) {
      const inserted = await db.insert(siteMetrics).values({ code, label: code, category, unit, metricType } as any).onConflictDoNothing().returning({ code: siteMetrics.code });
      if (inserted.length) createdMetricCodes.push(code);
    }
    [{ id: orgA }] = await db.insert(organizations).values({ name: `EvalRadar Org A ${suffix}` }).returning();
    [{ id: orgB }] = await db.insert(organizations).values({ name: `EvalRadar Org B ${suffix}` }).returning();
    await mkUser('coach');
    await mkUser('orgAdmin');
    await mkUser('otherCoach');
    await mkUser('athleteRole', { gender: 'Male', birthDate: '2013-03-01' });
    await mkUser('athlete', { gender: 'Male', birthDate: '2013-03-01' }); // 13 at the event
    await mkUser('girl', { gender: 'Female', birthDate: '2013-03-01' });
    await db.insert(userOrganizations).values([
      { userId: u.coach.id, organizationId: orgA, role: 'coach' },
      { userId: u.orgAdmin.id, organizationId: orgA, role: 'org_admin' },
      { userId: u.otherCoach.id, organizationId: orgB, role: 'coach' },
      { userId: u.athleteRole.id, organizationId: orgA, role: 'athlete' },
      { userId: u.athlete.id, organizationId: orgA, role: 'athlete' },
      { userId: u.girl.id, organizationId: orgA, role: 'athlete' },
    ] as any);
    [{ id: eventA }] = await db.insert(events).values({ organizationId: orgA, name: `Radar Event ${suffix}`, startDate: new Date('2026-05-01T10:00:00Z') } as any).returning({ id: events.id });
    eventIds.push(eventA);
    [{ id: teamA }, { id: teamB }] = await db.insert(teams).values([
      { organizationId: orgA, name: `Radar Team A ${suffix}` },
      { organizationId: orgB, name: `Radar Team B ${suffix}` },
    ] as any).returning();
    teamIds.push(teamA, teamB);

    // Subject athlete: every axis measured; the 5-0-5 legs average 2.6
    for (const [code, value, units] of [
      ['DASH_10YD', 2.0, 's'], ['FLY10_TIME_RI30', 1.0, 's'], ['JUMP_CMJ_HOH', 15, 'in'], ['RSI_105', 15, ''], ['JUMP_BROAD', 15, 'in'],
      ['AGILITY_505_M_L', 2.5, 's'], ['AGILITY_505_M_R', 2.7, 's'],
    ] as const) await measure(u.athlete.id, code, value, { units });
    // A girl with the same data has no female distribution and must be unscored
    await measure(u.girl.id, 'DASH_10YD', 2.0);

    // Newest version wins; the numbers are chosen so every sample is 1..30 (x=15 -> mid-rank 48.3)
    // Versions left behind by earlier runs (immutable on migrated DBs) must not outrank these: go after the newest
    const [{ newest }] = await db.select({ newest: sql<string | null>`max(${benchmarkDistributionVersions.createdAt})` }).from(benchmarkDistributionVersions);
    laterThanAll = Math.max(Date.now(), newest ? new Date(newest + 'Z').getTime() : 0);
    versionId = await mkVersion('v1', () => range(30), new Date(laterThanAll + 86_400_000));

    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const user = Object.values(u).find((x: any) => x.id === req.get('x-test-user')) as any;
      req.session = { user: user ? { id: user.id, username: user.username, role: 'coach', isSiteAdmin: false } : undefined };
      Object.defineProperty(req, 'ip', { value: `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });
      next();
    });
    registerEventReportRoutes(app);
  });

  afterAll(async () => {
    // On DBs with the 0179 trigger distribution rows cannot be deleted; only that error is tolerated
    const tolerate = (e: any) => { if (!/immutable|violates foreign key/.test(String(e?.message) + String(e?.cause?.message))) throw e; };
    const versionIds = (await db.select({ id: benchmarkDistributionVersions.id }).from(benchmarkDistributionVersions).where(like(benchmarkDistributionVersions.label, `evalradar-${suffix}%`))).map((v) => v.id);
    if (versionIds.length) await db.delete(benchmarkDistributions).where(inArray(benchmarkDistributions.versionId, versionIds)).catch(tolerate);
    await db.delete(benchmarkDistributionVersions).where(like(benchmarkDistributionVersions.label, `evalradar-${suffix}%`)).catch(tolerate);
    await db.delete(reports).where(inArray(reports.organizationId, [orgA, orgB]));
    await db.delete(measurements).where(inArray(measurements.eventId, eventIds));
    await db.delete(userTeams).where(inArray(userTeams.teamId, teamIds));
    await db.delete(events).where(inArray(events.id, eventIds));
    await purgeTestRows({ usernameLike: [`evalradar-%-${suffix}`], orgIds: [orgA, orgB], teamIds });
    if (createdMetricCodes.length) await db.delete(siteMetrics).where(inArray(siteMetrics.code, createdMetricCodes)).catch(tolerate);
  });

  it('has no radar unless the radar section is on', async () => {
    const res = await preview('coach', {});
    expect(res.status).toBe(200);
    expect(res.body.model.radar).toBeUndefined();
  });

  it('previews the norm radar: six axes with the version provenance, 5-0-5 as the leg mean', async () => {
    const res = await preview('coach', RADAR_ON);
    expect(res.status).toBe(200);
    const { model } = res.body;
    expect(model.modelVersion).toBe(2);
    expect(model.radar.cohortKind).toBe('norm');
    expect(model.radar.axes).toHaveLength(6);
    const accel = axis(model, 'acceleration');
    expect(accel.cohortKind).toBe('norm');
    expect(accel.n).toBe(30);
    expect(accel.source).toBe('Radar test v1');
    expect(accel.distributionVersionId).toBe(versionId);
    expect(accel.cohortLabel).toContain('Radar test v1');
    expect(accel.percentile).toBe(95); // 1..30, x=2.0: below 1, equal 1 -> 5th percentile, lower is better
  });

  it('scores the 5-0-5 axis on the mean and shows the fly as mph with the raw time', async () => {
    const { model } = (await preview('coach', RADAR_ON)).body;
    const cod = axis(model, 'changeOfDirection');
    expect(cod.value).toBeCloseTo(2.6);
    expect(cod.percentile).not.toBeNull();
    const fly = axis(model, 'highSpeedRunning');
    expect(fly.displayValue).toBe('20.5 mph');
    expect(fly.detail).toBe('1 s');
  });

  it('leaves every axis unscored for an athlete whose sex has no distribution', async () => {
    const res = await as('coach', 'post', `${path(eventA, u.girl.id)}/preview`).send({ selection: RADAR_ON });
    expect(res.status).toBe(200);
    expect(res.body.model.radar.scoredCount).toBe(0);
    expect(res.body.model.radar.axes.every((a: any) => a.percentile === null)).toBe(true);
  });

  it('saves the radar frozen with provenance; a newer or edited distribution never changes the saved report', async () => {
    const saved = await save('coach', RADAR_ON);
    expect(saved.status).toBe(201);
    const before = (await db.select().from(reports).where(eq(reports.id, saved.body.report.id)))[0];
    const frozen = (before.config as any).model.radar;
    expect(frozen.axes.map((a: any) => a.distributionVersionId)).toContain(versionId);
    expect((before.config as any).model.modelVersion).toBe(2);

    // A newer version with very different values: new previews use it, the saved row does not move
    const newer = await mkVersion('v2', () => range(40, 100), new Date(laterThanAll + 172_800_000));
    const next = await preview('coach', RADAR_ON);
    expect(axis(next.body.model, 'acceleration').distributionVersionId).toBe(newer);
    const after = (await db.select().from(reports).where(eq(reports.id, saved.body.report.id)))[0];
    expect((after.config as any).model.radar).toEqual(frozen);
  });

  it('renders the saved model to a PDF', async () => {
    const saved = await save('coach', RADAR_ON);
    const { doc, blocks } = buildEvalReportPdf((saved.body.report.config as any).model, {});
    expect(doc.getNumberOfPages()).toBeGreaterThan(0);
    expect(blocks.some((b) => b.kind === 'radar')).toBe(true);
  });

  describe('event and team groups', () => {
    const peerRows = async (ids: string[], over: Record<string, unknown> = {}) => {
      for (const id of ids) {
        await measure(id, 'DASH_10YD', 1.5 + Math.random() * 0.4, over);
        await measure(id, 'JUMP_CMJ_HOH', 10 + Math.random(), { units: 'in', ...over });
      }
    };

    it('event group: nine athletes do not score, ten do; an unverified or foreign-org peer does not count', async () => {
      const peers = Array.from({ length: 7 }, () => randomUUID());
      await peerRows(peers);
      // Seven peers + the subject + the girl who also ran = 9: below the minimum of 10
      let res = await preview('coach', { ...RADAR_ON, radarCohort: { kind: 'event' } });
      expect(axis(res.body.model, 'acceleration').n).toBe(9);
      expect(axis(res.body.model, 'acceleration').percentile).toBeNull();
      // Unverified and other-organization rows are ignored
      await peerRows([randomUUID()], { isVerified: false });
      await peerRows([randomUUID()], { organizationId: orgB });
      res = await preview('coach', { ...RADAR_ON, radarCohort: { kind: 'event' } });
      expect(axis(res.body.model, 'acceleration').n).toBe(9);
      await peerRows([randomUUID()]);
      res = await preview('coach', { ...RADAR_ON, radarCohort: { kind: 'event' } });
      const accel = axis(res.body.model, 'acceleration');
      expect(accel.n).toBe(10);
      expect(accel.cohortKind).toBe('event');
      expect(accel.cohortLabel).toBe('This event (all athletes)');
      expect(accel.distributionVersionId).toBeNull();
      // The subject's 2.0 s ties with the girl's 2.0 s and is slower than every peer (all under 1.9): (8 + 0.5 * 2) / 10 = 90, inverted
      expect(accel.percentile).toBe(10);
    });

    it('team group: only members of the chosen team, labelled with the team name', async () => {
      const members: string[] = [];
      for (let i = 0; i < 10; i++) {
        const m = await mkUser(`member${i}`, { gender: 'Male', birthDate: '2013-03-01' });
        members.push(m.id);
        await measure(m.id, 'DASH_10YD', 2.1 + i / 100);
      }
      await db.insert(userTeams).values(members.map((userId) => ({ userId, teamId: teamA })) as any);
      const res = await preview('coach', { ...RADAR_ON, radarCohort: { kind: 'team', teamId: teamA } });
      expect(res.status).toBe(200);
      const accel = axis(res.body.model, 'acceleration');
      expect(accel.cohortKind).toBe('team');
      expect(accel.cohortLabel).toBe(`Radar Team A ${suffix} (whole team)`);
      expect(accel.n).toBe(10);
      expect(accel.percentile).not.toBeNull();
      // Team peers have no jump: that axis has n = 0 and is unscored
      expect(axis(res.body.model, 'verticalPower').percentile).toBeNull();
    });

    it('rejects a team from another organization or an unknown team with 400, on preview and save', async () => {
      for (const teamId of [teamB, randomUUID()]) {
        const sel = { ...RADAR_ON, radarCohort: { kind: 'team', teamId } };
        expect((await preview('coach', sel)).status).toBe(400);
        expect((await save('coach', sel)).status).toBe(400);
      }
    });
  });

  it('gates the radar like the rest of the eval report: org admin yes; athlete role and other-org coach get 404', async () => {
    expect((await preview('orgAdmin', RADAR_ON)).status).toBe(200);
    expect((await preview('athleteRole', RADAR_ON)).status).toBe(404);
    expect((await preview('otherCoach', { ...RADAR_ON, radarCohort: { kind: 'team', teamId: teamB } })).status).toBe(404);
  });

  it('the model carries no survey-style field names', async () => {
    const { model } = (await preview('coach', RADAR_ON)).body;
    expect(JSON.stringify(model)).not.toMatch(/sleep|soreness|stress|energy|cycle|wellness|mood|readiness|pain/i);
  });

  describe('norm version selection', () => {
    const DAY = 86_400_000;
    it('with two versions for the same cohort only the newer one scores', async () => {
      const older = await mkVersion('sel-old', () => range(30), new Date(laterThanAll + 5 * DAY));
      const newer = await mkVersion('sel-new', () => range(40, 100), new Date(laterThanAll + 6 * DAY));
      const { model } = (await preview('coach', RADAR_ON)).body;
      const accel = axis(model, 'acceleration');
      expect(accel.distributionVersionId).toBe(newer);
      expect(accel.distributionVersionId).not.toBe(older);
      expect(accel.n).toBe(40);
      expect(accel.source).toBe('Radar test sel-new');
    });

    it('uses an older version when the newer one lacks the athlete\'s age band', async () => {
      const older = await mkVersion('band-old', () => range(30), new Date(laterThanAll + 7 * DAY));
      await mkVersion('band-new', () => range(40, 100), new Date(laterThanAll + 8 * DAY), [15, 16]);
      const { model } = (await preview('coach', RADAR_ON)).body;
      const accel = axis(model, 'acceleration');
      expect(accel.distributionVersionId).toBe(older);
      expect(accel.n).toBe(30);
    });
  });
});
