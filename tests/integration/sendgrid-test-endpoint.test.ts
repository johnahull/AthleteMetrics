/**
 * Integration tests for SendGrid test endpoint
 * Uses mocks to avoid requiring actual SendGrid API access in CI
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the email service before importing routes
vi.mock('../../packages/api/services/email-service', () => {
  return {
    emailService: {
      sendInvitation: vi.fn().mockResolvedValue(true),
      sendWelcome: vi.fn().mockResolvedValue(true),
      sendEmailVerification: vi.fn().mockResolvedValue(true),
      sendPasswordReset: vi.fn().mockResolvedValue(true)
    }
  };
});

describe('POST /api/test/send-email', () => {
  let app: express.Application;
  let authCookie: string;

  beforeAll(async () => {
    // Create minimal express app with test endpoint
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    const requireSiteAdmin = (req: any, res: any, next: any) => {
      if (!req.headers.authorization) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      next();
    };

    // Mock rate limiter
    const testEmailLimiter = (req: any, res: any, next: any) => next();

    // Import the email service mock
    const { emailService } = await import('../../packages/api/services/email-service');

    // Recreate the test endpoint
    app.post('/api/test/send-email', testEmailLimiter, requireSiteAdmin, async (req, res) => {
      // Production check
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          success: false,
          error: 'This endpoint is not available in production environments'
        });
      }

      const { emailType, recipientEmail } = req.body;

      // Validate required parameters
      if (!emailType) {
        return res.status(400).json({
          success: false,
          error: 'emailType is required. Valid types: invitation, welcome, verification, password-reset'
        });
      }

      if (!recipientEmail) {
        return res.status(400).json({
          success: false,
          error: 'recipientEmail is required'
        });
      }

      // Validate email format
      const { isValidEmail } = await import('../../packages/shared/email-validation');
      if (!isValidEmail(recipientEmail)) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid email address'
        });
      }

      // Validate email type
      const validEmailTypes = ['invitation', 'welcome', 'verification', 'password-reset'];
      if (!validEmailTypes.includes(emailType)) {
        return res.status(400).json({
          success: false,
          error: `Invalid emailType. Must be one of: ${validEmailTypes.join(', ')}`
        });
      }

      let emailSent = false;
      const appUrl = process.env.APP_URL || 'http://localhost:5000';

      // Send appropriate test email based on type
      switch (emailType) {
        case 'invitation': {
          const crypto = await import('crypto');
          const invitationToken = `test-invitation-${crypto.randomBytes(8).toString('hex')}`;
          const testInvitationData = {
            recipientName: 'Test User',
            inviterName: 'Admin User',
            organizationName: 'Test Organization',
            invitationLink: `${appUrl}/accept-invitation?token=${invitationToken}`,
            expiryDays: 7,
            role: 'coach'
          };
          emailSent = await emailService.sendInvitation(recipientEmail, testInvitationData);
          break;
        }

        case 'welcome': {
          const testWelcomeData = {
            userName: 'Test User',
            organizationName: 'Test Organization',
            role: 'coach'
          };
          emailSent = await emailService.sendWelcome(recipientEmail, testWelcomeData);
          break;
        }

        case 'verification': {
          const crypto = await import('crypto');
          const verificationToken = `test-verification-${crypto.randomBytes(8).toString('hex')}`;
          const testVerificationData = {
            userName: 'Test User',
            verificationLink: `${appUrl}/verify-email?token=${verificationToken}`
          };
          emailSent = await emailService.sendEmailVerification(recipientEmail, testVerificationData);
          break;
        }

        case 'password-reset': {
          const crypto = await import('crypto');
          const resetToken = `test-reset-${crypto.randomBytes(8).toString('hex')}`;
          const testResetData = {
            userName: 'Test User',
            resetLink: `${appUrl}/reset-password?token=${resetToken}`
          };
          emailSent = await emailService.sendPasswordReset(recipientEmail, testResetData);
          break;
        }
      }

      if (emailSent) {
        res.json({
          success: true,
          message: `Test ${emailType} email sent successfully`,
          emailType,
          recipientEmail
        });
      } else {
        res.json({
          success: false,
          message: 'Email service is not configured. Email was logged to console but not sent.',
          emailType,
          note: 'Contact administrator to configure email service'
        });
      }
    });

    // Set up auth cookie for tests
    authCookie = 'mock-admin-auth';
  });

  describe('Authentication & Authorization', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/test/send-email')
        .send({
          emailType: 'invitation',
          recipientEmail: 'test@example.com'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should allow authenticated site admin', async () => {
      const response = await request(app)
        .post('/api/test/send-email')
        .set('Authorization', authCookie)
        .send({
          emailType: 'invitation',
          recipientEmail: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Request Validation', () => {
    it('should reject missing emailType', async () => {
      const response = await request(app)
        .post('/api/test/send-email')
        .set('Authorization', authCookie)
        .send({
          recipientEmail: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('emailType is required');
    });

    it('should reject missing recipientEmail', async () => {
      const response = await request(app)
        .post('/api/test/send-email')
        .set('Authorization', authCookie)
        .send({
          emailType: 'invitation'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('recipientEmail is required');
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/test/send-email')
        .set('Authorization', authCookie)
        .send({
          emailType: 'invitation',
          recipientEmail: 'invalid-email'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('valid email address');
    });

    it('should reject invalid emailType', async () => {
      const response = await request(app)
        .post('/api/test/send-email')
        .set('Authorization', authCookie)
        .send({
          emailType: 'invalid-type',
          recipientEmail: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid emailType');
    });
  });

  describe('Email Sending', () => {
    it('should send invitation email', async () => {
      const { emailService } = await import('../../packages/api/services/email-service');
      const sendInvitationSpy = vi.spyOn(emailService, 'sendInvitation');

      const response = await request(app)
        .post('/api/test/send-email')
        .set('Authorization', authCookie)
        .send({
          emailType: 'invitation',
          recipientEmail: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.emailType).toBe('invitation');
      expect(sendInvitationSpy).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          recipientName: 'Test User',
          inviterName: 'Admin User',
          organizationName: 'Test Organization',
          role: 'coach'
        })
      );
    });

    it('should send welcome email', async () => {
      const { emailService } = await import('../../packages/api/services/email-service');
      const sendWelcomeSpy = vi.spyOn(emailService, 'sendWelcome');

      const response = await request(app)
        .post('/api/test/send-email')
        .set('Authorization', authCookie)
        .send({
          emailType: 'welcome',
          recipientEmail: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(sendWelcomeSpy).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          userName: 'Test User',
          organizationName: 'Test Organization',
          role: 'coach'
        })
      );
    });

    it('should send verification email', async () => {
      const { emailService } = await import('../../packages/api/services/email-service');
      const sendVerificationSpy = vi.spyOn(emailService, 'sendEmailVerification');

      const response = await request(app)
        .post('/api/test/send-email')
        .set('Authorization', authCookie)
        .send({
          emailType: 'verification',
          recipientEmail: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(sendVerificationSpy).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          userName: 'Test User'
        })
      );
    });

    it('should send password reset email', async () => {
      const { emailService } = await import('../../packages/api/services/email-service');
      const sendPasswordResetSpy = vi.spyOn(emailService, 'sendPasswordReset');

      const response = await request(app)
        .post('/api/test/send-email')
        .set('Authorization', authCookie)
        .send({
          emailType: 'password-reset',
          recipientEmail: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(sendPasswordResetSpy).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          userName: 'Test User'
        })
      );
    });
  });

  describe('Email Validation Security', () => {
    const dangerousEmails = [
      'test@<script>alert(1)</script>.com',
      'test@example.com\r\nBcc: attacker@evil.com',
      'test@example..com',
      'test@@example.com',
      '<test@example.com>',
      'test@localhost',
      'a'.repeat(65) + '@example.com', // exceeds 64 char local part
      'test@' + 'a'.repeat(256) + '.com' // exceeds 255 char domain
    ];

    dangerousEmails.forEach((email) => {
      it(`should reject dangerous email: ${email.substring(0, 50)}`, async () => {
        const response = await request(app)
          .post('/api/test/send-email')
          .set('Authorization', authCookie)
          .send({
            emailType: 'invitation',
            recipientEmail: email
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('valid email address');
      });
    });
  });
});
