/**
 * Regression test: acceptInvitation is atomic.
 *
 * The user-creation, org-membership, invitation-status and audit-log writes must
 * all live in the same transaction. Previously createUser/updateUser/
 * addUserToOrganization used the module-level db handle instead of the tx, so a
 * failure after the user was created left an orphaned user + a still-"pending"
 * invitation (re-acceptable → duplicate accounts).
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { storage } from '../../packages/api/storage';
import type { Organization, User } from '@shared/schema';

const PASSWORD = 'TestPass123!';

describe('acceptInvitation transaction atomicity', () => {
  let org: Organization;
  let inviter: User;
  const trackedUserIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    const ts = Date.now();
    org = await storage.createOrganization({ name: `Tx Inv Org ${ts}`, description: 'x' });
    inviter = await storage.createUser({
      username: `txinviter${ts}`,
      password: PASSWORD,
      emails: [`txinviter${ts}@test.com`],
      firstName: 'In',
      lastName: 'Viter',
    });
    trackedUserIds.push(inviter.id);
  });

  afterAll(async () => {
    for (const id of trackedUserIds) {
      try { await storage.deleteUser(id); } catch { /* ignore */ }
    }
    try { await storage.deleteOrganization(org.id); } catch { /* ignore */ }
  });

  async function makeInvitation(email: string) {
    return storage.createInvitation({
      email,
      firstName: 'Tx',
      lastName: 'Invitee',
      organizationId: org.id,
      role: 'athlete',
      invitedBy: inviter.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  it('rolls back the created user when a later step fails', async () => {
    const ts = `${Date.now()}a`;
    const email = `txinvitee${ts}@test.com`;
    const username = `txinvitee${ts}`;
    const inv = await makeInvitation(email);
    const rawToken = inv.token;

    // Inject a failure AFTER createUser (addUserToOrganization runs after it).
    const spy = vi.spyOn(storage, 'addUserToOrganization').mockRejectedValueOnce(new Error('injected failure'));
    try {
      await expect(
        storage.acceptInvitation(rawToken, { email, username, password: PASSWORD, firstName: 'Tx', lastName: 'Invitee' })
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }

    // No orphaned user, and the invitation is still acceptable (not marked used).
    expect(await storage.getUserByUsername(username)).toBeFalsy();
    const invAfter = await storage.getInvitationByToken(rawToken);
    expect(invAfter?.isUsed).toBe(false);
  });

  it('accepts the invitation and creates the user + membership on success', async () => {
    const ts = `${Date.now()}b`;
    const email = `txinvitee${ts}@test.com`;
    const username = `txinvitee${ts}`;
    const inv = await makeInvitation(email);

    const { user } = await storage.acceptInvitation(inv.token, {
      email, username, password: PASSWORD, firstName: 'Tx', lastName: 'Invitee',
    });
    trackedUserIds.push(user.id);

    expect(user.username).toBe(username);
    const roles = await storage.getUserRoles(user.id, org.id);
    expect(roles).toContain('athlete');
    const invAfter = await storage.getInvitationByToken(inv.token);
    expect(invAfter?.isUsed).toBe(true);
  });
});
