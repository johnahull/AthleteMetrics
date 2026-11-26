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
  users, organizations, measurements, globalAthletes, userGlobalAthleteLinks, globalAthleteClaims, emailVerificationTokens,
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
import { globalAthleteService } from '../../packages/api/services/global-athlete-service';
import { ProfileMergeService } from '../../packages/api/services/profile-merge-service';

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

/** Proves the mailbox the way a user does: token issued for the address, then redeemed while signed in as that user. */
async function verifyMailbox(userId: string, email: string) {
  const { token } = await storage.createEmailVerificationToken(userId, email);
  const result = await PasswordResetService.verifyEmail(token, '127.0.0.1', undefined, userId);
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

describe('new automatic links start pending', () => {
  let coachB: any;
  let copyId: string;

  beforeAll(async () => {
    coachB = await mkUser('coachb', [mail('coachb')], { isEmailVerified: true });
    await storage.addUserToOrganization(coachB.id, orgB.id, 'coach');
  });

  it('creating an athlete with the identity email makes a pending link and sends no "account linked" email', async () => {
    emailMocks.sendAccountLinkedNotification.mockClear();
    const coach = await login(coachB);
    const res = await coach.post('/api/athletes').send({ firstName: 'Copy', lastName: 'Ilv', emails: [ownerEmail], birthDate: '2000-01-01' });
    expect(res.status).toBe(201);
    copyId = res.body.id;
    userIds.push(copyId);

    const link = await linkOf(copyId);
    expect(link.linkStatus).toBe('pending');
    expect(link.globalAthleteId).toBe(identityId);
    expect(link.confirmedAt).toBeNull();
    expect(emailMocks.sendAccountLinkedNotification).not.toHaveBeenCalled();
  });

  it('verifying another address leaves it pending; verifying the identity address activates it', async () => {
    const other = mail('copyother');
    await db.update(users).set({ emails: [ownerEmail, other] }).where(eq(users.id, copyId));
    await verifyMailbox(copyId, other);
    expect((await linkOf(copyId)).linkStatus).toBe('pending');

    await verifyMailbox(copyId, ownerEmail);
    const link = await linkOf(copyId);
    expect(link.linkStatus).toBe('confirmed');
    expect(link.confirmedBy).toBe(copyId);
    expect(await globalAthleteService.getActiveUserGlobalAthleteLink(copyId)).not.toBeNull();
  });

  it('an identity created from an unverified address gives its creator a pending link', async () => {
    const u = await mkUser('fresh', [mail('fresh')]);
    await globalAthleteService.linkAthleteByEmail(u.id, u.emails![0]);
    expect((await linkOf(u.id)).linkStatus).toBe('pending');
  });

  it('an account that already redeemed a token for the address gets a confirmed link; the flag alone is not enough', async () => {
    const email = mail('pre');
    const proven = await mkUser('pre1', [email]);
    const { token } = await storage.createEmailVerificationToken(proven.id, email);
    await storage.verifyEmailToken(token, proven.id); // redeemed while signed in, without the hook that links
    await globalAthleteService.linkAthleteByEmail(proven.id, email);
    expect((await linkOf(proven.id)).linkStatus).toBe('confirmed');

    const flagged = await mkUser('pre2', [email], { isEmailVerified: true });
    await globalAthleteService.linkAthleteByEmail(flagged.id, email);
    expect((await linkOf(flagged.id)).linkStatus).toBe('pending');
  });

  it('the admin backfill writes pending links for accounts without proof', async () => {
    const u = await mkUser('backfill', [mail('backfill')]);
    await storage.addUserToOrganization(u.id, orgB.id, 'athlete');
    await globalAthleteService.backfillAllAthleteLinks();
    expect((await linkOf(u.id)).linkStatus).toBe('pending');
  });
});

describe('email verification as proof', () => {
  let athlete: any;
  let email: string;

  beforeAll(async () => {
    email = mail('proof');
    athlete = await mkUser('proof', [email]);
    await db.insert(userGlobalAthleteLinks).values({ userId: athlete.id, globalAthleteId: identityId, linkStatus: 'pending', linkType: 'auto_import' });
    await db.update(globalAthletes).set({ verifiedEmails: [ownerEmail, email] }).where(eq(globalAthletes.id, identityId));
  });

  it('a verification email can only be requested for an address of the signed-in account', async () => {
    const agent = await login(athlete);
    emailMocks.sendEmailVerification.mockClear();
    const foreign = await agent.post('/api/enhanced-auth/request-email-verification').send({ email: mail('stranger') });
    expect(foreign.status).toBe(400);
    expect(emailMocks.sendEmailVerification).not.toHaveBeenCalled();

    const own = await agent.post('/api/enhanced-auth/request-email-verification').send({});
    expect(own.status).toBe(200);
    expect(own.body.success).toBe(true);
    expect(emailMocks.sendEmailVerification).toHaveBeenCalledWith(email, expect.anything());
  });

  it('a used token from before this check, or redeemed without signing in, verifies the email but proves nothing', async () => {
    await db.insert(emailVerificationTokens).values({ userId: athlete.id, email, token: `old-${rid()}`, isUsed: true, expiresAt: new Date() });
    await globalAthleteService.linkAthleteByEmail(athlete.id, email);
    expect((await linkOf(athlete.id)).linkStatus).toBe('pending');

    const { token } = await storage.createEmailVerificationToken(athlete.id, email);
    const res = await request(app).post('/api/enhanced-auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.signInToRestoreLinks).toBe(true);
    const [u] = await db.select().from(users).where(eq(users.id, athlete.id));
    expect(u.isEmailVerified).toBe(true);
    expect((await linkOf(athlete.id)).linkStatus).toBe('pending');
    expect(await globalAthleteService.getActiveUserGlobalAthleteLink(athlete.id)).toBeNull();
  });

  it('redeeming while signed in as someone else proves nothing', async () => {
    const { token } = await storage.createEmailVerificationToken(athlete.id, email);
    const res = await (await login(owner)).post('/api/enhanced-auth/verify-email').send({ token });
    expect(res.body.success).toBe(true);
    expect((await linkOf(athlete.id)).linkStatus).toBe('pending');
  });

  it('a pending account cannot change its sharing setting', async () => {
    const res = await (await login(athlete)).patch('/api/my/global-athlete/sharing').send({ shareMeasurements: false });
    expect(res.status).toBe(404);
    expect((await linkOf(athlete.id)).shareMeasurements).toBe(true);
  });

  it('redeeming while signed in as the token user activates the link and notifies the address', async () => {
    emailMocks.sendAccountLinkedNotification.mockClear();
    const { token } = await storage.createEmailVerificationToken(athlete.id, email);
    const res = await (await login(athlete)).post('/api/enhanced-auth/verify-email').send({ token });
    expect(res.body.success).toBe(true);
    expect(res.body.signInToRestoreLinks).toBeFalsy();
    const link = await linkOf(athlete.id);
    expect(link.linkStatus).toBe('confirmed');
    expect(link.notifiedAt).not.toBeNull();
    expect(await globalAthleteService.getActiveUserGlobalAthleteLink(athlete.id)).not.toBeNull();
    expect(emailMocks.sendAccountLinkedNotification).toHaveBeenCalledWith(expect.objectContaining({ email }));
  });

  it('admin counts include only active links', async () => {
    const before = await globalAthleteService.getGlobalAthleteStats();
    const u = await mkUser('count', [mail('count')]);
    await db.insert(userGlobalAthleteLinks).values({ userId: u.id, globalAthleteId: identityId, linkStatus: 'confirmed', linkType: 'auto_import', confirmedAt: new Date() });
    const after = await globalAthleteService.getGlobalAthleteStats();
    expect(after.totalLinkedUsers).toBe(before.totalLinkedUsers);
    expect(after.recentLinkCount).toBe(before.recentLinkCount);
    const { athletes } = await globalAthleteService.getAllGlobalAthletes({ search: ownerEmail });
    const row = athletes.find((a) => a.id === identityId)!;
    const active = await globalAthleteService.getLinkedUsers(identityId);
    expect(row.linkedUserCount).toBe(active.length);
    await db.delete(userGlobalAthleteLinks).where(eq(userGlobalAthleteLinks.userId, u.id));
  });
});

describe('profile merge consolidation', () => {
  const setup = async (tag: string) => {
    const org = await mkOrg(tag);
    const admin = await mkUser(`${tag}admin`, [mail(`${tag}admin`)], { isSiteAdmin: true });
    const srcEmail = mail(`${tag}src`);
    const dstEmail = mail(`${tag}dst`);
    const src = await mkUser(`${tag}src`, [srcEmail]);
    const dst = await mkUser(`${tag}dst`, [dstEmail]);
    await storage.addUserToOrganization(src.id, org.id, 'athlete');
    await storage.addUserToOrganization(dst.id, org.id, 'athlete');
    return { org, admin, src, dst, srcEmail, dstEmail };
  };

  it('a proven link moved to an account without proof stops sharing', async () => {
    const { org, admin, src, dst, srcEmail } = await setup('mg1');
    await verifyMailbox(src.id, srcEmail);
    await new ProfileMergeService().mergeProfiles(org.id, src.id, dst.id, admin.id);
    expect(await linkOf(dst.id)).toBeDefined();
    expect(await globalAthleteService.getActiveUserGlobalAthleteLink(dst.id)).toBeNull();
  });

  it('a non-active link neither blocks the merge nor replaces an active one', async () => {
    const { org, admin, src, dst, dstEmail } = await setup('mg2');
    await verifyMailbox(dst.id, dstEmail);
    const dstLink = await linkOf(dst.id);
    await db.insert(userGlobalAthleteLinks).values({ userId: src.id, globalAthleteId: identityId, linkStatus: 'pending', linkType: 'auto_import' });
    await new ProfileMergeService().mergeProfiles(org.id, src.id, dst.id, admin.id);
    expect((await linkOf(dst.id)).id).toBe(dstLink.id);
    expect(await globalAthleteService.getActiveUserGlobalAthleteLink(dst.id)).not.toBeNull();
  });

  it('an active source link replaces a non-active target link', async () => {
    const { org, admin, src, dst, srcEmail } = await setup('mg3');
    await verifyMailbox(src.id, srcEmail);
    const srcLink = await linkOf(src.id);
    await db.insert(userGlobalAthleteLinks).values({ userId: dst.id, globalAthleteId: identityId, linkStatus: 'pending', linkType: 'auto_import' });
    await new ProfileMergeService().mergeProfiles(org.id, src.id, dst.id, admin.id);
    expect((await linkOf(dst.id)).id).toBe(srcLink.id);
  });
});
