/**
 * Cross-organization identity links need proof of email ownership.
 *
 * A link shares data (in either direction) only when it is confirmed and, for an automatic link, the account
 * redeemed an email verification token for an address it still holds and the identity carries. users.isEmailVerified
 * is not proof. Links made by people (admin_forced and so on) only need to be confirmed.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import {
  users, organizations, measurements, globalAthletes, userGlobalAthleteLinks, globalAthleteClaims,
} from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  sendAccountLinkedNotification: vi.fn().mockResolvedValue(true),
  sendEmailVerification: vi.fn().mockResolvedValue(true),
  sendClaimVerificationEmail: vi.fn().mockResolvedValue(true),
  sendWelcome: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../packages/api/services/email-service', () => ({
  emailService: emailMocks,
  EmailService: vi.fn().mockImplementation(() => emailMocks),
}));

import { registerRoutes } from '../../packages/api/routes';
import { storage } from '../../packages/api/storage';
import { PasswordResetService } from '../../packages/api/auth/password-reset';

const PREFIX = 'ilv_';
const PASSWORD = 'TestPassword1!';
const rid = () => crypto.randomBytes(4).toString('hex');
const mail = (name: string) => `${PREFIX}${name}_${rid()}@example.com`;

let app: Express;
const userIds: string[] = [];
const orgIds: string[] = [];

async function mkUser(name: string, emails: string[], extra: Record<string, unknown> = {}) {
  const [u] = await db.insert(users).values({
    username: `${PREFIX}${name}_${rid()}`,
    emails,
    password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
    firstName: name,
    lastName: 'Ilv',
    fullName: `${name} Ilv`,
    birthDate: '2000-01-01',
    coppaStatus: 'not_applicable',
    isActive: true,
    ...extra,
  } as any).returning();
  userIds.push(u.id);
  return u;
}

async function mkOrg(name: string) {
  const [o] = await db.insert(organizations).values({ name: `${PREFIX}${name}_${rid()}`, orgType: 'club', isActive: true }).returning();
  orgIds.push(o.id);
  return o;
}

async function addMeasurement(userId: string, organizationId: string, value: string) {
  await db.insert(measurements).values({
    userId, submittedBy: userId, organizationId, date: '2026-01-15', age: 25, metric: 'FLY10_TIME', value, units: 's',
  } as any);
}

/** Proves the mailbox the way a user does: token issued for the address, then redeemed. */
async function verifyMailbox(userId: string, email: string) {
  const { token } = await storage.createEmailVerificationToken(userId, email);
  const result = await PasswordResetService.verifyEmail(token, '127.0.0.1');
  expect(result.success).toBe(true);
}

async function linkOf(userId: string) {
  const [link] = await db.select().from(userGlobalAthleteLinks).where(eq(userGlobalAthleteLinks.userId, userId));
  return link;
}

async function login(user: { username: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const unified = async (user: { username: string }) => {
  const res = await (await login(user)).get('/api/my/unified-measurements');
  return (res.body.measurements as Array<{ value: string }>).map((m) => Number(m.value)).sort();
};

let orgA: any;
let orgB: any;
let owner: any;
let ownerEmail: string;
let identityId: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  await registerRoutes(app);

  orgA = await mkOrg('a');
  orgB = await mkOrg('b');
  ownerEmail = mail('owner');
  owner = await mkUser('owner', [ownerEmail]);
  await storage.addUserToOrganization(owner.id, orgA.id, 'athlete');
  await addMeasurement(owner.id, orgA.id, '1.111');
  await verifyMailbox(owner.id, ownerEmail);
  identityId = (await linkOf(owner.id)).globalAthleteId;
});

afterAll(async () => {
  const links = userIds.length
    ? await db.select({ g: userGlobalAthleteLinks.globalAthleteId }).from(userGlobalAthleteLinks).where(inArray(userGlobalAthleteLinks.userId, userIds))
    : [];
  const created = userIds.length
    ? await db.select({ id: globalAthletes.id }).from(globalAthletes).where(inArray(globalAthletes.createdBy, userIds))
    : [];
  const all = [...new Set([...links.map((l) => l.g), ...created.map((c) => c.id), identityId].filter(Boolean))];
  if (all.length) {
    await db.delete(globalAthleteClaims).where(inArray(globalAthleteClaims.globalAthleteId, all));
    await db.delete(globalAthletes).where(inArray(globalAthletes.id, all));
  }
  await purgeTestRows({ userIds, orgIds, usernameLike: [`${PREFIX}%`] });
});

