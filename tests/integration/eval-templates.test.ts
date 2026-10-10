/**
 * Eval battery templates and org eval report settings (AM-FEAT-019 P2).
 * The organization always comes from the row (template / event / URL org), never from the session.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { evalBatteryTemplates, eventMetrics, events, orgEvalReportSettings, organizations, siteMetrics, auditLogs, userOrganizations, users } from '@shared/schema';
import { resolveTemplateKey } from '../../packages/api/services/eval-report/template-keys';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

// The 20-writes-per-window mutation limiter is per IP and this file makes more writes than that.
vi.mock('express-rate-limit', async (importOriginal) => {
  const passthrough = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...(await importOriginal<Record<string, unknown>>()), default: passthrough, rateLimit: passthrough };
});

import { registerRoutes } from '../../packages/api/routes';
import { canEditTemplate } from '../../packages/api/services/eval-template-service';

const PASSWORD = 'EvalTemplates123!';
const PREFIX = `evaltpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

type Who = 'coachA' | 'adminA' | 'athleteA' | 'coachB' | 'siteAdmin' | 'coachAB' | 'coachAB2';

describe('eval templates and org eval report settings', () => {
  let app: Express;
  const u = {} as Record<Who, any>;
  const cookies = {} as Record<Who, string>;
  let orgA: string;
  let orgB: string;
  let eventA: string;
  let eventB: string;
  let globalId: string;
  let tplB: string;
  let createdGlobalId: string | null = null;
  const createdSiteMetricCodes: string[] = [];
  const SUFFIX = Math.random().toString(36).slice(2, 8).toUpperCase();
  const DERIVED_CODE = `ZZ_DERIVED_${SUFFIX}`;
  const INACTIVE_CODE = `ZZ_INACTIVE_${SUFFIX}`;

  const as = (who: Who) => ({
    get: (url: string) => request(app).get(url).set('Cookie', cookies[who]),
    post: (url: string) => request(app).post(url).set('Cookie', cookies[who]),
    patch: (url: string) => request(app).patch(url).set('Cookie', cookies[who]),
    put: (url: string) => request(app).put(url).set('Cookie', cookies[who]),
    delete: (url: string) => request(app).delete(url).set('Cookie', cookies[who]),
  });

  // Two required tests, then optional ones. Their site_metrics rows may not exist on a push-only DB; beforeAll adds what is absent.
  const metrics = [
    { metricKey: 'DASH_10', isRequired: true, displayOrder: 1 },
    { metricKey: 'FLY_10', isRequired: true, displayOrder: 2 },
    { metricKey: 'CMJ_HOH', isRequired: false, displayOrder: 3, customLabel: 'CMJ' },
    { metricKey: 'RSI_LEFT', isRequired: false, displayOrder: 4 },
    { metricKey: 'CMJ_SL_LEFT', isRequired: false, displayOrder: 5 },
    { metricKey: 'CMJ_SL_RIGHT', isRequired: false, displayOrder: 6 },
  ];
  // A template whose key lost its site_metrics code after it was saved (inserted directly: the API rejects it)
  const staleMetrics = [metrics[0], { metricKey: 'ZZ_NO_SUCH_CODE', isRequired: true, displayOrder: 2 }];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    [{ id: orgA }, { id: orgB }] = await db
      .insert(organizations)
      .values([{ name: `${PREFIX}-A` }, { name: `${PREFIX}-B` }] as any)
      .returning({ id: organizations.id });

    const spec: Record<Who, Array<[string, string]>> = {
      coachA: [[orgA, 'coach']],
      adminA: [[orgA, 'org_admin']],
      athleteA: [[orgA, 'athlete']],
      coachB: [[orgB, 'coach']],
      siteAdmin: [],
      // coach in B first alphabetically-irrelevant; athlete in A. Proves the role comes from the row's org.
      coachAB: [[orgA, 'athlete'], [orgB, 'coach']],
      coachAB2: [[orgA, 'coach'], [orgB, 'coach']],
    };
    for (const [who, memberships] of Object.entries(spec) as Array<[Who, Array<[string, string]>]>) {
      [u[who]] = await db
        .insert(users)
        .values({
          username: `${PREFIX}-${who}`,
          emails: [`${PREFIX}-${who}@test.com`],
          password: hashed,
          firstName: 'Eval',
          lastName: who,
          fullName: `Eval ${who}`,
          ...(who === 'siteAdmin' ? { isSiteAdmin: true } : {}),
        } as any)
        .returning();
      for (const [organizationId, role] of memberships) {
        await db.insert(userOrganizations).values({ userId: u[who].id, organizationId, role } as any);
      }
      const login = await request(app).post('/api/auth/login').send({ username: u[who].username, password: PASSWORD });
      expect(login.status, `login ${who}`).toBe(200);
      cookies[who] = login.headers['set-cookie'][0];
    }

    // Every site_metrics row the file resolves or measures. CI builds the DB with db:push + the default seed only
    // (no manual migrations), so create what is absent and remember which rows this file created.
    const needed: Array<[string, string, string]> = [
      ['DASH_10YD', 'speed', 's'],
      ['FLY10_TIME', 'speed', 's'],
      ['JUMP_CMJ_HOH', 'power', 'in'],
      ['RSI_L', 'power', 'ratio'],
      ['JUMP_CMJ_SL_L', 'power', 'in'],
      ['JUMP_CMJ_SL_R', 'power', 'in'],
    ];
    for (const [code, category, unit] of needed) {
      const inserted = await db
        .insert(siteMetrics)
        .values({ code, label: code, category, unit, metricType: 'higher_is_better' } as any)
        .onConflictDoNothing()
        .returning({ code: siteMetrics.code });
      if (inserted.length > 0) createdSiteMetricCodes.push(code);
    }

    // A derived and an inactive metric, for the resolved statuses (literal codes: a key outside the key map is a code)
    for (const [code, extra] of [[DERIVED_CODE, { isDerived: true }], [INACTIVE_CODE, { isActive: false }]] as const) {
      await db.insert(siteMetrics).values({ code, label: `Label ${code}`, category: 'power', unit: 'kg', metricType: 'tracking', ...extra } as any);
      createdSiteMetricCodes.push(code);
    }

    [{ id: eventA }, { id: eventB }] = await db
      .insert(events)
      .values([
        { organizationId: orgA, name: `${PREFIX}-evA`, startDate: new Date('2026-02-10T10:00:00Z') },
        { organizationId: orgB, name: `${PREFIX}-evB`, startDate: new Date('2026-02-10T10:00:00Z') },
      ] as any)
      .returning({ id: events.id });

    // The global default is seeded by migration 0153; make sure one live copy exists even on a push-only DB.
    const liveGlobal = () =>
      db.select({ id: evalBatteryTemplates.id }).from(evalBatteryTemplates)
        .where(and(isNull(evalBatteryTemplates.organizationId), isNull(evalBatteryTemplates.archivedAt), eq(evalBatteryTemplates.name, 'Soccer eval (yards)')));
    if ((await liveGlobal()).length === 0) {
      [{ id: createdGlobalId }] = await db.insert(evalBatteryTemplates).values({ sport: 'SOCCER', name: 'Soccer eval (yards)', metrics } as any).returning({ id: evalBatteryTemplates.id });
    }
    [{ id: globalId }] = await liveGlobal();

    [{ id: tplB }] = await db
      .insert(evalBatteryTemplates)
      .values({ organizationId: orgB, sport: 'SOCCER', name: `${PREFIX}-tplB`, metrics } as any)
      .returning({ id: evalBatteryTemplates.id });
  });

  afterAll(async () => {
    await purgeTestRows({ usernameLike: [`${PREFIX}-%`], orgNameLike: [`${PREFIX}-%`] });
    if (createdGlobalId) await db.delete(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, createdGlobalId));
    if (createdSiteMetricCodes.length) await db.delete(siteMetrics).where(inArray(siteMetrics.code, createdSiteMetricCodes));
  });

  describe('create and list', () => {
    let tplA: string;

    it('a coach creates a template for their org; the id is a 36-char uuid', async () => {
      const res = await as('coachA').post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-tplA`, sport: 'SOCCER', metrics });
      expect(res.status).toBe(201);
      expect(res.body.id).toHaveLength(36);
      expect(res.body.organizationId).toBe(orgA);
      expect(res.body.createdBy).toBe(u.coachA.id);
      tplA = res.body.id;
    });

    it('rejects an invalid body and a duplicate name', async () => {
      const bad = await as('coachA').post(`/api/organizations/${orgA}/eval-templates`).send({ name: '', sport: 'SOCCER', metrics: [] });
      expect(bad.status).toBe(400);
      const dup = await as('coachA').post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-tplA`, sport: 'SOCCER', metrics });
      expect(dup.status).toBe(409);
    });

    it('lists the org templates plus the global default, never another org\'s', async () => {
      const res = await as('coachA').get(`/api/organizations/${orgA}/eval-templates`);
      expect(res.status).toBe(200);
      const ids = res.body.map((t: any) => t.id);
      expect(ids).toContain(tplA);
      expect(ids).toContain(globalId);
      expect(ids).not.toContain(tplB);
    });

    it('saves an event\'s metric set as a template (logical keys, order and labels kept)', async () => {
      await db.insert(eventMetrics).values([
        { eventId: eventA, metricCode: 'DASH_10YD', displayOrder: 1, isRequired: true },
        { eventId: eventA, metricCode: 'JUMP_CMJ_HOH', displayOrder: 2, isRequired: false, customLabel: 'CMJ' },
      ] as any);
      const res = await as('coachA').post(`/api/events/${eventA}/eval-templates`).send({ name: `${PREFIX}-fromEvent` });
      expect(res.status).toBe(201);
      expect(res.body.sport).toBe('SOCCER');
      expect(res.body.metrics).toEqual([
        { metricKey: 'DASH_10', isRequired: true, displayOrder: 1 },
        { metricKey: 'CMJ_HOH', isRequired: false, displayOrder: 2, customLabel: 'CMJ' },
      ]);
    });

    it('refuses to save an event with no metrics', async () => {
      const res = await as('coachB').post(`/api/events/${eventB}/eval-templates`).send({ name: `${PREFIX}-empty` });
      expect(res.status).toBe(400);
    });
  });

  describe('validation and mass assignment', () => {
    it('rejects unknown keys with a 400 that lists them (create and update)', async () => {
      const bad = [metrics[0], { metricKey: 'ZZ_NO_SUCH_CODE', isRequired: false, displayOrder: 2 }];
      const res = await as('coachA').post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-unk`, sport: 'SOCCER', metrics: bad });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('ZZ_NO_SUCH_CODE');
      const ok = await as('coachA').post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-unk2`, sport: 'SOCCER', metrics: [metrics[0]] });
      const upd = await as('coachA').patch(`/api/eval-templates/${ok.body.id}`).send({ metrics: bad });
      expect(upd.status).toBe(400);
      expect(JSON.stringify(upd.body)).toContain('ZZ_NO_SUCH_CODE');
    });

    it('rejects two keys that resolve to the same code (FLY_10 and FLY10_TIME)', async () => {
      const dup = [{ metricKey: 'FLY_10', isRequired: true, displayOrder: 1 }, { metricKey: 'FLY10_TIME', isRequired: true, displayOrder: 2 }];
      const res = await as('coachA').post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-dupcode`, sport: 'SOCCER', metrics: dup });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('FLY10_TIME');
    });

    it('ignores organizationId (and other row fields) in the body of create and update', async () => {
      const created = await as('coachA').post(`/api/organizations/${orgA}/eval-templates`)
        .send({ name: `${PREFIX}-mass`, sport: 'SOCCER', metrics: [metrics[0]], organizationId: orgB, createdBy: u.coachB.id, archivedAt: new Date().toISOString() });
      expect(created.status).toBe(201);
      expect(created.body.organizationId).toBe(orgA);
      expect(created.body.createdBy).toBe(u.coachA.id);
      expect(created.body.archivedAt).toBeNull();
      const patched = await as('coachA').patch(`/api/eval-templates/${created.body.id}`).send({ description: 'd', organizationId: orgB });
      expect(patched.status).toBe(200);
      expect(patched.body.organizationId).toBe(orgA);
      const [row] = await db.select().from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, created.body.id));
      expect(row.organizationId).toBe(orgA);
    });

    it('answers 404, not 500, when a site admin posts to an organization that does not exist', async () => {
      const ghost = '00000000-0000-4000-8000-000000000000';
      expect((await as('siteAdmin').post(`/api/organizations/${ghost}/eval-templates`).send({ name: 'n', sport: 'SOCCER', metrics: [metrics[0]] })).status).toBe(404);
      expect((await as('siteAdmin').put(`/api/organizations/${ghost}/eval-report-settings`).send({ presets: {} })).status).toBe(404);
    });
  });

  describe('org isolation (org comes from the row)', () => {
    it('org A coach gets 404 for org B template: read, patch, archive, delete', async () => {
      expect((await as('coachA').get(`/api/eval-templates/${tplB}`)).status).toBe(404);
      expect((await as('coachA').patch(`/api/eval-templates/${tplB}`).send({ name: 'x' })).status).toBe(404);
      expect((await as('coachA').post(`/api/eval-templates/${tplB}/archive`)).status).toBe(404);
      expect((await as('coachA').delete(`/api/eval-templates/${tplB}`)).status).toBe(404);
      const [row] = await db.select().from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, tplB));
      expect(row.archivedAt).toBeNull();
      expect(row.name).toBe(`${PREFIX}-tplB`);
    });

    it('org A coach gets 404 listing, creating in and reading settings of org B', async () => {
      expect((await as('coachA').get(`/api/organizations/${orgB}/eval-templates`)).status).toBe(404);
      expect((await as('coachA').post(`/api/organizations/${orgB}/eval-templates`).send({ name: 'n', sport: 'SOCCER', metrics })).status).toBe(404);
      expect((await as('coachA').get(`/api/organizations/${orgB}/eval-report-settings`)).status).toBe(404);
      expect((await as('coachA').put(`/api/organizations/${orgB}/eval-report-settings`).send({ presets: {} })).status).toBe(404);
    });

    it('org A coach cannot apply org B\'s template to an org A event, nor any template to an org B event', async () => {
      expect((await as('coachA').post(`/api/events/${eventA}/apply-eval-template`).send({ templateId: tplB })).status).toBe(404);
      expect((await as('coachA').post(`/api/events/${eventB}/apply-eval-template`).send({ templateId: globalId })).status).toBe(404);
    });

    it('a user who is an athlete in A and a coach in B is judged per row: B yes, A no', async () => {
      expect((await as('coachAB').get(`/api/eval-templates/${tplB}`)).status).toBe(200);
      expect((await as('coachAB').get(`/api/organizations/${orgA}/eval-templates`)).status).toBe(404);
      expect((await as('coachAB').post(`/api/events/${eventA}/apply-eval-template`).send({ templateId: globalId })).status).toBe(404);
    });

    it('a coach of BOTH orgs cannot apply org A\'s template to org B\'s event: the template/event org match decides', async () => {
      const made = await as('coachAB2').post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-ab2`, sport: 'SOCCER', metrics: [metrics[0]] });
      expect(made.status).toBe(201);
      // coachAB2 can see the template and write to the event: only the org-match rule can refuse
      expect((await as('coachAB2').get(`/api/eval-templates/${made.body.id}`)).status).toBe(200);
      expect((await as('coachAB2').post(`/api/events/${eventB}/eval-templates`).send({ name: `${PREFIX}-ab2-ev` })).status).not.toBe(404);
      const res = await as('coachAB2').post(`/api/events/${eventB}/apply-eval-template`).send({ templateId: made.body.id });
      expect(res.status).toBe(404);
      expect(await db.select().from(eventMetrics).where(and(eq(eventMetrics.eventId, eventB), eq(eventMetrics.metricCode, 'DASH_10YD')))).toHaveLength(0);
      // the same coach applying it to an org A event works
      expect((await as('coachAB2').post(`/api/events/${eventA}/apply-eval-template`).send({ templateId: made.body.id })).status).toBe(200);
    });

    it('authorizes the event before parsing the body (outsider gets 404, not 400)', async () => {
      expect((await as('coachA').post(`/api/events/${eventB}/apply-eval-template`).send({})).status).toBe(404);
      expect((await as('coachA').post(`/api/events/${eventB}/eval-templates`).send({})).status).toBe(404);
      expect((await as('coachB').post(`/api/events/${eventB}/apply-eval-template`).send({})).status).toBe(400);
    });

    it('an athlete gets nothing, including the global default', async () => {
      expect((await as('athleteA').get(`/api/organizations/${orgA}/eval-templates`)).status).toBe(404);
      expect((await as('athleteA').get(`/api/eval-templates/${globalId}`)).status).toBe(404);
      expect((await as('athleteA').get(`/api/organizations/${orgA}/eval-report-settings`)).status).toBe(404);
    });

    it('requires login', async () => {
      expect((await request(app).get(`/api/eval-templates/${globalId}`)).status).toBe(401);
    });
  });

  describe('global default', () => {
    it('is readable by any org writer, but only a site admin may edit, archive or delete it', async () => {
      expect((await as('coachA').get(`/api/eval-templates/${globalId}`)).status).toBe(200);
      expect((await as('coachB').get(`/api/eval-templates/${globalId}`)).status).toBe(200);
      expect((await as('adminA').patch(`/api/eval-templates/${globalId}`).send({ description: 'x' })).status).toBe(403);
      expect((await as('adminA').post(`/api/eval-templates/${globalId}/archive`)).status).toBe(403);
      expect((await as('adminA').delete(`/api/eval-templates/${globalId}`)).status).toBe(403);
    });

    it('a site admin can edit it, and cannot hard-delete it (archive instead)', async () => {
      const [before] = await db.select().from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, globalId));
      const res = await as('siteAdmin').patch(`/api/eval-templates/${globalId}`).send({ description: `${PREFIX} desc` });
      expect(res.status).toBe(200);
      expect(res.body.description).toBe(`${PREFIX} desc`);
      await db.update(evalBatteryTemplates).set({ description: before.description }).where(eq(evalBatteryTemplates.id, globalId));
      expect((await as('siteAdmin').delete(`/api/eval-templates/${globalId}`)).status).toBe(409);
    });
  });

  describe('update, archive, delete (org template)', () => {
    it('org_admin updates, archives (hidden from the list), and deletes a template', async () => {
      const created = await as('coachA').post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-life`, sport: 'SOCCER', metrics });
      const id = created.body.id;

      const upd = await as('adminA').patch(`/api/eval-templates/${id}`).send({ name: `${PREFIX}-life2`, metrics: [metrics[0]] });
      expect(upd.status).toBe(200);
      expect(upd.body.name).toBe(`${PREFIX}-life2`);
      expect(upd.body.metrics).toHaveLength(1);

      await as('adminA').patch(`/api/eval-templates/${id}`).send({ description: 'about' });
      const cleared = await as('adminA').patch(`/api/eval-templates/${id}`).send({ description: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.description).toBeNull();

      expect((await as('adminA').post(`/api/eval-templates/${id}/archive`)).status).toBe(200);
      const list = await as('coachA').get(`/api/organizations/${orgA}/eval-templates`);
      expect(list.body.map((t: any) => t.id)).not.toContain(id);

      expect((await as('adminA').delete(`/api/eval-templates/${id}`)).status).toBe(204);
      expect((await as('adminA').get(`/api/eval-templates/${id}`)).status).toBe(404);
    });

    it('refuses to edit or archive an archived template (409), but still reads it', async () => {
      const id = (await as('coachA').post(`/api/organizations/${orgA}/eval-templates`).send({ name: `${PREFIX}-arch`, sport: 'SOCCER', metrics })).body.id;
      expect((await as('coachA').post(`/api/eval-templates/${id}/archive`)).status).toBe(200);

      const patched = await as('coachA').patch(`/api/eval-templates/${id}`).send({ name: `${PREFIX}-arch2` });
      expect(patched.status).toBe(409);
      expect(patched.body).toEqual({ error: 'Template is archived' });
      const again = await as('coachA').post(`/api/eval-templates/${id}/archive`);
      expect(again.status).toBe(409);
      expect(again.body).toEqual({ error: 'Template is archived' });

      expect((await as('coachA').get(`/api/eval-templates/${id}`)).status).toBe(200);
      const [row] = await db.select().from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, id));
      expect(row.name).toBe(`${PREFIX}-arch`);
    });
  });

  describe('apply template to event', () => {
    const newEvent = async (organizationId: string, extra: Record<string, unknown> = {}) =>
      (await db.insert(events).values({ organizationId, name: `${PREFIX}-ev-${Math.random().toString(36).slice(2, 7)}`, startDate: new Date('2026-03-01T10:00:00Z'), ...extra } as any).returning({ id: events.id }))[0].id;
    const codesOf = async (eventId: string) => (await db.select().from(eventMetrics).where(eq(eventMetrics.eventId, eventId))).map((r) => r.metricCode).sort();
    let tpl: string;

    it('adds only the required metrics by default, with order, flags and audit log', async () => {
      tpl = (await as('coachB').post(`/api/organizations/${orgB}/eval-templates`).send({ name: `${PREFIX}-apply`, sport: 'SOCCER', metrics })).body.id;
      const ev = await newEvent(orgB);
      const res = await as('coachB').post(`/api/events/${ev}/apply-eval-template`).send({ templateId: tpl });
      expect(res.status).toBe(200);
      expect(res.body.added.sort()).toEqual(['DASH_10YD', 'FLY10_TIME']);
      expect(res.body.skipped).toEqual([]);
      expect(res.body.alreadyPresent).toEqual([]);
      const rows = await db.select().from(eventMetrics).where(eq(eventMetrics.eventId, ev));
      const byCode = Object.fromEntries(rows.map((r) => [r.metricCode, r]));
      expect(byCode.DASH_10YD).toMatchObject({ isRequired: true, displayOrder: 1 });
      expect(byCode.FLY10_TIME).toMatchObject({ isRequired: true, displayOrder: 2 });
      expect(rows).toHaveLength(2);
      const audit = await db.select().from(auditLogs).where(and(eq(auditLogs.resourceId, ev), eq(auditLogs.action, 'event_metrics_bulk_added')));
      expect(audit).toHaveLength(1);
      expect(audit[0].userId).toBe(u.coachB.id);
    });

    it('adds named optional metrics on top, with their label, when includeOptional lists them', async () => {
      const ev = await newEvent(orgB);
      const res = await as('coachB').post(`/api/events/${ev}/apply-eval-template`).send({ templateId: tpl, includeOptional: ['CMJ_HOH', 'RSI_LEFT'] });
      expect(res.status).toBe(200);
      expect(res.body.added.sort()).toEqual(['DASH_10YD', 'FLY10_TIME', 'JUMP_CMJ_HOH', 'RSI_L']);
      const [cmj] = await db.select().from(eventMetrics).where(and(eq(eventMetrics.eventId, ev), eq(eventMetrics.metricCode, 'JUMP_CMJ_HOH')));
      expect(cmj).toMatchObject({ isRequired: false, customLabel: 'CMJ' });
    });

    it('allows one single-leg CMJ and rejects both with 400 (nothing is added)', async () => {
      const one = await newEvent(orgB);
      const ok = await as('coachB').post(`/api/events/${one}/apply-eval-template`).send({ templateId: tpl, includeOptional: ['CMJ_SL_LEFT'] });
      expect(ok.status).toBe(200);
      expect(ok.body.added).toContain('JUMP_CMJ_SL_L');
      expect(ok.body.added).not.toContain('JUMP_CMJ_SL_R');

      const both = await newEvent(orgB);
      const res = await as('coachB').post(`/api/events/${both}/apply-eval-template`).send({ templateId: tpl, includeOptional: ['CMJ_SL_LEFT', 'CMJ_SL_RIGHT'] });
      expect(res.status).toBe(400);
      expect(await codesOf(both)).toEqual([]);
    });

    it('rejects includeOptional keys that are required or not in the template', async () => {
      const ev = await newEvent(orgB);
      expect((await as('coachB').post(`/api/events/${ev}/apply-eval-template`).send({ templateId: tpl, includeOptional: ['DASH_10'] })).status).toBe(400);
      expect((await as('coachB').post(`/api/events/${ev}/apply-eval-template`).send({ templateId: tpl, includeOptional: ['NOPE'] })).status).toBe(400);
      expect(await codesOf(ev)).toEqual([]);
    });

    it('is repeatable: metrics already on the event are left alone and reported', async () => {
      const ev = await newEvent(orgB);
      await as('coachB').post(`/api/events/${ev}/apply-eval-template`).send({ templateId: tpl });
      const again = await as('coachB').post(`/api/events/${ev}/apply-eval-template`).send({ templateId: tpl });
      expect(again.status).toBe(200);
      expect(again.body.added).toEqual([]);
      expect(again.body.alreadyPresent.sort()).toEqual(['DASH_10YD', 'FLY10_TIME']);
    });

    it('skips keys whose site_metrics code is gone and reports them by key', async () => {
      const [stale] = await db.insert(evalBatteryTemplates).values({ organizationId: orgB, sport: 'SOCCER', name: `${PREFIX}-stale`, metrics: staleMetrics } as any).returning({ id: evalBatteryTemplates.id });
      const ev = await newEvent(orgB);
      const res = await as('coachB').post(`/api/events/${ev}/apply-eval-template`).send({ templateId: stale.id });
      expect(res.status).toBe(200);
      expect(res.body.added).toEqual(['DASH_10YD']);
      expect(res.body.skipped).toEqual(['ZZ_NO_SUCH_CODE']);
    });

    it('applies the global default to an event: exactly its required keys that exist', async () => {
      const [global] = await db.select().from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, globalId));
      const required = global.metrics.filter((m) => m.isRequired).map((m) => resolveTemplateKey(m.metricKey));
      const existing = (await db.select({ code: siteMetrics.code }).from(siteMetrics).where(inArray(siteMetrics.code, required))).map((r) => r.code);
      expect(existing).toContain('FLY10_TIME');

      const ev = await newEvent(orgA);
      const res = await as('adminA').post(`/api/events/${ev}/apply-eval-template`).send({ templateId: globalId });
      expect(res.status).toBe(200);
      expect(res.body.added.sort()).toEqual([...existing].sort());
      expect(await codesOf(ev)).toEqual([...existing].sort());
    });

    it('answers 200 with an empty result when every metric is optional and none is chosen', async () => {
      const allOptional = (await as('coachB').post(`/api/organizations/${orgB}/eval-templates`).send({
        name: `${PREFIX}-all-optional`, sport: 'SOCCER', metrics: [{ metricKey: 'CMJ_HOH', isRequired: false, displayOrder: 1 }],
      })).body.id;
      const ev = await newEvent(orgB);
      const res = await as('coachB').post(`/api/events/${ev}/apply-eval-template`).send({ templateId: allOptional });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ added: [], skipped: [], alreadyPresent: [] });
      expect(await codesOf(ev)).toEqual([]);
    });

    it('answers 400 with details when the body is malformed', async () => {
      const ev = await newEvent(orgB);
      const res = await as('coachB').post(`/api/events/${ev}/apply-eval-template`).send({ templateId: tplB, includeOptional: 'CMJ_HOH' });
      expect(res.status).toBe(400);
      expect(res.body.details?.fieldErrors?.includeOptional).toBeDefined();
    });

    it('refuses a frozen event with 409 and adds nothing', async () => {
      const ev = await newEvent(orgA, { isFrozen: true });
      const res = await as('coachA').post(`/api/events/${ev}/apply-eval-template`).send({ templateId: globalId });
      expect(res.status).toBe(409);
      expect(await codesOf(ev)).toEqual([]);
    });
  });

  describe('GET /api/eval-templates/:id/resolved', () => {
    let tplId: string;
    beforeAll(async () => {
      // Stored out of order on purpose: the answer is in displayOrder
      [{ id: tplId }] = await db.insert(evalBatteryTemplates).values({
        organizationId: orgA, sport: 'SOCCER', name: `${PREFIX}-resolved`,
        metrics: [
          { metricKey: DERIVED_CODE, isRequired: false, displayOrder: 5 },
          { metricKey: 'ZZ_NO_SUCH_CODE', isRequired: true, displayOrder: 4 },
          { metricKey: 'FLY_10', isRequired: true, displayOrder: 2 },
          { metricKey: INACTIVE_CODE, isRequired: false, displayOrder: 3 },
          { metricKey: 'DASH_10', isRequired: true, displayOrder: 1 },
        ],
      } as any).returning({ id: evalBatteryTemplates.id });
    });

    it('returns the template, every entry resolved to its code with a status, in displayOrder', async () => {
      const res = await as('coachA').get(`/api/eval-templates/${tplId}/resolved`);
      expect(res.status).toBe(200);
      expect(res.body.template).toEqual({ id: tplId, name: `${PREFIX}-resolved` });
      expect(res.body.metrics.map((m: any) => [m.metricKey, m.code, m.status, m.isRequired, m.displayOrder])).toEqual([
        ['DASH_10', 'DASH_10YD', 'available', true, 1],
        ['FLY_10', 'FLY10_TIME', 'available', true, 2],
        [INACTIVE_CODE, INACTIVE_CODE, 'inactive', false, 3],
        ['ZZ_NO_SUCH_CODE', 'ZZ_NO_SUCH_CODE', 'missing', true, 4],
        [DERIVED_CODE, DERIVED_CODE, 'derived', false, 5],
      ]);
    });

    it('carries the site metric label, unit and category when the metric exists, nulls when it does not', async () => {
      const res = await as('coachA').get(`/api/eval-templates/${tplId}/resolved`);
      const byKey = Object.fromEntries(res.body.metrics.map((m: any) => [m.metricKey, m]));
      expect(byKey.DASH_10).toMatchObject({ label: expect.any(String), unit: 's', category: expect.any(String) });
      expect(byKey[DERIVED_CODE]).toMatchObject({ label: `Label ${DERIVED_CODE}`, unit: 'kg', category: 'power' });
      expect(byKey.ZZ_NO_SUCH_CODE).toMatchObject({ label: null, unit: null, category: null });
    });

    it('is readable by org_admin and by a site admin; the global default by a writer of any org', async () => {
      expect((await as('adminA').get(`/api/eval-templates/${tplId}/resolved`)).status).toBe(200);
      expect((await as('siteAdmin').get(`/api/eval-templates/${tplId}/resolved`)).status).toBe(200);
      const g = await as('coachB').get(`/api/eval-templates/${globalId}/resolved`);
      expect(g.status).toBe(200);
      expect(g.body.template.id).toBe(globalId);
    });

    it('answers 404 to an athlete (even for the global default), another org\'s coach and an unknown id', async () => {
      expect((await as('athleteA').get(`/api/eval-templates/${tplId}/resolved`)).status).toBe(404);
      expect((await as('athleteA').get(`/api/eval-templates/${globalId}/resolved`)).status).toBe(404);
      expect((await as('coachB').get(`/api/eval-templates/${tplId}/resolved`)).status).toBe(404);
      expect((await as('coachA').get(`/api/eval-templates/${tplB}/resolved`)).status).toBe(404);
      expect((await as('coachA').get(`/api/eval-templates/no-such-template/resolved`)).status).toBe(404);
    });

    it('requires login', async () => {
      expect((await request(app).get(`/api/eval-templates/${tplId}/resolved`)).status).toBe(401);
    });
  });

  describe('apply template: derived metrics', () => {
    it('skips a derived metric (reported by key) and adds the rest', async () => {
      const [t] = await db.insert(evalBatteryTemplates).values({
        organizationId: orgB, sport: 'SOCCER', name: `${PREFIX}-with-derived`,
        metrics: [
          { metricKey: 'DASH_10', isRequired: true, displayOrder: 1 },
          { metricKey: DERIVED_CODE, isRequired: false, displayOrder: 2 },
          { metricKey: INACTIVE_CODE, isRequired: true, displayOrder: 3 },
        ],
      } as any).returning({ id: evalBatteryTemplates.id });
      const [ev] = await db.insert(events).values({ organizationId: orgB, name: `${PREFIX}-ev-derived`, startDate: new Date('2026-03-01T10:00:00Z') } as any).returning({ id: events.id });
      const res = await as('coachB').post(`/api/events/${ev.id}/apply-eval-template`).send({ templateId: t.id, includeOptional: [DERIVED_CODE] });
      expect(res.status).toBe(200);
      expect(res.body.added).toEqual(['DASH_10YD']);
      expect(res.body.skipped.sort()).toEqual([DERIVED_CODE, INACTIVE_CODE].sort());
      const rows = await db.select().from(eventMetrics).where(eq(eventMetrics.eventId, ev.id));
      expect(rows.map((r) => r.metricCode)).toEqual(['DASH_10YD']);
    });
  });

  describe('org eval report settings', () => {
    const selection = { preset: 'senior', metricKeys: ['DASH_10', 'FLY_10'], collegeGauge: true, headline: true, freshAndHealthy: true, coachNote: true, strengths: true, retestTrend: false };

    it('returns empty defaults before anything is saved', async () => {
      const res = await as('coachA').get(`/api/organizations/${orgA}/eval-report-settings`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ organizationId: orgA, presets: {}, lastSelection: null });
    });

    it('saves presets and last selection; a later put changes only what it sends', async () => {
      const put = await as('coachA').put(`/api/organizations/${orgA}/eval-report-settings`).send({ presets: { senior: { collegeGauge: false } }, lastSelection: selection });
      expect(put.status).toBe(200);
      expect(put.body.presets).toEqual({ senior: { collegeGauge: false } });
      expect(put.body.updatedBy).toBe(u.coachA.id);

      const put2 = await as('adminA').put(`/api/organizations/${orgA}/eval-report-settings`).send({ lastSelection: { ...selection, preset: 'high_school' } });
      expect(put2.status).toBe(200);
      const got = await as('coachA').get(`/api/organizations/${orgA}/eval-report-settings`);
      expect(got.body.presets).toEqual({ senior: { collegeGauge: false } });
      expect(got.body.lastSelection.preset).toBe('high_school');
      expect(await db.select().from(orgEvalReportSettings).where(eq(orgEvalReportSettings.organizationId, orgA))).toHaveLength(1);
    });

    it('rejects an invalid preset name and an athlete\'s write', async () => {
      expect((await as('coachA').put(`/api/organizations/${orgA}/eval-report-settings`).send({ presets: { college: {} } })).status).toBe(400);
      expect((await as('athleteA').put(`/api/organizations/${orgA}/eval-report-settings`).send({ presets: {} })).status).toBe(404);
    });
  });

  describe('canEditTemplate is safe standalone', () => {
    it('lets only that org\'s writers edit an org template (no prior visibility check needed)', async () => {
      const tpl = { organizationId: orgA } as any;
      expect(await canEditTemplate(u.coachA, tpl)).toBe(true);
      expect(await canEditTemplate(u.adminA, tpl)).toBe(true);
      expect(await canEditTemplate(u.siteAdmin, tpl)).toBe(true);
      expect(await canEditTemplate(u.athleteA, tpl)).toBe(false);
      expect(await canEditTemplate(u.coachB, tpl)).toBe(false);
    });

    it('lets only a site admin edit the global default', async () => {
      const tpl = { organizationId: null } as any;
      expect(await canEditTemplate(u.siteAdmin, tpl)).toBe(true);
      expect(await canEditTemplate(u.coachA, tpl)).toBe(false);
      expect(await canEditTemplate(u.adminA, tpl)).toBe(false);
    });
  });
});
