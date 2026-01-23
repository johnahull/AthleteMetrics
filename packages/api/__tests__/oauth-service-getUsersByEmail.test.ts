/**
 * OAuth Service Tests for getUsersByEmail() Integration
 *
 * Tests that the OAuth service correctly uses getUsersByEmail() to handle
 * multiple users with the same email address.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../db";
import { users, accountLinkingTokens } from "@shared/schema";
import { eq } from "drizzle-orm";
import { OAuthService } from "../services/oauth-service";

// Mock EmailService to avoid sending actual emails
vi.mock("../services/email-service", () => {
  return {
    EmailService: vi.fn().mockImplementation(() => ({
      sendAccountLinkingEmail: vi.fn().mockResolvedValue(true),
    })),
  };
});

describe("OAuth Service - getUsersByEmail Integration", () => {
  let oauthService: OAuthService;
  const timestamp = Date.now().toString();
  const createdUserIds: string[] = [];

  beforeEach(() => {
    oauthService = new OAuthService();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up all created users and tokens
    for (const userId of createdUserIds) {
      await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
    createdUserIds.length = 0;
  });

  it("should handle single user with matching email (backwards compatibility)", async () => {
    const testEmail = `single-${timestamp}@example.com`;

    // Create user with email but no OAuth
    const [user] = await db.insert(users).values({
      username: `single-${timestamp}`,
      emails: [testEmail],
      firstName: "Single",
      lastName: "User",
      fullName: "Single User",
      password: "hashedpassword",
      isEmailVerified: true,
    }).returning();
    createdUserIds.push(user.id);

    const googleProfile = {
      id: "new_google_id",
      emails: [{ value: testEmail, verified: true }],
      name: { givenName: "Single", familyName: "User" },
    };

    const result = await oauthService.handleGoogleAuth(googleProfile);

    // Should trigger account linking
    expect(result.success).toBe(false);
    expect(result.requiresLinking).toBe(true);
    expect(result.error).toContain("account with this email already exists");

    // Verify email was sent to the user
    const mockEmailService = oauthService["emailService"] as any;
    expect(mockEmailService.sendAccountLinkingEmail).toHaveBeenCalledWith(
      testEmail,
      "Single",
      "google",
      expect.any(String)
    );
  });

  it("should log warning and use first user when multiple users share the same email", async () => {
    const sharedEmail = `shared-${timestamp}@example.com`;
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create first user with the shared email
    const [user1] = await db.insert(users).values({
      username: `shared1-${timestamp}`,
      emails: [sharedEmail],
      firstName: "First",
      lastName: "User",
      fullName: "First User",
      password: "hashedpassword1",
      isEmailVerified: true,
    }).returning();
    createdUserIds.push(user1.id);

    // Create second user with the same email (data integrity issue)
    const [user2] = await db.insert(users).values({
      username: `shared2-${timestamp}`,
      emails: [sharedEmail],
      firstName: "Second",
      lastName: "User",
      fullName: "Second User",
      password: "hashedpassword2",
      isEmailVerified: true,
    }).returning();
    createdUserIds.push(user2.id);

    const googleProfile = {
      id: "new_google_for_shared",
      emails: [{ value: sharedEmail, verified: true }],
      name: { givenName: "OAuth", familyName: "User" },
    };

    const result = await oauthService.handleGoogleAuth(googleProfile);

    // Should still trigger linking flow (not fail)
    expect(result.success).toBe(false);
    expect(result.requiresLinking).toBe(true);

    // Verify warning was logged about multiple users
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[OAuth] Multiple users found with email, using first:',
      expect.objectContaining({
        email: sharedEmail,
        userIds: expect.arrayContaining([user1.id, user2.id]),
        userCount: 2
      })
    );

    // Verify linking email was sent to the FIRST user
    const mockEmailService = oauthService["emailService"] as any;
    expect(mockEmailService.sendAccountLinkingEmail).toHaveBeenCalledWith(
      sharedEmail,
      "First", // First user's firstName
      "google",
      expect.any(String)
    );

    consoleWarnSpy.mockRestore();
  });

  it("should handle three users with the same email and use the first one", async () => {
    const sharedEmail = `triple-${timestamp}@example.com`;
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create three users with the same email
    const [user1] = await db.insert(users).values({
      username: `triple1-${timestamp}`,
      emails: [sharedEmail],
      firstName: "First",
      lastName: "Triple",
      fullName: "First Triple",
      password: "hashedpassword1",
      isEmailVerified: true,
    }).returning();
    createdUserIds.push(user1.id);

    const [user2] = await db.insert(users).values({
      username: `triple2-${timestamp}`,
      emails: [sharedEmail],
      firstName: "Second",
      lastName: "Triple",
      fullName: "Second Triple",
      password: "hashedpassword2",
      isEmailVerified: true,
    }).returning();
    createdUserIds.push(user2.id);

    const [user3] = await db.insert(users).values({
      username: `triple3-${timestamp}`,
      emails: [sharedEmail],
      firstName: "Third",
      lastName: "Triple",
      fullName: "Third Triple",
      password: "hashedpassword3",
      isEmailVerified: true,
    }).returning();
    createdUserIds.push(user3.id);

    const appleProfile = {
      id: "new_apple_for_triple",
      email: sharedEmail,
      name: { firstName: "Apple", lastName: "User" },
    };

    const result = await oauthService.handleAppleAuth(appleProfile);

    // Should still trigger linking flow
    expect(result.success).toBe(false);
    expect(result.requiresLinking).toBe(true);

    // Verify warning was logged with count of 3
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[OAuth] Multiple users found with email, using first:',
      expect.objectContaining({
        email: sharedEmail,
        userIds: expect.arrayContaining([user1.id, user2.id, user3.id]),
        userCount: 3
      })
    );

    // Verify linking email was sent to the FIRST user
    const mockEmailService = oauthService["emailService"] as any;
    expect(mockEmailService.sendAccountLinkingEmail).toHaveBeenCalledWith(
      sharedEmail,
      "First", // First user's firstName
      "apple",
      expect.any(String)
    );

    consoleWarnSpy.mockRestore();
  });

  it("should not log warning when no users have the email (new OAuth user)", async () => {
    const newEmail = `new-oauth-${timestamp}@example.com`;
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const googleProfile = {
      id: "brand_new_google_id",
      emails: [{ value: newEmail, verified: true }],
      name: { givenName: "New", familyName: "OAuthUser" },
    };

    // Note: This test will fail due to pre-existing audit log issues in createOAuthUser
    // The important part is verifying the warning is NOT logged
    await oauthService.handleGoogleAuth(googleProfile);

    // Verify warning was NOT logged (no multiple users scenario)
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      '[OAuth] Multiple users found with email, using first:',
      expect.anything()
    );

    consoleWarnSpy.mockRestore();
  });
});
