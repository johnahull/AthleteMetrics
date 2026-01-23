/**
 * OAuth authentication service handling Google and Apple sign-in
 */

import crypto from 'crypto';
import { BaseService } from './base-service';
import { EmailService } from './email-service';
import type { User, InsertOAuthUser } from '@shared/schema';
import { getLegalAcceptanceTimestamp, AUDIT_ACTION_LEGAL_ACCEPTED } from '@shared/legal-acceptance';

export interface OAuthProfile {
  provider: 'google' | 'apple';
  providerId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
}

export interface OAuthResult {
  success: boolean;
  userId?: string;
  requiresLinking?: boolean;
  linkingToken?: string;
  error?: string;
}

export class OAuthService extends BaseService {
  private emailService = new EmailService();

  /**
   * Handle Google OAuth authentication
   */
  async handleGoogleAuth(profile: any): Promise<OAuthResult> {
    // Validate profile has required fields
    if (!profile.emails || profile.emails.length === 0) {
      console.error('[OAuth Security] Missing email from Google OAuth provider');
      return { success: false, error: 'Authentication failed. Please try again or contact support.' };
    }

    if (!profile.id) {
      console.error('[OAuth Security] Missing user ID from Google OAuth provider');
      return { success: false, error: 'Authentication failed. Please try again or contact support.' };
    }

    // Validate provider ID format (prevent injection attacks)
    // Google IDs may contain dots (e.g., numeric IDs from Google accounts)
    const providerIdRegex = /^[a-zA-Z0-9_\-\.]{1,255}$/;
    if (!providerIdRegex.test(profile.id)) {
      console.error('[OAuth Security] Invalid provider ID format from Google:', { providerId: profile.id });
      return { success: false, error: 'Authentication failed. Please try again or contact support.' };
    }

    const oauthProfile: OAuthProfile = {
      provider: 'google',
      providerId: profile.id,
      email: profile.emails[0].value,
      emailVerified: profile.emails[0].verified,
      firstName: profile.name?.givenName || '',
      lastName: profile.name?.familyName || '',
    };

    return this.authenticateWithOAuth(oauthProfile);
  }

  /**
   * Handle Apple OAuth authentication
   */
  async handleAppleAuth(profile: any): Promise<OAuthResult> {
    // Validate required fields
    if (!profile.id) {
      console.error('[OAuth Security] Missing user ID from Apple OAuth provider');
      return { success: false, error: 'Authentication failed. Please try again or contact support.' };
    }

    if (!profile.email) {
      console.error('[OAuth Security] Missing email from Apple OAuth provider');
      return { success: false, error: 'Authentication failed. Please try again or contact support.' };
    }

    // Validate provider ID format (prevent injection attacks)
    const providerIdRegex = /^[a-zA-Z0-9_\-\.]{1,255}$/;
    if (!providerIdRegex.test(profile.id)) {
      console.error('[OAuth Security] Invalid provider ID format from Apple:', { providerId: profile.id });
      return { success: false, error: 'Authentication failed. Please try again or contact support.' };
    }

    const oauthProfile: OAuthProfile = {
      provider: 'apple',
      providerId: profile.id,
      email: profile.email,
      emailVerified: true,  // Apple emails are always verified
      firstName: profile.name?.firstName || '',
      lastName: profile.name?.lastName || '',
    };

    return this.authenticateWithOAuth(oauthProfile);
  }

