/**
 * Integration tests — GET /api/membership-requests/pending (the list behind User Management's
 * "Pending Membership Requests") and the approve rules it relies on.
 *
 * Scope: site admin -> every organization; org admin -> only organizations where they are org_admin;
 * coaches and athletes -> 403. Only requests an admin can actually act on are listed.
 *
 * Run:
 *   npx dotenv -e <env file> -- npx vitest run --config vitest.integration.config.ts tests/integration/membership-requests-pending.test.ts
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { users, organizations } from '@shared/schema/tables/core';
import { userOrganizations, membershipRequests } from '@shared/schema/tables/membership';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
  sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
  sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
  sendParentNotification: vi.fn().mockResolvedValue(true),
  sendEmailVerification: vi.fn().mockResolvedValue(true),
  sendInvitation: vi.fn().mockResolvedValue(true),
  sendParentInvitation: vi.fn().mockResolvedValue(true),
  sendWelcome: vi.fn().mockResolvedValue(true),
  sendPasswordReset: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../packages/api/services/email-service', () => ({
  emailService: emailMocks,
  EmailService: vi.fn().mockImplementation(() => emailMocks),
}));

import { registerRoutes } from '../../packages/api/routes';

const TEST_PREFIX = 'mrpending_';
const VALID_PASSWORD = 'TestPassword1!';
const id = crypto.randomBytes(4).toString('hex');
const MFA_SENTINEL = `MFA-SENTINEL-${id}`;

let app: Express;
let orgA: { id: string; name: string };
let adminAId: string;
let orgB: { id: string; name: string };
let orgInactive: { id: string };
const cookies: Record<'siteAdmin' | 'adminA' | 'coachA' | 'athleteA', string> = {
  siteAdmin: '', adminA: '', coachA: '', athleteA: '',
};
const reqIds: Record<string, string> = {};
const createdOrgIds: string[] = [];

async function createUser(
  suffix: string,
  memberships: Array<{ orgId: string; role: 'org_admin' | 'coach' | 'athlete' }> = [],
  extra: Partial<typeof users.$inferInsert> = {},
) {
  const username = `${TEST_PREFIX}${suffix}_${id}`;
  const [user] = await db.insert(users).values({
    username,
    firstName: suffix,
    lastName: 'Tester',
    fullName: `${suffix} Tester`,
    emails: [`${username}@example.com`],
    password: await bcrypt.hash(VALID_PASSWORD, BCRYPT_SALT_ROUNDS),
    isEmailVerified: true,
    coppaStatus: 'not_applicable',
    mfaSecret: MFA_SENTINEL,
    school: 'Central High',
    graduationYear: 2028,
    ...extra,
  }).returning();
  for (const m of memberships) {
    await db.insert(userOrganizations).values({ userId: user.id, organizationId: m.orgId, role: m.role });
  }
  return user;
}

async function loginAs(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password: VALID_PASSWORD });
  const set = res.headers['set-cookie'];
  return Array.isArray(set) ? set[0] : (set as unknown as string);
}

async function addRequest(label: string, userId: string, organizationId: string, extra: Partial<typeof membershipRequests.$inferInsert> = {}) {
  const [row] = await db.insert(membershipRequests).values({ userId, organizationId, status: 'pending', ...extra }).returning();
  reqIds[label] = row.id;
  return row;
}

const get = (path: string, who: keyof typeof cookies) => request(app).get(path).set('Cookie', cookies[who]);
const listedIds = (body: { requests: Array<{ id: string }> }) => body.requests.map((r) => r.id);

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set to run integration tests.');

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const mk = async (name: string, extra: Partial<typeof organizations.$inferInsert> = {}) => {
    const [o] = await db.insert(organizations).values({ name: `${name}-${id}`, orgType: 'club', ...extra }).returning();
    createdOrgIds.push(o.id);
    return o;
  };
  orgA = await mk('MRPendingOrgA');
  orgB = await mk('MRPendingOrgB');
  orgInactive = await mk('MRPendingOrgInactive', { isActive: false });

  const siteAdmin = await createUser('siteadmin', [], { isSiteAdmin: true });
  // org admin in A but only a coach in B
  const adminA = await createUser('adminA', [
    { orgId: orgA.id, role: 'org_admin' },
    { orgId: orgB.id, role: 'coach' },
  ]);
  adminAId = adminA.id;
  const coachA = await createUser('coachA', [{ orgId: orgA.id, role: 'coach' }]);
  const athleteA = await createUser('athleteA', [{ orgId: orgA.id, role: 'athlete' }], { birthDate: '1990-01-01' });

  // requesters (not members)
  const rA = await createUser('rA');
  const rB = await createUser('rB');
  await addRequest('pendingA', rA.id, orgA.id);
  await addRequest('pendingB', rB.id, orgB.id);

  const rApproved = await createUser('rApproved');
  await addRequest('approved', rApproved.id, orgA.id, { status: 'approved' });
  const rRejected = await createUser('rRejected');
  await addRequest('rejected', rRejected.id, orgA.id, { status: 'rejected' });
  const rExpired = await createUser('rExpired');
  await addRequest('expired', rExpired.id, orgA.id, { expiresAt: new Date(Date.now() - 60_000) });
  const rInactiveOrg = await createUser('rInactiveOrg');
  await addRequest('inactiveOrg', rInactiveOrg.id, orgInactive.id);
  const rInactiveUser = await createUser('rInactiveUser', [], { isActive: false });
  await addRequest('inactiveUser', rInactiveUser.id, orgA.id);
  for (const status of ['consent_revoked', 'needs_parent_email', 'pending_consent'] as const) {
    const u = await createUser(`r_${status}`, [], { coppaStatus: status });
    await addRequest(status, u.id, orgA.id);
  }
  // for the approve rules
  const rCoach = await createUser('rCoachApprove');
  await addRequest('coachApprove', rCoach.id, orgA.id);
  const rRace = await createUser('rRace');
  await addRequest('race', rRace.id, orgA.id);
  const rApproveVsReject = await createUser('rApproveVsReject');
  await addRequest('approveVsReject', rApproveVsReject.id, orgA.id);
  const rErrApprove = await createUser('rErrApprove');
  await addRequest('errApprove', rErrApprove.id, orgA.id);
  const rErrReject = await createUser('rErrReject');
  await addRequest('errReject', rErrReject.id, orgA.id);

  cookies.siteAdmin = await loginAs(siteAdmin.username);
  cookies.adminA = await loginAs(adminA.username);
  cookies.coachA = await loginAs(coachA.username);
  cookies.athleteA = await loginAs(athleteA.username);
});

afterAll(async () => {
  try {
    await db.delete(membershipRequests).where(inArray(membershipRequests.organizationId, createdOrgIds));
    await db.delete(userOrganizations).where(inArray(userOrganizations.organizationId, createdOrgIds));
    await db.delete(users).where(like(users.username, `${TEST_PREFIX}%`));
    await db.delete(organizations).where(inArray(organizations.id, createdOrgIds));
  } catch {
    // best-effort cleanup
  }
});

describe('GET /api/membership-requests/pending', () => {
  it('a site admin sees pending requests from every organization, with the organization name', async () => {
    const res = await get('/api/membership-requests/pending', 'siteAdmin');
    expect(res.status).toBe(200);
    const ids = listedIds(res.body);
    expect(ids).toContain(reqIds.pendingA);
    expect(ids).toContain(reqIds.pendingB);
    const a = res.body.requests.find((r: { id: string }) => r.id === reqIds.pendingA);
    expect(a.organization).toEqual({ id: orgA.id, name: orgA.name });
  });

  it('an org admin sees only organizations where they are org_admin (not one where they are only a coach)', async () => {
    const res = await get('/api/membership-requests/pending', 'adminA');
    expect(res.status).toBe(200);
    const ids = listedIds(res.body);
    expect(ids).toContain(reqIds.pendingA);
    expect(ids).not.toContain(reqIds.pendingB);
  });

  it('coaches and athletes get 403', async () => {
    expect((await get('/api/membership-requests/pending', 'coachA')).status).toBe(403);
    expect((await get('/api/membership-requests/pending', 'athleteA')).status).toBe(403);
  });

  it('lists only requests an admin can act on', async () => {
    const res = await get('/api/membership-requests/pending', 'siteAdmin');
    const ids = listedIds(res.body);
    for (const excluded of ['approved', 'rejected', 'expired', 'inactiveOrg', 'inactiveUser', 'consent_revoked', 'needs_parent_email', 'pending_consent']) {
      expect(ids, excluded).not.toContain(reqIds[excluded]);
    }
  });

  it('returns exactly the allowlisted fields and no credentials', async () => {
    const res = await get('/api/membership-requests/pending', 'adminA');
    const row = res.body.requests.find((r: { id: string }) => r.id === reqIds.pendingA);
    expect(Object.keys(row.user).sort()).toEqual(
      ['email', 'firstName', 'fullName', 'id', 'isEmailVerified', 'lastName'],
    );
    expect(Object.keys(row.organization).sort()).toEqual(['id', 'name']);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(MFA_SENTINEL);
    expect(text).not.toContain('$2b$');
    expect(text).not.toContain('"username"');
    expect(text).not.toContain('"joinCode"');
  });

  it('lists the oldest requests first, so a capped list never hides the most overdue ones', async () => {
    const res = await get('/api/membership-requests/pending', 'siteAdmin');
    const times = res.body.requests.map((r: { createdAt: string }) => new Date(r.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(res.body.truncated).toBe(false);
  });

  it('is never cached', async () => {
    const res = await get('/api/membership-requests/pending', 'adminA');
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });
});

describe('approving a request', () => {
  it.each(['consent_revoked', 'needs_parent_email', 'pending_consent'])(
    'refuses to approve a requester whose parental consent status is %s',
    async (status) => {
      const res = await request(app)
        .post(`/api/membership-requests/${reqIds[status]}/approve`)
        .set('Cookie', cookies.adminA)
        .send({});
      expect(res.status).toBe(400);
      const [row] = await db.select().from(membershipRequests).where(eq(membershipRequests.id, reqIds[status]));
      expect(row.status).toBe('pending');
    },
  );

  it('refuses to approve a deactivated requester', async () => {
    const res = await request(app)
      .post(`/api/membership-requests/${reqIds.inactiveUser}/approve`)
      .set('Cookie', cookies.adminA)
      .send({});
    expect(res.status).toBe(400);
  });

  it('a coach may not approve with an athlete link (that is a profile merge)', async () => {
    const res = await request(app)
      .post(`/api/membership-requests/${reqIds.coachApprove}/approve`)
      .set('Cookie', cookies.coachA)
      .send({ linkToAthleteId: crypto.randomUUID() });
    expect(res.status).toBe(403);
    const [row] = await db.select().from(membershipRequests).where(eq(membershipRequests.id, reqIds.coachApprove));
    expect(row.status).toBe('pending');
  });

  it('a coach can still approve without a link, and the requester becomes a member', async () => {
    const res = await request(app)
      .post(`/api/membership-requests/${reqIds.coachApprove}/approve`)
      .set('Cookie', cookies.coachA)
      .send({});
    expect(res.status).toBe(200);

    const [row] = await db.select().from(membershipRequests).where(eq(membershipRequests.id, reqIds.coachApprove));
    expect(row.status).toBe('approved');
    const [membership] = await db.select().from(userOrganizations)
      .where(and(eq(userOrganizations.userId, row.userId), eq(userOrganizations.organizationId, orgA.id)));
    expect(membership?.role).toBe('athlete');
  });

  it('an approval racing a rejection leaves a record that matches the membership', async () => {
    const approve = request(app).post(`/api/membership-requests/${reqIds.approveVsReject}/approve`).set('Cookie', cookies.adminA).send({});
    const reject = request(app).post(`/api/membership-requests/${reqIds.approveVsReject}/reject`).set('Cookie', cookies.adminA).send({ reason: 'no' });
    const [a, r] = await Promise.all([approve, reject]);
    expect([a.status, r.status].filter((st) => st === 200)).toHaveLength(1); // exactly one decision wins

    const [row] = await db.select().from(membershipRequests).where(eq(membershipRequests.id, reqIds.approveVsReject));
    const memberships = await db.select().from(userOrganizations)
      .where(and(eq(userOrganizations.userId, row.userId), eq(userOrganizations.organizationId, orgA.id)));
    expect(memberships.length).toBe(row.status === 'approved' ? 1 : 0);
  });

  it('two simultaneous approvals of the same request: exactly one wins and the user is added once', async () => {
    const send = () =>
      request(app).post(`/api/membership-requests/${reqIds.race}/approve`).set('Cookie', cookies.adminA).send({});
    const [first, second] = await Promise.all([send(), send()]);
    expect([first.status, second.status].sort()).toEqual([200, 400]);

    const [row] = await db.select().from(membershipRequests).where(eq(membershipRequests.id, reqIds.race));
    const memberships = await db.select().from(userOrganizations)
      .where(and(eq(userOrganizations.userId, row.userId), eq(userOrganizations.organizationId, orgA.id)));
    expect(memberships).toHaveLength(1);
  });
});

describe('the whole flow, over HTTP', () => {
  it('a user asks to join, an org admin sees and approves the request, and the user is added to the organization', async () => {
    // an athlete with no organization (birth date so the profile-completion gate lets them through)
    const applicant = await createUser('flowApplicant', [], { birthDate: '1990-01-01' });
    const applicantCookie = await loginAs(applicant.username);
    const membershipOf = async () => (await db.select().from(userOrganizations)
      .where(and(eq(userOrganizations.userId, applicant.id), eq(userOrganizations.organizationId, orgA.id))))[0];

    // 1. the applicant submits the request
    const created = await request(app)
      .post('/api/membership-requests')
      .set('Cookie', applicantCookie)
      .send({ organizationId: orgA.id, discoveryMethod: 'directory' });
    expect(created.status).toBe(201);
    expect(created.body.request.status).toBe('pending');
    const requestId: string = created.body.request.id;
    expect(await membershipOf()).toBeUndefined(); // not a member yet

    // 2. the org admin sees it in the pending list
    const listed = await get('/api/membership-requests/pending', 'adminA');
    expect(listedIds(listed.body)).toContain(requestId);

    // 3. the org admin approves it
    const approved = await request(app)
      .post(`/api/membership-requests/${requestId}/approve`)
      .set('Cookie', cookies.adminA)
      .send({});
    expect(approved.status).toBe(200);

    // 4. the applicant is now in the organization, as an athlete, and the request records who approved it
    expect((await membershipOf())?.role).toBe('athlete');
    const [row] = await db.select().from(membershipRequests).where(eq(membershipRequests.id, requestId));
    expect(row.status).toBe('approved');
    expect(row.processedBy).toBe(adminAId);

    // 5. it is gone from the pending list, and the applicant's own view includes the organization
    const after = await get('/api/membership-requests/pending', 'adminA');
    expect(listedIds(after.body)).not.toContain(requestId);
    const mine = await request(app).get('/api/auth/me/organizations').set('Cookie', applicantCookie);
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.body)).toContain(orgA.id);
  });
});

describe('approve and reject error responses', () => {
  const RAW = 'relation "membership_requests" does not exist';

  it.each([
    ['approve', 'errApprove', 'Failed to approve membership request'],
    ['reject', 'errReject', 'Failed to reject membership request'],
  ])('an unexpected failure while trying to %s is a generic 500, never the raw error text', async (action, label, message) => {
    const method = action === 'approve' ? 'approveMembershipRequest' : 'rejectMembershipRequest';
    const spy = vi.spyOn(storage, method as 'approveMembershipRequest').mockRejectedValueOnce(new Error(RAW));
    try {
      const res = await request(app)
        .post(`/api/membership-requests/${reqIds[label]}/${action}`)
        .set('Cookie', cookies.adminA)
        .send({});
      expect(res.status).toBe(500);
      expect(res.body.message).toBe(message);
      expect(JSON.stringify(res.body)).not.toContain('relation');
    } finally {
      spy.mockRestore();
    }
  });

  it('still tells the admin when the request was already handled', async () => {
    const approve = await request(app).post(`/api/membership-requests/${reqIds.approved}/approve`).set('Cookie', cookies.adminA).send({});
    expect(approve.status).toBe(400);
    expect(approve.body.message).toBe('Only pending requests can be approved');

    const reject = await request(app).post(`/api/membership-requests/${reqIds.rejected}/reject`).set('Cookie', cookies.adminA).send({});
    expect(reject.status).toBe(400);
    expect(reject.body.message).toBe('Only pending requests can be rejected');
  });
});

/** True once some backend is waiting on a row lock (the approval blocked by the uncommitted deactivation). */
async function waitForBlockedBackend(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await db.execute(
      sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if (rows.length > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

describe('eligibility is checked inside the approval transaction', () => {
  /**
   * Runs an approval while another transaction has deactivated something but not committed yet, then lets that
   * transaction commit. An approval that read the rows before its own transaction would already have passed its
   * check and succeed; one that reads them (locked) inside its transaction waits for the commit and sees it.
   */
  async function approvalRacingADeactivation(deactivate: (tx: any) => Promise<unknown>, requestId: string) {
    let release!: () => void;
    let markUpdated!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const updated = new Promise<void>((resolve) => { markUpdated = resolve; });

    const deactivating = db.transaction(async (tx) => {
      await deactivate(tx);
      markUpdated();
      await held;
    });
    await updated; // the uncommitted change now holds its row lock

    const approving = storage
      .approveMembershipRequest(requestId, adminAId)
      .then(() => 'approved', (e: Error) => e.message);
    // With the fix the approval is now waiting on the deactivation's row lock; without it the approval has already
    // finished and nothing ever blocks (the wait gives up and the assertions below fail).
    await waitForBlockedBackend();
    release();
    await deactivating;
    return approving;
  }

  it('refuses when the requester is deactivated while the approval is in flight', async () => {
    const requester = await createUser('rLockUser');
    const row = await addRequest('lockUser', requester.id, orgA.id);

    const outcome = await approvalRacingADeactivation(
      (tx) => tx.update(users).set({ isActive: false }).where(eq(users.id, requester.id)),
      row.id,
    );

    expect(outcome).toBe('This request can no longer be approved');
    const [after] = await db.select().from(membershipRequests).where(eq(membershipRequests.id, row.id));
    expect(after.status).toBe('pending');
    const memberships = await db.select().from(userOrganizations).where(eq(userOrganizations.userId, requester.id));
    expect(memberships).toHaveLength(0);
  });

  it('refuses when the organization is deactivated while the approval is in flight', async () => {
    const [org] = await db.insert(organizations).values({ name: `MRPendingOrgLock-${id}`, orgType: 'club' }).returning();
    createdOrgIds.push(org.id);
    const requester = await createUser('rLockOrg');
    const row = await addRequest('lockOrg', requester.id, org.id);

    const outcome = await approvalRacingADeactivation(
      (tx) => tx.update(organizations).set({ isActive: false }).where(eq(organizations.id, org.id)),
      row.id,
    );

    expect(outcome).toBe('This request can no longer be approved');
    const [after] = await db.select().from(membershipRequests).where(eq(membershipRequests.id, row.id));
    expect(after.status).toBe('pending');
  });
});
