/**
 * Tests for legal acceptance during registration flow
 *
 * REQUIREMENTS:
 * - Registration page must have legal acceptance checkbox
 * - Registration API must require legalAcceptedAt
 * - Audit log entry should be created on acceptance
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { storage } from '../../storage';
import { registerRegistrationRoutes } from '../../routes/registration-routes';
import { AUDIT_ACTION_LEGAL_ACCEPTED } from '@shared/legal-acceptance';

// Mock email service to avoid resend dependency.
// Must export both the EmailService class (used by CoppaService) and the emailService singleton.
vi.mock('../../services/email-service', () => {
  const mockMethods = {
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
  };
  return {
    EmailService: vi.fn().mockImplementation(() => mockMethods),
    emailService: mockMethods,
  };
});

describe('Registration Flow - Legal Acceptance', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerRegistrationRoutes(app);
    vi.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should reject registration without legalAcceptedAt', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          username: 'johndoe',
          password: 'SecurePassword123!',
          // Missing legalAcceptedAt
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        message: 'Validation failed'
      });
      // Check that the error is specifically about legal acceptance
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'legalAcceptedAt',
            message: 'Required'
          })
        ])
      );
    });

    it('should accept registration with legalAcceptedAt', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'johndoe',
        firstName: 'John',
        lastName: 'Doe',
        emails: ['john.doe@example.com'],
        isEmailVerified: false,
      };

      vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByEmail').mockResolvedValue(null);
      vi.spyOn(storage, 'createUser').mockResolvedValue(mockUser as any);
      vi.spyOn(storage, 'createEmailVerificationToken').mockResolvedValue({ token: 'token-123', expiresAt: new Date() });
      // Mock createAuditLog to return objects with id (implementation expects .id property)
      vi.spyOn(storage, 'createAuditLog').mockResolvedValue({ id: 'audit-log-1' } as any);

      const legalAcceptedAt = new Date().toISOString();
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          username: 'johndoe',
          password: 'SecurePassword123!',
          legalAcceptedAt,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      // Verify user was created with legal acceptance fields
      expect(storage.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          legalAcceptedAt: expect.any(Date),
          legalAcceptedVersion: expect.any(String),
        })
      );
    });

    it('should create audit log entry for legal acceptance', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'johndoe',
        firstName: 'John',
        lastName: 'Doe',
        emails: ['john.doe@example.com'],
        isEmailVerified: false,
      };

      vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByEmail').mockResolvedValue(null);
      vi.spyOn(storage, 'createUser').mockResolvedValue(mockUser as any);
      vi.spyOn(storage, 'createEmailVerificationToken').mockResolvedValue({ token: 'token-123', expiresAt: new Date() });
      // Mock createAuditLog to return objects with id (implementation expects .id property)
      vi.spyOn(storage, 'createAuditLog').mockResolvedValue({ id: 'audit-log-1' } as any);

      const legalAcceptedAt = new Date().toISOString();
      await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          username: 'johndoe',
          password: 'SecurePassword123!',
          legalAcceptedAt,
        });

      // Verify audit log was created for legal acceptance
      expect(storage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTION_LEGAL_ACCEPTED,
          userId: 'user-123',
          resourceType: 'user',
          details: expect.stringContaining('registration'),
        })
      );
    });

    it('should set legalAcceptedVersion to current date (YYYY-MM-DD)', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'johndoe',
        firstName: 'John',
        lastName: 'Doe',
        emails: ['john.doe@example.com'],
        isEmailVerified: false,
      };

      vi.spyOn(storage, 'getUserByUsername').mockResolvedValue(null);
      vi.spyOn(storage, 'getUserByEmail').mockResolvedValue(null);
      vi.spyOn(storage, 'createUser').mockResolvedValue(mockUser as any);
      vi.spyOn(storage, 'createEmailVerificationToken').mockResolvedValue({ token: 'token-123', expiresAt: new Date() });
      // Mock createAuditLog to return objects with id (implementation expects .id property)
      vi.spyOn(storage, 'createAuditLog').mockResolvedValue({ id: 'audit-log-1' } as any);

      const legalAcceptedAt = new Date().toISOString();
      await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          username: 'johndoe',
          password: 'SecurePassword123!',
          legalAcceptedAt,
        });

      const expectedVersion = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      expect(storage.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          legalAcceptedVersion: expectedVersion,
        })
      );
    });
  });
});