describe('read gate on existing links', () => {
  let legacy: any;

  beforeAll(async () => {
    // An automatic link written by earlier code: confirmed and sharing, but the account never proved the address.
    legacy = await mkUser('legacy', [ownerEmail], { isEmailVerified: true }); // the flag alone is not proof
    await storage.addUserToOrganization(legacy.id, orgB.id, 'athlete');
    await addMeasurement(legacy.id, orgB.id, '2.222');
    await db.insert(userGlobalAthleteLinks).values({
      userId: legacy.id, globalAthleteId: identityId, linkStatus: 'confirmed', linkType: 'auto_import',
      confirmedAt: new Date(), shareMeasurements: true, notifiedAt: new Date(),
    });
  });

  it('the identity owner, who proved the address, still sees its own data', async () => {
    expect(await unified(owner)).toEqual([1.111]);
  });

  it('the unproven account sees nothing of the identity and cannot change it', async () => {
    const agent = await login(legacy);
    expect((await agent.get('/api/my/unified-measurements')).body.measurements).toEqual([]);
    expect((await agent.get('/api/my/global-athlete')).status).toBe(404);
    const dash = await agent.get('/api/my/unified-dashboard');
    expect(dash.body.hasGlobalAthlete).toBe(false);
    expect((await agent.get('/api/my/global-athlete/audit-log')).status).toBe(404);
    expect((await agent.get('/api/my/global-athlete/notifications')).body.notifications).toEqual([]);

    expect((await agent.patch('/api/my/global-athlete/privacy').send({ allowCrossOrgLinking: false })).status).toBe(404);
    expect((await linkOf(owner.id)).linkStatus).toBe('confirmed');
    const [g] = await db.select().from(globalAthletes).where(eq(globalAthletes.id, identityId));
    expect(g.allowCrossOrgLinking).toBe(true);

    expect((await agent.post('/api/my/global-athlete/claims').send({ email: mail('claim') })).status).toBeGreaterThanOrEqual(400);
    expect(await db.select().from(globalAthleteClaims).where(eq(globalAthleteClaims.globalAthleteId, identityId))).toEqual([]);
  });

  it('the identity owner does not see the unproven account or its data', async () => {
    const agent = await login(owner);
    const profile = await agent.get('/api/my/global-athlete');
    expect(profile.status).toBe(200);
    expect(profile.body.linkedAccounts.map((a: any) => a.userId)).toEqual([owner.id]);
    const dash = await agent.get('/api/my/unified-dashboard');
    expect(dash.body.organizations.map((o: any) => o.id)).toEqual([orgA.id]);
  });

  it('a verified address that the identity does not carry is not proof', async () => {
    const other = mail('other');
    await db.update(users).set({ emails: [ownerEmail, other] }).where(eq(users.id, legacy.id));
    await verifyMailbox(legacy.id, other);
    expect(await unified(legacy)).toEqual([]);
  });

  it('proving the identity address makes the link readable both ways', async () => {
    await verifyMailbox(legacy.id, ownerEmail);
    expect(await unified(legacy)).toEqual([1.111, 2.222]);
    expect(await unified(owner)).toEqual([1.111, 2.222]);
  });

  it('removing the proven address from the account stops sharing; the old proof does not carry over', async () => {
    await storage.updateAthlete(legacy.id, { emails: [mail('moved')] } as any);
    expect(await unified(legacy)).toEqual([]);
    expect(await unified(owner)).toEqual([1.111]);
    await storage.updateUser(owner.id, { emails: [mail('ownermoved')] } as any);
    expect(await unified(owner)).toEqual([]);
    await storage.updateUser(owner.id, { emails: [ownerEmail] } as any);
  });

  it('a confirmed link made by a person needs no email proof', async () => {
    const u = await mkUser('manual', [mail('manual')]);
    await db.insert(userGlobalAthleteLinks).values({
      userId: u.id, globalAthleteId: identityId, linkStatus: 'confirmed', linkType: 'admin_forced', confirmedAt: new Date(),
    });
    expect(await unified(u)).toEqual([1.111]);
    await db.delete(userGlobalAthleteLinks).where(eq(userGlobalAthleteLinks.userId, u.id));
  });
});
