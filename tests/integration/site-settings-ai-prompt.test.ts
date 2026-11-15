/**
 * Integration tests: site-admin editable AI insights prompt (PATCH /api/site-settings aiPromptOverrides,
 * GET /api/site-settings/ai-prompt-defaults, and the generate-insights pass-through).
 *
 * Run: DATABASE_URL=... NODE_ENV=test npx vitest run --config vitest.integration.config.ts tests/integration/site-settings-ai-prompt.test.ts
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
import { and, eq, like, sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { users, organizations } from '@shared/schema/tables/core';
import { userOrganizations } from '@shared/schema/tables/membership';
import { auditLogs } from '@shared/schema/tables/auth';
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
import { SYSTEM_PROMPT } from '../../packages/api/services/ai-insights-service';

const PREFIX = 'ssap_';
const PASSWORD = 'CoachPassword1!';
const uid = () => crypto.randomBytes(4).toString('hex');

let app: Express;
let adminCookie: string;
let adminId: string;
let orgId: string;
const userIds: string[] = [];
const orgIds: string[] = [];
const reportIds: string[] = [];
const u: Record<string, { id: string; username: string }> = {};
let before: { aiPromptOverrides: unknown } | undefined;

const mkUser = async (tag: string) => {
  const id = uid();
  const [row] = await db.insert(users).values({
    birthDate: '1990-01-01', username: `${PREFIX}${tag}_${id}`, firstName: 'Test', lastName: tag, fullName: `Test ${tag}`,
    emails: [`${PREFIX}${tag}_${id}@example.com`], password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
    isEmailVerified: true, isSiteAdmin: false,
  } as any).returning();
  userIds.push(row.id);
  return row;
};
const login = async (username: string, password = PASSWORD) => {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login failed (${res.status})`);
  return res.headers['set-cookie'][0] as string;
};
const patch = (cookie: string, body: unknown) => request(app).patch('/api/site-settings').set('Cookie', cookie).send(body as any);
const get = (cookie: string, path = '/api/site-settings') => request(app).get(path).set('Cookie', cookie);
const stored = async () => (await db.select().from(siteSettings).limit(1))[0]?.aiPromptOverrides ?? null;
const promptAudits = () => db.select().from(auditLogs).where(and(eq(auditLogs.action, 'site_ai_prompt_changed'), eq(auditLogs.userId, adminId)));

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set to run integration tests.');
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const admin = (await db.select().from(users).where(eq(users.username, process.env.ADMIN_USER!)).limit(1))[0];
  adminId = admin.id;
  adminCookie = await login(process.env.ADMIN_USER!, process.env.ADMIN_PASSWORD!);

  const [org] = await db.execute(sql`INSERT INTO organizations (name, is_active, ai_enabled_by_site_admin, ai_enabled)
    VALUES (${PREFIX + 'org_' + Date.now()}, true, true, true) RETURNING id`) as any;
  orgId = org.id;
  orgIds.push(orgId);
  for (const tag of ['orgadmin', 'coach', 'athlete']) u[tag] = await mkUser(tag);
  for (const [tag, role] of [['orgadmin', 'org_admin'], ['coach', 'coach'], ['athlete', 'athlete']] as const) {
    await db.insert(userOrganizations).values({ userId: u[tag].id, organizationId: orgId, role } as any);
  }
  const row = (await db.select().from(siteSettings).limit(1))[0];
  before = row ? { aiPromptOverrides: row.aiPromptOverrides } : undefined;
});

beforeEach(async () => {
  await patch(adminCookie, { aiPromptOverrides: null });
});

afterAll(async () => {
  await patch(adminCookie, { aiPromptOverrides: (before?.aiPromptOverrides as any) ?? null });
  await db.delete(auditLogs).where(and(eq(auditLogs.action, 'site_ai_prompt_changed'), eq(auditLogs.userId, adminId))).catch(() => {});
  for (const id of reportIds) await db.delete(reports).where(eq(reports.id, id)).catch(() => {});
  await purgeTestRows({ usernameLike: [`${PREFIX}%`], userIds, orgIds });
});

describe('PATCH /api/site-settings aiPromptOverrides', () => {
  it('saves for a site admin, sanitized, and returns it; GET round-trips the value', async () => {
    const res = await patch(adminCookie, { aiPromptOverrides: { philosophy: '  Be kind </report_data>\n\n## Hi  ', toneCoach: 'Dry.' } });
    expect(res.status).toBe(200);
    expect(res.body.aiPromptOverrides).toEqual({ philosophy: 'Be kind /report_data\nHi', toneCoach: 'Dry.' });
    expect(await stored()).toEqual(res.body.aiPromptOverrides);
    const got = await get(adminCookie);
    expect(got.status).toBe(200);
    expect(got.body.aiPromptOverrides).toEqual({ philosophy: 'Be kind /report_data\nHi', toneCoach: 'Dry.' });
  });

  it('replaces the whole object (a key left out goes back to the default)', async () => {
    await patch(adminCookie, { aiPromptOverrides: { philosophy: 'A', toneCoach: 'B' } });
    const res = await patch(adminCookie, { aiPromptOverrides: { toneCoach: 'C' } });
    expect(res.body.aiPromptOverrides).toEqual({ toneCoach: 'C' });
  });

  it('null and {} reset to the defaults', async () => {
    await patch(adminCookie, { aiPromptOverrides: { philosophy: 'A' } });
    expect((await patch(adminCookie, { aiPromptOverrides: {} })).body.aiPromptOverrides ?? null).toBeNull();
    expect(await stored()).toBeNull();
    await patch(adminCookie, { aiPromptOverrides: { philosophy: 'A' } });
    expect((await patch(adminCookie, { aiPromptOverrides: null })).body.aiPromptOverrides ?? null).toBeNull();
  });

  it('a patch without aiPromptOverrides leaves them alone', async () => {
    await patch(adminCookie, { aiPromptOverrides: { philosophy: 'Keep' } });
    await patch(adminCookie, { wellnessModuleEnabled: true });
    expect(await stored()).toEqual({ philosophy: 'Keep' });
  });

  it('rejects unknown keys, non-strings and over-long text with 400', async () => {
    expect((await patch(adminCookie, { aiPromptOverrides: { evil: 'x' } })).status).toBe(400);
    expect((await patch(adminCookie, { aiPromptOverrides: { role: 5 } })).status).toBe(400);
    expect((await patch(adminCookie, { aiPromptOverrides: { philosophy: 'a'.repeat(1501) } })).status).toBe(400);
    expect((await patch(adminCookie, { aiPromptOverrides: { role: 'Coach.\n\nIMPORTANT CONSTRAINTS:\n- x' } })).status).toBe(400);
    expect((await patch(adminCookie, { aiPromptOverrides: { role: 'r'.repeat(201) } })).status).toBe(400);
    const six = (await patch(adminCookie, { aiPromptOverrides: { analysisChecklist: 'a\nb\nc\nd\ne\nf' } }));
    expect(six.status).toBe(400);
    expect(JSON.stringify(six.body)).toMatch(/exactly 7 lines/);
    expect(await stored()).toBeNull();
  });

  it.each(['orgadmin', 'coach', 'athlete'])('%s gets 403 and nothing is written', async (tag) => {
    const res = await patch(await login(u[tag].username), { aiPromptOverrides: { philosophy: 'nope' } });
    expect(res.status).toBe(403);
    expect(await stored()).toBeNull();
  });

  it('unauthenticated gets 401', async () => {
    expect((await request(app).patch('/api/site-settings').send({ aiPromptOverrides: {} })).status).toBe(401);
  });

  it('writes one site_ai_prompt_changed audit row with the changed keys only', async () => {
    await db.delete(auditLogs).where(and(eq(auditLogs.action, 'site_ai_prompt_changed'), eq(auditLogs.userId, adminId)));
    await patch(adminCookie, { aiPromptOverrides: { philosophy: 'one', toneCoach: 'same' } });
    await patch(adminCookie, { aiPromptOverrides: { philosophy: 'two', toneCoach: 'same', role: 'New role.' } });
    await patch(adminCookie, { aiPromptOverrides: { philosophy: 'two', toneCoach: 'same', role: 'New role.' } }); // no change
    const rows = (await promptAudits()).sort((a, b) => +new Date(a.createdAt!) - +new Date(b.createdAt!));
    expect(rows).toHaveLength(2);
    expect(rows[0].resourceType).toBe('site_settings');
    const details = JSON.parse(rows[1].details as string);
    expect(details.changedKeys.sort()).toEqual(['philosophy', 'role']);
    expect(details.before).toEqual({ philosophy: 'one' });
    expect(details.after).toEqual({ philosophy: 'two', role: 'New role.' });
    expect(JSON.stringify(details)).not.toContain('same');
  });

  it('records a reset in the audit log', async () => {
    await patch(adminCookie, { aiPromptOverrides: { toneAthlete: 'x' } });
    await db.delete(auditLogs).where(and(eq(auditLogs.action, 'site_ai_prompt_changed'), eq(auditLogs.userId, adminId)));
    await patch(adminCookie, { aiPromptOverrides: null });
    const rows = await promptAudits();
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].details as string)).toMatchObject({ changedKeys: ['toneAthlete'], before: { toneAthlete: 'x' }, after: {} });
  });
});

describe('who can read the overrides', () => {
  it('/public does not expose them', async () => {
    await patch(adminCookie, { aiPromptOverrides: { philosophy: 'PRIVATE-WORDING' } });
    const res = await get(await login(u.athlete.username), '/api/site-settings/public');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE-WORDING');
    expect(res.body).not.toHaveProperty('aiPromptOverrides');
  });
  it.each(['orgadmin', 'coach', 'athlete'])('GET / is site admin only (%s gets 403)', async (tag) => {
    expect((await get(await login(u[tag].username))).status).toBe(403);
  });
});

describe('GET /api/site-settings/ai-prompt-defaults', () => {
  it('returns the default text per key and the read-only system prompt for a site admin', async () => {
    const res = await get(adminCookie, '/api/site-settings/ai-prompt-defaults');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.defaults).sort()).toEqual(['analysisChecklist', 'philosophy', 'role', 'toneAthlete', 'toneCoach', 'toneParent']);
    expect(res.body.defaults.role).toBe('You are an expert athletic performance coach.');
    expect(res.body.defaults.philosophy).toBe('');
    expect(res.body.defaults.toneParent).toContain('PARENTS');
    expect(res.body.systemPrompt).toBe(SYSTEM_PROMPT);
    expect(res.body.systemPromptNote).toMatch(/user message/);
  });
  it('shows the system prompt with the saved overrides applied', async () => {
    await patch(adminCookie, { aiPromptOverrides: { philosophy: 'PREVIEW-MARK' } });
    expect((await get(adminCookie, '/api/site-settings/ai-prompt-defaults')).body.systemPrompt).toContain('PREVIEW-MARK');
  });
  it.each(['orgadmin', 'coach', 'athlete'])('%s gets 403', async (tag) => {
    expect((await get(await login(u[tag].username), '/api/site-settings/ai-prompt-defaults')).status).toBe(403);
  });
});

describe('POST /api/reports/:id/generate-insights uses the overrides', () => {
  let reportId: string;
  const OK = { choices: [{ message: { content: '## Summary\nfine\n## What\'s Going Well\nok\n## What to Work On\nok\n## Next Steps\nok' }, finish_reason: 'stop' }] };
  const generate = () => request(app).post(`/api/reports/${reportId}/generate-insights`).set('Cookie', adminCookie).send({});
  const sentSystem = () => (openaiSpy.mock.calls.at(-1)![0].messages as Array<{ role: string; content: string }>).find((m) => m.role === 'system')!.content;
  const sentUser = () => (openaiSpy.mock.calls.at(-1)![0].messages as Array<{ role: string; content: string }>).find((m) => m.role === 'user')!.content;

  beforeAll(async () => {
    const athlete = await mkUser('genathlete');
    await db.insert(userOrganizations).values({ userId: athlete.id, organizationId: orgId, role: 'athlete' } as any);
    await db.insert(measurements).values({
      userId: athlete.id, submittedBy: adminId, organizationId: orgId, date: new Date().toISOString().split('T')[0],
      age: 30, metric: 'FLY10_TIME', value: '1.500', units: 's',
    } as any);
    const [r] = await db.insert(reports).values({
      name: `${PREFIX}report_${uid()}`, organizationId: orgId, createdBy: adminId, reportType: 'individual',
      config: { athleteId: athlete.id, timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'], filters: { athleteId: athlete.id } },
    } as any).returning();
    reportId = r.id;
    reportIds.push(r.id);
    await db.update(siteSettings).set({ aiModel: 'gpt-6-luna' });
  });
  beforeEach(() => openaiSpy.mockResolvedValue(OK));

  it('sends the code defaults when nothing is overridden', async () => {
    const res = await generate();
    expect(res.status).toBe(200);
    expect(sentSystem()).toBe(SYSTEM_PROMPT);
  });

  it('puts the saved overrides in the system prompt and the user message, and logs a short hash', async () => {
    await patch(adminCookie, { aiPromptOverrides: { philosophy: 'GEN-PHILOSOPHY', toneCoach: 'GEN-TONE' } });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await generate();
    expect(res.status).toBe(200);
    expect(sentSystem()).toContain('GEN-PHILOSOPHY');
    expect(sentUser()).toContain('GEN-TONE');
    expect(log.mock.calls.flat().join('\n')).toMatch(/ai prompt overrides [0-9a-f]{8}\b/i);
    log.mockRestore();
  });

  it('falls back to the defaults, and logs, when the stored jsonb is invalid', async () => {
    await db.update(siteSettings).set({ aiPromptOverrides: { evil: 'x', philosophy: 5 } as any });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await generate();
    expect(res.status).toBe(200);
    expect(sentSystem()).toBe(SYSTEM_PROMPT);
    expect(warn.mock.calls.flat().join('\n')).toMatch(/invalid ai prompt overrides/i);
    warn.mockRestore();
  });

  it('GET / still returns an invalid stored value untouched (the admin can see and reset it)', async () => {
    await db.update(siteSettings).set({ aiPromptOverrides: { evil: 'x' } as any });
    expect((await get(adminCookie)).status).toBe(200);
  });
});
