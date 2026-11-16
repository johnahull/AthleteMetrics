/**
 * Integration tests: org-admin AI prompt wording (organizations.ai_prompt_overrides), layered on the site wording.
 *
 * PATCH /api/organizations/:id/org-settings aiPromptOverrides, GET /api/organizations/:id/ai-prompt-defaults,
 * read exposure, and the generate-insights pass-through.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';
process.env.OPENAI_API_KEY = 'test-key';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { users, organizations } from '@shared/schema/tables/core';
import { userOrganizations } from '@shared/schema/tables/membership';
import { siteSettings } from '@shared/schema/tables/settings';
import { reports } from '@shared/schema/tables/reports';
import { measurements } from '@shared/schema/tables/measurements';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

const { openaiSpy } = vi.hoisted(() => ({ openaiSpy: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({ chat: { completions: { create: openaiSpy } } })),
}));
vi.mock('../../packages/api/vite.js', () => ({ setupVite: vi.fn().mockResolvedValue(undefined), serveStatic: vi.fn() }));
vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendInvitation: vi.fn().mockResolvedValue(true),
    sendWelcome: vi.fn().mockResolvedValue(true),
    sendPasswordReset: vi.fn().mockResolvedValue(true),
    sendReportSharedNotification: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn().mockImplementation(() => ({})),
}));

import { registerRoutes } from '../../packages/api/routes';
import { DEFAULT_PROMPT_TEXT } from '../../packages/api/services/ai-insights-service';

const PREFIX = 'oapo_';
const PASSWORD = 'CoachPassword1!';
const uid = () => crypto.randomBytes(4).toString('hex');

let app: Express;
let siteAdminCookie: string;
let siteAdminId: string;
let org: { id: string };
let otherOrg: { id: string };
const cookies: Record<string, string> = {};
const usernames: Record<string, string> = {};
const ids: Record<string, string> = {};
let teamId = '';
let member: { fullName: string };
const userIds: string[] = [];
const orgIds: string[] = [];
const reportIds: string[] = [];
let siteBefore: unknown;

const mkUser = async (tag: string, orgId: string | null, role?: string) => {
  const id = uid();
  const [row] = await db.insert(users).values({
    birthDate: '1990-01-01', username: `${PREFIX}${tag}_${id}`, firstName: `Fn${tag}`, lastName: `Ln${id}`, fullName: `Fn${tag} Ln${id}`,
    emails: [`${PREFIX}${tag}_${id}@example.com`], password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
    isEmailVerified: true, isSiteAdmin: false,
  } as any).returning();
  userIds.push(row.id);
  if (orgId && role) await db.insert(userOrganizations).values({ userId: row.id, organizationId: orgId, role } as any);
  return row;
};
const login = async (username: string, password = PASSWORD) => {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login failed (${res.status})`);
  return res.headers['set-cookie'][0] as string;
};
const patch = (key: string, body: unknown, orgId = () => org.id) =>
  request(app).patch(`/api/organizations/${orgId()}/org-settings`).set('Cookie', cookies[key]).send(body as object);
const stored = async () => (await db.select().from(organizations).where(eq(organizations.id, org.id)))[0].aiPromptOverrides ?? null;
const setSite = (o: unknown) => db.update(siteSettings).set({ aiPromptOverrides: o as any });
const mkOrg = async (name: string) => {
  const [o] = await db.insert(organizations).values({ name: `${PREFIX}${name}_${Date.now()}`, isActive: true, aiEnabledBySiteAdmin: true, aiEnabled: true } as any).returning();
  orgIds.push(o.id);
  return o;
};

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set to run integration tests.');
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const admin = (await db.select().from(users).where(eq(users.username, process.env.ADMIN_USER!)).limit(1))[0];
  siteAdminId = admin.id;
  siteAdminCookie = await login(process.env.ADMIN_USER!, process.env.ADMIN_PASSWORD!);
  cookies.siteadmin = siteAdminCookie;

  org = await mkOrg('org');
  otherOrg = await mkOrg('other');
  for (const [tag, o, role] of [
    ['admin', org.id, 'org_admin'], ['coach', org.id, 'coach'], ['athlete', org.id, 'athlete'], ['otheradmin', otherOrg.id, 'org_admin'],
  ] as const) {
    const user = await mkUser(tag, o, role);
    usernames[tag] = user.username;
    ids[tag] = user.id;
    cookies[tag] = await login(user.username);
  }
  const { teams, userTeams } = await import('@shared/schema/tables/core');
  const [team] = await db.insert(teams).values({ organizationId: org.id, name: `${PREFIX}team` } as any).returning();
  teamId = team.id;
  for (const tag of ['coach', 'athlete']) await db.insert(userTeams).values({ userId: ids[tag], teamId } as any);
  member = await mkUser('member', org.id, 'athlete'); // a member whose name must not appear in the wording
  // The site row may not exist on a fresh DB; a PATCH creates it so the direct updates below hit a row
  await request(app).patch('/api/site-settings').set('Cookie', siteAdminCookie).send({ aiPromptOverrides: null });
  const row = (await db.select().from(siteSettings).limit(1))[0];
  siteBefore = row?.aiPromptOverrides ?? null;
});

beforeEach(async () => {
  await db.update(organizations).set({ aiPromptOverrides: null, aiEnabled: true }).where(eq(organizations.id, org.id));
  await setSite(null);
});

afterAll(async () => {
  await setSite(siteBefore);
  for (const id of reportIds) await db.delete(reports).where(eq(reports.id, id)).catch(() => {});
  await purgeTestRows({ usernameLike: [`${PREFIX}%`], userIds, orgIds, teamIds: [teamId] });
});

describe('PATCH org-settings aiPromptOverrides', () => {
  it('org admin saves wording, sanitized; whole object replaces', async () => {
    const res = await patch('admin', { aiPromptOverrides: { philosophy: 'Be <b>kind</b>', toneParent: 'Warm.' } });
    expect(res.status).toBe(200);
    expect(await stored()).toEqual({ philosophy: 'Be bkind/b', toneParent: 'Warm.' });
    expect((await patch('admin', { aiPromptOverrides: { toneCoach: 'Dry.' } })).status).toBe(200);
    expect(await stored()).toEqual({ toneCoach: 'Dry.' });
  });

  it('site admin can write it', async () => {
    const res = await patch('siteadmin', { aiPromptOverrides: { toneCoach: 'From the site admin.' } });
    expect(res.status).toBe(200);
    expect(await stored()).toEqual({ toneCoach: 'From the site admin.' });
  });

  it.each([[null], [{}]])('%j resets to inherit', async (value) => {
    await db.update(organizations).set({ aiPromptOverrides: { toneCoach: 'x' } }).where(eq(organizations.id, org.id));
    expect((await patch('admin', { aiPromptOverrides: value })).status).toBe(200);
    expect(await stored()).toBeNull();
  });

  it('a patch without aiPromptOverrides leaves them alone', async () => {
    await db.update(organizations).set({ aiPromptOverrides: { toneCoach: 'keep' } }).where(eq(organizations.id, org.id));
    expect((await patch('admin', { aiPromptContext: 'ctx' })).status).toBe(200);
    expect(await stored()).toEqual({ toneCoach: 'keep' });
  });

  it('rejects role, analysisChecklist, unknown keys and over-long text', async () => {
    for (const bad of [{ role: 'You are a coach.' }, { analysisChecklist: 'a\nb\nc\nd\ne\nf\ng' }, { evil: 'x' }, { toneCoach: 'a'.repeat(1501) }, { toneCoach: 5 }]) {
      expect((await patch('admin', { aiPromptOverrides: bad })).status, JSON.stringify(bad)).toBe(400);
    }
    expect(await stored()).toBeNull();
  });

  it('rejects wording that names an organization member, listing the name', async () => {
    const res = await patch('admin', { aiPromptOverrides: { toneParent: `Greet ${member.fullName} warmly` } });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain(member.fullName);
    expect(await stored()).toBeNull();
  });

  it('does not store a value equal to the inherited one (site wording, else code default)', async () => {
    await setSite({ toneParent: 'Site parent tone.' });
    const res = await patch('admin', {
      aiPromptOverrides: { toneParent: 'Site parent tone.', toneCoach: DEFAULT_PROMPT_TEXT.toneCoach, toneAthlete: 'Mine.' },
    });
    expect(res.status).toBe(200);
    expect(await stored()).toEqual({ toneAthlete: 'Mine.' });
  });

  it('AI disabled: can clear, cannot set', async () => {
    await db.update(organizations).set({ aiEnabled: false, aiPromptOverrides: { toneCoach: 'old' } }).where(eq(organizations.id, org.id));
    expect((await patch('admin', { aiPromptOverrides: { toneCoach: 'new' } })).status).toBe(403);
    expect(await stored()).toEqual({ toneCoach: 'old' });
    expect((await patch('admin', { aiPromptOverrides: null })).status).toBe(200);
    expect(await stored()).toBeNull();
  });

  it.each(['coach', 'athlete', 'otheradmin'])('%s gets 403 and nothing is written', async (key) => {
    expect((await patch(key, { aiPromptOverrides: { toneCoach: 'hacked' } })).status).toBe(403);
    expect(await stored()).toBeNull();
  });
});

describe('read exposure', () => {
  const MARK = 'OAPO-MARKER-77';
  beforeEach(async () => {
    await db.update(organizations).set({ aiPromptOverrides: { toneCoach: MARK } }).where(eq(organizations.id, org.id));
  });
  const reads = (k: string) => [
    request(app).get(`/api/organizations/${org.id}`).set('Cookie', cookies[k]),
    request(app).get('/api/my-organizations').set('Cookie', cookies[k]),
    request(app).get(`/api/organizations/${org.id}/profile`).set('Cookie', cookies[k]),
  ];

  it.each(['coach', 'athlete', 'otheradmin'])('%s never receives the wording', async (key) => {
    for (const call of reads(key)) expect(JSON.stringify((await call).body)).not.toContain(MARK);
    const login = await request(app).post('/api/auth/login').send({ username: usernames.coach, password: PASSWORD });
    expect(JSON.stringify(login.body)).not.toContain(MARK);
  });

  it.each(['coach', 'athlete'])('%s: orgs nested in team reads never carry the wording', async (key) => {
    const { storage } = await import('../../packages/api/storage');
    expect(JSON.stringify(await storage.getUserTeams(ids[key]))).not.toContain(MARK);
    expect(JSON.stringify(await storage.getAthleteTeams(ids[key]))).not.toContain(MARK);
    for (const path of ['/api/teams', `/api/teams/${teamId}`]) {
      const res = await request(app).get(path).set('Cookie', cookies[key]);
      expect(JSON.stringify(res.body), path).not.toContain(MARK);
    }
  });

  it('org admin and site admin receive it from the organization read', async () => {
    for (const k of ['admin', 'siteadmin']) {
      const res = await request(app).get(`/api/organizations/${org.id}`).set('Cookie', cookies[k]);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(MARK);
    }
  });

  it('the public directory never returns it', async () => {
    await db.update(organizations).set({ isPublicDirectory: true }).where(eq(organizations.id, org.id));
    const res = await request(app).get('/api/organizations/public');
    expect(res.status).toBe(200);
    expect(res.body.organizations.map((o: { id: string }) => o.id)).toContain(org.id);
    expect(JSON.stringify(res.body)).not.toContain(MARK);
  });
});

describe('GET /api/organizations/:id/ai-prompt-defaults', () => {
  const get = (key: string, id = () => org.id) => request(app).get(`/api/organizations/${id()}/ai-prompt-defaults`).set('Cookie', cookies[key]);

  it('returns the site value, else the code default, for the four org keys', async () => {
    await setSite({ toneParent: 'Site parent tone.', role: 'Site role.' });
    const res = await get('admin');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.defaults).sort()).toEqual(['philosophy', 'toneAthlete', 'toneCoach', 'toneParent']);
    expect(res.body.defaults.toneParent).toBe('Site parent tone.');
    expect(res.body.defaults.toneCoach).toBe(DEFAULT_PROMPT_TEXT.toneCoach);
  });

  it.each(['coach', 'athlete', 'otheradmin'])('%s gets 403', async (key) => {
    expect((await get(key)).status).toBe(403);
  });

  it('an invalid site row falls back to the code defaults', async () => {
    await setSite({ evil: 'x' });
    expect((await get('admin')).body.defaults.toneParent).toBe(DEFAULT_PROMPT_TEXT.toneParent);
  });
});

describe('POST /api/reports/:id/generate-insights uses the org layer', () => {
  let reportId: string;
  const OK = { choices: [{ message: { content: '## Summary\nfine\n## What\'s Going Well\nok\n## What to Work On\nok\n## Next Steps\nok' }, finish_reason: 'stop' }] };
  const generate = (id = reportId) => request(app).post(`/api/reports/${id}/generate-insights`).set('Cookie', siteAdminCookie).send({});
  const msgs = () => openaiSpy.mock.calls.at(-1)![0].messages as Array<{ role: string; content: string }>;
  const sentSystem = () => msgs().find((m) => m.role === 'system')!.content;
  const sentUser = () => msgs().find((m) => m.role === 'user')!.content;

  const mkReport = async (orgId: string) => {
    const athlete = await mkUser('genathlete', orgId, 'athlete');
    await db.insert(measurements).values({
      userId: athlete.id, submittedBy: siteAdminId, organizationId: orgId, date: new Date().toISOString().split('T')[0],
      age: 30, metric: 'FLY10_TIME', value: '1.500', units: 's',
    } as any);
    const [r] = await db.insert(reports).values({
      name: `${PREFIX}report_${uid()}`, organizationId: orgId, createdBy: siteAdminId, reportType: 'individual',
      config: { athleteId: athlete.id, audience: 'coach', timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'], filters: { athleteId: athlete.id } },
    } as any).returning();
    reportIds.push(r.id);
    return r.id;
  };

  beforeAll(async () => {
    reportId = await mkReport(org.id);
    await db.update(siteSettings).set({ aiModel: 'gpt-6-luna' });
  });
  beforeEach(() => openaiSpy.mockResolvedValue(OK));

  it('org tone beats site tone; org philosophy is in the user message only; site-only org uses the site tone', async () => {
    await setSite({ toneCoach: 'SITE-TONE', philosophy: 'SITE-PHIL' });
    await db.update(organizations).set({ aiPromptOverrides: { toneCoach: 'ORG-TONE', philosophy: 'ORG-PHIL' } }).where(eq(organizations.id, org.id));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect((await generate()).status).toBe(200);
    expect(sentUser()).toContain('ORG-TONE');
    expect(sentUser()).toContain('ORG-PHIL');
    expect(sentUser()).not.toContain('SITE-TONE');
    // the org philosophy replaces the site one
    expect(sentSystem()).not.toContain('SITE-PHIL');
    expect(sentSystem()).not.toContain('ORG-PHIL');
    expect(sentSystem()).not.toContain('ORG-TONE');
    const orgHash = log.mock.calls.flat().join('\n').match(/overrides ([0-9a-f]{8})/i)?.[1];

    const otherReport = await mkReport(otherOrg.id);
    log.mockClear();
    expect((await generate(otherReport)).status).toBe(200);
    expect(sentUser()).toContain('SITE-TONE');
    expect(sentUser()).not.toContain('ORG-TONE');
    const siteHash = log.mock.calls.flat().join('\n').match(/overrides ([0-9a-f]{8})/i)?.[1];
    expect(orgHash).toBeTruthy();
    expect(siteHash).toBeTruthy();
    expect(orgHash).not.toBe(siteHash);
    log.mockRestore();
  });

  it('drops the org layer, and warns, when it names a member', async () => {
    await db.update(organizations).set({ aiPromptOverrides: { toneCoach: `ORG-NAMED ${member.fullName}` } }).where(eq(organizations.id, org.id));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await generate()).status).toBe(200);
    expect(sentUser()).not.toContain('ORG-NAMED');
    expect(warn.mock.calls.flat().join('\n')).toMatch(/organization wording dropped/i);
    warn.mockRestore();
  });

  it('ignores an invalid org row and logs', async () => {
    await db.update(organizations).set({ aiPromptOverrides: { role: 'x' } as any }).where(eq(organizations.id, org.id));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await generate()).status).toBe(200);
    expect(warn.mock.calls.flat().join('\n')).toMatch(/invalid ai prompt overrides in organization/i);
    warn.mockRestore();
  });
});
