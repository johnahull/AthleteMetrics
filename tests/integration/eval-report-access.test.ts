/**
 * AM-FEAT-019 P3c: eval reports are visible and editable only to coach / org_admin / site admin of the
 * report row's own organization. Every existing report route that checked membership alone is covered,
 * plus the restricted-snapshot parent check, share scoping, /api/my/reports and the wellness-key rule.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
import * as measurementHelpers from '../../packages/api/permissions/measurement-helpers';
import { purgeTestRows } from '../helpers/purge-test-rows';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const NOT_FOUND = { message: 'Report not found' };
const WELLNESS_KEY = /^(sleep|soreness|stress|energy|cycle|wellness|mood|readiness|pain)$/i;

/** Relative to now so the fixture stays under 13 as the calendar moves on */
function elevenYearsAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 11);
  d.setDate(d.getDate() - 100);
  return d.toISOString().slice(0, 10);
}

function wellnessKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => wellnessKeys(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(WELLNESS_KEY.test(k) ? [`${path}.${k}`] : []),
      ...wellnessKeys(v, `${path}.${k}`),
    ]);
  }
  return [];
}

describe('eval report access hardening', () => {
  let app: Express;
  let orgA: string;
  let orgB: string;
  let eventId: string;
  const u: Record<string, any> = {};
  const rid: Record<string, string> = {};
  let ipCounter = 0;

  const mkUser = async (tag: string, extra: Record<string, unknown> = {}) => {
    const [row] = await db
      .insert(users)
      .values({
        username: `evalacc-${tag}-${suffix}`,
        emails: [`evalacc-${tag}-${suffix}@test.com`],
        password: 'x',
        firstName: 'Acc',
        lastName: tag,
        fullName: `Acc ${tag}`,
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
    [{ id: orgA }] = await db.insert(organizations).values({ name: `EvalAcc Org A ${suffix}` }).returning();
    [{ id: orgB }] = await db.insert(organizations).values({ name: `EvalAcc Org B ${suffix}` }).returning();

    await mkUser('coachA');
    await mkUser('coachB');
    // Coach in B (and alphabetically first org for them) but only an athlete in A
    await mkUser('coachBathleteA');
    await mkUser('orgAdminA');
    await mkUser('siteAdmin', { isSiteAdmin: true });
    await mkUser('athleteRole', { gender: 'Female', birthDate: '2000-03-01', sports: ['Soccer'] });
    await mkUser('adult', { gender: 'Female', birthDate: '2000-03-01', sports: ['Soccer'] });
    // 12 at the 2026-05-01 event (restricted public snapshot) but 13 today, so sharing to the athlete is allowed
    await mkUser('kid', { gender: 'Female', birthDate: '2013-06-01', sports: ['Soccer'], isMinor: true });
    // A second adult to receive a successful /share, a child under 13 TODAY, and an athlete without a birth date
    await mkUser('adult2', { gender: 'Female', birthDate: '2000-03-01', sports: ['Soccer'] });
    await mkUser('youngKid', { gender: 'Female', birthDate: elevenYearsAgo(), sports: ['Soccer'], isMinor: true });
    await mkUser('noDob', { gender: 'Female', sports: ['Soccer'] });
    await mkUser('parentOfKid');
    await mkUser('parentOfOther');

    await db.insert(userOrganizations).values([
      { userId: u.coachA.id, organizationId: orgA, role: 'coach' },
      { userId: u.coachB.id, organizationId: orgB, role: 'coach' },
      { userId: u.coachBathleteA.id, organizationId: orgB, role: 'coach' },
      { userId: u.coachBathleteA.id, organizationId: orgA, role: 'athlete' },
      { userId: u.orgAdminA.id, organizationId: orgA, role: 'org_admin' },
      ...['athleteRole', 'adult', 'kid', 'adult2', 'youngKid', 'noDob'].map((t) => ({ userId: u[t].id, organizationId: orgA, role: 'athlete' })),
    ] as any);

    await db.insert(parentAthleteLinks).values([
      { parentEmail: `p1-${suffix}@test.com`, parentUserId: u.parentOfKid.id, athleteUserId: u.kid.id, organizationId: orgA, isActive: true },
      { parentEmail: `p2-${suffix}@test.com`, parentUserId: u.parentOfOther.id, athleteUserId: u.adult.id, organizationId: orgA, isActive: true },
    ] as any);

    const [e] = await db
      .insert(events)
      .values({ organizationId: orgA, name: `EvalAcc Event ${suffix}`, startDate: new Date('2026-05-01T10:00:00Z') } as any)
      .returning({ id: events.id });
    eventId = e.id;
    for (const t of ['adult', 'kid', 'athleteRole', 'adult2', 'youngKid', 'noDob']) {
      await db.insert(measurements).values({
        userId: u[t].id, submittedBy: u.coachA.id, date: '2026-05-01', age: 15, metric: 'DASH_10YD',
        value: '2.0', units: 's', isVerified: true, eventId, organizationId: orgA,
      } as any);
    }

    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const user = Object.values(u).find((x: any) => x.id === req.get('x-test-user')) as any;
      // The session role is deliberately 'coach' for everyone: authorization must not trust it
      // primaryOrganizationId is what requireRole('coach') resolves the org from; coachBathleteA's is B, not the report's org A
      const primary: Record<string, string> = { coachB: orgB, coachBathleteA: orgB };
      const tag = Object.keys(u).find((k) => u[k] === user);
      req.session = { user: user ? { id: user.id, username: user.username, role: 'coach', isSiteAdmin: !!user.isSiteAdmin, primaryOrganizationId: primary[tag!] ?? orgA } : undefined };
      Object.defineProperty(req, 'ip', { value: `10.2.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });
      next();
    });
    registerEventReportRoutes(app);
    registerReportRoutes(app);

    for (const t of ['adult', 'kid', 'athleteRole', 'adult2', 'youngKid', 'noDob']) {
      const res = await as('coachA', 'post', `/api/events/${eventId}/athletes/${u[t].id}/eval-report`).send({ coachNote: 'Private coach note' });
      expect(res.status, t).toBe(201);
      rid[t] = res.body.report.id;
    }
  });

  afterAll(async () => {
    await db.delete(reports).where(inArray(reports.organizationId, [orgA, orgB]));
    await db.delete(measurements).where(eq(measurements.eventId, eventId));
    await db.delete(events).where(eq(events.id, eventId));
    await purgeTestRows({ usernameLike: [`evalacc-%-${suffix}`], orgIds: [orgA, orgB] });
  });

  // Everyone who must not touch an eval, including its own athlete and an under-13 account
  const outsiders = ['athleteRole', 'adult', 'kid', 'coachB', 'coachBathleteA'];
  const writers = ['coachA', 'orgAdminA', 'siteAdmin'];

  describe('GET /api/reports (list)', () => {
    it('omits eval rows for non-writers and keeps pagination counts right', async () => {
      for (const key of outsiders) {
        const res = await as(key, 'get', '/api/reports').query(key === 'coachB' ? {} : { organizationId: orgA });
        if (key === 'coachB') continue; // not a member of A: 403 on the org filter, covered below
        expect(res.status, key).toBe(200);
        expect(res.body.reports.filter((r: any) => r.reportType === 'eval'), key).toEqual([]);
        expect(res.body.pagination.total, key).toBe(res.body.reports.length);
      }
      expect((await as('coachB', 'get', '/api/reports')).body.reports.filter((r: any) => r.reportType === 'eval')).toEqual([]);
    });

    it('lists eval rows for writers, filterable by reportType=eval, without config.model', async () => {
      for (const key of writers) {
        const res = await as(key, 'get', '/api/reports').query({ organizationId: orgA, reportType: 'eval' });
        expect(res.status, key).toBe(200);
        const ids = res.body.reports.map((r: any) => r.id);
        expect(ids, key).toEqual(expect.arrayContaining([rid.adult, rid.kid, rid.athleteRole]));
        expect(res.body.reports.every((r: any) => r.reportType === 'eval')).toBe(true);
        for (const r of res.body.reports) {
          expect(r.config.model, key).toBeUndefined();
          expect(r.config.eventId).toBe(eventId);
          expect(r.config.athleteId).toBeTruthy();
          expect(r.config.metrics).toBeDefined();
        }
      }
    });
  });

  describe('single-report routes return 404 for everyone but a writer of the report org', () => {
    const cases: Array<[string, 'get' | 'post' | 'put' | 'patch' | 'delete', (id: string) => string, (() => any)?]> = [
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

    const ROLE_GATED = ['POST share', 'POST share-bulk', 'PATCH archive', 'PATCH unarchive', 'GET shares'];
    for (const [label, method, path, body] of cases) {
      it(`${label}: 404 with the not-found body for outsiders, identical to an unknown id`, async () => {
        for (const key of outsiders) {
          const req = as(key, method, path(rid.adult));
          const res = await (body === undefined ? req : req.send(body()));
          // requireRole('coach') stops athlete-primary accounts with a 403 before any lookup, so ids cannot be probed
          const gatedByRole = ROLE_GATED.includes(label) && ['athleteRole', 'adult', 'kid'].includes(key);
          expect(res.status, `${label} ${key}`).toBe(gatedByRole ? 403 : 404);
          if (!gatedByRole) expect(res.body, `${label} ${key}`).toEqual(NOT_FOUND);
        }
        // an unknown id gets the same status and body as a real eval the caller may not see
        if (!ROLE_GATED.includes(label)) {
          const unknown = '00000000-0000-4000-8000-000000000000';
          const req = as('coachBathleteA', method, path(unknown));
          const res = await (body === undefined ? req : req.send(body()));
          expect(res.status).toBe(404);
          expect(res.body).toEqual(NOT_FOUND);
        }
        // the report is untouched
        const [row] = await db.select().from(reports).where(eq(reports.id, rid.adult));
        expect(row).toBeTruthy();
        expect(row.name).not.toBe('hacked');
        expect(row.isPinned).toBe(false);
        expect(row.archivedAt).toBeNull();
      });
    }

    it('DELETE snapshot of an eval is 404 for outsiders', async () => {
      const snap = await as('coachA', 'post', `/api/reports/${rid.adult}/snapshots`).send({});
      expect(snap.status).toBe(201);
      for (const key of outsiders) {
        const res = await as(key, 'delete', `/api/reports/${rid.adult}/snapshots/${snap.body.id}`);
        expect(res.status, key).toBe(404);
      }
      const [row] = await db.select().from(reportSnapshots).where(eq(reportSnapshots.id, snap.body.id));
      expect(row.isActive).toBe(true);
    });
  });

  describe('writers', () => {
    it('GET report returns the full row including the frozen model', async () => {
      for (const key of writers) {
        const res = await as(key, 'get', `/api/reports/${rid.adult}`);
        expect(res.status, key).toBe(200);
        expect(res.body.reportType).toBe('eval');
        expect(res.body.config.model).toBeTruthy();
      }
    });

    it('GET snapshots, pin/unpin and archive/unarchive succeed', async () => {
      for (const key of writers) {
        expect((await as(key, 'get', `/api/reports/${rid.adult}/snapshots`)).status, key).toBe(200);
      }
      expect((await as('coachA', 'patch', `/api/reports/${rid.kid}/pin`)).status).toBe(200);
      expect((await as('coachA', 'patch', `/api/reports/${rid.kid}/unpin`)).status).toBe(200);
      expect((await as('orgAdminA', 'patch', `/api/reports/${rid.kid}/archive`)).status).toBe(200);
      expect((await as('orgAdminA', 'patch', `/api/reports/${rid.kid}/unarchive`)).status).toBe(200);
    });

    it('PUT changes name and description only; config and reportType are immutable', async () => {
      const [before] = await db.select().from(reports).where(eq(reports.id, rid.adult));
      const res = await as('coachA', 'put', `/api/reports/${rid.adult}`).send({
        name: 'Renamed eval',
        description: 'new description',
        reportType: 'team',
        config: { reportType: 'team', metrics: [], model: null, athleteId: u.athleteRole.id },
        isPinned: true,
        organizationId: orgB,
      });
      expect(res.status).toBe(200);
      const [after] = await db.select().from(reports).where(eq(reports.id, rid.adult));
      expect(after.name).toBe('Renamed eval');
      expect(after.description).toBe('new description');
      expect(after.reportType).toBe('eval');
      expect(after.config).toEqual(before.config);
      expect(after.organizationId).toBe(orgA);
      expect(after.isPinned).toBe(before.isPinned);
      expect(res.body.config.model).toBeTruthy();
    });

    it('DELETE removes the eval for a writer', async () => {
      const res = await as('coachA', 'post', `/api/events/${eventId}/athletes/${u.athleteRole.id}/eval-report`).send({});
      const id = res.body.report.id;
      expect((await as('coachA', 'delete', `/api/reports/${id}`)).status).toBe(200);
      expect((await db.select().from(reports).where(eq(reports.id, id))).length).toBe(0);
    });
  });

  describe('sharing', () => {
    it('share to an athlete other than config.athleteId is rejected and creates no row', async () => {
      const res = await as('coachA', 'post', `/api/reports/${rid.adult}/share`).send({ athleteId: u.athleteRole.id });
      expect(res.status).toBe(400);
      const rows = await db.select().from(reportShares).where(eq(reportShares.reportId, rid.adult));
      expect(rows).toEqual([]);
    });

    it('share-bulk rejects an eval outright, even with the right athlete', async () => {
      for (const body of [{ athleteIds: [u.adult.id] }, {}]) {
        const res = await as('coachA', 'post', `/api/reports/${rid.adult}/share-bulk`).send(body);
        expect(res.status).toBe(400);
      }
      expect(await db.select().from(reportShares).where(eq(reportShares.reportId, rid.adult))).toEqual([]);
    });

    it('bulk-distribute delivers each eval only to its config.athleteId', async () => {
      const res = await as('coachA', 'post', '/api/reports/bulk-distribute').send({ reportIds: [rid.adult, rid.athleteRole] });
      expect(res.status).toBe(200);
      const rows = await db.select().from(reportShares).where(inArray(reportShares.reportId, [rid.adult, rid.athleteRole]));
      const pairs = rows.map((r) => `${r.reportId}:${r.athleteId}`).sort();
      expect(pairs).toEqual([`${rid.adult}:${u.adult.id}`, `${rid.athleteRole}:${u.athleteRole.id}`].sort());
    });

    it('bulk-distribute by an org member who is not a writer skips the eval without leaking its name', async () => {
      const [row] = await db.select().from(reports).where(eq(reports.id, rid.kid));
      const res = await as('coachBathleteA', 'post', '/api/reports/bulk-distribute').send({ reportIds: [rid.kid] });
      expect(res.status).toBe(400);
      expect(res.body.skipped).toEqual([{ reportId: rid.kid, reportName: '', reason: 'Report not found' }]);
      expect(JSON.stringify(res.body)).not.toContain(row.name);
      expect(await db.select().from(reportShares).where(eq(reportShares.reportId, rid.kid))).toEqual([]);
    });

    it('share to config.athleteId succeeds for an adult athlete', async () => {
      const res = await as('coachA', 'post', `/api/reports/${rid.adult2}/share`).send({ athleteId: u.adult2.id });
      expect(res.status).toBe(201);
    });

    it('refuses to share an eval to an under-13 or no-DOB athlete (403 UNDER_13_SHARE_BLOCKED, no row)', async () => {
      for (const t of ['youngKid', 'noDob']) {
        const res = await as('coachA', 'post', `/api/reports/${rid[t]}/share`).send({ athleteId: u[t].id });
        expect(res.status, t).toBe(403);
        expect(res.body.code, t).toBe('UNDER_13_SHARE_BLOCKED');
        expect(await db.select().from(reportShares).where(eq(reportShares.reportId, rid[t])), t).toEqual([]);
      }
    });

    it('bulk-distribute blocks those athletes with status blocked_under_13 and creates no share row', async () => {
      const ids = [rid.youngKid, rid.noDob];
      const res = await as('coachA', 'post', '/api/reports/bulk-distribute').send({ reportIds: ids });
      expect(res.status).toBe(200);
      expect(res.body.results.map((r: any) => r.status)).toEqual(['blocked_under_13', 'blocked_under_13']);
      expect(res.body.summary.blockedUnder13).toBe(2);
      expect(res.body.summary.sent).toBe(0);
      expect(await db.select().from(reportShares).where(inArray(reportShares.reportId, ids))).toEqual([]);
    });

    it('DELETE /shares/:shareId: the sharer and an org_admin may unshare; a coach of another org may not', async () => {
      const [share] = await db.select().from(reportShares).where(eq(reportShares.reportId, rid.adult2));
      const other = await as('coachB', 'delete', `/api/reports/${rid.adult2}/shares/${share.id}`);
      expect([403, 404]).toContain(other.status);
      expect((await db.select().from(reportShares).where(eq(reportShares.id, share.id))).length).toBe(1);
      expect((await as('coachA', 'delete', `/api/reports/${rid.adult2}/shares/${share.id}`)).status).toBe(200);
      const again = await as('coachA', 'post', `/api/reports/${rid.adult2}/share`).send({ athleteId: u.adult2.id });
      expect(again.status).toBe(201);
      const [s2] = await db.select().from(reportShares).where(eq(reportShares.reportId, rid.adult2));
      expect((await as('orgAdminA', 'delete', `/api/reports/${rid.adult2}/shares/${s2.id}`)).status).toBe(200);
    });

    it('GET /shares lists shares for a writer', async () => {
      expect((await as('coachA', 'get', `/api/reports/${rid.adult}/shares`)).status).toBe(200);
    });
  });

  describe('/api/my/reports', () => {
    it('shows a shared eval to its athlete only, with no heavy model in the list', async () => {
      const mine = await as('adult', 'get', '/api/my/reports');
      expect(mine.status).toBe(200);
      const item = mine.body.reports.find((r: any) => r.reportId === rid.adult);
      expect(item.reportType).toBe('eval');
      expect(item.config).toBeUndefined();
      expect(JSON.stringify(mine.body)).not.toContain('Private coach note');

      const other = await as('athleteRole', 'get', '/api/my/reports');
      expect(other.body.reports.find((r: any) => r.reportId === rid.adult)).toBeUndefined();

      const detail = await as('adult', 'get', `/api/my/reports/${item.shareId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.report.reportType).toBe('eval');
      expect(detail.body.report.config.model).toBeTruthy();

      const stolen = await as('athleteRole', 'get', `/api/my/reports/${item.shareId}`);
      expect(stolen.status).toBe(404);
    });
  });

  describe('/api/my/reports for an under-13 with a pre-existing eval share (defence in depth)', () => {
    it('hides it from the list and returns 404 on the detail route', async () => {
      const rows = [];
      for (const t of ['youngKid', 'noDob']) {
        const [row] = await db.insert(reportShares).values({ reportId: rid[t], athleteId: u[t].id, sharedBy: u.coachA.id, organizationId: orgA } as any).returning();
        rows.push([t, row] as const);
      }
      for (const [t, row] of rows) {
        const list = await as(t, 'get', '/api/my/reports');
        expect(list.body.reports.find((r: any) => r.reportId === rid[t]), t).toBeUndefined();
        const detail = await as(t, 'get', `/api/my/reports/${row.id}`);
        expect(detail.status, t).toBe(404);
        expect(JSON.stringify(detail.body), t).not.toContain('model');
      }
      await db.delete(reportShares).where(inArray(reportShares.id, rows.map(([, r]) => r.id)));
    });
  });

  describe('query counts on batch and list paths', () => {
    const mkEval = async () => (await as('coachA', 'post', `/api/events/${eventId}/athletes/${u.adult2.id}/eval-report`).send({})).body.report.id as string;

    it('resolves the org role once per distinct organization, not once per eval row', async () => {
      const [one, ...many] = [await mkEval(), await mkEval(), await mkEval(), await mkEval()];
      const roleLookups = async (ids: string[]) => {
        const spy = vi.spyOn(measurementHelpers, 'getOrgRole');
        const res = await as('coachA', 'post', '/api/reports/bulk-archive').send({ reportIds: ids });
        const calls = spy.mock.calls.length;
        spy.mockRestore();
        expect(res.status).toBe(200);
        return calls;
      };
      const single = await roleLookups([one]);
      const batch = await roleLookups(many);
      expect(batch).toBe(single);
    });

    it('a batch holding an eval from an org the caller cannot write to is refused as a whole, with one lookup per org', async () => {
      const [mine] = await db.select().from(reports).where(eq(reports.id, rid.adult2));
      const [foreign] = await db.insert(reports).values({ ...mine, id: undefined, organizationId: orgB, archivedAt: null } as any).returning();
      const spy = vi.spyOn(measurementHelpers, 'getOrgRole');
      const res = await as('coachA', 'post', '/api/reports/bulk-archive').send({ reportIds: [rid.adult2, rid.adult, foreign.id] });
      const orgIds = spy.mock.calls.map((c) => c[1]);
      spy.mockRestore();
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
      expect(orgIds.filter((o) => o === orgA).length).toBe(1);
      expect(orgIds.filter((o) => o === orgB).length).toBe(1);
      const rows = await db.select().from(reports).where(inArray(reports.id, [rid.adult2, rid.adult, foreign.id]));
      expect(rows.every((r) => r.archivedAt === null)).toBe(true);
    });

    it('/api/my/reports looks the athlete up once however many eval shares they hold', async () => {
      const ids = [await mkEval(), await mkEval(), await mkEval()];
      const shareIds: string[] = [];
      const selectCount = async () => {
        const spy = vi.spyOn(db, 'select');
        const res = await as('adult2', 'get', '/api/my/reports');
        const calls = spy.mock.calls.length;
        spy.mockRestore();
        expect(res.status).toBe(200);
        return { calls, evals: res.body.reports.filter((r: any) => r.reportType === 'eval').length };
      };
      const share = async (reportId: string) => {
        const [row] = await db.insert(reportShares).values({ reportId, athleteId: u.adult2.id, sharedBy: u.coachA.id, organizationId: orgA } as any).returning();
        shareIds.push(row.id);
      };
      await share(ids[0]);
      const one = await selectCount();
      await share(ids[1]);
      await share(ids[2]);
      const three = await selectCount();
      await db.delete(reportShares).where(inArray(reportShares.id, shareIds));
      expect(three.evals).toBe(one.evals + 2);
      expect(three.calls).toBe(one.calls);
    });
  });

  describe('bulk archive / unarchive / delete', () => {
    const routes = ['bulk-archive', 'bulk-unarchive', 'bulk-delete'];

    it('a coach whose primary org is not the report org gets the not-found body and nothing changes', async () => {
      for (const r of routes) {
        const res = await as('coachBathleteA', 'post', `/api/reports/${r}`).send({ reportIds: [rid.athleteRole] });
        expect(res.status, r).toBe(404);
        expect(res.body, r).toEqual(NOT_FOUND);
        // a mixed request is refused as a whole
        const mixed = await as('coachBathleteA', 'post', `/api/reports/${r}`).send({ reportIds: [rid.athleteRole, '00000000-0000-4000-8000-000000000000'] });
        expect(mixed.status, r).toBe(404);
      }
      const [row] = await db.select().from(reports).where(eq(reports.id, rid.athleteRole));
      expect(row).toBeTruthy();
      expect(row.archivedAt).toBeNull();
    });

    it('writers can archive, unarchive and delete evals in bulk', async () => {
      const mk = async () => (await as('coachA', 'post', `/api/events/${eventId}/athletes/${u.adult2.id}/eval-report`).send({})).body.report.id as string;
      const [a, b] = [await mk(), await mk()];
      expect((await as('coachA', 'post', '/api/reports/bulk-archive').send({ reportIds: [a, b] })).status).toBe(200);
      expect((await db.select().from(reports).where(eq(reports.id, a)))[0].archivedAt).not.toBeNull();
      expect((await as('orgAdminA', 'post', '/api/reports/bulk-unarchive').send({ reportIds: [a, b] })).status).toBe(200);
      expect((await db.select().from(reports).where(eq(reports.id, a)))[0].archivedAt).toBeNull();
      expect((await as('coachA', 'post', '/api/reports/bulk-delete').send({ reportIds: [a, b] })).status).toBe(200);
      expect(await db.select().from(reports).where(inArray(reports.id, [a, b]))).toEqual([]);
    });
  });

  describe('insights ordering and the event reports list', () => {
    it('non-writers get 404 first; only writers get the 400', async () => {
      await db.update(organizations).set({ aiEnabled: true, aiEnabledBySiteAdmin: true } as any).where(eq(organizations.id, orgA));
      for (const [method, path, body] of [
        ['post', `/api/reports/${rid.adult}/generate-insights`, {}],
        ['patch', `/api/reports/${rid.adult}/insights`, { coachingInsights: 'x' }],
      ] as const) {
        const out = await as('coachBathleteA', method, path).send(body);
        expect(out.status, path).toBe(404);
        expect(out.body, path).toEqual(NOT_FOUND);
        expect((await as('coachA', method, path).send(body)).status, path).toBe(400);
      }
    });

    it('GET /api/events/:eventId/reports is 403 for a coach of another org', async () => {
      expect((await as('coachB', 'get', `/api/events/${eventId}/reports`)).status).toBe(403);
      expect((await as('coachA', 'get', `/api/events/${eventId}/reports`)).status).toBe(200);
    });

    it('PUT validates name and description for an eval', async () => {
      expect((await as('coachA', 'put', `/api/reports/${rid.adult}`).send({ name: '   ' })).status).toBe(400);
      expect((await as('coachA', 'put', `/api/reports/${rid.adult}`).send({ description: 'x'.repeat(1001) })).status).toBe(400);
    });
  });

  describe('restricted eval snapshot access', () => {
    let kidToken: string;
    let adultToken: string;

    beforeAll(async () => {
      const k = await as('coachA', 'post', `/api/reports/${rid.kid}/snapshots`).send({});
      expect(k.body.publicAccessRestricted).toBe(true);
      kidToken = k.body.publicToken;
      const a = await as('coachA', 'post', `/api/reports/${rid.adult}/snapshots`).send({});
      expect(a.body.publicAccessRestricted).toBe(false);
      adultToken = a.body.publicToken;
    });

    const open = (key: string | null, token: string) => as(key, 'get', `/api/public/reports/${token}`);

    it('is 403 for unauthenticated viewers', async () => {
      expect((await open(null, kidToken)).status).toBe(403);
    });

    it('opens for a logged-in parent linked to config.athleteId, not for a parent of another athlete in the org', async () => {
      expect((await open('parentOfKid', kidToken)).status).toBe(200);
      const wrong = await open('parentOfOther', kidToken);
      expect(wrong.status).toBe(403);
      expect(wrong.body.code).toBe('minor_data_restricted');
    });

    it('opens for the athlete themself, not for another athlete or an unrelated member', async () => {
      expect((await open('kid', kidToken)).status).toBe(200);
      expect((await open('athleteRole', kidToken)).status).toBe(403);
      expect((await open('coachBathleteA', kidToken)).status).toBe(403);
    });

    it('opens for writers of the org and site admins', async () => {
      for (const key of writers) expect((await open(key, kidToken)).status, key).toBe(200);
    });

    it('does not open for an inactive parent link', async () => {
      await db.update(parentAthleteLinks).set({ isActive: false }).where(eq(parentAthleteLinks.parentUserId, u.parentOfKid.id));
      expect((await open('parentOfKid', kidToken)).status).toBe(403);
      await db.update(parentAthleteLinks).set({ isActive: true }).where(eq(parentAthleteLinks.parentUserId, u.parentOfKid.id));
    });

    it('leaves an unrestricted (adult) snapshot open to anyone with the link', async () => {
      expect((await open(null, adultToken)).status).toBe(200);
    });

    it('applies the same tightened check to the public PDF routes', async () => {
      expect((await as('parentOfOther', 'get', `/api/public/reports/${kidToken}/pdf`)).status).toBe(403);
    });
  });

  describe('wellness data never enters an eval snapshot', () => {
    it('has none of the wellness keys at any depth in snapshotData', async () => {
      const res = await as('coachA', 'post', `/api/reports/${rid.adult}/snapshots`).send({});
      expect(res.status).toBe(201);
      const [snap] = await db.select().from(reportSnapshots).where(eq(reportSnapshots.id, res.body.id));
      expect((snap.snapshotData as any).reportType).toBe('eval');
      expect(wellnessKeys(snap.snapshotData)).toEqual([]);
    });
  });
});
