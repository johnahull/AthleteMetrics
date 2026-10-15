/**
 * AM-FEAT-019 P3b: eval branches of the report PDF routes and of createSnapshot.
 * An eval is saved through the P3a route; the PDF renders from the frozen model after an explicit
 * org + role check, and snapshots carry reportType 'eval' with fail-closed minor flags.
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
import { ReportService } from '../../packages/api/services/report-service';
import { events, measurements, organizations, reports, reportSnapshots, userOrganizations, users } from '@shared/schema';
import { purgeTestRows } from '../helpers/purge-test-rows';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('eval report PDF and snapshots', () => {
  let app: Express;
  let orgA: string;
  let orgB: string;
  let eventId: string;
  const u: Record<string, any> = {};
  const reportIds: Record<string, string> = {};
  let ipCounter = 0;

  const mkUser = async (tag: string, extra: Record<string, unknown> = {}) => {
    const [row] = await db
      .insert(users)
      .values({
        username: `evalpdf-${tag}-${suffix}`,
        emails: [`evalpdf-${tag}-${suffix}@test.com`],
        password: 'x',
        firstName: 'Eval',
        lastName: tag,
        fullName: `Eval ${tag}`,
        isMinor: false,
        ...extra,
      } as any)
      .returning();
    u[tag] = row;
    return row;
  };

  const as = (userKey: string | null, method: 'get' | 'post' | 'patch', path: string) => {
    const r = (request(app) as any)[method](path).set('x-forwarded-test', String(++ipCounter));
    return userKey ? r.set('x-test-user', u[userKey].id) : r;
  };

  beforeAll(async () => {
    [{ id: orgA }] = await db.insert(organizations).values({ name: `EvalPdf Org A ${suffix}` }).returning();
    [{ id: orgB }] = await db.insert(organizations).values({ name: `EvalPdf Org B ${suffix}` }).returning();

    await mkUser('coachA');
    await mkUser('coachB');
    await mkUser('orgAdminA');
    await mkUser('siteAdmin', { isSiteAdmin: true });
    await mkUser('athleteRole', { gender: 'Female', birthDate: '2000-03-01', sports: ['Soccer'] });
    // Event on 2026-05-01. "adult" is 26; "teen" is 15; "underAtEvent" was 12 then and is 13 now.
    await mkUser('adult', { gender: 'Female', birthDate: '2000-03-01', sports: ['Soccer'] });
    await mkUser('teen', { gender: 'Female', birthDate: '2011-03-01', sports: ['Soccer'] });
    await mkUser('underAtEvent', { gender: 'Female', birthDate: '2013-06-01', sports: ['Soccer'] });
    await mkUser('noDob', { gender: 'Female', sports: ['Soccer'] });
    await mkUser('minorFlag', { gender: 'Female', birthDate: '2000-03-01', sports: ['Soccer'], isMinor: true });

    await db.insert(userOrganizations).values([
      { userId: u.coachA.id, organizationId: orgA, role: 'coach' },
      { userId: u.coachB.id, organizationId: orgB, role: 'coach' },
      { userId: u.orgAdminA.id, organizationId: orgA, role: 'org_admin' },
      { userId: u.athleteRole.id, organizationId: orgA, role: 'athlete' },
      ...['adult', 'teen', 'underAtEvent', 'noDob', 'minorFlag'].map((t) => ({ userId: u[t].id, organizationId: orgA, role: 'athlete' })),
    ] as any);

    const [e] = await db
      .insert(events)
      .values({ organizationId: orgA, name: `EvalPdf Event ${suffix}`, startDate: new Date('2026-05-01T10:00:00Z') } as any)
      .returning({ id: events.id });
    eventId = e.id;
    for (const t of ['adult', 'teen', 'underAtEvent', 'noDob', 'minorFlag']) {
      await db.insert(measurements).values({
        userId: u[t].id,
        submittedBy: u.coachA.id,
        date: '2026-05-01',
        age: 15,
        metric: 'DASH_10YD',
        value: '2.0',
        units: 's',
        isVerified: true,
        eventId,
        organizationId: orgA,
      } as any);
    }

    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const user = Object.values(u).find((x: any) => x.id === req.get('x-test-user')) as any;
      // The session role is deliberately 'coach' for everyone: authorization must not trust it
      req.session = { user: user ? { id: user.id, username: user.username, role: 'coach', isSiteAdmin: !!user.isSiteAdmin } : undefined };
      Object.defineProperty(req, 'ip', { value: `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });
      next();
    });
    registerEventReportRoutes(app);
    registerReportRoutes(app);

    for (const t of ['adult', 'teen', 'underAtEvent', 'noDob', 'minorFlag']) {
      const res = await as('coachA', 'post', `/api/events/${eventId}/athletes/${u[t].id}/eval-report`).send({ coachNote: 'Great work today' });
      expect(res.status, t).toBe(201);
      reportIds[t] = res.body.report.id;
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await db.delete(reports).where(inArray(reports.organizationId, [orgA, orgB]));
    await db.delete(measurements).where(eq(measurements.eventId, eventId));
    await db.delete(events).where(eq(events.id, eventId));
    await purgeTestRows({ usernameLike: [`evalpdf-%-${suffix}`], orgIds: [orgA, orgB] });
  });

  const pdf = (userKey: string | null, id: string) =>
    as(userKey, 'get', `/api/reports/${id}/pdf`).buffer(true).parse(binary);

  it('GET returns a PDF for a coach of the event org, with no athleteId query', async () => {
    const res = await pdf('coachA', reportIds.adult);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.headers['content-disposition']).toContain('.pdf');
  });

  it('POST returns a PDF for a coach of the event org, with no athleteId in the body', async () => {
    const res = await as('coachA', 'post', `/api/reports/${reportIds.adult}/pdf`).send({}).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('returns 404 to a coach of another org and to an athlete-role member of the same org, on GET and POST', async () => {
    for (const key of ['coachB', 'athleteRole', 'adult']) {
      expect((await pdf(key, reportIds.adult)).status, `GET ${key}`).toBe(404);
      expect((await as(key, 'post', `/api/reports/${reportIds.adult}/pdf`).send({})).status, `POST ${key}`).toBe(404);
    }
  });

  it('never calls the individual or team generator for an eval PDF or snapshot', async () => {
    const individual = vi.spyOn(ReportService.prototype, 'generateIndividualReport');
    const team = vi.spyOn(ReportService.prototype, 'generateTeamReport');
    expect((await pdf('coachA', reportIds.teen)).status).toBe(200);
    expect((await as('coachA', 'post', `/api/reports/${reportIds.teen}/snapshots`).send({})).status).toBe(201);
    expect(individual).not.toHaveBeenCalled();
    expect(team).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  const snapshotOf = async (tag: string) => {
    const res = await as('coachA', 'post', `/api/reports/${reportIds[tag]}/snapshots`).send({});
    expect(res.status, tag).toBe(201);
    const [row] = await db.select().from(reportSnapshots).where(eq(reportSnapshots.id, res.body.id));
    return row;
  };

  it('stores reportType eval and the frozen model in the snapshot', async () => {
    const snap = await snapshotOf('adult');
    const data = snap.snapshotData as any;
    expect(data.reportType).toBe('eval');
    expect(data.model.eventDate).toBe('2026-05-01');
    expect(data.model.athlete.name).toContain('Eval adult');
    expect(data.orgBranding.orgName).toContain('EvalPdf Org A');
  });

  it('restricts the snapshot for isMinor, no date of birth and under 13 at the EVENT date; not for an adult or a teen', async () => {
    const flags: Record<string, boolean> = {};
    for (const tag of ['adult', 'teen', 'underAtEvent', 'noDob', 'minorFlag']) {
      const snap = await snapshotOf(tag);
      expect(snap.containsMinorData).toBe(snap.publicAccessRestricted);
      flags[tag] = snap.publicAccessRestricted === true;
    }
    expect(flags).toEqual({ adult: false, teen: false, underAtEvent: true, noDob: true, minorFlag: true });
  });

  it('fails closed when the athlete row is gone', async () => {
    const [report] = await db.select().from(reports).where(eq(reports.id, reportIds.adult));
    const [copy] = await db
      .insert(reports)
      .values({ ...report, id: undefined, config: { ...(report.config as any), athleteId: 'no-such-athlete' } } as any)
      .returning();
    const res = await as('coachA', 'post', `/api/reports/${copy.id}/snapshots`).send({});
    expect(res.status).toBe(201);
    expect(res.body.publicAccessRestricted).toBe(true);
  });

  it('serves the public snapshot PDF for an unrestricted eval snapshot, without the individual generator', async () => {
    const snap = await snapshotOf('adult');
    const individual = vi.spyOn(ReportService.prototype, 'generateIndividualReport');
    const res = await as(null, 'get', `/api/public/reports/${snap.publicToken}/pdf`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(individual).not.toHaveBeenCalled();
    // The POST variant (client-captured charts) dispatches the same way
    const post = await as(null, 'post', `/api/public/reports/${snap.publicToken}/pdf`).send({}).buffer(true).parse(binary);
    expect(post.status).toBe(200);
    expect((post.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    vi.restoreAllMocks();
  });

  describe('corrupt or missing frozen model', () => {
    const copyWithConfig = async (mutate: (config: any) => any) => {
      const [report] = await db.select().from(reports).where(eq(reports.id, reportIds.adult));
      const config = mutate(JSON.parse(JSON.stringify(report.config)));
      const [copy] = await db
        .insert(reports)
        .values({ ...report, id: undefined, config } as any)
        .returning();
      return copy;
    };
    const corruptions: Array<[string, (c: any) => any]> = [
      ['model removed', (c) => { delete c.model; return c; }],
      ['metrics not an array', (c) => ({ ...c, model: { ...c.model, metrics: 'nope' } })],
      ['athlete removed', (c) => { delete c.model.athlete; return c; }],
    ];

    it.each(corruptions)('GET and POST /pdf return 500 Report data is unavailable (%s)', async (_name, mutate) => {
      const copy = await copyWithConfig(mutate);
      const get = await pdf('coachA', copy.id);
      expect(get.status).toBe(500);
      expect(JSON.parse((get.body as Buffer).toString()).message).toBe('Report data is unavailable');
      const post = await as('coachA', 'post', `/api/reports/${copy.id}/pdf`).send({});
      expect(post.status).toBe(500);
      expect(post.body.message).toBe('Report data is unavailable');
    });

    it('still returns 404 (not 500) to an unauthorized caller of a corrupt report', async () => {
      const copy = await copyWithConfig((c) => { delete c.model; return c; });
      expect((await pdf('coachB', copy.id)).status).toBe(404);
    });

    it('public snapshot PDF returns 500 for a corrupted snapshotData.model, on GET and POST', async () => {
      const snap = await snapshotOf('adult');
      const data = JSON.parse(JSON.stringify(snap.snapshotData));
      data.model.metrics = null;
      await db.update(reportSnapshots).set({ snapshotData: data }).where(eq(reportSnapshots.id, snap.id));
      const get = await as(null, 'get', `/api/public/reports/${snap.publicToken}/pdf`);
      expect(get.status).toBe(500);
      expect(get.body.message).toBe('Report data is unavailable');
      const post = await as(null, 'post', `/api/public/reports/${snap.publicToken}/pdf`).send({});
      expect(post.status).toBe(500);
      expect(post.body.message).toBe('Report data is unavailable');
    });
  });

  it('keeps a restricted eval snapshot closed on the public PDF route', async () => {
    const snap = await snapshotOf('noDob');
    const res = await as(null, 'get', `/api/public/reports/${snap.publicToken}/pdf`);
    expect(res.status).toBe(403);
  });

  describe('POST /api/reports/:id/snapshots on an eval', () => {
    const snapshotCount = async (reportId: string) =>
      (await db.select().from(reportSnapshots).where(eq(reportSnapshots.reportId, reportId))).length;

    it('returns 404 and creates no snapshot for an athlete-role member or a coach of another org', async () => {
      const before = await snapshotCount(reportIds.adult);
      for (const key of ['athleteRole', 'adult', 'coachB']) {
        const res = await as(key, 'post', `/api/reports/${reportIds.adult}/snapshots`).send({});
        expect(res.status, key).toBe(404);
        expect(res.body.message).toBe('Report not found');
      }
      expect(await snapshotCount(reportIds.adult)).toBe(before);
    });

    it('allows the event-org coach, an org_admin and a site admin', async () => {
      for (const key of ['coachA', 'orgAdminA', 'siteAdmin']) {
        expect((await as(key, 'post', `/api/reports/${reportIds.adult}/snapshots`).send({})).status, key).toBe(201);
      }
    });
  });

  describe('insights on an eval', () => {
    it('generate-insights and PATCH insights return 400 before any data is built', async () => {
      const gen = await as('coachA', 'post', `/api/reports/${reportIds.adult}/generate-insights`).send({});
      expect(gen.status).toBe(400);
      const patch = await as('coachA', 'patch' as any, `/api/reports/${reportIds.adult}/insights`).send({ coachingInsights: 'x' });
      expect(patch.status).toBe(400);
    });
  });
});
