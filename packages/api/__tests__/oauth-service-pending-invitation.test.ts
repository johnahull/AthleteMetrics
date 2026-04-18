/**
 * OAuth Service - Pending Invitation Guard
 *
 * Regression for the "Christian Hull" incident: when a user OAuths in before
 * their pending invitation is accepted, a duplicate orphan account gets
 * created because the original pending-athlete row often has no email.
 *
 * The fix: if a pending invitation exists for the OAuth email, block
 * auto-provisioning a new OAuth user and ask the caller to accept the
 * invitation first.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { db } from "../db";
import { users, invitations, organizations, accountLinkingTokens } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { OAuthService } from "../services/oauth-service";

vi.mock("../services/email-service", () => ({
  EmailService: vi.fn().mockImplementation(() => ({
    sendAccountLinkingEmail: vi.fn().mockResolvedValue(true),
  })),
}));

describe("OAuth Service - Pending Invitation Guard", () => {
  let oauthService: OAuthService;
  const timestamp = Date.now().toString();
  const createdUserIds: string[] = [];
  const createdInvitationIds: string[] = [];
  const createdOrgIds: string[] = [];

  beforeEach(() => {
    oauthService = new OAuthService();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (createdInvitationIds.length > 0) {
      await db.delete(invitations).where(inArray(invitations.id, createdInvitationIds));
      createdInvitationIds.length = 0;
    }
    for (const userId of createdUserIds) {
      await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    createdUserIds.length = 0;
    if (createdOrgIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, createdOrgIds));
      createdOrgIds.length = 0;
    }
  });

  async function createTestOrg(name: string): Promise<string> {
    const [org] = await db
      .insert(organizations)
      .values({ name, orgType: "club" })
      .returning();
    createdOrgIds.push(org.id);
    return org.id;
  }

  async function createPendingInvitation(email: string, organizationId: string): Promise<void> {
    const [invite] = await db
      .insert(invitations)
      .values({
        email,
        firstName: "Pending",
        lastName: "Athlete",
        organizationId,
        role: "athlete",
        token: crypto.randomBytes(32).toString("hex"),
        status: "pending",
        isUsed: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();
    createdInvitationIds.push(invite.id);
  }

  it("blocks new OAuth user creation when a pending invitation exists for the email", async () => {
    const email = `pending-invite-${timestamp}@example.com`;
    const orgId = await createTestOrg(`Pending Invite Org ${timestamp}`);
    await createPendingInvitation(email, orgId);

    const googleProfile = {
      id: `google_id_${timestamp}`,
      emails: [{ value: email, verified: true }],
      name: { givenName: "Pending", familyName: "Athlete" },
    };

    const result = await oauthService.handleGoogleAuth(googleProfile);

    expect(result.success).toBe(false);
    expect(result.userId).toBeUndefined();
    expect(result.error).toMatch(/invitation/i);

    // Critical: verify NO duplicate user was created for this email.
    const usersWithEmail = await db
      .select()
      .from(users)
      .where(eq(users.oauthEmail, email));
    expect(usersWithEmail).toHaveLength(0);

    const usersWithProviderId = await db
      .select()
      .from(users)
      .where(eq(users.googleId, googleProfile.id));
    expect(usersWithProviderId).toHaveLength(0);
  });

  it("ignores cancelled invitations and proceeds with normal OAuth flow", async () => {
    const email = `cancelled-invite-${timestamp}@example.com`;
    const orgId = await createTestOrg(`Cancelled Invite Org ${timestamp}`);

    // Create a cancelled invitation — it should not block OAuth
    const [invite] = await db
      .insert(invitations)
      .values({
        email,
        organizationId: orgId,
        role: "athlete",
        token: crypto.randomBytes(32).toString("hex"),
        status: "cancelled",
        isUsed: false,
        cancelledAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .returning();
    createdInvitationIds.push(invite.id);

    const googleProfile = {
      id: `google_cancelled_${timestamp}`,
      emails: [{ value: email, verified: true }],
      name: { givenName: "Cancelled", familyName: "User" },
    };

    const result = await oauthService.handleGoogleAuth(googleProfile);

    // New OAuth user should be created — the cancelled invite doesn't block
    expect(result.success).toBe(true);
    expect(result.userId).toBeTruthy();
    if (result.userId) createdUserIds.push(result.userId);
  });

  it("ignores expired invitations and proceeds with normal OAuth flow", async () => {
    const email = `expired-invite-${timestamp}@example.com`;
    const orgId = await createTestOrg(`Expired Invite Org ${timestamp}`);

    const [invite] = await db
      .insert(invitations)
      .values({
        email,
        organizationId: orgId,
        role: "athlete",
        token: crypto.randomBytes(32).toString("hex"),
        status: "pending",
        isUsed: false,
        expiresAt: new Date(Date.now() - 60 * 1000), // expired 1 minute ago
      })
      .returning();
    createdInvitationIds.push(invite.id);

    const googleProfile = {
      id: `google_expired_${timestamp}`,
      emails: [{ value: email, verified: true }],
      name: { givenName: "Expired", familyName: "User" },
    };

    const result = await oauthService.handleGoogleAuth(googleProfile);

    expect(result.success).toBe(true);
    expect(result.userId).toBeTruthy();
    if (result.userId) createdUserIds.push(result.userId);
  });

  it("matches pending invitations case-insensitively", async () => {
    const canonicalEmail = `Case-Invite-${timestamp}@Example.com`;
    const orgId = await createTestOrg(`Case Invite Org ${timestamp}`);
    await createPendingInvitation(canonicalEmail, orgId);

    // Google returns lowercased email — common real-world case
    const googleProfile = {
      id: `google_case_${timestamp}`,
      emails: [{ value: canonicalEmail.toLowerCase(), verified: true }],
      name: { givenName: "Case", familyName: "Test" },
    };

    const result = await oauthService.handleGoogleAuth(googleProfile);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invitation/i);
  });
});
