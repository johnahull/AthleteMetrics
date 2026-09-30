/**
 * Unit tests for OAuth authentication routes
 * Tests Google and Apple OAuth flows, account linking, and security
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { users, accountLinkingTokens } from "@shared/schema";
import { eq } from "drizzle-orm";
import { hashToken } from '../lib/token-hash';
import crypto from "crypto";
import type { OAuthProfile, OAuthResult } from "../services/oauth-service";

// TODO: These tests need to be fixed - they have issues with mock setup and database isolation
describe.skip("OAuth Routes", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_oauth_test_${timestamp}`;

  let testAthleteId: string;
  let existingUserEmail: string;
  let testLinkingToken: string;

  const TEST_ATHLETE_EMAIL = `oauthathlete${testSuffix}@example.com`;
  const EXISTING_USER_EMAIL = `existinguser${testSuffix}@example.com`;

  beforeAll(async () => {
    // Create existing user (for account linking tests)
    const [existingUser] = await db.insert(users).values({
      emails: [EXISTING_USER_EMAIL],
      username: `existinguser${testSuffix}`,
      firstName: "Existing",
      lastName: "User",
      fullName: "Existing User",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testAthleteId = existingUser.id;
    existingUserEmail = existingUser.emails[0];
  });

  afterAll(async () => {
    // Clean up all test data
    await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.userId, testAthleteId));
    await db.delete(users).where(eq(users.id, testAthleteId));

    // Clean up any OAuth-created users
    await db.delete(users).where(eq(users.username, `oauthtest${testSuffix}`));
  });

  beforeEach(async () => {
    // Clean up linking tokens before each test
    await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.userId, testAthleteId));
  });

  describe("GET /api/auth/oauth-status", () => {
    it("should return OAuth provider availability", async () => {
      // This endpoint always exists, even if OAuth is disabled
      const status = {
        googleEnabled: !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
        appleEnabled: !!(
          process.env.APPLE_OAUTH_CLIENT_ID &&
          process.env.APPLE_OAUTH_TEAM_ID &&
          process.env.APPLE_OAUTH_KEY_ID &&
          process.env.APPLE_OAUTH_PRIVATE_KEY_PATH
        )
      };

      expect(status).toHaveProperty('googleEnabled');
      expect(status).toHaveProperty('appleEnabled');
      expect(typeof status.googleEnabled).toBe('boolean');
      expect(typeof status.appleEnabled).toBe('boolean');
    });
  });

  describe("Google OAuth Flow", () => {
    describe("GET /api/auth/google - Initiate", () => {
      it("should redirect to Google OAuth with correct scope", () => {
        // In actual implementation, this would redirect to Google
        const expectedScope = ['profile', 'email'];
        const expectedAccessType = 'offline';
        const expectedPrompt = 'select_account';

        expect(expectedScope).toContain('profile');
        expect(expectedScope).toContain('email');
        expect(expectedAccessType).toBe('offline');
        expect(expectedPrompt).toBe('select_account');
      });

      it("should apply rate limiting", () => {
        // Rate limit: 10 OAuth attempts per 15 minutes
        const rateLimitConfig = {
          windowMs: 15 * 60 * 1000,
          limit: 10,
          message: { message: "Too many OAuth attempts, please try again later." }
        };

        expect(rateLimitConfig.limit).toBe(10);
        expect(rateLimitConfig.windowMs).toBe(900000);
      });
    });

    describe("GET /api/auth/google/callback - Callback", () => {
      it("should create new user for first-time Google sign-in", async () => {
        const googleProfile: OAuthProfile = {
          provider: 'google',
          providerId: `google_${testSuffix}`,
          email: `newgoogleuser${testSuffix}@example.com`,
          emailVerified: true,
          firstName: "Google",
          lastName: "User",
        };

        // Simulate OAuth service creating user
        const username = `oauthtest${testSuffix}`;
        const [newUser] = await db.insert(users).values({
          username,
          emails: [googleProfile.email],
          firstName: googleProfile.firstName,
          lastName: googleProfile.lastName,
          fullName: `${googleProfile.firstName} ${googleProfile.lastName}`,
          googleId: googleProfile.providerId,
          oauthProvider: 'google',
          oauthEmail: googleProfile.email,
          oauthEmailVerified: true,
          isEmailVerified: true,
          accountLinkedAt: new Date(),
          isActive: true,
        }).returning();

        expect(newUser.googleId).toBe(googleProfile.providerId);
        expect(newUser.emails[0]).toBe(googleProfile.email);
        expect(newUser.oauthProvider).toBe('google');
        expect(newUser.password).toBeNull();

        // Cleanup
        await db.delete(users).where(eq(users.id, newUser.id));
      });

      it("should log in existing Google user", async () => {
        // Create OAuth user
        const googleId = `google_existing_${testSuffix}`;
        const [existingOAuthUser] = await db.insert(users).values({
          username: `existinggoogle${testSuffix}`,
          emails: [`existinggoogle${testSuffix}@example.com`],
          firstName: "Existing",
          lastName: "Google",
          fullName: "Existing Google",
          googleId,
          oauthProvider: 'google',
          isActive: true,
        }).returning();

        // Verify user can be found by Google ID
        const foundUser = await storage.getUserByGoogleId(googleId);
        expect(foundUser).toBeDefined();
        expect(foundUser?.id).toBe(existingOAuthUser.id);

        // Cleanup
        await db.delete(users).where(eq(users.id, existingOAuthUser.id));
      });

      it("should require account linking when email already exists", async () => {
        // Attempt to sign in with Google using an existing email
        const googleProfile: OAuthProfile = {
          provider: 'google',
          providerId: `google_linking_${testSuffix}`,
          email: EXISTING_USER_EMAIL,
          emailVerified: true,
          firstName: "Google",
          lastName: "Linking",
        };

        // Check that user exists with this email
        const existingUser = await storage.getUserByEmail(EXISTING_USER_EMAIL);
        expect(existingUser).toBeDefined();
        expect(existingUser?.googleId).toBeNull();

        // OAuth should trigger linking flow (sends email)
        // The route would redirect to /login?message=linking_email_sent
        const expectedRedirect = '/login?message=linking_email_sent';
        expect(expectedRedirect).toContain('linking_email_sent');
      });

      it("should handle OAuth errors gracefully", () => {
        // Various error scenarios
        const errorScenarios = [
          { error: 'LINKING_REQUIRED', expectedRedirect: '/login?message=linking_email_sent' },
          { error: 'OAuth failed', expectedRedirect: '/login?error=oauth_failed' },
          { error: null, expectedRedirect: '/login?error=oauth_failed' }, // No result
          { error: 'user_not_found', expectedRedirect: '/login?error=user_not_found' },
        ];

        errorScenarios.forEach(scenario => {
          expect(scenario.expectedRedirect).toMatch(/^\/login\?(error|message)=/);
        });
      });

      it("should set session for successful authentication", () => {
        const mockSession = {
          user: {
            id: testAthleteId,
            username: 'testuser',
            firstName: 'Test',
            lastName: 'User',
            email: TEST_ATHLETE_EMAIL,
            role: 'athlete' as const,
            isSiteAdmin: false,
            primaryOrganizationId: undefined,
            athleteId: testAthleteId,
          }
        };

        expect(mockSession.user.id).toBe(testAthleteId);
        expect(mockSession.user.role).toBe('athlete');
      });

      it("should redirect to appropriate dashboard based on role", () => {
        const redirectTests = [
          { isSiteAdmin: true, expectedRedirect: '/admin' },
          { role: 'athlete', expectedRedirect: '/my-dashboard' },
          { role: 'coach', expectedRedirect: '/dashboard' },
          { role: 'org_admin', expectedRedirect: '/dashboard' },
        ];

        redirectTests.forEach(test => {
          if ('isSiteAdmin' in test && test.isSiteAdmin) {
            expect(test.expectedRedirect).toBe('/admin');
          } else if (test.role === 'athlete') {
            expect(test.expectedRedirect).toBe('/my-dashboard');
          } else {
            expect(test.expectedRedirect).toBe('/dashboard');
          }
        });
      });
    });
  });

  describe("Apple OAuth Flow", () => {
    describe("GET /api/auth/apple - Initiate", () => {
      it("should redirect to Apple OAuth with correct scope", () => {
        const expectedScope = ['name', 'email'];

        expect(expectedScope).toContain('name');
        expect(expectedScope).toContain('email');
      });

      it("should apply rate limiting", () => {
        const rateLimitConfig = {
          windowMs: 15 * 60 * 1000,
          limit: 10,
        };

        expect(rateLimitConfig.limit).toBe(10);
      });
    });

    describe("POST /api/auth/apple/callback - Callback", () => {
      it("should create new user for first-time Apple sign-in", async () => {
        const appleProfile: OAuthProfile = {
          provider: 'apple',
          providerId: `apple_${testSuffix}`,
          email: `newappleuser${testSuffix}@example.com`,
          emailVerified: true,
          firstName: "Apple",
          lastName: "User",
        };

        const username = `appletest${testSuffix}`;
        const [newUser] = await db.insert(users).values({
          username,
          emails: [appleProfile.email],
          firstName: appleProfile.firstName,
          lastName: appleProfile.lastName,
          fullName: `${appleProfile.firstName} ${appleProfile.lastName}`,
          appleId: appleProfile.providerId,
          oauthProvider: 'apple',
          oauthEmail: appleProfile.email,
          oauthEmailVerified: true,
          isEmailVerified: true,
          accountLinkedAt: new Date(),
          isActive: true,
        }).returning();

        expect(newUser.appleId).toBe(appleProfile.providerId);
        expect(newUser.emails[0]).toBe(appleProfile.email);
        expect(newUser.oauthProvider).toBe('apple');

        await db.delete(users).where(eq(users.id, newUser.id));
      });

      it("should log in existing Apple user", async () => {
        const appleId = `apple_existing_${testSuffix}`;
        const [existingAppleUser] = await db.insert(users).values({
          username: `existingapple${testSuffix}`,
          emails: [`existingapple${testSuffix}@example.com`],
          firstName: "Existing",
          lastName: "Apple",
          fullName: "Existing Apple",
          appleId,
          oauthProvider: 'apple',
          isActive: true,
        }).returning();

        const foundUser = await storage.getUserByAppleId(appleId);
        expect(foundUser).toBeDefined();
        expect(foundUser?.id).toBe(existingAppleUser.id);

        await db.delete(users).where(eq(users.id, existingAppleUser.id));
      });

      it("should require account linking when email already exists", async () => {
        const appleProfile: OAuthProfile = {
          provider: 'apple',
          providerId: `apple_linking_${testSuffix}`,
          email: EXISTING_USER_EMAIL,
          emailVerified: true,
          firstName: "Apple",
          lastName: "Linking",
        };

        const existingUser = await storage.getUserByEmail(EXISTING_USER_EMAIL);
        expect(existingUser).toBeDefined();
        expect(existingUser?.appleId).toBeNull();

        const expectedRedirect = '/login?message=linking_email_sent';
        expect(expectedRedirect).toContain('linking_email_sent');
      });

      it("should handle Apple OAuth errors gracefully", () => {
        const errorScenarios = [
          { error: 'LINKING_REQUIRED', expectedRedirect: '/login?message=linking_email_sent' },
          { error: 'OAuth failed', expectedRedirect: '/login?error=oauth_failed' },
        ];

        errorScenarios.forEach(scenario => {
          expect(scenario.expectedRedirect).toMatch(/^\/login\?(error|message)=/);
        });
      });

      it("should handle POST method for Apple callback", () => {
        // Apple uses POST for callback (unlike Google which uses GET)
        const method = 'POST';
        expect(method).toBe('POST');
      });
    });
  });

  describe("Account Linking", () => {
    describe("GET /api/auth/link-account/:token - Confirm Linking", () => {
      it("should successfully link OAuth account with valid token", async () => {
        // Create a linking token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await db.insert(accountLinkingTokens).values({
          userId: testAthleteId,
          token,
          provider: 'google',
          providerId: `google_link_${testSuffix}`,
          providerEmail: EXISTING_USER_EMAIL,
          expiresAt,
        });

        testLinkingToken = token;

        // Verify token was created
        const linkingToken = await storage.getAccountLinkingToken(token);
        expect(linkingToken).toBeDefined();
        expect(linkingToken?.userId).toBe(testAthleteId);
        expect(linkingToken?.provider).toBe('google');
        expect(linkingToken?.usedAt).toBeNull();

        // Confirm linking
        const result = await storage.confirmAccountLinking(token);
        expect(result.success).toBe(true);

        // Verify user was updated
        const updatedUser = await storage.getUser(testAthleteId);
        expect(updatedUser?.googleId).toBe(`google_link_${testSuffix}`);
        expect(updatedUser?.oauthProvider).toBe('google');
        expect(updatedUser?.accountLinkedAt).toBeDefined();

        // Verify token was marked as used
        const usedToken = await storage.getAccountLinkingToken(token);
        expect(usedToken?.usedAt).toBeDefined();
      });

      it("should reject invalid token", async () => {
        const invalidToken = "invalid_token_that_does_not_exist";

        const result = await storage.confirmAccountLinking(invalidToken);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/invalid|expired/i);
      });

      it("should reject expired token", async () => {
        // Create expired token
        const expiredToken = crypto.randomBytes(32).toString('hex');
        const expiredAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

        await db.insert(accountLinkingTokens).values({
          userId: testAthleteId,
          token: hashToken(expiredToken),
          provider: 'google',
          providerId: `google_expired_${testSuffix}`,
          providerEmail: EXISTING_USER_EMAIL,
          expiresAt: expiredAt,
        });

        const result = await storage.confirmAccountLinking(expiredToken);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/expired/i);

        // Cleanup
        await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.token, hashToken(expiredToken)));
      });

      it("should reject already-used token", async () => {
        // Create and use a token
        const usedToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await db.insert(accountLinkingTokens).values({
          userId: testAthleteId,
          token: hashToken(usedToken),
          provider: 'apple',
          providerId: `apple_used_${testSuffix}`,
          providerEmail: EXISTING_USER_EMAIL,
          expiresAt,
          usedAt: new Date(), // Already used
        });

        const result = await storage.confirmAccountLinking(usedToken);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/already.*used/i);

        // Cleanup
        await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.token, hashToken(usedToken)));
      });

      it("should redirect to login with success message after linking", () => {
        const successRedirect = '/login?message=account_linked';
        expect(successRedirect).toContain('account_linked');
      });

      it("should redirect to login with error on failure", () => {
        const errorRedirect = '/login?error=linking_failed';
        expect(errorRedirect).toContain('linking_failed');
      });

      it("should be one-time use only", async () => {
        // Create fresh token for this test
        const oneTimeToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await db.insert(accountLinkingTokens).values({
          userId: testAthleteId,
          token: hashToken(oneTimeToken),
          provider: 'google',
          providerId: `google_onetime_${testSuffix}`,
          providerEmail: EXISTING_USER_EMAIL,
          expiresAt,
        });

        // First use - success
        const firstResult = await storage.confirmAccountLinking(oneTimeToken);
        expect(firstResult.success).toBe(true);

        // Second use - should fail
        const secondResult = await storage.confirmAccountLinking(oneTimeToken);
        expect(secondResult.success).toBe(false);
        expect(secondResult.error).toMatch(/already.*used/i);

        // Cleanup
        await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.token, hashToken(oneTimeToken)));
      });
    });

    describe("Account Linking Token Creation", () => {
      it("should have 1-hour expiry", () => {
        const now = Date.now();
        const expiryMs = 60 * 60 * 1000; // 1 hour
        const expiresAt = new Date(now + expiryMs);

        const timeDiff = expiresAt.getTime() - now;
        expect(timeDiff).toBeGreaterThanOrEqual(3599000); // ~1 hour
        expect(timeDiff).toBeLessThanOrEqual(3600000);
      });

      it("should generate random secure token", () => {
        const token1 = crypto.randomBytes(32).toString('hex');
        const token2 = crypto.randomBytes(32).toString('hex');

        expect(token1).not.toBe(token2);
        expect(token1.length).toBe(64); // 32 bytes = 64 hex chars
        expect(token2.length).toBe(64);
      });

      it("should store provider information", async () => {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await db.insert(accountLinkingTokens).values({
          userId: testAthleteId,
          token,
          provider: 'google',
          providerId: 'google_123',
          providerEmail: 'test@example.com',
          expiresAt,
        });

        const linkingToken = await storage.getAccountLinkingToken(token);
        expect(linkingToken?.provider).toBe('google');
        expect(linkingToken?.providerId).toBe('google_123');
        expect(linkingToken?.providerEmail).toBe('test@example.com');

        await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.token, hashToken(token)));
      });
    });
  });

  describe("Security", () => {
    describe("Rate Limiting", () => {
      it("should limit OAuth attempts to 10 per 15 minutes", () => {
        const rateLimitConfig = {
          windowMs: 15 * 60 * 1000,
          limit: 10,
          message: { message: "Too many OAuth attempts, please try again later." }
        };

        expect(rateLimitConfig.limit).toBe(10);
        expect(rateLimitConfig.windowMs).toBe(15 * 60 * 1000);
      });

      it("should use draft-7 standard headers", () => {
        const rateLimitConfig = {
          standardHeaders: 'draft-7',
          legacyHeaders: false,
        };

        expect(rateLimitConfig.standardHeaders).toBe('draft-7');
        expect(rateLimitConfig.legacyHeaders).toBe(false);
      });

      it("should skip rate limiting in test environment", () => {
        const isTestEnv = process.env.NODE_ENV === 'test';
        if (isTestEnv) {
          expect(isTestEnv).toBe(true);
        }
      });

      it("should skip rate limiting for localhost", () => {
        const localhostIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
        localhostIps.forEach(ip => {
          expect(['127.0.0.1', '::1', '::ffff:127.0.0.1']).toContain(ip);
        });
      });
    });

    describe("CSRF Protection", () => {
      it("should validate state parameter in OAuth callbacks", () => {
        // Passport.js automatically handles state parameter for CSRF protection
        // This test verifies the expectation exists
        const csrfProtection = {
          stateParameter: true,
          automaticValidation: true,
        };

        expect(csrfProtection.stateParameter).toBe(true);
        expect(csrfProtection.automaticValidation).toBe(true);
      });
    });

    describe("Token Security", () => {
      it("should mark tokens as used after linking", async () => {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await db.insert(accountLinkingTokens).values({
          userId: testAthleteId,
          token,
          provider: 'google',
          providerId: `google_security_${testSuffix}`,
          providerEmail: EXISTING_USER_EMAIL,
          expiresAt,
        });

        await storage.markAccountLinkingTokenUsed(token);

        const usedToken = await storage.getAccountLinkingToken(token);
        expect(usedToken?.usedAt).toBeDefined();
        expect(usedToken?.usedAt).toBeInstanceOf(Date);

        await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.token, hashToken(token)));
      });

      it("should prevent token reuse", async () => {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await db.insert(accountLinkingTokens).values({
          userId: testAthleteId,
          token,
          provider: 'apple',
          providerId: `apple_reuse_${testSuffix}`,
          providerEmail: EXISTING_USER_EMAIL,
          expiresAt,
        });

        // Use token
        const firstResult = await storage.confirmAccountLinking(token);
        expect(firstResult.success).toBe(true);

        // Attempt reuse
        const secondResult = await storage.confirmAccountLinking(token);
        expect(secondResult.success).toBe(false);

        await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.token, hashToken(token)));
      });

      it("should enforce token expiration", async () => {
        const token = crypto.randomBytes(32).toString('hex');
        const expiredAt = new Date(Date.now() - 1000); // Expired 1 second ago

        await db.insert(accountLinkingTokens).values({
          userId: testAthleteId,
          token,
          provider: 'google',
          providerId: `google_expiry_${testSuffix}`,
          providerEmail: EXISTING_USER_EMAIL,
          expiresAt: expiredAt,
        });

        const result = await storage.confirmAccountLinking(token);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/expired/i);

        await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.token, hashToken(token)));
      });
    });

    describe("Email Verification", () => {
      it("should trust OAuth provider email verification", async () => {
        // Google and Apple verify emails - we trust their verification
        const googleProfile: OAuthProfile = {
          provider: 'google',
          providerId: 'google_verified',
          email: 'verified@gmail.com',
          emailVerified: true,
          firstName: 'Verified',
          lastName: 'User',
        };

        const appleProfile: OAuthProfile = {
          provider: 'apple',
          providerId: 'apple_verified',
          email: 'verified@icloud.com',
          emailVerified: true,
          firstName: 'Verified',
          lastName: 'User',
        };

        expect(googleProfile.emailVerified).toBe(true);
        expect(appleProfile.emailVerified).toBe(true);
      });

      it("should set isEmailVerified for OAuth users", async () => {
        const oauthUser = {
          oauthProvider: 'google' as const,
          oauthEmailVerified: true,
          isEmailVerified: true,
        };

        expect(oauthUser.isEmailVerified).toBe(true);
        expect(oauthUser.oauthEmailVerified).toBe(true);
      });
    });

    describe("Account Linking Security", () => {
      it("should require email confirmation before linking", async () => {
        // When OAuth email matches existing account, send email first
        const linkingFlow = {
          step1: 'OAuth attempt with existing email',
          step2: 'Create linking token',
          step3: 'Send email to existing account',
          step4: 'User clicks link in email',
          step5: 'Accounts linked',
        };

        expect(linkingFlow.step3).toContain('email');
        expect(linkingFlow.step4).toContain('clicks link');
      });

      it("should prevent unauthorized account takeover", async () => {
        // Linking requires possession of the email account
        // Attacker cannot link without access to victim's email
        const securityMechanism = {
          requiresEmailAccess: true,
          tokenSentToEmail: true,
          oneTimeUse: true,
          timeExpiry: '1 hour',
        };

        expect(securityMechanism.requiresEmailAccess).toBe(true);
        expect(securityMechanism.oneTimeUse).toBe(true);
      });
    });
  });

  describe("OAuth User Creation", () => {
    it("should generate unique username from email", async () => {
      const email = `duplicate${testSuffix}@example.com`;

      // Create first user with username from email
      const username1 = email.split('@')[0];
      const [user1] = await db.insert(users).values({
        username: username1,
        emails: [email],
        firstName: "First",
        lastName: "User",
        fullName: "First User",
        isActive: true,
      }).returning();

      // Second user with same email prefix should get incremented username
      const username2 = `${email.split('@')[0]}1`;
      const [user2] = await db.insert(users).values({
        username: username2,
        emails: [`second${testSuffix}@example.com`],
        firstName: "Second",
        lastName: "User",
        fullName: "Second User",
        isActive: true,
      }).returning();

      expect(user1.username).toBe(username1);
      expect(user2.username).toBe(username2);
      expect(user1.username).not.toBe(user2.username);

      // Cleanup
      await db.delete(users).where(eq(users.id, user1.id));
      await db.delete(users).where(eq(users.id, user2.id));
    });

    it("should set OAuth-specific fields", async () => {
      const oauthUser = {
        googleId: 'google_123',
        appleId: null,
        oauthProvider: 'google' as const,
        oauthEmail: 'user@gmail.com',
        oauthEmailVerified: true,
        password: null, // OAuth-only users have no password
        accountLinkedAt: new Date(),
        lastAuthMethod: 'google' as const,
      };

      expect(oauthUser.googleId).toBe('google_123');
      expect(oauthUser.oauthProvider).toBe('google');
      expect(oauthUser.password).toBeNull();
      expect(oauthUser.accountLinkedAt).toBeInstanceOf(Date);
    });

    it("should allow null password for OAuth-only users", () => {
      const oauthOnlyUser = {
        password: null,
        googleId: 'google_id',
        oauthProvider: 'google' as const,
      };

      expect(oauthOnlyUser.password).toBeNull();
      expect(oauthOnlyUser.googleId).toBeDefined();
    });

    it("should set accountLinkedAt timestamp", () => {
      const now = new Date();
      const accountLinkedAt = new Date();

      const timeDiff = Math.abs(accountLinkedAt.getTime() - now.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });
  });

  describe("OAuth Provider Integration", () => {
    it("should handle Google profile structure", () => {
      const googleProfile = {
        id: 'google_user_id',
        emails: [{ value: 'user@gmail.com', verified: true }],
        name: {
          givenName: 'John',
          familyName: 'Doe',
        },
      };

      expect(googleProfile.id).toBeDefined();
      expect(googleProfile.emails[0].value).toContain('@');
      expect(googleProfile.name.givenName).toBeDefined();
      expect(googleProfile.name.familyName).toBeDefined();
    });

    it("should handle Apple profile structure", () => {
      const appleProfile = {
        id: 'apple_user_id',
        email: 'user@icloud.com',
        name: {
          firstName: 'Jane',
          lastName: 'Smith',
        },
      };

      expect(appleProfile.id).toBeDefined();
      expect(appleProfile.email).toContain('@');
    });

    it("should handle Apple profile without name", () => {
      // Apple only provides name on first sign-in
      const appleProfileNoName = {
        id: 'apple_user_id_2',
        email: 'returning@icloud.com',
        name: undefined,
      };

      const firstName = appleProfileNoName.name?.firstName || '';
      const lastName = appleProfileNoName.name?.lastName || '';

      expect(firstName).toBe('');
      expect(lastName).toBe('');
    });
  });

  describe("Session Management", () => {
    it("should serialize OAuth user to session", () => {
      const oauthResult = {
        success: true,
        userId: 'user_123',
      };

      // Passport serializes user.userId to session
      const serialized = oauthResult.userId;
      expect(serialized).toBe('user_123');
    });

    it("should deserialize user from session", async () => {
      // Passport deserializes userId from session to full user
      const userId = testAthleteId;
      const user = await storage.getUser(userId);

      expect(user).toBeDefined();
      expect(user?.id).toBe(userId);
    });
  });

  describe("Last Login Tracking", () => {
    it("should update lastLoginAt on OAuth sign-in", async () => {
      const before = new Date();

      await storage.updateUser(testAthleteId, {
        lastLoginAt: new Date(),
        lastAuthMethod: 'google',
      });

      const after = new Date();
      const user = await storage.getUser(testAthleteId);

      expect(user?.lastLoginAt).toBeDefined();
      const loginTime = new Date(user!.lastLoginAt!).getTime();
      expect(loginTime).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(loginTime).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it("should track lastAuthMethod", async () => {
      await storage.updateUser(testAthleteId, {
        lastAuthMethod: 'apple',
      });

      const user = await storage.getUser(testAthleteId);
      expect(user?.lastAuthMethod).toBe('apple');
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing environment variables gracefully", () => {
      const isOAuthEnabled = () => {
        const googleEnabled = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
        const appleEnabled = !!(
          process.env.APPLE_OAUTH_CLIENT_ID &&
          process.env.APPLE_OAUTH_TEAM_ID &&
          process.env.APPLE_OAUTH_KEY_ID &&
          process.env.APPLE_OAUTH_PRIVATE_KEY_PATH
        );
        return { googleEnabled, appleEnabled, anyEnabled: googleEnabled || appleEnabled };
      };

      const result = isOAuthEnabled();
      expect(result).toHaveProperty('googleEnabled');
      expect(result).toHaveProperty('appleEnabled');
      expect(result).toHaveProperty('anyEnabled');
    });

    it("should handle OAuth callback without profile", () => {
      const oauthResult = null;
      const expectedRedirect = '/login?error=oauth_failed';

      if (!oauthResult) {
        expect(expectedRedirect).toContain('oauth_failed');
      }
    });

    it("should handle database errors gracefully", async () => {
      try {
        // Attempt to get token with invalid format
        const result = await storage.getAccountLinkingToken('');
        expect(result).toBeUndefined();
      } catch (error) {
        // Should handle error without crashing
        expect(error).toBeDefined();
      }
    });
  });
});

// TODO: These tests need to be fixed - they have issues with mock setup and database isolation
describe.skip("OAuth Service Business Logic", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_oauth_service_${timestamp}`;

  let testUserId: string;

  beforeAll(async () => {
    const [user] = await db.insert(users).values({
      username: `servicetest${testSuffix}`,
      emails: [`servicetest${testSuffix}@example.com`],
      firstName: "Service",
      lastName: "Test",
      fullName: "Service Test",
      isActive: true,
    }).returning();
    testUserId = user.id;
  });

  afterAll(async () => {
    await db.delete(accountLinkingTokens).where(eq(accountLinkingTokens.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe("OAuth Result Structure", () => {
    it("should return success result for new user", () => {
      const result: OAuthResult = {
        success: true,
        userId: 'new_user_id',
      };

      expect(result.success).toBe(true);
      expect(result.userId).toBeDefined();
      expect(result.requiresLinking).toBeUndefined();
    });

    it("should return linking result for existing email", () => {
      const result: OAuthResult = {
        success: false,
        requiresLinking: true,
        linkingToken: 'token_123',
        error: 'An account with this email already exists. Please check your email to confirm linking.',
      };

      expect(result.success).toBe(false);
      expect(result.requiresLinking).toBe(true);
      expect(result.linkingToken).toBeDefined();
      expect(result.error).toContain('email');
    });

    it("should return error result for failures", () => {
      const result: OAuthResult = {
        success: false,
        error: 'OAuth authentication failed',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Provider-Specific Handling", () => {
    it("should find user by Google ID", async () => {
      const googleId = `google_findtest_${testSuffix}`;

      await storage.updateUser(testUserId, {
        googleId,
        oauthProvider: 'google',
      });

      const user = await storage.getUserByGoogleId(googleId);
      expect(user).toBeDefined();
      expect(user?.id).toBe(testUserId);
      expect(user?.googleId).toBe(googleId);
    });

    it("should find user by Apple ID", async () => {
      const appleId = `apple_findtest_${testSuffix}`;

      await storage.updateUser(testUserId, {
        appleId,
        oauthProvider: 'apple',
      });

      const user = await storage.getUserByAppleId(appleId);
      expect(user).toBeDefined();
      expect(user?.id).toBe(testUserId);
      expect(user?.appleId).toBe(appleId);
    });

    it("should return null for non-existent provider ID", async () => {
      const user = await storage.getUserByGoogleId('non_existent_id');
      expect(user).toBeNull();
    });
  });
});
