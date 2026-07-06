/**
 * Regression tests: single-use bearer tokens are stored hashed, not in plaintext.
 *
 * For each token type, creating via the production path stores only the SHA-256
 * hash: a direct lookup by the raw token finds nothing, while the production
 * lookup (which hashes) finds the row.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { invitations, emailVerificationTokens, accountLinkingTokens } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { hashToken } from '../../packages/api/lib/token-hash';
import type { Organization, User } from '@shared/schema';

describe('Bearer tokens are hashed at rest', () => {
  let org: Organization;
  let user: User;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    const ts = Date.now();
    org = await storage.createOrganization({ name: `TokenHash Org ${ts}`, description: 'x' });
    user = await storage.createUser({
      username: `tokhash${ts}`,
      password: 'TestPass123!',
      emails: [`tokhash${ts}@test.com`],
      firstName: 'Tok',
      lastName: 'Hash',
    });
  });

  afterAll(async () => {
    try { await storage.deleteUser(user.id); } catch { /* ignore */ }
    try { await storage.deleteOrganization(org.id); } catch { /* ignore */ }
  });

  it('invitation token is stored as a hash', async () => {
    const invitation = await storage.createInvitation({
      email: `inv${Date.now()}@test.com`,
      firstName: 'In',
      lastName: 'Vitee',
      organizationId: org.id,
      role: 'athlete',
      invitedBy: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const raw = invitation.token;

    const byRaw = await db.select().from(invitations).where(eq(invitations.token, raw));
    expect(byRaw.length).toBe(0);
    const byHash = await db.select().from(invitations).where(eq(invitations.token, hashToken(raw)));
    expect(byHash.length).toBe(1);
    // Production lookup accepts the raw token.
    expect((await storage.getInvitationByToken(raw))?.id).toBe(invitation.id);
  });

  it('email verification token is stored as a hash', async () => {
    const { token: raw } = await storage.createEmailVerificationToken(user.id, user.emails![0]);

    const byRaw = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, raw));
    expect(byRaw.length).toBe(0);
    const byHash = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, hashToken(raw)));
    expect(byHash.length).toBe(1);
    expect((await storage.getEmailVerificationToken(raw))?.userId).toBe(user.id);
  });

  it('account linking token is stored as a hash', async () => {
    const raw = `linktok_${Date.now()}`;
    await storage.createAccountLinkingToken({
      userId: user.id,
      token: raw,
      provider: 'google',
      providerId: 'g-123',
      providerEmail: user.emails![0],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      failedAttempts: 0,
    });

    const byRaw = await db.select().from(accountLinkingTokens).where(eq(accountLinkingTokens.token, raw));
    expect(byRaw.length).toBe(0);
    expect((await storage.getAccountLinkingToken(raw))?.userId).toBe(user.id);
  });
});
