/**
 * Report templates: org-wide saved metrics + benchmark + chart choices for the report wizard.
 * The organization comes from the row (URL org / template row), never from the session.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { organizations, reportTemplates, userOrganizations, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

// The per-IP mutation limiter would trip on this file's writes.
vi.mock('express-rate-limit', async (importOriginal) => {
  const passthrough = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...(await importOriginal<Record<string, unknown>>()), default: passthrough, rateLimit: passthrough };
});

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'ReportTemplates123!';
const PREFIX = `rpttpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

type Who = 'coachA' | 'adminA' | 'athleteA' | 'coachB' | 'outsider' | 'siteAdmin';

describe('report templates', () => {
  let app: Express;
  const u = {} as Record<Who, any>;
  const cookies = {} as Record<Who, string>;
  let orgA: string;
  let orgB: string;

  const as = (who: Who) => ({
    get: (url: string) => request(app).get(url).set('Cookie', cookies[who]),
    post: (url: string) => request(app).post(url).set('Cookie', cookies[who]),
    patch: (url: string) => request(app).patch(url).set('Cookie', cookies[who]),
    delete: (url: string) => request(app).delete(url).set('Cookie', cookies[who]),
  });

  const body = (name: string, extra: Record<string, unknown> = {}) => ({
    name: `${PREFIX}-${name}`,
    metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
    benchmarkSetIds: [randomUUID()],
    charts: { team: { trends: true } },
    ...extra,
  });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    [{ id: orgA }, { id: orgB }] = await db
      .insert(organizations)
      .values([{ name: `${PREFIX}-A` }, { name: `${PREFIX}-B` }] as any)
      .returning({ id: organizations.id });

    const specs: Record<Who, Array<[string, string]>> = {
      coachA: [[orgA, 'coach']],
      adminA: [[orgA, 'org_admin']],
      athleteA: [[orgA, 'athlete']],
      coachB: [[orgB, 'coach']],
      outsider: [],
      siteAdmin: [],
    };
    for (const [who, memberships] of Object.entries(specs) as Array<[Who, Array<[string, string]>]>) {
      [u[who]] = await db
        .insert(users)
        .values({
          username: `${PREFIX}-${who}`,
          emails: [`${PREFIX}-${who}@test.com`],
          password: hashed,
          firstName: 'Rpt',
          lastName: who,
          fullName: `Rpt ${who}`,
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
  });

  afterAll(async () => {
    await purgeTestRows({ usernameLike: [`${PREFIX}-%`], orgNameLike: [`${PREFIX}-%`] });
  });

  describe('create and list', () => {
    it('a coach creates a template; id is a 36-char uuid, createdBy is set, defaults applied', async () => {
      const res = await as('coachA').post(`/api/organizations/${orgA}/report-templates`).send({ name: `${PREFIX}-zeta`, metrics: ['FLY10_TIME'] });
      expect(res.status).toBe(201);
      expect(res.body.id).toHaveLength(36);
      expect(res.body.organizationId).toBe(orgA);
      expect(res.body.createdBy).toBe(u.coachA.id);
      expect(res.body.benchmarkSetIds).toEqual([]);
      expect(res.body.charts).toEqual({});
    });

    it('an org admin and a site admin can create too', async () => {
      expect((await as('adminA').post(`/api/organizations/${orgA}/report-templates`).send(body('alpha'))).status).toBe(201);
      expect((await as('siteAdmin').post(`/api/organizations/${orgA}/report-templates`).send(body('mid'))).status).toBe(201);
    });

    it('lists the org templates ordered by name, never another org\'s', async () => {
      const other = await as('coachB').post(`/api/organizations/${orgB}/report-templates`).send(body('b-only'));
      expect(other.status).toBe(201);
      const res = await as('coachA').get(`/api/organizations/${orgA}/report-templates`);
      expect(res.status).toBe(200);
      const names: string[] = res.body.map((t: any) => t.name);
      expect(names).toEqual([...names].sort());
      expect(names).toContain(`${PREFIX}-alpha`);
      expect(names).not.toContain(`${PREFIX}-b-only`);
    });

    it('400 on an invalid body', async () => {
      expect((await as('coachA').post(`/api/organizations/${orgA}/report-templates`).send({ name: '', metrics: [] })).status).toBe(400);
      expect((await as('coachA').post(`/api/organizations/${orgA}/report-templates`).send({ name: 'x', metrics: ['A'], bogus: 1 })).status).toBe(400);
    });

    it('409 on a duplicate name in the same org; the same name in another org is fine', async () => {
      expect((await as('coachA').post(`/api/organizations/${orgA}/report-templates`).send(body('alpha'))).status).toBe(409);
      expect((await as('coachB').post(`/api/organizations/${orgB}/report-templates`).send(body('alpha'))).status).toBe(201);
    });

    it('404 when the organization does not exist (site admin)', async () => {
      const res = await as('siteAdmin').post(`/api/organizations/${randomUUID()}/report-templates`).send(body('ghost'));
      expect(res.status).toBe(404);
    });
  });

  describe('authorization', () => {
    it('athlete, non-member and other-org coach get 404 on list and create', async () => {
      for (const who of ['athleteA', 'outsider', 'coachB'] as Who[]) {
        const list = await as(who).get(`/api/organizations/${orgA}/report-templates`);
        expect(list.status, `list ${who}`).toBe(404);
        expect(list.body).toEqual({ error: 'Not found' });
        expect((await as(who).post(`/api/organizations/${orgA}/report-templates`).send(body(`x-${who}`))).status, `create ${who}`).toBe(404);
      }
    });

    it('athlete, non-member and other-org coach get 404 on PATCH and DELETE; the row is untouched', async () => {
      const [row] = await db.insert(reportTemplates).values({ organizationId: orgA, name: `${PREFIX}-guarded`, metrics: ['FLY10_TIME'] }).returning();
      for (const who of ['athleteA', 'outsider', 'coachB'] as Who[]) {
        expect((await as(who).patch(`/api/report-templates/${row.id}`).send({ name: `${PREFIX}-hijack` })).status, `patch ${who}`).toBe(404);
        expect((await as(who).delete(`/api/report-templates/${row.id}`)).status, `delete ${who}`).toBe(404);
      }
      const [after] = await db.select().from(reportTemplates).where(eq(reportTemplates.id, row.id));
      expect(after.name).toBe(`${PREFIX}-guarded`);
    });

    it('PATCH/DELETE of an unknown id is 404', async () => {
      expect((await as('coachA').patch(`/api/report-templates/${randomUUID()}`).send({ name: 'x' })).status).toBe(404);
      expect((await as('coachA').delete(`/api/report-templates/${randomUUID()}`)).status).toBe(404);
    });
  });

  describe('update and delete', () => {
    let id: string;
    beforeAll(async () => {
      const res = await as('coachA').post(`/api/organizations/${orgA}/report-templates`).send(body('editable'));
      id = res.body.id;
    });

    it('PATCH updates fields and bumps updatedAt', async () => {
      const [before] = await db.select().from(reportTemplates).where(eq(reportTemplates.id, id));
      await new Promise((r) => setTimeout(r, 15));
      const res = await as('adminA').patch(`/api/report-templates/${id}`).send({ name: `${PREFIX}-renamed`, metrics: ['DASH_40YD'], description: 'd' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe(`${PREFIX}-renamed`);
      expect(res.body.metrics).toEqual(['DASH_40YD']);
      expect(res.body.benchmarkSetIds).toEqual(before.benchmarkSetIds);
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(before.updatedAt.getTime());
    });

    it('PATCH {description:null} clears the description; omitting it leaves it', async () => {
      const set = await as('coachA').patch(`/api/report-templates/${id}`).send({ description: 'keep me' });
      expect(set.body.description).toBe('keep me');
      const other = await as('coachA').patch(`/api/report-templates/${id}`).send({ charts: {} });
      expect(other.body.description).toBe('keep me');
      const cleared = await as('coachA').patch(`/api/report-templates/${id}`).send({ description: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.description).toBeNull();
      const [row] = await db.select().from(reportTemplates).where(eq(reportTemplates.id, id));
      expect(row.description).toBeNull();
    });

    it('PATCH 400 on an invalid body and 409 on a name clash', async () => {
      expect((await as('coachA').patch(`/api/report-templates/${id}`).send({ metrics: [] })).status).toBe(400);
      expect((await as('coachA').patch(`/api/report-templates/${id}`).send({ name: `${PREFIX}-alpha` })).status).toBe(409);
    });

    it('a site admin can patch and delete; the template is gone afterwards', async () => {
      expect((await as('siteAdmin').patch(`/api/report-templates/${id}`).send({ description: 'by site admin' })).status).toBe(200);
      expect((await as('siteAdmin').delete(`/api/report-templates/${id}`)).status).toBe(204);
      expect((await as('coachA').delete(`/api/report-templates/${id}`)).status).toBe(404);
    });
  });
});
