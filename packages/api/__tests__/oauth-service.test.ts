/**
 * Integration tests for OAuth authentication service
 * Tests Google/Apple OAuth flows, account linking, and edge cases
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from "vitest";
import { db } from "../db";
import { users, accountLinkingTokens } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { hashToken } from '../lib/token-hash';
import { OAuthService, type OAuthProfile } from "../services/oauth-service";
import { EmailService } from "../services/email-service";

// Mock EmailService
vi.mock("../services/email-service", () => {
  return {
    EmailService: vi.fn().mockImplementation(() => ({
      sendAccountLinkingEmail: vi.fn().mockResolvedValue(true),
    })),
  };
});

// TODO: These tests need to be fixed - they have issues with mock setup and database isolation
describe.skip("OAuth Service", () => {
  let oauthService: OAuthService;
  const timestamp = Date.now().toString();
  const testSuffix = `_oauth_test_${timestamp}`;

  beforeEach(() => {
    oauthService = new OAuthService();
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe("New OAuth User Flow", () => {
    afterEach(async () => {
      // Clean up users created by OAuth
      await db.delete(users).where(eq(users.username, `testuser${testSuffix}`));
      await db.delete(users).where(eq(users.username, `testuser${testSuffix}1`));
      await db.delete(users).where(eq(users.username, `appleuser${testSuffix}`));
      await db.delete(users).where(eq(users.username, `appleuser${testSuffix}1`));
    });

    it("should create new user with Google OAuth", async () => {
      const googleProfile = {
        id: "google123",
        emails: [{ value: `testuser${testSuffix}@example.com`, verified: true }],
        name: { givenName: "Test", familyName: "User" },
      };

      const result = await oauthService.handleGoogleAuth(googleProfile);

      expect(result.success).toBe(true);
      expect(result.userId).toBeDefined();
      expect(result.requiresLinking).toBeUndefined();

      // Verify user was created in database
      const user = await oauthService.getUserById(result.userId!);
      expect(user).toBeDefined();
      expect(user?.googleId).toBe("google123");
      expect(user?.oauthProvider).toBe("google");
      expect(user?.firstName).toBe("Test");
      expect(user?.lastName).toBe("User");
      expect(user?.emails).toContain(`testuser${testSuffix}@example.com`);
      expect(user?.isEmailVerified).toBe(true); // OAuth emails are pre-verified
      expect(user?.password).toBeNull(); // OAuth-only users have no password
      expect(user?.username).toBe(`testuser${testSuffix}`);
    });

    it("should create new user with Apple OAuth", async () => {
      const appleProfile = {
        id: "apple456",
        email: `appleuser${testSuffix}@example.com`,
        name: { firstName: "Apple", lastName: "User" },
      };

      const result = await oauthService.handleAppleAuth(appleProfile);

      expect(result.success).toBe(true);
      expect(result.userId).toBeDefined();

      const user = await oauthService.getUserById(result.userId!);
      expect(user).toBeDefined();
      expect(user?.appleId).toBe("apple456");
      expect(user?.oauthProvider).toBe("apple");
      expect(user?.firstName).toBe("Apple");
      expect(user?.lastName).toBe("User");
      expect(user?.emails).toContain(`appleuser${testSuffix}@example.com`);
      expect(user?.isEmailVerified).toBe(true); // Apple emails are always verified
      expect(user?.password).toBeNull();
    });

    it("should generate unique username when email prefix is taken", async () => {
      // Create a user with the base username
      const [existingUser] = await db.insert(users).values({
        username: `testuser${testSuffix}`,
        emails: [`other${testSuffix}@example.com`],
        firstName: "Existing",
        lastName: "User",
        fullName: "Existing User",
        password: "hashedpassword",
      }).returning();

      const googleProfile = {
        id: "google789",
        emails: [{ value: `testuser${testSuffix}@example.com`, verified: true }],
        name: { givenName: "Test", familyName: "User" },
      };

      const result = await oauthService.handleGoogleAuth(googleProfile);

      expect(result.success).toBe(true);

      const user = await oauthService.getUserById(result.userId!);
      expect(user?.username).toBe(`testuser${testSuffix}1`); // Should append counter

      // Clean up
      await db.delete(users).where(eq(users.id, existingUser.id));
    });

    it("should handle Apple users with missing name fields", async () => {
      const appleProfile = {
        id: "apple999",
        email: `appleuser${testSuffix}@example.com`,
        name: undefined, // Apple doesn't always provide name
      };

      const result = await oauthService.handleAppleAuth(appleProfile);

      expect(result.success).toBe(true);

      const user = await oauthService.getUserById(result.userId!);
      expect(user?.firstName).toBe(""); // Should handle missing first name
      expect(user?.lastName).toBe(""); // Should handle missing last name
    });
  });

  describe("Existing OAuth User Flow", () => {
    let existingGoogleUserId: string;
    let existingAppleUserId: string;

    beforeAll(async () => {
      // Create existing OAuth users
      const [googleUser] = await db.insert(users).values({
        username: `existinggoogle${testSuffix}`,
        emails: [`existinggoogle${testSuffix}@example.com`],
        firstName: "Existing",
        lastName: "Google",
        fullName: "Existing Google",
        googleId: "existing_google_id",
        oauthProvider: "google",
        isEmailVerified: true,
      }).returning();
      existingGoogleUserId = googleUser.id;

      const [appleUser] = await db.insert(users).values({
        username: `existingapple${testSuffix}`,
        emails: [`existingapple${testSuffix}@example.com`],
        firstName: "Existing",
        lastName: "Apple",
        fullName: "Existing Apple",
        appleId: "existing_apple_id",
        oauthProvider: "apple",
        isEmailVerified: true,
      }).returning();
      existingAppleUserId = appleUser.id;
    });

    afterAll(async () => {
      await db.delete(users).where(eq(users.id, existingGoogleUserId));
      await db.delete(users).where(eq(users.id, existingAppleUserId));
    });

    it("should login existing Google OAuth user", async () => {
      const googleProfile = {
        id: "existing_google_id",
        emails: [{ value: `existinggoogle${testSuffix}@example.com`, verified: true }],
        name: { givenName: "Existing", familyName: "Google" },
      };

      const result = await oauthService.handleGoogleAuth(googleProfile);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(existingGoogleUserId);
      expect(result.requiresLinking).toBeUndefined();
    });

    it("should login existing Apple OAuth user", async () => {
      const appleProfile = {
        id: "existing_apple_id",
        email: `existingapple${testSuffix}@example.com`,
        name: { firstName: "Existing", lastName: "Apple" },
      };

      const result = await oauthService.handleAppleAuth(appleProfile);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(existingAppleUserId);
    });

    it("should update last login timestamp on successful login", async () => {
      const googleProfile = {
        id: "existing_google_id",
        emails: [{ value: `existinggoogle${testSuffix}@example.com`, verified: true }],
        name: { givenName: "Existing", familyName: "Google" },
      };

      const before = new Date();
      await oauthService.handleGoogleAuth(googleProfile);
      const after = new Date();

      const user = await oauthService.getUserById(existingGoogleUserId);
      expect(user?.lastLoginAt).toBeDefined();
      expect(new Date(user!.lastLoginAt!).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(new Date(user!.lastLoginAt!).getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
      expect(user?.lastAuthMethod).toBe("google");
    });
  });

  describe("Account Linking Flow", () => {
    let existingEmailUserId: string;
    const existingEmail = `existingemail${testSuffix}@example.com`;

    beforeAll(async () => {
      // Create user with email but no OAuth
      const [user] = await db.insert(users).values({
        username: `existingemail${testSuffix}`,
        emails: [existingEmail],
        firstName: "Existing",
        lastName: "Email",
        fullName: "Existing Email",
        password: "hashedpassword",
        isEmailVerified: true,
      }).returning();
      existingEmailUserId = user.id;
    });

    afterAll(async () => {
      await db.delete(users).where(eq(users.id, existingEmailUserId));
      // Clean up any linking tokens
      await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.userId, existingEmailUserId));
    });

    afterEach(async () => {
      // Clean up linking tokens after each test
      await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.userId, existingEmailUserId));
    });

    it("should trigger account linking for single existing email with Google", async () => {
      const googleProfile = {
        id: "new_google_id",
        emails: [{ value: existingEmail, verified: true }],
        name: { givenName: "Existing", familyName: "Email" },
      };

      const result = await oauthService.handleGoogleAuth(googleProfile);

      expect(result.success).toBe(false);
      expect(result.requiresLinking).toBe(true);
      expect(result.error).toContain("account with this email already exists");

      // Verify email was sent
      const mockEmailService = oauthService["emailService"] as any;
      expect(mockEmailService.sendAccountLinkingEmail).toHaveBeenCalledWith(
        existingEmail,
        "Existing",
        "google",
        expect.any(String)
      );
    });

    it("should trigger account linking for existing email with Apple", async () => {
      const appleProfile = {
        id: "new_apple_id",
        email: existingEmail,
        name: { firstName: "Existing", lastName: "Email" },
      };

      const result = await oauthService.handleAppleAuth(appleProfile);

      expect(result.success).toBe(false);
      expect(result.requiresLinking).toBe(true);

      const mockEmailService = oauthService["emailService"] as any;
      expect(mockEmailService.sendAccountLinkingEmail).toHaveBeenCalledWith(
        existingEmail,
        "Existing",
        "apple",
        expect.any(String)
      );
    });

    it("should log warning and use first user when multiple users share the same email", async () => {
      const sharedEmail = `shared${testSuffix}@example.com`;
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Create first user with the shared email
      const [user1] = await db.insert(users).values({
        username: `shared1${testSuffix}`,
        emails: [sharedEmail],
        firstName: "First",
        lastName: "User",
        fullName: "First User",
        password: "hashedpassword1",
        isEmailVerified: true,
      }).returning();

      // Create second user with the same email (data integrity issue)
      const [user2] = await db.insert(users).values({
        username: `shared2${testSuffix}`,
        emails: [sharedEmail],
        firstName: "Second",
        lastName: "User",
        fullName: "Second User",
        password: "hashedpassword2",
        isEmailVerified: true,
      }).returning();

      try {
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
      } finally {
        // Clean up
        await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.userId, user1.id));
        await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.userId, user2.id));
        await db.delete(users).where(eq(users.id, user1.id));
        await db.delete(users).where(eq(users.id, user2.id));
        consoleWarnSpy.mockRestore();
      }
    });

    it("should create linking token with 1-hour expiry", async () => {
      const googleProfile = {
        id: "new_google_id",
        emails: [{ value: existingEmail, verified: true }],
        name: { givenName: "Existing", familyName: "Email" },
      };

      const before = new Date();
      await oauthService.handleGoogleAuth(googleProfile);
      const after = new Date();

      // Find the created token
      const tokens = await db.select()
        .from(accountLinkingTokens)
        .where(eq(accountLinkingTokens.userId, existingEmailUserId));

      expect(tokens.length).toBe(1);
      expect(tokens[0].provider).toBe("google");
      expect(tokens[0].providerId).toBe("new_google_id");
      expect(tokens[0].providerEmail).toBe(existingEmail);
      expect(tokens[0].usedAt).toBeNull();

      // Verify expiry is ~1 hour from now
      const expiryTime = new Date(tokens[0].expiresAt).getTime();
      const expectedExpiry = before.getTime() + 60 * 60 * 1000; // 1 hour
      expect(expiryTime).toBeGreaterThanOrEqual(expectedExpiry - 5000); // 5s tolerance
      expect(expiryTime).toBeLessThanOrEqual(after.getTime() + 60 * 60 * 1000 + 5000);
    });
  });

  describe("Account Linking Confirmation", () => {
    let testUserId: string;
    let validToken: string;

    beforeEach(async () => {
      // Create test user
      const [user] = await db.insert(users).values({
        username: `linktest${testSuffix}`,
        emails: [`linktest${testSuffix}@example.com`],
        firstName: "Link",
        lastName: "Test",
        fullName: "Link Test",
        password: "hashedpassword",
      }).returning();
      testUserId = user.id;

      // Create valid linking token
      validToken = "valid_token_" + Math.random().toString(36).substring(2);
      await db.insert(accountLinkingTokens).values({
        userId: testUserId,
        token: hashToken(validToken),
        provider: "google",
        providerId: "test_google_id",
        providerEmail: `linktest${testSuffix}@example.com`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      });
    });

    afterEach(async () => {
      await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    });

    it("should link Google account with valid token", async () => {
      const result = await oauthService.confirmAccountLinking(validToken);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify user was updated with OAuth info
      const user = await oauthService.getUserById(testUserId);
      expect(user?.googleId).toBe("test_google_id");
      expect(user?.oauthProvider).toBe("google");
      expect(user?.oauthEmail).toBe(`linktest${testSuffix}@example.com`);
      expect(user?.oauthEmailVerified).toBe(true);
      expect(user?.accountLinkedAt).toBeDefined();

      // Verify token was marked as used
      const tokens = await db.select()
        .from(accountLinkingTokens)
        .where(eq(accountLinkingTokens.token, hashToken(validToken)));

      expect(tokens[0].usedAt).toBeDefined();
    });

    it("should link Apple account with valid token", async () => {
      // Update token to be for Apple
      await db.update(accountLinkingTokens)
        .set({
          provider: "apple",
          providerId: "test_apple_id",
        })
        .where(eq(accountLinkingTokens.token, hashToken(validToken)));

      const result = await oauthService.confirmAccountLinking(validToken);

      expect(result.success).toBe(true);

      const user = await oauthService.getUserById(testUserId);
      expect(user?.appleId).toBe("test_apple_id");
      expect(user?.oauthProvider).toBe("apple");
      expect(user?.googleId).toBeNull(); // Should not set Google ID
    });

    it("should reject expired token", async () => {
      // Create expired token
      const expiredToken = "expired_token_" + Math.random().toString(36).substring(2);
      await db.insert(accountLinkingTokens).values({
        userId: testUserId,
        token: hashToken(expiredToken),
        provider: "google",
        providerId: "test_google_id_2",
        providerEmail: `linktest${testSuffix}@example.com`,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      const result = await oauthService.confirmAccountLinking(expiredToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe("This linking token has expired");

      // Verify user was NOT updated
      const user = await oauthService.getUserById(testUserId);
      expect(user?.googleId).toBeNull();
    });

    it("should reject already-used token", async () => {
      // Mark token as used
      await db.update(accountLinkingTokens)
        .set({ usedAt: new Date() })
        .where(eq(accountLinkingTokens.token, hashToken(validToken)));

      const result = await oauthService.confirmAccountLinking(validToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe("This linking token has already been used");
    });

    it("should reject invalid token", async () => {
      const result = await oauthService.confirmAccountLinking("nonexistent_token");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid or expired linking token");
    });

    it("should only use token once", async () => {
      // First use should succeed
      const result1 = await oauthService.confirmAccountLinking(validToken);
      expect(result1.success).toBe(true);

      // Second use should fail
      const result2 = await oauthService.confirmAccountLinking(validToken);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe("This linking token has already been used");
    });
  });

  describe("Edge Cases", () => {
    afterEach(async () => {
      // Clean up test users
      await db.delete(users).where(eq(users.username, `edgecase${testSuffix}`));
      await db.delete(users).where(eq(users.username, `unverified${testSuffix}`));
    });

    it("should handle OAuth profile without email verification", async () => {
      const googleProfile = {
        id: "google_unverified",
        emails: [{ value: `unverified${testSuffix}@example.com`, verified: false }],
        name: { givenName: "Unverified", familyName: "User" },
      };

      const result = await oauthService.handleGoogleAuth(googleProfile);

      expect(result.success).toBe(true);

      const user = await oauthService.getUserById(result.userId!);
      expect(user?.isEmailVerified).toBe(false); // Should respect OAuth provider's verification status
    });

    it("should handle database errors gracefully", async () => {
      // Try to create user with duplicate Google ID
      await db.insert(users).values({
        username: `edgecase${testSuffix}`,
        emails: [`edgecase${testSuffix}@example.com`],
        firstName: "Edge",
        lastName: "Case",
        fullName: "Edge Case",
        googleId: "duplicate_google_id",
        oauthProvider: "google",
      });

      const googleProfile = {
        id: "duplicate_google_id",
        emails: [{ value: `other${testSuffix}@example.com`, verified: true }],
        name: { givenName: "Other", familyName: "User" },
      };

      // Should handle error gracefully (existing user will be found and logged in)
      const result = await oauthService.handleGoogleAuth(googleProfile);
      expect(result.success).toBe(true); // Should find existing user
    });

    it("should handle email service failure during linking", async () => {
      // Mock email service to fail
      const mockEmailService = oauthService["emailService"] as any;
      mockEmailService.sendAccountLinkingEmail.mockRejectedValueOnce(new Error("Email service down"));

      // Create user with email
      const [user] = await db.insert(users).values({
        username: `edgecase${testSuffix}`,
        emails: [`edgecase${testSuffix}@example.com`],
        firstName: "Edge",
        lastName: "Case",
        fullName: "Edge Case",
        password: "hashedpassword",
      }).returning();

      const googleProfile = {
        id: "new_google_for_edge",
        emails: [{ value: `edgecase${testSuffix}@example.com`, verified: true }],
        name: { givenName: "Edge", familyName: "Case" },
      };

      // Should still create token and return linking required
      const result = await oauthService.handleGoogleAuth(googleProfile);
      expect(result.success).toBe(false);
      expect(result.requiresLinking).toBe(true);

      // Clean up
      await db.delete(users).where(eq(users.id, user.id));
      await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.userId, user.id));
    });
  });

  describe("Provider ID Lookup", () => {
    let googleUserId: string;
    let appleUserId: string;

    beforeAll(async () => {
      const [googleUser] = await db.insert(users).values({
        username: `lookup_google${testSuffix}`,
        emails: [`lookup_google${testSuffix}@example.com`],
        firstName: "Lookup",
        lastName: "Google",
        fullName: "Lookup Google",
        googleId: "lookup_google_id",
        oauthProvider: "google",
      }).returning();
      googleUserId = googleUser.id;

      const [appleUser] = await db.insert(users).values({
        username: `lookup_apple${testSuffix}`,
        emails: [`lookup_apple${testSuffix}@example.com`],
        firstName: "Lookup",
        lastName: "Apple",
        fullName: "Lookup Apple",
        appleId: "lookup_apple_id",
        oauthProvider: "apple",
      }).returning();
      appleUserId = appleUser.id;
    });

    afterAll(async () => {
      await db.delete(users).where(eq(users.id, googleUserId));
      await db.delete(users).where(eq(users.id, appleUserId));
    });

    it("should find user by Google ID", async () => {
      const googleProfile = {
        id: "lookup_google_id",
        emails: [{ value: `lookup_google${testSuffix}@example.com`, verified: true }],
        name: { givenName: "Lookup", familyName: "Google" },
      };

      const result = await oauthService.handleGoogleAuth(googleProfile);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(googleUserId);
    });

    it("should find user by Apple ID", async () => {
      const appleProfile = {
        id: "lookup_apple_id",
        email: `lookup_apple${testSuffix}@example.com`,
        name: { firstName: "Lookup", lastName: "Apple" },
      };

      const result = await oauthService.handleAppleAuth(appleProfile);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(appleUserId);
    });

    it("should return null for non-existent provider ID", async () => {
      const googleProfile = {
        id: "nonexistent_google_id",
        emails: [{ value: `nonexistent${testSuffix}@example.com`, verified: true }],
        name: { givenName: "Non", familyName: "Existent" },
      };

      const result = await oauthService.handleGoogleAuth(googleProfile);

      // Should create new user (not find existing)
      expect(result.success).toBe(true);
      expect(result.userId).toBeDefined();
      expect(result.userId).not.toBe(googleUserId);
      expect(result.userId).not.toBe(appleUserId);

      // Clean up
      await db.delete(users).where(eq(users.id, result.userId!));
    });
  });

  describe("Last Login Tracking", () => {
    let trackingUserId: string;

    beforeAll(async () => {
      const [user] = await db.insert(users).values({
        username: `tracking${testSuffix}`,
        emails: [`tracking${testSuffix}@example.com`],
        firstName: "Tracking",
        lastName: "User",
        fullName: "Tracking User",
        googleId: "tracking_google_id",
        oauthProvider: "google",
      }).returning();
      trackingUserId = user.id;
    });

    afterAll(async () => {
      await db.delete(users).where(eq(users.id, trackingUserId));
    });

    it("should track last auth method", async () => {
      const googleProfile = {
        id: "tracking_google_id",
        emails: [{ value: `tracking${testSuffix}@example.com`, verified: true }],
        name: { givenName: "Tracking", familyName: "User" },
      };

      await oauthService.handleGoogleAuth(googleProfile);

      const user = await oauthService.getUserById(trackingUserId);
      expect(user?.lastAuthMethod).toBe("google");
    });

    it("should update lastLoginAt on each login", async () => {
      const googleProfile = {
        id: "tracking_google_id",
        emails: [{ value: `tracking${testSuffix}@example.com`, verified: true }],
        name: { givenName: "Tracking", familyName: "User" },
      };

      // First login
      await oauthService.handleGoogleAuth(googleProfile);
      const user1 = await oauthService.getUserById(trackingUserId);
      const firstLogin = user1?.lastLoginAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second login
      await oauthService.handleGoogleAuth(googleProfile);
      const user2 = await oauthService.getUserById(trackingUserId);
      const secondLogin = user2?.lastLoginAt;

      expect(firstLogin).toBeDefined();
      expect(secondLogin).toBeDefined();
      expect(new Date(secondLogin!).getTime()).toBeGreaterThan(new Date(firstLogin!).getTime());
    });
  });
});
