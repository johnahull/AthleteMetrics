/**
 * Integration tests: wellness templates, targets, requests and analytics are scoped to the organization in the URL.
 *
 * - a template is usable by organization O when it belongs to O or is a system template (no organization),
 *   active or not
 * - request and schedule targets must be members / teams of O
 * - request-by-id routes only see requests of O
 * - team and athlete analytics only cover teams, athletes and responses of O; the athlete summary is allowed for
 *   the athlete themself or a coach / org admin of O (role in O, not the session role) or a site admin
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import {
  organizations,
  users,
  teams,
  wellnessTemplates,
  wellnessRequests,
  wellnessResponses,
  siteSettings,
} from '@shared/schema';
import { eq, inArray, or } from 'drizzle-orm';
import crypto from 'crypto';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {
    sendWellnessRequest: vi.fn().mockResolvedValue(true),
    sendWellnessReminder: vi.fn().mockResolvedValue(true),
    sendWellnessAlert: vi.fn().mockResolvedValue(true),
  },
}));

const { mockSendToUser } = vi.hoisted(() => ({ mockSendToUser: vi.fn() }));
vi.mock('../../packages/api/services/push-notification-service', () => ({
  getPushNotificationService: () => ({ sendToUser: mockSendToUser }),
}));

const PREFIX = `wos_${Date.now()}`;
const config = {
  questions: [{ id: 'q1', type: 'scale', label: 'Sleep', scaleMin: 1, scaleMax: 10, required: true }],
};

let app: express.Application;
let orgA: any, orgB: any;
let coachA: any, coachB: any, athleteA: any, athleteB: any, dual: any, outsider: any, siteAdmin: any;
let teamA: any, teamB: any;
let tplA: any, tplAInactive: any, tplB: any, tplSys: any;
const cookies: Record<string, string> = {};

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

async function makeUser(name: string, extra: Record<string, unknown> = {}) {
  const [u] = await db.insert(users).values({
    username: `${PREFIX}_${name}`,
    emails: [`${PREFIX}_${name}@test.com`],
    password: 'hashed',
    firstName: name,
    lastName: 'Test',
    fullName: `${name} Test`,
    ...extra,
  }).returning();
  return u;
}

async function login(key: string, user: any, role: string) {
  const res = await request(app).post('/mock-login').send({ userId: user.id, role });
  cookies[key] = res.headers['set-cookie']?.[0] || '';
}

async function insertRequest(organizationId: string, templateId: string, targets: { athletes?: string[]; teams?: string[] }) {
  const [r] = await db.insert(wellnessRequests).values({
    organizationId,
    templateId,
    distributionMethod: 'magic_link',
    targetAthleteIds: targets.athletes ?? [],
    targetTeamIds: targets.teams ?? [],
    publicToken: crypto.randomBytes(24).toString('hex'),
    status: 'active',
  }).returning();
  return r;
}

async function insertResponse(organizationId: string, user: any, teamId: string | null, value: number) {
  await db.insert(wellnessResponses).values({
    organizationId,
    templateId: tplA.id,
    userId: user.id,
    userFullName: user.fullName,
    teamId,
    submittedAt: new Date(),
    date: '2026-01-15',
    responses: { q1: { value } },
    accessMethod: 'authenticated',
  });
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(session({ secret: process.env.SESSION_SECRET!, resave: false, saveUninitialized: false }));
  app.post('/mock-login', async (req: any, res: any) => {
    const user = await storage.getUser(req.body.userId);
    req.session.user = {
      id: user!.id,
      emails: user!.emails,
      firstName: user!.firstName,
      lastName: user!.lastName,
      fullName: user!.fullName,
      role: req.body.role,
      isSiteAdmin: user!.isSiteAdmin || false,
    };
    res.json({ success: true });
  });

  // site_settings is a shared singleton: enable the module without replacing the row
  const [settings] = await db.select().from(siteSettings).limit(1);
  if (settings) {
    await db.update(siteSettings).set({ wellnessModuleEnabled: true }).where(eq(siteSettings.id, settings.id));
  } else {
    await db.insert(siteSettings).values({ wellnessModuleEnabled: true });
  }

  const { registerWellnessRoutes } = await import('../../packages/api/routes/wellness-routes');
  const { registerWellnessScheduleRoutes } = await import('../../packages/api/routes/wellness-schedule-routes');
  registerWellnessRoutes(app);
  registerWellnessScheduleRoutes(app);

  [orgA] = await db.insert(organizations).values({ name: `${PREFIX} Org A`, orgType: 'club', wellnessEnabled: true }).returning();
  [orgB] = await db.insert(organizations).values({ name: `${PREFIX} Org B`, orgType: 'club', wellnessEnabled: true }).returning();

  coachA = await makeUser('coachA');
  coachB = await makeUser('coachB');
  athleteA = await makeUser('athleteA');
  athleteB = await makeUser('athleteB');
  dual = await makeUser('dual'); // coach in B, athlete in A
  outsider = await makeUser('outsider');
  siteAdmin = await makeUser('siteadmin', { isSiteAdmin: true });

  await storage.addUserToOrganization(coachA.id, orgA.id, 'coach');
  await storage.addUserToOrganization(coachB.id, orgB.id, 'coach');
  await storage.addUserToOrganization(athleteA.id, orgA.id, 'athlete');
  await storage.addUserToOrganization(athleteB.id, orgB.id, 'athlete');
  await storage.addUserToOrganization(dual.id, orgA.id, 'athlete');
  await storage.addUserToOrganization(dual.id, orgB.id, 'coach');

  [teamA] = await db.insert(teams).values({ organizationId: orgA.id, name: `${PREFIX} Team A`, level: 'Club' }).returning();
  [teamB] = await db.insert(teams).values({ organizationId: orgB.id, name: `${PREFIX} Team B`, level: 'Club' }).returning();
  await storage.addUserToTeam(athleteA.id, teamA.id);
  await storage.addUserToTeam(athleteB.id, teamB.id);
  // dual is on a team of B (added first) and a team of A
  await storage.addUserToTeam(dual.id, teamB.id);
  await storage.addUserToTeam(dual.id, teamA.id);

  [tplA] = await db.insert(wellnessTemplates).values({ organizationId: orgA.id, name: `${PREFIX} A`, config }).returning();
  [tplAInactive] = await db.insert(wellnessTemplates).values({ organizationId: orgA.id, name: `${PREFIX} A old`, config, isActive: false }).returning();
  [tplB] = await db.insert(wellnessTemplates).values({ organizationId: orgB.id, name: `${PREFIX} B`, config }).returning();
  [tplSys] = await db.insert(wellnessTemplates).values({ organizationId: null, name: `${PREFIX} System`, config, isSystemSeeded: true }).returning();

  await login('coachA', coachA, 'coach');
  await login('athleteA', athleteA, 'athlete');
  await login('dual', dual, 'coach'); // session role comes from another organization
  await login('outsider', outsider, 'athlete');
  await login('siteAdmin', siteAdmin, 'site_admin');
});

afterAll(async () => {
  const orgIds = [orgA?.id, orgB?.id].filter(Boolean);
  if (orgIds.length) {
    await db.delete(wellnessResponses).where(inArray(wellnessResponses.organizationId, orgIds));
    await db.delete(wellnessTemplates).where(or(inArray(wellnessTemplates.organizationId, orgIds), eq(wellnessTemplates.name, `${PREFIX} System`)));
  }
  if (tplSys) await db.delete(wellnessTemplates).where(eq(wellnessTemplates.id, tplSys.id));
  await purgeTestRows({ usernameLike: [`${PREFIX}_%`], orgIds });
});

describe('templates usable by an organization', () => {
  it('GET template by id: own and system allowed, another organization 404', async () => {
    const base = `/api/organizations/${orgA.id}/wellness/templates`;
    expect((await request(app).get(`${base}/${tplA.id}`).set('Cookie', cookies.coachA)).status).toBe(200);
    expect((await request(app).get(`${base}/${tplSys.id}`).set('Cookie', cookies.coachA)).status).toBe(200);
    expect((await request(app).get(`${base}/${tplB.id}`).set('Cookie', cookies.coachA)).status).toBe(404);
  });

  it('GET template by id: non-member 403', async () => {
    const res = await request(app).get(`/api/organizations/${orgA.id}/wellness/templates/${tplA.id}`).set('Cookie', cookies.outsider);
    expect(res.status).toBe(403);
  });

  it('clone: system template allowed, another organization 404', async () => {
    const base = `/api/organizations/${orgA.id}/wellness/templates`;
    const ok = await request(app).post(`${base}/${tplSys.id}/clone`).set('Cookie', cookies.coachA);
    expect(ok.status).toBe(201);
    expect(ok.body.organizationId).toBe(orgA.id);
    expect((await request(app).post(`${base}/${tplB.id}/clone`).set('Cookie', cookies.coachA)).status).toBe(404);
  });

  it('request create: own, inactive own and system templates allowed, another organization 404', async () => {
    const url = `/api/organizations/${orgA.id}/wellness/requests`;
    for (const tpl of [tplA, tplAInactive, tplSys]) {
      const res = await request(app).post(url).set('Cookie', cookies.coachA)
        .send({ templateId: tpl.id, distributionMethod: 'athlete_account', targetAthleteIds: [athleteA.id], scheduledFor: tomorrow() });
      expect(res.status).toBe(201);
    }
    const res = await request(app).post(url).set('Cookie', cookies.coachA)
      .send({ templateId: tplB.id, distributionMethod: 'athlete_account', targetAthleteIds: [athleteA.id], scheduledFor: tomorrow() });
    expect(res.status).toBe(404);
  });

  it('request create by a site admin follows the same template rule', async () => {
    const url = `/api/organizations/${orgA.id}/wellness/requests`;
    const res = await request(app).post(url).set('Cookie', cookies.siteAdmin)
      .send({ templateId: tplB.id, distributionMethod: 'athlete_account', targetAthleteIds: [athleteA.id], scheduledFor: tomorrow() });
    expect(res.status).toBe(404);
  });

  it('schedule create: own and system templates allowed, another organization 404', async () => {
    const url = `/api/organizations/${orgA.id}/wellness/schedules`;
    const body = { distributionMethod: 'athlete_account', targetAthleteIds: [athleteA.id], recurrenceType: 'daily', scheduledTime: '08:00', maxOccurrences: 3 };
    expect((await request(app).post(url).set('Cookie', cookies.coachA).send({ ...body, templateId: tplA.id })).status).toBe(201);
    expect((await request(app).post(url).set('Cookie', cookies.coachA).send({ ...body, templateId: tplSys.id })).status).toBe(201);
    expect((await request(app).post(url).set('Cookie', cookies.coachA).send({ ...body, templateId: tplB.id })).status).toBe(404);
  });
});

describe('request and schedule targets', () => {
  const requestBody = (t: { a?: string[]; t?: string[] }) => ({
    templateId: tplA.id, distributionMethod: 'athlete_account', targetAthleteIds: t.a, targetTeamIds: t.t, scheduledFor: tomorrow(),
  });
  const scheduleBody = (t: { a?: string[]; t?: string[] }) => ({
    templateId: tplA.id, distributionMethod: 'athlete_account', targetAthleteIds: t.a, targetTeamIds: t.t,
    recurrenceType: 'daily', scheduledTime: '08:00', maxOccurrences: 3,
  });

  it('request create: own athletes and teams accepted (including an athlete of several organizations)', async () => {
    const res = await request(app).post(`/api/organizations/${orgA.id}/wellness/requests`).set('Cookie', cookies.coachA)
      .send(requestBody({ a: [athleteA.id, dual.id], t: [teamA.id] }));
    expect(res.status).toBe(201);
  });

  it('request create: athlete or team of another organization, or a mix, rejected with 400', async () => {
    const url = `/api/organizations/${orgA.id}/wellness/requests`;
    for (const t of [{ a: [athleteB.id] }, { t: [teamB.id] }, { a: [athleteA.id, athleteB.id] }, { a: [athleteA.id], t: [teamA.id, teamB.id] }]) {
      const res = await request(app).post(url).set('Cookie', cookies.coachA).send(requestBody(t));
      expect(res.status).toBe(400);
    }
  });

  it('schedule create: own targets accepted, targets of another organization rejected with 400', async () => {
    const url = `/api/organizations/${orgA.id}/wellness/schedules`;
    expect((await request(app).post(url).set('Cookie', cookies.coachA).send(scheduleBody({ a: [athleteA.id], t: [teamA.id] }))).status).toBe(201);
    for (const t of [{ a: [athleteB.id] }, { t: [teamB.id] }, { a: [athleteA.id, athleteB.id] }]) {
      const res = await request(app).post(url).set('Cookie', cookies.coachA).send(scheduleBody(t));
      expect(res.status).toBe(400);
    }
  });

  it('targeted-athletes by token lists only members of the request organization reached through its own teams', async () => {
    const r = await insertRequest(orgA.id, tplA.id, { athletes: [athleteA.id, athleteB.id], teams: [teamB.id] });
    const res = await request(app).get(`/api/wellness/requests/by-token/${r.publicToken}/targeted-athletes`);
    expect(res.status).toBe(200);
    expect(res.body.athletes.map((a: any) => a.id)).toEqual([athleteA.id]);
  });

  it('targeted-athletes shows a team of the request organization for an athlete of several organizations', async () => {
    const r = await insertRequest(orgA.id, tplA.id, { athletes: [dual.id] });
    const res = await request(app).get(`/api/wellness/requests/by-token/${r.publicToken}/targeted-athletes`);
    expect(res.body.athletes).toEqual([expect.objectContaining({ id: dual.id, teamId: teamA.id })]);
  });

  it('duplicate target ids are accepted', async () => {
    const res = await request(app).post(`/api/organizations/${orgA.id}/wellness/requests`).set('Cookie', cookies.coachA)
      .send(requestBody({ a: [athleteA.id, athleteA.id], t: [teamA.id, teamA.id] }));
    expect(res.status).toBe(201);
  });

  it('a target id in another letter case is rejected with 400', async () => {
    const res = await request(app).post(`/api/organizations/${orgA.id}/wellness/requests`).set('Cookie', cookies.coachA)
      .send(requestBody({ a: [athleteA.id.toUpperCase()] }));
    expect(res.status).toBe(400);
  });
});

describe('request-by-id routes', () => {
  it('GET, cancel, resend and delete a request of another organization: 404', async () => {
    const r = await insertRequest(orgB.id, tplB.id, { athletes: [athleteB.id] });
    const base = `/api/organizations/${orgA.id}/wellness/requests/${r.id}`;
    expect((await request(app).get(base).set('Cookie', cookies.coachA)).status).toBe(404);
    expect((await request(app).put(`${base}/cancel`).set('Cookie', cookies.coachA)).status).toBe(404);
    expect((await request(app).post(`${base}/resend-notifications`).set('Cookie', cookies.coachA)).status).toBe(404);
    expect((await request(app).delete(base).set('Cookie', cookies.coachA)).status).toBe(404);
    const [still] = await db.select().from(wellnessRequests).where(eq(wellnessRequests.id, r.id));
    expect(still.status).toBe('active');
  });

  it('site admin: request of another organization through this organization URL is 404', async () => {
    const r = await insertRequest(orgB.id, tplB.id, { athletes: [athleteB.id] });
    const base = `/api/organizations/${orgA.id}/wellness/requests/${r.id}`;
    expect((await request(app).get(base).set('Cookie', cookies.siteAdmin)).status).toBe(404);
    expect((await request(app).put(`${base}/cancel`).set('Cookie', cookies.siteAdmin)).status).toBe(404);
    expect((await request(app).delete(base).set('Cookie', cookies.siteAdmin)).status).toBe(404);
    expect((await request(app).get(`/api/organizations/${orgB.id}/wellness/requests/${r.id}`).set('Cookie', cookies.siteAdmin)).status).toBe(200);
  });

  it('completion rate counts only members of the organization reached through its own teams', async () => {
    const r = await insertRequest(orgA.id, tplA.id, { athletes: [athleteA.id, athleteB.id], teams: [teamA.id, teamB.id] });
    const res = await request(app).get(`/api/organizations/${orgA.id}/wellness/requests/${r.id}/completion-rate`).set('Cookie', cookies.coachA);
    // athleteA (direct and team A) and dual (team A); athleteB is not a member of A
    expect(res.body.total).toBe(2);
  });

  it('GET own request: 200', async () => {
    const r = await insertRequest(orgA.id, tplA.id, { athletes: [athleteA.id] });
    expect((await request(app).get(`/api/organizations/${orgA.id}/wellness/requests/${r.id}`).set('Cookie', cookies.coachA)).status).toBe(200);
  });

  it('completion rate covers only requests of the organization', async () => {
    const own = await insertRequest(orgA.id, tplA.id, { athletes: [athleteA.id] });
    const other = await insertRequest(orgB.id, tplB.id, { athletes: [athleteB.id] });
    const url = (id: string) => `/api/organizations/${orgA.id}/wellness/requests/${id}/completion-rate`;
    expect((await request(app).get(url(own.id)).set('Cookie', cookies.coachA)).body.total).toBe(1);
    expect((await request(app).get(url(other.id)).set('Cookie', cookies.coachA)).body.total).toBe(0);
  });
});

describe('analytics', () => {
  beforeAll(async () => {
    await insertResponse(orgA.id, athleteA, teamA.id, 7);
    await insertResponse(orgB.id, athleteA, teamA.id, 1); // response of another organization carrying team A
    await insertResponse(orgA.id, dual, teamA.id, 8);
    await insertResponse(orgB.id, dual, null, 2);
  });
  const range = { startDate: '2026-01-01', endDate: '2026-01-31' };

  it('team summary: own team covers only responses of the organization; another organization team 404', async () => {
    const url = `/api/organizations/${orgA.id}/wellness/analytics/team`;
    const own = await request(app).get(url).query({ ...range, teamId: teamA.id }).set('Cookie', cookies.coachA);
    expect(own.status).toBe(200);
    expect(own.body.totalResponses).toBe(2);
    const other = await request(app).get(url).query({ ...range, teamId: teamB.id }).set('Cookie', cookies.coachA);
    expect(other.status).toBe(404);
  });

  it('team summary: missing or repeated teamId is 400', async () => {
    const url = `/api/organizations/${orgA.id}/wellness/analytics/team`;
    expect((await request(app).get(url).query(range).set('Cookie', cookies.coachA)).status).toBe(400);
    const repeated = await request(app).get(`${url}?teamId=${teamA.id}&teamId=${teamA.id}&startDate=${range.startDate}&endDate=${range.endDate}`).set('Cookie', cookies.coachA);
    expect(repeated.status).toBe(400);
  });

  const athleteUrl = (id: string) => `/api/organizations/${orgA.id}/wellness/analytics/athlete/${id}`;

  it('athlete summary: athlete reads own summary', async () => {
    const res = await request(app).get(athleteUrl(athleteA.id)).query(range).set('Cookie', cookies.athleteA);
    expect(res.status).toBe(200);
    expect(res.body.totalResponses).toBe(1);
  });

  it('athlete summary: own summary through an organization URL covers only that organization', async () => {
    const res = await request(app).get(athleteUrl(dual.id)).query(range).set('Cookie', cookies.dual);
    expect(res.status).toBe(200);
    expect(res.body.totalResponses).toBe(1);
  });

  it('athlete summary: athlete reading another athlete 403', async () => {
    const res = await request(app).get(athleteUrl(dual.id)).query(range).set('Cookie', cookies.athleteA);
    expect(res.status).toBe(403);
  });

  it('athlete summary: coach in another organization but athlete in this one cannot read others', async () => {
    const res = await request(app).get(athleteUrl(athleteA.id)).query(range).set('Cookie', cookies.dual);
    expect(res.status).toBe(403);
  });

  it('athlete summary: coach reads an athlete of the organization, only its responses', async () => {
    const res = await request(app).get(athleteUrl(dual.id)).query(range).set('Cookie', cookies.coachA);
    expect(res.status).toBe(200);
    expect(res.body.totalResponses).toBe(1);
    expect(res.body.averageScores.q1).toBe(8);
  });

  it('athlete summary: athlete not in the organization 404', async () => {
    const res = await request(app).get(athleteUrl(athleteB.id)).query(range).set('Cookie', cookies.coachA);
    expect(res.status).toBe(404);
  });

  it('athlete summary: site admin allowed', async () => {
    const res = await request(app).get(athleteUrl(athleteA.id)).query(range).set('Cookie', cookies.siteAdmin);
    expect(res.status).toBe(200);
  });
});

describe('stored targets used for sending and submitting', () => {
  const today = () => new Date().toISOString().split('T')[0];
  const submit = (r: any, athlete: string, extra: Record<string, unknown> = {}) =>
    request(app).post('/api/wellness/responses').query({ token: r.publicToken, athlete })
      .send({ requestId: r.id, templateId: tplA.id, date: today(), responses: { q1: { value: 6, label: 'Sleep' } }, ...extra });

  it('magic links are generated only for members of the organization reached through its own teams', async () => {
    const { WellnessAccessService } = await import('../../packages/api/auth/wellness-access');
    const r = await insertRequest(orgA.id, tplA.id, { athletes: [athleteA.id, athleteB.id], teams: [teamB.id] });
    const links = await WellnessAccessService.generateMagicLinksForRequest(r.id);
    expect([...links.keys()]).toEqual([athleteA.id]);
  });

  it('magic links include an athlete of several organizations targeted directly', async () => {
    const { WellnessAccessService } = await import('../../packages/api/auth/wellness-access');
    const r = await insertRequest(orgA.id, tplA.id, { athletes: [dual.id] });
    const links = await WellnessAccessService.generateMagicLinksForRequest(r.id);
    expect([...links.keys()]).toEqual([dual.id]);
  });

  it('athlete account notifications go only to members of the organization', async () => {
    const { sendWellnessRequestNotifications } = await import('../../packages/api/services/wellness-notification-service');
    mockSendToUser.mockReset();
    mockSendToUser.mockResolvedValue({ successful: 1, failed: 0 });
    await sendWellnessRequestNotifications(
      { id: crypto.randomUUID(), publicToken: null },
      { templateId: tplA.id, distributionMethod: 'athlete_account', targetAthleteIds: [athleteA.id, athleteB.id] },
      coachA.id,
      orgA.id
    );
    expect(mockSendToUser.mock.calls.map(c => c[0])).toEqual([athleteA.id]);
  });

  it('resend notifications for an athlete account request go only to members of the organization', async () => {
    mockSendToUser.mockReset();
    mockSendToUser.mockResolvedValue({ successful: 1, failed: 0 });
    const [r] = await db.insert(wellnessRequests).values({
      organizationId: orgA.id, templateId: tplA.id, distributionMethod: 'athlete_account',
      targetAthleteIds: [athleteA.id, athleteB.id], targetTeamIds: [], status: 'active',
    }).returning();
    const res = await request(app).post(`/api/organizations/${orgA.id}/wellness/requests/${r.id}/resend-notifications`).set('Cookie', cookies.coachA);
    expect(res.status).toBe(200);
    expect(mockSendToUser.mock.calls.map(c => c[0])).toEqual([athleteA.id]);
  });

  it('magic link submission: a team of another organization does not make a member targeted', async () => {
    const r = await insertRequest(orgA.id, tplA.id, { teams: [teamB.id] });
    expect((await submit(r, dual.id)).status).toBe(403);
  });

  it('magic link submission: selected athlete reached only through a team of another organization is refused', async () => {
    const r = await insertRequest(orgA.id, tplA.id, { athletes: [athleteA.id], teams: [teamB.id] });
    expect((await submit(r, athleteA.id, { selectedAthleteId: dual.id })).status).toBe(403);
  });

  it('magic link submission: athlete of several organizations targeted directly or through a team of the organization', async () => {
    const direct = await insertRequest(orgA.id, tplA.id, { athletes: [dual.id] });
    expect((await submit(direct, dual.id)).status).toBe(201);
    const viaTeam = await insertRequest(orgA.id, tplA.id, { athletes: [athleteA.id], teams: [teamA.id] });
    expect((await submit(viaTeam, athleteA.id, { selectedAthleteId: dual.id })).status).toBe(201);
  });
});