  /**
   * Core OAuth authentication logic
   */
  private async authenticateWithOAuth(profile: OAuthProfile): Promise<OAuthResult> {
    try {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(profile.email)) {
        console.error('[OAuth Security] Invalid email format from OAuth provider:', { provider: profile.provider });
        return { success: false, error: 'Authentication failed. Please try again or contact support.' };
      }
      // 1. Check if user exists with this provider ID
      const existingOAuthUser = await this.findUserByProviderId(profile.provider, profile.providerId);

      if (existingOAuthUser) {
        // Existing OAuth user - log them in
        await this.updateLastLogin(existingOAuthUser.id, profile.provider);
        return { success: true, userId: existingOAuthUser.id };
      }

      // 2. Check if user(s) exist with this email - use getUsersByEmail
      const existingEmailUsers = await this.storage.getUsersByEmail(profile.email);

      if (existingEmailUsers.length > 1) {
        // Multiple users with same email - log warning for investigation
        console.warn('[OAuth] Multiple users found with email, using first:', {
          email: profile.email,
          userIds: existingEmailUsers.map(u => u.id),
          userCount: existingEmailUsers.length
        });
      }

      if (existingEmailUsers.length > 0) {
        const existingEmailUser = existingEmailUsers[0];

        // Validate user has email address
        if (!existingEmailUser.emails || existingEmailUser.emails.length === 0) {
          console.error('[OAuth Security] User account missing email array:', { userId: existingEmailUser.id });
          return { success: false, error: 'Authentication failed. Please try again or contact support.' };
        }

        // Email exists - require account linking via email confirmation
        const linkingToken = await this.createAccountLinkingToken(
          existingEmailUser.id,
          profile
        );

        // Send email confirmation
        await this.emailService.sendAccountLinkingEmail(
          existingEmailUser.emails[0],
          existingEmailUser.firstName,
          profile.provider,
          linkingToken
        );

        return {
          success: false,
          requiresLinking: true,
          error: 'An account with this email already exists. Please check your email to confirm linking.'
        };
      }

      // 3. New user - create account with OAuth
      const newUser = await this.createOAuthUser(profile);
      return { success: true, userId: newUser.id };

    } catch (error) {
      console.error('OAuthService.authenticateWithOAuth:', error);
      return { success: false, error: 'OAuth authentication failed' };
    }
  }

  /**
   * Create new user account with OAuth
   */
  private async createOAuthUser(profile: OAuthProfile): Promise<User> {
    const userId = crypto.randomUUID();

    // Generate username from email with random suffix (ensure uniqueness and prevent enumeration)
    let username = profile.email.split('@')[0];
    let attempts = 0;
    const maxAttempts = 5;

    while (await this.storage.getUserByUsername(username) && attempts < maxAttempts) {
      // Use cryptographically random suffix to prevent enumeration attacks
      const randomSuffix = crypto.randomBytes(3).toString('hex');
      username = `${profile.email.split('@')[0]}_${randomSuffix}`;
      attempts++;
    }

    // If we exhausted attempts, fail gracefully
    if (attempts >= maxAttempts) {
      throw new Error('Failed to generate unique username');
    }

    // Set legal acceptance fields for new OAuth users
    const now = new Date();
    const legalAcceptedAt = now;
    const legalAcceptedVersion = getLegalAcceptanceTimestamp(); // YYYY-MM-DD format

    const userData: InsertOAuthUser = {
      username,
      emails: [profile.email],
      // No password for OAuth-only users - storage.createUser detects OAuth users and sets null
      firstName: profile.firstName,
      lastName: profile.lastName,
      role: 'athlete',  // OAuth users default to athlete role
      googleId: profile.provider === 'google' ? profile.providerId : undefined,
      appleId: profile.provider === 'apple' ? profile.providerId : undefined,
      oauthProvider: profile.provider,
      oauthEmail: profile.email,
      oauthEmailVerified: profile.emailVerified,
      lastAuthMethod: profile.provider,
      isEmailVerified: profile.emailVerified,  // OAuth emails are pre-verified
      accountLinkedAt: new Date(),
      legalAcceptedAt,
      legalAcceptedVersion,
    };

    // Use InsertOAuthUser type which allows optional password for OAuth-only accounts
    const user = await this.storage.createUser(userData);

    // Create audit log for legal acceptance (critical for compliance)
    // If audit log fails, rollback by deleting the user
    try {
      await this.storage.createAuditLog({
        userId: user.id,
        action: AUDIT_ACTION_LEGAL_ACCEPTED,
        resourceType: 'user',
        resourceId: user.id,
        details: JSON.stringify({
          version: legalAcceptedVersion,
          acceptedAt: legalAcceptedAt.toISOString(),
          method: 'oauth',
          provider: profile.provider
        }),
      });
    } catch (auditError) {
      console.error('[CRITICAL] Failed to create audit log for OAuth user:', auditError);
      // Rollback user creation for compliance
      try {
        await this.storage.deleteUser(user.id);
      } catch (cleanupError) {
        console.error('[CRITICAL] Failed to cleanup user after audit log failure:', cleanupError);
      }
      throw new Error('Failed to complete OAuth registration');
    }

    return user;
  }

  /**
   * Create account linking token for email verification
   */
  private async createAccountLinkingToken(
    userId: string,
    profile: OAuthProfile
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    // 1 hour expiry - balances security with UX (email delivery can be slow)
    // Security: Single-use tokens + 3 failed attempt lockout provides adequate protection
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.storage.createAccountLinkingToken({
      userId,
      token,
      provider: profile.provider,
      providerId: profile.providerId,
      providerEmail: profile.email,
      expiresAt,
      failedAttempts: 0,
    });

    return token;
  }

  /**
   * Confirm account linking via email token
   */
  async confirmAccountLinking(token: string): Promise<{ success: boolean; error?: string; shouldIncrementFailedAttempts?: boolean }> {
    try {
      const linkingToken = await this.storage.getAccountLinkingToken(token);

      if (!linkingToken) {
        return { success: false, error: 'Invalid or expired linking token', shouldIncrementFailedAttempts: false };
      }

      if (linkingToken.usedAt) {
        return { success: false, error: 'This linking token has already been used', shouldIncrementFailedAttempts: false };
      }

      if (new Date() > linkingToken.expiresAt) {
        return { success: false, error: 'This linking token has expired', shouldIncrementFailedAttempts: false };
      }

      // Check failed attempts (invalidate after 3 failed attempts)
      if (linkingToken.failedAttempts >= 3) {
        console.error('[OAuth Security] Token invalidated due to too many failed attempts:', { token: token.substring(0, 8) });
        return { success: false, error: 'This linking token has been invalidated due to too many failed attempts', shouldIncrementFailedAttempts: false };
      }

      // Link OAuth account to existing user
      await this.storage.updateUser(linkingToken.userId, {
        googleId: linkingToken.provider === 'google' ? linkingToken.providerId : undefined,
        appleId: linkingToken.provider === 'apple' ? linkingToken.providerId : undefined,
        oauthProvider: linkingToken.provider,
        oauthEmail: linkingToken.providerEmail,
        oauthEmailVerified: true,
        accountLinkedAt: new Date(),
      });

      // Mark token as used
      await this.storage.markAccountLinkingTokenUsed(token);

      return { success: true, shouldIncrementFailedAttempts: false };
    } catch (error) {
      console.error('OAuthService.confirmAccountLinking:', error);
      // On unexpected errors, increment failed attempts to prevent brute force
      return { success: false, error: 'Failed to link accounts', shouldIncrementFailedAttempts: true };
    }
  }

  /**
   * Find user by OAuth provider ID
   */
  private async findUserByProviderId(provider: string, providerId: string): Promise<User | null> {
    if (provider === 'google') {
      return await this.storage.getUserByGoogleId(providerId);
    } else if (provider === 'apple') {
      return await this.storage.getUserByAppleId(providerId);
    }
    return null;
  }

  /**
   * Update last login timestamp and auth method
   */
  private async updateLastLogin(userId: string, authMethod: 'google' | 'apple'): Promise<void> {
    await this.storage.updateUser(userId, {
      lastLoginAt: new Date(),
      lastAuthMethod: authMethod,
    });
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | undefined> {
    return await this.storage.getUser(id);
  }

  /**
   * Increment failed attempts on an account linking token (for rate limiting)
   */
  async incrementLinkingTokenFailedAttempts(token: string): Promise<void> {
    await this.storage.incrementAccountLinkingTokenFailedAttempts(token);
  }
}
