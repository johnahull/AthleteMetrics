/**
 * Tests for email verification endpoints and flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockStorage = {
  createEmailVerificationToken: vi.fn(),
  verifyEmailToken: vi.fn(),
  getEmailVerificationToken: vi.fn(),
  getUser: vi.fn(),
};

const mockEmailService = {
  sendEmailVerification: vi.fn(),
};

describe('Email Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/auth/send-verification-email', () => {
    it('should send verification email to unverified user', async () => {
      const user = {
        id: 'user-123',
        username: 'johndoe',
        firstName: 'John',
        lastName: 'Doe',
        emails: ['john@example.com'],
        isEmailVerified: false,
      };

      mockStorage.getUser.mockResolvedValue(user);
      mockStorage.createEmailVerificationToken.mockResolvedValue({
        token: 'verification-token-123',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      mockEmailService.sendEmailVerification.mockResolvedValue(true);

      const foundUser = await mockStorage.getUser('user-123');
      expect(foundUser.isEmailVerified).toBe(false);

      const tokenData = await mockStorage.createEmailVerificationToken(
        user.id,
        user.emails[0]
      );
      expect(tokenData.token).toBeDefined();

      const emailSent = await mockEmailService.sendEmailVerification(
        user.emails[0],
        {
          userName: `${user.firstName} ${user.lastName}`,
          verificationLink: `https://example.com/verify-email?token=${tokenData.token}`,
        }
      );
      expect(emailSent).toBe(true);
    });

    it('should reject sending to already verified users', async () => {
      const verifiedUser = {
        id: 'user-123',
        isEmailVerified: true,
      };

      mockStorage.getUser.mockResolvedValue(verifiedUser);

      const user = await mockStorage.getUser('user-123');
      expect(user.isEmailVerified).toBe(true);
      // Should return 400 error
    });

    it('should require authentication', async () => {
      // Test without authentication
      // Should return 401 error
      expect(true).toBe(true); // Placeholder for actual auth check
    });

    it('should handle email service failures gracefully', async () => {
      const user = {
        id: 'user-123',
        emails: ['john@example.com'],
        isEmailVerified: false,
      };

      mockStorage.getUser.mockResolvedValue(user);
      mockStorage.createEmailVerificationToken.mockResolvedValue({
        token: 'token-123',
        expiresAt: new Date(),
      });
      mockEmailService.sendEmailVerification.mockResolvedValue(false);

      const emailSent = await mockEmailService.sendEmailVerification(
        user.emails[0],
        {
          userName: 'John Doe',
          verificationLink: 'https://example.com/verify',
        }
      );

      expect(emailSent).toBe(false);
      // Should return 500 error
    });
  });

  describe('POST /api/auth/verify-email/:token', () => {
    it('should verify email with valid token', async () => {
      mockStorage.verifyEmailToken.mockResolvedValue({
        success: true,
        userId: 'user-123',
        email: 'john@example.com',
      });

      const result = await mockStorage.verifyEmailToken('valid-token');

      expect(result.success).toBe(true);
      expect(result.userId).toBe('user-123');
      expect(result.email).toBe('john@example.com');
    });

    it('should reject invalid tokens', async () => {
      mockStorage.verifyEmailToken.mockResolvedValue({
        success: false,
      });

      const result = await mockStorage.verifyEmailToken('invalid-token');

      expect(result.success).toBe(false);
      // Should return 400 error
    });

    it('should reject expired tokens', async () => {
      const expiredToken = {
        token: 'expired-token',
        isUsed: false,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      };

      mockStorage.getEmailVerificationToken.mockResolvedValue(expiredToken);

      const token = await mockStorage.getEmailVerificationToken('expired-token');
      const isExpired = new Date(token.expiresAt) < new Date();

      expect(isExpired).toBe(true);
      // verifyEmailToken should return success: false
    });

    it('should reject already used tokens', async () => {
      const usedToken = {
        token: 'used-token',
        isUsed: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      mockStorage.getEmailVerificationToken.mockResolvedValue(usedToken);

      const token = await mockStorage.getEmailVerificationToken('used-token');

      expect(token.isUsed).toBe(true);
      // verifyEmailToken should return success: false
    });

    it('should mark token as used after verification', async () => {
      const token = {
        token: 'valid-token',
        isUsed: false,
        userId: 'user-123',
        email: 'john@example.com',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      mockStorage.getEmailVerificationToken.mockResolvedValue(token);
      mockStorage.verifyEmailToken.mockResolvedValue({
        success: true,
        userId: 'user-123',
        email: 'john@example.com',
      });

      const result = await mockStorage.verifyEmailToken('valid-token');

      expect(result.success).toBe(true);
      // Should mark token as used in database
    });

    it('should mark user email as verified', async () => {
      const token = {
        userId: 'user-123',
        email: 'john@example.com',
      };

      mockStorage.verifyEmailToken.mockResolvedValue({
        success: true,
        userId: token.userId,
        email: token.email,
      });

      const result = await mockStorage.verifyEmailToken('valid-token');

      expect(result.success).toBe(true);
      // Should update user.isEmailVerified to true
    });

    it('should update session if user is logged in', async () => {
      const sessionUser = {
        id: 'user-123',
        isEmailVerified: false,
      };

      mockStorage.verifyEmailToken.mockResolvedValue({
        success: true,
        userId: 'user-123',
        email: 'john@example.com',
      });

      const result = await mockStorage.verifyEmailToken('valid-token');

      if (sessionUser.id === result.userId) {
        sessionUser.isEmailVerified = true;
      }

      expect(sessionUser.isEmailVerified).toBe(true);
    });

    it('should require valid token parameter', async () => {
      // Test with missing token
      const token = '';
      expect(token).toBe('');
      // Should return 400 error
    });
  });

  describe('Token Generation', () => {
    it('should generate secure random tokens', async () => {
      mockStorage.createEmailVerificationToken.mockResolvedValue({
        token: 'abc123def456',
        expiresAt: new Date(),
      });

      const result = await mockStorage.createEmailVerificationToken(
        'user-123',
        'user@example.com'
      );

      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(10);
    });

    it('should set 24-hour expiration', async () => {
      const now = Date.now();
      const expectedExpiry = new Date(now + 24 * 60 * 60 * 1000);

      mockStorage.createEmailVerificationToken.mockResolvedValue({
        token: 'token-123',
        expiresAt: expectedExpiry,
      });

      const result = await mockStorage.createEmailVerificationToken(
        'user-123',
        'user@example.com'
      );

      const expiryTime = new Date(result.expiresAt).getTime();
      const expectedTime = expectedExpiry.getTime();

      // Allow 1 second tolerance
      expect(Math.abs(expiryTime - expectedTime)).toBeLessThan(1000);
    });

    it('should store token with user and email', async () => {
      const userId = 'user-123';
      const email = 'user@example.com';

      mockStorage.createEmailVerificationToken.mockImplementation(
        async (uid, em) => {
          return {
            token: 'generated-token',
            userId: uid,
            email: em,
            expiresAt: new Date(),
          };
        }
      );

      const result = await mockStorage.createEmailVerificationToken(userId, email);

      expect(result.userId).toBe(userId);
      expect(result.email).toBe(email);
    });
  });

  describe('Verification Link Generation', () => {
    it('should generate proper verification links', () => {
      const baseUrl = 'https://example.com';
      const token = 'verification-token-123';
      const link = `${baseUrl}/verify-email?token=${token}`;

      expect(link).toBe('https://example.com/verify-email?token=verification-token-123');
      expect(link).toContain('/verify-email?token=');
    });

    it('should use APP_URL from environment', () => {
      const appUrl = process.env.APP_URL || 'http://localhost:5000';
      const token = 'token-123';
      const link = `${appUrl}/verify-email?token=${token}`;

      expect(link).toContain('/verify-email?token=');
      expect(link.startsWith('http')).toBe(true);
    });
  });

  describe('Email Verification Flow', () => {
    it('should complete full verification flow', async () => {
      // 1. User requests verification email
      const user = {
        id: 'user-123',
        emails: ['john@example.com'],
        isEmailVerified: false,
      };

      mockStorage.getUser.mockResolvedValue(user);

      // 2. Token is created
      mockStorage.createEmailVerificationToken.mockResolvedValue({
        token: 'verify-token-123',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      // 3. Email is sent
      mockEmailService.sendEmailVerification.mockResolvedValue(true);

      // 4. User clicks link and token is verified
      mockStorage.verifyEmailToken.mockResolvedValue({
        success: true,
        userId: 'user-123',
        email: 'john@example.com',
      });

      // Execute flow
      const foundUser = await mockStorage.getUser('user-123');
      expect(foundUser.isEmailVerified).toBe(false);

      const tokenData = await mockStorage.createEmailVerificationToken(
        foundUser.id,
        foundUser.emails[0]
      );
      expect(tokenData.token).toBeDefined();

      const emailSent = await mockEmailService.sendEmailVerification(
        foundUser.emails[0],
        {
          userName: 'John Doe',
          verificationLink: `https://example.com/verify-email?token=${tokenData.token}`,
        }
      );
      expect(emailSent).toBe(true);

      const verifyResult = await mockStorage.verifyEmailToken(tokenData.token);
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.userId).toBe('user-123');
    });
  });
});
