/**
 * AM-FEAT-019 P3c: access-matrix gaps for eval reports that eval-report-access.test.ts does not cover:
 * age-derived share blocking independent of isMinor, POST /api/reports refusing 'eval', an org_admin of
 * another org, unauthenticated callers, expired / revoked snapshots, a parent of another athlete, and the
 * scoped GET /api/events/:eventId/reports list.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { registerEventReportRoutes } from '../../packages/api/routes/event-report-routes';
import { registerReportRoutes } from '../../packages/api/routes/report-routes';
import {
  events, measurements, organizations, parentAthleteLinks, reports, reportShares, reportSnapshots,
  userOrganizations, users,
} from '@shared/schema';
import { purgeTestRows } from '../helpers/purge-test-rows';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const NOT_FOUND = { message: 'Report not found' };
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/** YYYY-MM-DD for `years` years and ~100 days ago, so the age stays put for a few months of wall-clock drift */
function bornAbout(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 100);
  return d.toISOString().slice(0, 10);
}

describe('eval report access matrix', () => {
  let app: Express;
  let orgA: string;
  let orgB: string;
  let eventId: string;
  let otherEventId: string;
  let eventIdB: string;
  const u: Record<string, any> = {};
  const rid: Record<string, string> = {};
  let ipCounter = 0;

  const mkUser = async (tag: string, extra: Record<string, unknown> = {}) => {
    const [row] = await db
      .insert(users)
      .values({
        username: `evalmx-${tag}-${suffix}`,
        emails: [`evalmx-${tag}-${suffix}@test.com`],
        password: 'x',
        firstName: 'Mx',
        lastName: tag,
        fullName: `Mx ${tag}`,
        isMinor: false,
        ...extra,
      } as any)
      .returning();
    u[tag] = row;
    return row;
  };

  const as = (userKey: string | null, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => {
    const r = (request(app) as any)[method](path).set('x-forwarded-test', String(++ipCounter));
    return userKey ? r.set('x-test-user', u[userKey].id) : r;
  };

  beforeAll(async () => {
    [{ id: orgA }] = await db.insert(organizations).values({ name: `EvalMx Org A ${suffix}` }).returning();
    [{ id: orgB }] = await db.insert(organizations).values({ name: `EvalMx Org B ${suffix}` }).returning();

    await mkUser('coachA');
    await mkUser('coachB');
    await mkUser('orgAdminB');
    await mkUser('adult', { gender: 'Female', birthDate: '2000-03-01', sports: ['Soccer'] });
    await mkUser('other', { gender: 'Female', birthDate: '2000-03-01', sports: ['Soccer'] });
    // Under 13 TODAY but not flagged isMinor: only the isUnder13(birthDate) check can block these
    await mkUser('young', { gender: 'Female', birthDate: bornAbout(11), sports: ['Soccer'], isMinor: false });
    // 13-17 and not flagged isMinor: current behaviour is that the share goes through
    await mkUser('teen', { gender: 'Female', birthDate: bornAbout(15), sports: ['Soccer'], isMinor: false });
    // 15 and flagged isMinor: sharing is blocked for under-13 only, so this account can receive its eval
    await mkUser('teenMinor', { gender: 'Female', birthDate: bornAbout(15), sports: ['Soccer'], isMinor: true });
    // 13 today, 12 at the event, flagged isMinor: age TODAY decides
    await mkUser('justTurned13', { gender: 'Female', birthDate: bornAbout(13), sports: ['Soccer'], isMinor: true });
    await mkUser('noDob', { gender: 'Female', sports: ['Soccer'] });
    await mkUser('parentOfOther');

    await db.insert(userOrganizations).values([
      { userId: u.coachA.id, organizationId: orgA, role: 'coach' },
      { userId: u.coachB.id, organizationId: orgB, role: 'coach' },
      { userId: u.orgAdminB.id, organizationId: orgB, role: 'org_admin' },
      ...['adult', 'other', 'young', 'teen', 'teenMinor', 'justTurned13', 'noDob'].map((t) => ({ userId: u[t].id, organizationId: orgA, role: 'athlete' })),
    ] as any);

    await db.insert(parentAthleteLinks).values([
      { parentEmail: `mxp-${suffix}@test.com`, parentUserId: u.parentOfOther.id, athleteUserId: u.other.id, organizationId: orgA, isActive: true },
    ] as any);

    const now = new Date();
    const [e] = await db.insert(events).values({ organizationId: orgA, name: `EvalMx Event ${suffix}`, startDate: now } as any).returning({ id: events.id });
    const [e2] = await db.insert(events).values({ organizationId: orgA, name: `EvalMx Other Event ${suffix}`, startDate: now } as any).returning({ id: events.id });
    const [eb] = await db.insert(events).values({ organizationId: orgB, name: `EvalMx B Event ${suffix}`, startDate: now } as any).returning({ id: events.id });
    eventId = e.id;
    otherEventId = e2.id;
    eventIdB = eb.id;
    const today = now.toISOString().slice(0, 10);
    for (const t of ['adult', 'other', 'young', 'teen', 'teenMinor', 'justTurned13', 'noDob']) {
      await db.insert(measurements).values({
        userId: u[t].id, submittedBy: u.coachA.id, date: today, age: 15, metric: 'DASH_10YD',
        value: '2.0', units: 's', isVerified: true, eventId, organizationId: orgA,
      } as any);
    }

    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const user = Object.values(u).find((x: any) => x.id === req.get('x-test-user')) as any;
      const tag = Object.keys(u).find((k) => u[k] === user);
      const primary: Record<string, string> = { coachB: orgB, orgAdminB: orgB };
      req.session = { user: user ? { id: user.id, username: user.username, role: 'coach', isSiteAdmin: false, primaryOrganizationId: primary[tag!] ?? orgA } : undefined };
      Object.defineProperty(req, 'ip', { value: `10.3.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });
      next();
    });
    registerEventReportRoutes(app);
    registerReportRoutes(app);

    for (const t of ['adult', 'other', 'young', 'teen', 'teenMinor', 'justTurned13', 'noDob']) {
      const res = await as('coachA', 'post', `/api/events/${eventId}/athletes/${u[t].id}/eval-report`).send({ coachNote: 'Private coach note' });
      expect(res.status, t).toBe(201);
      rid[t] = res.body.report.id;
    }
    // justTurned13 was 12 on the event date: dated before the 13th birthday, still shareable because age today decides
    {
      const [row] = await db.select().from(reports).where(eq(reports.id, rid.justTurned13));
      const cfg = row.config as any;
      const [y, m, d] = String(u.justTurned13.birthDate).split('-').map(Number);
      const at12 = new Date(y + 12, m - 1, d).toISOString().slice(0, 10);
      await db.update(reports).set({ config: { ...cfg, model: { ...cfg.model, eventDate: at12 } } as any }).where(eq(reports.id, rid.justTurned13));
    }
    // The 'young' eval is dated after the athlete's 13th birthday so that, for the report row, the age-at-event
    // check says "not restricted". Only the current-age check (isUnder13(birthDate)) can then block the share.
    for (const t of ['young']) {
      const [row] = await db.select().from(reports).where(eq(reports.id, rid[t]));
      const cfg = row.config as any;
      const [y, m, d] = String(u[t].birthDate).split('-').map(Number);
      const after13 = new Date(y + 14, m - 1, d).toISOString().slice(0, 10);
      await db.update(reports).set({ config: { ...cfg, model: { ...cfg.model, eventDate: after13 } } as any }).where(eq(reports.id, rid[t]));
    }
  });

  afterAll(async () => {
    const orgs = [orgA, orgB];
    await db.delete(reports).where(inArray(reports.organizationId, orgs));
    await db.delete(measurements).where(inArray(measurements.eventId, [eventId, otherEventId, eventIdB]));
    await db.delete(events).where(inArray(events.id, [eventId, otherEventId, eventIdB]));
    await purgeTestRows({ usernameLike: [`evalmx-%-${suffix}`], orgIds: orgs });
  });

  describe('age-based share blocking independent of isMinor', () => {
    it('under 13 today with isMinor=false: /share is 403 UNDER_13_SHARE_BLOCKED and writes no row', async () => {
      const res = await as('coachA', 'post', `/api/reports/${rid.young}/share`).send({ athleteId: u.young.id });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('UNDER_13_SHARE_BLOCKED');
      expect(await db.select().from(reportShares).where(eq(reportShares.reportId, rid.young))).toEqual([]);
    });

    it('under 13 today with isMinor=false: bulk-distribute reports blocked_under_13', async () => {
      const res = await as('coachA', 'post', '/api/reports/bulk-distribute').send({ reportIds: [rid.young] });
      expect(res.status).toBe(200);
      expect(res.body.results.map((r: any) => r.status)).toEqual(['blocked_under_13']);
      expect(await db.select().from(reportShares).where(eq(reportShares.reportId, rid.young))).toEqual([]);
    });

    it('13-17 with isMinor=false: /share succeeds (current behaviour for isMinor=false only)', async () => {
      const res = await as('coachA', 'post', `/api/reports/${rid.teen}/share`).send({ athleteId: u.teen.id });
      expect(res.status).toBe(201);
    });

    it('15 with isMinor=true: /share is 201 and the athlete sees the eval in /api/my/reports', async () => {
      const res = await as('coachA', 'post', `/api/reports/${rid.teenMinor}/share`).send({ athleteId: u.teenMinor.id });
      expect(res.status).toBe(201);
      const mine = await as('teenMinor', 'get', '/api/my/reports');
      expect(mine.status).toBe(200);
      expect(mine.body.reports.find((r: any) => r.reportId === rid.teenMinor)).toBeTruthy();
    });

    it('bulk-distribute delivers to a 15-year-old flagged isMinor=true', async () => {
      await db.delete(reportShares).where(eq(reportShares.reportId, rid.teenMinor));
      const res = await as('coachA', 'post', '/api/reports/bulk-distribute').send({ reportIds: [rid.teenMinor] });
      expect(res.status).toBe(200);
      expect(res.body.results.map((r: any) => r.status)).not.toContain('blocked_under_13');
      expect(await db.select().from(reportShares).where(eq(reportShares.reportId, rid.teenMinor))).toHaveLength(1);
    });

    it('12 at the event but 13 today (isMinor=true): not blocked, age today decides', async () => {
      const res = await as('coachA', 'post', `/api/reports/${rid.justTurned13}/share`).send({ athleteId: u.justTurned13.id });
      expect(res.status).toBe(201);
    });

    it('no date of birth: blocked on /share and bulk-distribute', async () => {
      const res = await as('coachA', 'post', `/api/reports/${rid.noDob}/share`).send({ athleteId: u.noDob.id });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('UNDER_13_SHARE_BLOCKED');
      const bulk = await as('coachA', 'post', '/api/reports/bulk-distribute').send({ reportIds: [rid.noDob] });
      expect(bulk.body.results.map((r: any) => r.status)).toEqual(['blocked_under_13']);
    });
  });

  describe('POST /api/reports', () => {
    it("refuses reportType 'eval' with 400 and creates no row", async () => {
      const before = await db.select().from(reports).where(eq(reports.organizationId, orgA));
      const res = await as('coachA', 'post', '/api/reports').send({
        organizationId: orgA, name: 'Sneaky eval', reportType: 'eval',
        config: { eventId, athleteId: u.adult.id, metrics: [], model: {} },
      });
      expect(res.status).toBe(400);
      const after = await db.select().from(reports).where(eq(reports.organizationId, orgA));
      expect(after.length).toBe(before.length);
    });
  });

  // One loop over every authenticated route that takes an eval id
  const routes: Array<[string, 'get' | 'post' | 'put' | 'patch' | 'delete', (id: string) => string, (() => any)?]> = [
    ['GET report', 'get', (id) => `/api/reports/${id}`],
    ['PUT report', 'put', (id) => `/api/reports/${id}`, () => ({ name: 'hacked' })],
    ['GET snapshots', 'get', (id) => `/api/reports/${id}/snapshots`],
    ['POST snapshots', 'post', (id) => `/api/reports/${id}/snapshots`, () => ({})],
    ['POST share', 'post', (id) => `/api/reports/${id}/share`, () => ({ athleteId: u.adult.id })],
    ['POST share-bulk', 'post', (id) => `/api/reports/${id}/share-bulk`, () => ({ athleteIds: [u.adult.id] })],
    ['GET shares', 'get', (id) => `/api/reports/${id}/shares`],
    ['GET pdf', 'get', (id) => `/api/reports/${id}/pdf`],
    ['POST pdf', 'post', (id) => `/api/reports/${id}/pdf`, () => ({})],
    ['PATCH archive', 'patch', (id) => `/api/reports/${id}/archive`],
    ['PATCH unarchive', 'patch', (id) => `/api/reports/${id}/unarchive`],
    ['PATCH pin', 'patch', (id) => `/api/reports/${id}/pin`],
    ['PATCH unpin', 'patch', (id) => `/api/reports/${id}/unpin`],
    ['POST generate', 'post', (id) => `/api/reports/${id}/generate`, () => ({ athleteId: u.adult.id })],
    ['DELETE report', 'delete', (id) => `/api/reports/${id}`],
  ];

  describe('org_admin of ANOTHER org', () => {
    for (const [label, method, path, body] of routes) {
      it(`${label}: 404 with the not-found body`, async () => {
        const req = as('orgAdminB', method, path(rid.adult));
        const res = await (body === undefined ? req : req.send(body()));
        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND);
      });
    }

    it('GET /api/events/:eventId/reports is 403', async () => {
      expect((await as('orgAdminB', 'get', `/api/events/${eventId}/reports`)).status).toBe(403);
    });

    it('the report is untouched', async () => {
      const [row] = await db.select().from(reports).where(eq(reports.id, rid.adult));
      expect(row).toBeTruthy();
      expect(row.name).not.toBe('hacked');
    });
  });

  describe('unauthenticated requests', () => {
    it('are 401 on GET /api/reports/:id, GET /api/reports/:id/pdf and GET /api/events/:eventId/reports', async () => {
      expect((await as(null, 'get', `/api/reports/${rid.adult}`)).status).toBe(401);
      expect((await as(null, 'get', `/api/reports/${rid.adult}/pdf`)).status).toBe(401);
      expect((await as(null, 'get', `/api/events/${eventId}/reports`)).status).toBe(401);
    });
  });

  describe('a linked parent of ANOTHER athlete', () => {
    for (const [label, method, path, body] of routes) {
      it(`${label}: refused, nothing leaks`, async () => {
        const req = as('parentOfOther', method, path(rid.adult));
        const res = await (body === undefined ? req : req.send(body()));
        expect([403, 404], `${label} -> ${res.status}`).toContain(res.status);
        if (res.status === 404) expect(res.body).toEqual(NOT_FOUND);
        expect(JSON.stringify(res.body)).not.toContain('Private coach note');
      });
    }

    it('GET /api/events/:eventId/reports is 403', async () => {
      expect((await as('parentOfOther', 'get', `/api/events/${eventId}/reports`)).status).toBe(403);
    });
  });

  describe('expired and revoked eval snapshots answer like other reports', () => {
    const make = async (kind: 'eval' | 'team', state: 'expired' | 'revoked') => {
      let reportId = rid.adult;
      if (kind === 'team') {
        const [t] = await db.insert(reports).values({
          organizationId: orgA, createdBy: u.coachA.id, name: `Mx team ${state} ${suffix}`, reportType: 'team',
          config: { metrics: [] },
        } as any).returning();
        reportId = t.id;
      }
      const token = `mx-${kind}-${state}-${suffix}`.slice(0, 64);
      await db.insert(reportSnapshots).values({
        reportId, publicToken: token, snapshotData: { reportType: kind }, createdBy: u.coachA.id,
        expiresAt: state === 'expired' ? new Date(Date.now() - 60_000) : new Date(Date.now() + 86_400_000),
        isActive: state !== 'revoked', revokedAt: state === 'revoked' ? new Date() : null,
      } as any);
      return token;
    };

    for (const state of ['expired', 'revoked'] as const) {
      it(`${state}: public GET and PDF match a ${state} team snapshot`, async () => {
        const evalTok = await make('eval', state);
        const teamTok = await make('team', state);
        for (const suffixPath of ['', '/pdf']) {
          const e = await as(null, 'get', `/api/public/reports/${evalTok}${suffixPath}`);
          const t = await as(null, 'get', `/api/public/reports/${teamTok}${suffixPath}`);
          expect(e.status, `${state}${suffixPath}`).toBe(t.status);
          expect(e.body, `${state}${suffixPath}`).toEqual(t.body);
          expect(e.status).not.toBe(200);
          expect(JSON.stringify(e.body)).not.toContain('Private coach note');
        }
      });
    }
  });

  describe('GET /api/events/:eventId/reports is scoped in SQL and carries no frozen model', () => {
    let teamId: string;
    let otherOrgId: string;
    let otherEventReportId: string;

    beforeAll(async () => {
      const mk = async (organizationId: string, evId: string, name: string) => {
        const [r] = await db.insert(reports).values({
          organizationId, createdBy: u.coachA.id, name, reportType: 'team', config: { eventId: evId, metrics: [] },
        } as any).returning();
        return r.id as string;
      };
      teamId = await mk(orgA, eventId, `Mx team for event ${suffix}`);
      otherOrgId = await mk(orgB, eventId, `Mx other-org report ${suffix}`);
      otherEventReportId = await mk(orgA, otherEventId, `Mx other-event report ${suffix}`);
    });

    it('returns this event\'s reports for this org only', async () => {
      const res = await as('coachA', 'get', `/api/events/${eventId}/reports`);
      expect(res.status).toBe(200);
      const ids = res.body.map((r: any) => r.id);
      expect(ids).toEqual(expect.arrayContaining([teamId, rid.adult, rid.other, rid.young, rid.teen]));
      expect(ids).not.toContain(otherOrgId);
      expect(ids).not.toContain(otherEventReportId);
      expect(res.body.every((r: any) => r.organizationId === orgA && r.config.eventId === eventId)).toBe(true);
    });

    it('drops config.model from eval rows but keeps what the list uses', async () => {
      const res = await as('coachA', 'get', `/api/events/${eventId}/reports`);
      const evals = res.body.filter((r: any) => r.reportType === 'eval');
      expect(evals.length).toBe(7);
      const [full] = await db.select().from(reports).where(eq(reports.id, rid.adult));
      for (const r of evals) {
        expect(r.config.model).toBeUndefined();
        expect(r.config.eventId).toBe(eventId);
        expect(r.config.athleteId).toBeTruthy();
        expect(r.config.eventDate).toBeTruthy();
        expect(r.name).toBeTruthy();
        expect(r.createdAt).toBeTruthy();
      }
      const listed = evals.find((r: any) => r.id === rid.adult);
      expect(JSON.stringify(listed).length).toBeLessThan(JSON.stringify(full).length);
    });
  });
});
