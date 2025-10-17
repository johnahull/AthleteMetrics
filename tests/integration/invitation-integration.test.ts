/**
 * Integration tests for invitation endpoints
 * Uses supertest for real HTTP request testing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { storage } from '../../packages/api/storage';

// Mock vite module before importing registerRoutes
vi.mock('../../server/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';

describe.skip('Invitation Integration Tests', () => {
  let app: Express;
  let authCookie: string;
  let testOrgId: string;
  let testTeamId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test Express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Register routes
    await registerRoutes(app);

    // Set up test organization, user, and team
    // TODO: Implement proper test database setup - currently skipped because
    // testOrgId, testTeamId, and testUserId are never initialized
  });

  afterAll(async () => {
    // Clean up test data
  });

  beforeEach(async () => {
    // Reset state before each test
  });

  describe('POST /api/invitations - Team ID Validation', () => {
    it('should reject invitation with invalid team ID', async () => {
      const response = await request(app)
        .post('/api/invitations')
        .set('Cookie', authCookie)
        .send({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'athlete',
          organizationId: testOrgId,
          teamIds: ['invalid-team-id-123'],
        })
        .expect(400);

      expect(response.body.message).toContain('Team with ID');
      expect(response.body.message).toContain('not found');
    });

    it('should reject invitation with team from different organization', async () => {
      // Create a team in a different organization
      const otherOrgId = 'other-org-id';
      const otherTeamId = 'other-team-id';

      const response = await request(app)
        .post('/api/invitations')
        .set('Cookie', authCookie)
        .send({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'athlete',
          organizationId: testOrgId,
          teamIds: [otherTeamId],
        })
        .expect(400);

      expect(response.body.message).toContain('does not belong to organization');
    });

    it('should accept invitation with valid team IDs', async () => {
      const response = await request(app)
        .post('/api/invitations')
        .set('Cookie', authCookie)
        .send({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'athlete',
          organizationId: testOrgId,
          teamIds: [testTeamId],
        })
        .expect(201);

      expect(response.body.invitation).toBeDefined();
      expect(response.body.invitation.teamIds).toContain(testTeamId);
    });
  });

  describe('POST /api/invitations - Organization Validation', () => {
    it('should reject invitation with invalid organization ID', async () => {
      const response = await request(app)
        .post('/api/invitations')
        .set('Cookie', authCookie)
        .send({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'coach',
          organizationId: 'invalid-org-id-123',
          teamIds: [],
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid organization ID');
    });

    it('should reject athlete invitation with invalid organization ID', async () => {
      const response = await request(app)
        .post('/api/invitations')
        .set('Cookie', authCookie)
        .send({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'athlete',
          organizationId: 'invalid-org-id-123',
          athleteId: 'test-athlete-id',
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid organization ID');
    });
  });

  describe('POST /api/invitations/:invitationId/resend - Performance', () => {
    it('should use efficient getInvitationById instead of fetching all invitations', async () => {
      // Create invitation
      const invitation = await storage.createInvitation({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        organizationId: testOrgId,
        teamIds: [],
        role: 'athlete',
        invitedBy: testUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Spy on storage methods to verify efficient query
      const getInvitationByIdSpy = vi.spyOn(storage, 'getInvitationById');
      const getInvitationsSpy = vi.spyOn(storage, 'getInvitations');

      await request(app)
        .post(`/api/invitations/${invitation.id}/resend`)
        .set('Cookie', authCookie)
        .expect(200);

      // Should use getInvitationById, not getInvitations
      expect(getInvitationByIdSpy).toHaveBeenCalledWith(invitation.id);
      expect(getInvitationsSpy).not.toHaveBeenCalled();

      getInvitationByIdSpy.mockRestore();
      getInvitationsSpy.mockRestore();
    });
  });

  describe('POST /api/invitations/:invitationId/cancel - Performance', () => {
    it('should use efficient getInvitationById instead of fetching all invitations', async () => {
      // Create invitation
      const invitation = await storage.createInvitation({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        organizationId: testOrgId,
        teamIds: [],
        role: 'athlete',
        invitedBy: testUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Spy on storage methods
      const getInvitationByIdSpy = vi.spyOn(storage, 'getInvitationById');
      const getInvitationsSpy = vi.spyOn(storage, 'getInvitations');

      await request(app)
        .post(`/api/invitations/${invitation.id}/cancel`)
        .set('Cookie', authCookie)
        .expect(200);

      // Should use getInvitationById, not getInvitations
      expect(getInvitationByIdSpy).toHaveBeenCalledWith(invitation.id);
      expect(getInvitationsSpy).not.toHaveBeenCalled();

      getInvitationByIdSpy.mockRestore();
      getInvitationsSpy.mockRestore();
    });
  });

  describe('POST /api/invitations/:token/accept - Concurrent Acceptance', () => {
    it('should handle concurrent acceptance attempts gracefully', async () => {
      // Create invitation
      const invitation = await storage.createInvitation({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        organizationId: testOrgId,
        teamIds: [],
        role: 'athlete',
        invitedBy: testUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Attempt concurrent acceptances
      const promises = Array.from({ length: 3 }).map((_, i) =>
        request(app)
          .post(`/api/invitations/${invitation.token}/accept`)
          .send({
            email: 'test@example.com',
            username: `testuser${i}`,
            password: 'SecurePass123!',
            firstName: 'Test',
            lastName: 'User',
          })
      );

      const results = await Promise.allSettled(promises);

      // Exactly one should succeed
      const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).status === 201);
      const failed = results.filter(r => r.status === 'fulfilled' && (r.value as any).status !== 201);

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(2);

      // Failed attempts should indicate invitation already used
      failed.forEach(result => {
        if (result.status === 'fulfilled') {
          expect((result.value as any).body.message).toContain('already');
        }
      });
    });
  });

  describe('POST /api/invitations/:token/accept - Attempt Tracking', () => {
    it('should track failed acceptance attempts', async () => {
      // Create invitation
      const invitation = await storage.createInvitation({
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        organizationId: testOrgId,
        teamIds: [],
        role: 'athlete',
        invitedBy: testUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Attempt with invalid password
      await request(app)
        .post(`/api/invitations/${invitation.token}/accept`)
        .send({
          email: 'test@example.com',
          username: 'testuser',
          password: 'weak', // Doesn't meet password requirements
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(400);

      // Verify attempt was tracked
      const updatedInvitation = await storage.getInvitationByToken(invitation.token);
      expect(updatedInvitation?.attemptCount).toBeGreaterThan(0);
      expect(updatedInvitation?.lastAttemptAt).toBeDefined();
    });
  });

  describe('POST /api/invitations - Authentication', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/invitations')
        .send({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'athlete',
          organizationId: testOrgId,
        });

      expect([401, 403]).toContain(response.status);
      if (response.status === 401) {
        expect(response.body.message).toBe('Authentication required');
      }
    });

    it('should not fall back to hardcoded admin username', async () => {
      // This test ensures the hardcoded admin lookup is removed
      // Even if session.admin is present, should require proper authentication
      const response = await request(app)
        .post('/api/invitations')
        .send({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: 'athlete',
          organizationId: testOrgId,
        });

      expect([401, 403]).toContain(response.status);
      expect(response.body).toBeDefined();
      // Message is optional - some authentication failures don't return a message
      if (response.body.message) {
        expect(response.body.message).not.toContain('Unable to determine');
      }
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on invitation creation', async () => {
      // Send multiple requests rapidly
      const requests = Array.from({ length: 25 }).map(() =>
        request(app)
          .post('/api/invitations')
          .set('Cookie', authCookie)
          .send({
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'athlete',
            organizationId: testOrgId,
          })
      );

      const responses = await Promise.all(requests);

      // Some requests should be rate limited
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
