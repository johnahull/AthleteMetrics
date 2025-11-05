// Set environment variables before any imports
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'e13e619e75f862229b549596ba2b5baa327dd8a8a247322bcc6b927542e7d497';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';

// Mock vite module before importing registerRoutes
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';
import * as emailService from '../../packages/api/services/email-service.js';

describe('POST /api/test/send-email - SendGrid Test Endpoint', () => {
  const testEmail = 'test@example.com';
  const adminCredentials = {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || 'TestPassword123!',
  };

  let app: Express;
  let authCookie: string;

  beforeAll(async () => {
    // Create Express app and register routes
    app = express();
    await registerRoutes(app);

    // Login to get session cookie
    const loginResponse = await request(app)
      .post('/api/login')
      .send(adminCredentials);

    if (loginResponse.headers['set-cookie']) {
      authCookie = loginResponse.headers['set-cookie'][0];
    } else {
      // Login failed - likely admin user doesn't exist in test database
      // This is expected for integration tests without full database setup
      console.warn('Login failed -admin user may not exist. Some tests will be skipped.');
      authCookie = '';
    }
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/test/send-email')
        .send({
          emailType: 'invitation',
          recipientEmail: testEmail,
        });

      expect(response.status).toBe(401);
    });

    it('should only be available in development/staging environments', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .post('/api/test/send-email')
        .set('Cookie', authCookie)
        .send({
          emailType: 'invitation',
          recipientEmail: testEmail,
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('not available in production');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Request Validation', () => {
    it('should require emailType parameter', async () => {
      const response = await request(app)
        .post('/api/test/send-email')
        .set('Cookie', authCookie)
        .send({
          recipientEmail: testEmail,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('emailType');
    });

    it('should require recipientEmail parameter', async () => {
      const response = await request(app)
        .post('/api/test/send-email')
        .set('Cookie', authCookie)
        .send({
          emailType: 'invitation',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('recipientEmail');
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/test/send-email')
        .set('Cookie', authCookie)
        .send({
          emailType: 'invitation',
          recipientEmail: 'invalid-email',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('valid email');
    });

    it('should validate emailType is one of allowed types', async () => {
      const response = await request(app)
        .post('/api/test/send-email')
        .set('Cookie', authCookie)
        .send({
          emailType: 'invalid-type',
          recipientEmail: testEmail,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid emailType');
    });
  });

  describe('Email Sending - Invitation', () => {
    it('should send invitation test email successfully', async () => {
      const sendInvitationSpy = vi.spyOn(emailService.emailService, 'sendInvitation');
      sendInvitationSpy.mockResolvedValueOnce(true);

      const response = await request(app)
        .post('/api/test/send-email')
        .set('Cookie', authCookie)
        .send({
          emailType: 'invitation',
          recipientEmail: testEmail,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('sent successfully');
      expect(response.body.emailType).toBe('invitation');
      expect(response.body.recipientEmail).toBe(testEmail);

      expect(sendInvitationSpy).toHaveBeenCalledWith(
        testEmail,
        expect.objectContaining({
          invitationToken: expect.any(String),
          organizationName: 'Test Organization',
          role: 'coach',
        })
      );

      sendInvitationSpy.mockRestore();
    });

    it('should handle SendGrid errors gracefully', async () => {
      const sendInvitationSpy = vi.spyOn(emailService.emailService, 'sendInvitation');
      sendInvitationSpy.mockRejectedValueOnce(new Error('SendGrid API error'));

      const response = await request(app)
        .post('/api/test/send-email')
        .set('Cookie', authCookie)
        .send({
          emailType: 'invitation',
          recipientEmail: testEmail,
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to send test email');

      sendInvitationSpy.mockRestore();
    });
  });

  describe('Email Sending - Welcome', () => {
    it('should send welcome test email successfully', async () => {
      const sendWelcomeSpy = vi.spyOn(emailService.emailService, 'sendWelcome');
      sendWelcomeSpy.mockResolvedValueOnce(true);

      const response = await request(app)
        .post('/api/test/send-email')
        .set('Cookie', authCookie)
        .send({
          emailType: 'welcome',
          recipientEmail: testEmail,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.emailType).toBe('welcome');

      expect(sendWelcomeSpy).toHaveBeenCalledWith(
        testEmail,
        'Test User',
        'Test Organization',
        'coach'
      );

      sendWelcomeSpy.mockRestore();
    });
  });

  describe('Email Sending - Email Verification', () => {
    it('should send email verification test email successfully', async () => {
      const sendVerificationSpy = vi.spyOn(emailService.emailService, 'sendEmailVerification');
      sendVerificationSpy.mockResolvedValueOnce(true);

      const response = await request(app)
        .post('/api/test/send-email')
        .set('Cookie', authCookie)
        .send({
          emailType: 'verification',
          recipientEmail: testEmail,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.emailType).toBe('verification');

      expect(sendVerificationSpy).toHaveBeenCalledWith(
        testEmail,
        'Test User',
        expect.any(String)
      );

      sendVerificationSpy.mockRestore();
    });
  });

  describe('Email Sending - Password Reset', () => {
    it('should send password reset test email successfully', async () => {
      const sendPasswordResetSpy = vi.spyOn(emailService.emailService, 'sendPasswordReset');
      sendPasswordResetSpy.mockResolvedValueOnce(true);

      const response = await request(app)
        .post('/api/test/send-email')
        .set('Cookie', authCookie)
        .send({
          emailType: 'password-reset',
          recipientEmail: testEmail,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.emailType).toBe('password-reset');

      expect(sendPasswordResetSpy).toHaveBeenCalledWith(
        testEmail,
        'Test User',
        expect.any(String)
      );

      sendPasswordResetSpy.mockRestore();
    });
  });

  describe('Configuration Check', () => {
    it('should report when SendGrid is not configured', async () => {
      const sendInvitationSpy = vi.spyOn(emailService.emailService, 'sendInvitation');
      sendInvitationSpy.mockResolvedValueOnce(false); // Simulates missing API key

      const response = await request(app)
        .post('/api/test/send-email')
        .set('Cookie', authCookie)
        .send({
          emailType: 'invitation',
          recipientEmail: testEmail,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('SendGrid is not configured');

      sendInvitationSpy.mockRestore();
    });
  });
});
