/**
 * OAuth authentication service handling Google and Apple sign-in
 */

import crypto from 'crypto';
import { BaseService } from './base-service';
import { EmailService } from './email-service';
import type { User } from '@shared/schema';

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
      return { success: false, error: 'No email address provided by OAuth provider' };
    }

    if (!profile.id) {
      return { success: false, error: 'No user ID provided by OAuth provider' };
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
        return { success: false, error: 'Invalid email address from OAuth provider' };
      }
      // 1. Check if user exists with this provider ID
      const existingOAuthUser = await this.findUserByProviderId(profile.provider, profile.providerId);

      if (existingOAuthUser) {
        // Existing OAuth user - log them in
        await this.updateLastLogin(existingOAuthUser.id, profile.provider);
        return { success: true, userId: existingOAuthUser.id };
      }

      // 2. Check if user exists with this email
      const existingEmailUser = await this.storage.getUserByEmail(profile.email);

      if (existingEmailUser) {
        // Validate user has email address
        if (!existingEmailUser.emails || existingEmailUser.emails.length === 0) {
          return { success: false, error: 'User account has no email address' };
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

    const userData = {
      username,
      emails: [profile.email],
      // No password for OAuth-only users - storage.createUser detects OAuth users and sets null
      firstName: profile.firstName,
      lastName: profile.lastName,
      googleId: profile.provider === 'google' ? profile.providerId : undefined,
      appleId: profile.provider === 'apple' ? profile.providerId : undefined,
      oauthProvider: profile.provider,
      oauthEmail: profile.email,
      oauthEmailVerified: profile.emailVerified,
      lastAuthMethod: profile.provider,
      isEmailVerified: profile.emailVerified,  // OAuth emails are pre-verified
      accountLinkedAt: new Date(),
    };

    // Use type assertion since InsertUser expects password but OAuth users don't need one
    // storage.createUser detects OAuth users (has googleId/appleId, no password) and sets password to null
    return await this.storage.createUser(userData as any);
  }

  /**
   * Create account linking token for email verification
   */
  private async createAccountLinkingToken(
    userId: string,
    profile: OAuthProfile
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    await this.storage.createAccountLinkingToken({
      userId,
      token,
      provider: profile.provider,
      providerId: profile.providerId,
      providerEmail: profile.email,
      expiresAt,
    });

    return token;
  }

  /**
   * Confirm account linking via email token
   */
  async confirmAccountLinking(token: string): Promise<{ success: boolean; error?: string }> {
    try {
      const linkingToken = await this.storage.getAccountLinkingToken(token);

      if (!linkingToken) {
        return { success: false, error: 'Invalid or expired linking token' };
      }

      if (linkingToken.usedAt) {
        return { success: false, error: 'This linking token has already been used' };
      }

      if (new Date() > linkingToken.expiresAt) {
        return { success: false, error: 'This linking token has expired' };
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

      return { success: true };
    } catch (error) {
      console.error('OAuthService.confirmAccountLinking:', error);
      return { success: false, error: 'Failed to link accounts' };
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
}
