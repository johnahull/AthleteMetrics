/**
 * Tests for legal acceptance during OAuth flow
 *
 * REQUIREMENTS:
 * - OAuth flow must ensure new users accept terms
 * - OAuth user creation must include legalAcceptedAt
 * - Audit log entry should be created on OAuth account creation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OAuthService, type OAuthProfile } from '../../services/oauth-service';
import { storage } from '../../storage';

// Mock email service to avoid resend dependency
vi.mock('../../services/email-service', () => ({
  EmailService: vi.fn().mockImplementation(() => ({
    sendAccountLinkingEmail: vi.fn().mockResolvedValue(true),
  })),
}));

describe('OAuth Flow - Legal Acceptance', () => {
  let oauthService: OAuthService;

  beforeEach(() => {
    oauthService = new OAuthService();
    vi.clearAllMocks();
  });

  describe('New OAuth User Creation', () => {
    it('should create new OAuth user with legalAcceptedAt', async () => {
      const profile: OAuthProfile = {
        provider: 'google',
        providerId: 'google-123',
        email: 'john.doe@example.com',
        emailVerified: true,
        firstName: 'John',
        lastName: 'Doe',
      };

      const mockUser = {
        id: 'user-123',
        username: 'john_doe',
        emails: ['john.doe@example.com'],
        firstName: 'John',
        lastName: 'Doe',
      };

      vi.spyOn(storage, 'getUserByGoogleId').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByAppleId').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByEmail').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(null);
      vi.spyOn(storage, 'createUser').mockResolvedValue(mockUser as any);
      vi.spyOn(storage, 'createAuditLog').mockResolvedValue(undefined);

      const result = await oauthService.handleGoogleAuth({
        id: profile.providerId,
        emails: [{ value: profile.email, verified: profile.emailVerified }],
        name: { givenName: profile.firstName, familyName: profile.lastName },
      });

      expect(result.success).toBe(true);
      expect(storage.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          legalAcceptedAt: expect.any(Date),
          legalAcceptedVersion: expect.any(String),
        })
      );
    });

    it('should create audit log for OAuth user legal acceptance', async () => {
      const profile: OAuthProfile = {
        provider: 'google',
        providerId: 'google-123',
        email: 'john.doe@example.com',
        emailVerified: true,
        firstName: 'John',
        lastName: 'Doe',
      };

      const mockUser = {
        id: 'user-123',
        username: 'john_doe',
        emails: ['john.doe@example.com'],
        firstName: 'John',
        lastName: 'Doe',
      };

      vi.spyOn(storage, 'getUserByGoogleId').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByAppleId').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByEmail').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(null);
      vi.spyOn(storage, 'createUser').mockResolvedValue(mockUser as any);
      vi.spyOn(storage, 'createAuditLog').mockResolvedValue(undefined);

      await oauthService.handleGoogleAuth({
        id: profile.providerId,
        emails: [{ value: profile.email, verified: profile.emailVerified }],
        name: { givenName: profile.firstName, familyName: profile.lastName },
      });

      // Should create audit log for legal acceptance
      expect(storage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'legal_accepted',
          userId: 'user-123',
          resourceType: 'user',
          details: expect.stringContaining('oauth'),
        })
      );
    });

    it('should set legalAcceptedVersion to current date (YYYY-MM-DD) for OAuth users', async () => {
      const profile: OAuthProfile = {
        provider: 'apple',
        providerId: 'apple-123',
        email: 'jane.doe@example.com',
        emailVerified: true,
        firstName: 'Jane',
        lastName: 'Doe',
      };

      const mockUser = {
        id: 'user-456',
        username: 'jane_doe',
        emails: ['jane.doe@example.com'],
        firstName: 'Jane',
        lastName: 'Doe',
      };

      vi.spyOn(storage, 'getUserByGoogleId').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByAppleId').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByEmail').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(null);
      vi.spyOn(storage, 'createUser').mockResolvedValue(mockUser as any);
      vi.spyOn(storage, 'createAuditLog').mockResolvedValue(undefined);

      await oauthService.handleAppleAuth({
        id: profile.providerId,
        email: profile.email,
        name: { firstName: profile.firstName, lastName: profile.lastName },
      });

      const expectedVersion = new Date().toISOString().split('T')[0];
      expect(storage.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          legalAcceptedVersion: expectedVersion,
        })
      );
    });

    it('should NOT require legal acceptance for existing OAuth users', async () => {
      const existingUser = {
        id: 'user-existing',
        username: 'existing_user',
        emails: ['existing@example.com'],
        googleId: 'google-existing',
        legalAcceptedAt: new Date('2024-01-01'),
        legalAcceptedVersion: '2024-01-01',
      };

      vi.spyOn(storage, 'getUserByGoogleId').mockResolvedValue(existingUser as any);
      vi.spyOn(storage, 'updateUser').mockResolvedValue(undefined);
      vi.spyOn(storage, 'createUser').mockResolvedValue(existingUser as any);

      const result = await oauthService.handleGoogleAuth({
        id: 'google-existing',
        emails: [{ value: 'existing@example.com', verified: true }],
        name: { givenName: 'Existing', familyName: 'User' },
      });

      expect(result.success).toBe(true);
      // Should NOT create a new user
      expect(storage.createUser).not.toHaveBeenCalled();
    });
  });
});
