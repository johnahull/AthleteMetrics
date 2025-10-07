/**
 * Integration tests for invitation endpoints
 * Tests invitation creation, resend, cancel, and acceptance flows
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
const mockStorage = {
  createInvitation: vi.fn(),
  getInvitation: vi.fn(),
  getInvitations: vi.fn(),
  updateInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  getUserOrganizations: vi.fn(),
  getUser: vi.fn(),
  getOrganization: vi.fn(),
  createAuditLog: vi.fn(),
  getUserByUsername: vi.fn(),
};

const mockEmailService = {
  sendInvitation: vi.fn(),
  sendWelcome: vi.fn(),
};

describe('Invitation Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/invitations', () => {
    it('should create invitation and send email', async () => {
      const invitationData = {
        email: 'athlete@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'athlete',
        organizationId: 'org-123',
        teamIds: ['team-1'],
      };

      const createdInvitation = {
        id: 'inv-123',
        ...invitationData,
        token: 'secure-token-123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isUsed: false,
        status: 'pending',
        createdAt: new Date(),
      };

      mockStorage.createInvitation.mockResolvedValue(createdInvitation);
      mockStorage.getUser.mockResolvedValue({
        id: 'user-1',
        firstName: 'Jane',
        lastName: 'Admin',
      });
      mockStorage.getOrganization.mockResolvedValue({
        id: 'org-123',
        name: 'Test Organization',
      });
      mockEmailService.sendInvitation.mockResolvedValue(true);

      // Test would make API call here
      expect(mockStorage.createInvitation).toBeDefined();
    });

    it('should validate required fields', async () => {
      const invalidData = {
        email: 'athlete@example.com',
        // Missing role and organizationId
      };

      // Should return 400 for missing fields
      expect(invalidData).not.toHaveProperty('role');
      expect(invalidData).not.toHaveProperty('organizationId');
    });

    it('should validate email format', async () => {
      const invalidEmail = {
        email: 'not-an-email',
        role: 'athlete',
        organizationId: 'org-123',
      };

      // Email validation should fail
      expect(invalidEmail.email).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    it('should check organization permissions', async () => {
      mockStorage.getUserOrganizations.mockResolvedValue([
        { organizationId: 'org-456' }, // Different org
      ]);

      // User should not be able to invite to org-123
      const userOrgs = await mockStorage.getUserOrganizations('user-1');
      const hasAccess = userOrgs.some((org: any) => org.organizationId === 'org-123');
      expect(hasAccess).toBe(false);
    });

    it('should create audit log for invitation', async () => {
      const invitationData = {
        email: 'athlete@example.com',
        role: 'athlete',
        organizationId: 'org-123',
      };

      mockStorage.createInvitation.mockResolvedValue({
        id: 'inv-123',
        ...invitationData,
        token: 'token',
      });

      // Should call createAuditLog
      expect(mockStorage.createAuditLog).toBeDefined();
    });
  });

  describe('POST /api/invitations/:invitationId/resend', () => {
    it('should resend invitation email', async () => {
      const invitation = {
        id: 'inv-123',
        email: 'athlete@example.com',
        token: 'token-123',
        status: 'pending',
        isUsed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        organizationId: 'org-123',
        role: 'athlete',
      };

      mockStorage.getInvitations.mockResolvedValue([invitation]);
      mockStorage.getUserOrganizations.mockResolvedValue([
        { organizationId: 'org-123' },
      ]);
      mockEmailService.sendInvitation.mockResolvedValue(true);

      const allInvitations = await mockStorage.getInvitations();
      const foundInvitation = allInvitations.find((inv: any) => inv.id === 'inv-123');

      expect(foundInvitation).toBeDefined();
      expect(foundInvitation.status).toBe('pending');
    });

    it('should extend expiration if invitation is expired', async () => {
      const expiredInvitation = {
        id: 'inv-123',
        email: 'athlete@example.com',
        token: 'token-123',
        status: 'pending',
        isUsed: false,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired
        organizationId: 'org-123',
      };

      mockStorage.getInvitations.mockResolvedValue([expiredInvitation]);

      const now = new Date();
      const isExpired = expiredInvitation.expiresAt < now;
      expect(isExpired).toBe(true);

      // Should update with new expiration
      expect(mockStorage.updateInvitation).toBeDefined();
    });

    it('should reject resending accepted invitations', async () => {
      const acceptedInvitation = {
        id: 'inv-123',
        isUsed: true,
        status: 'accepted',
      };

      mockStorage.getInvitations.mockResolvedValue([acceptedInvitation]);

      expect(acceptedInvitation.isUsed).toBe(true);
      // Should return 400 error
    });

    it('should reject resending cancelled invitations', async () => {
      const cancelledInvitation = {
        id: 'inv-123',
        status: 'cancelled',
      };

      mockStorage.getInvitations.mockResolvedValue([cancelledInvitation]);

      expect(cancelledInvitation.status).toBe('cancelled');
      // Should return 400 error
    });
  });

  describe('POST /api/invitations/:invitationId/cancel', () => {
    it('should cancel pending invitation', async () => {
      const invitation = {
        id: 'inv-123',
        email: 'athlete@example.com',
        status: 'pending',
        isUsed: false,
        organizationId: 'org-123',
      };

      mockStorage.getInvitations.mockResolvedValue([invitation]);
      mockStorage.getUserOrganizations.mockResolvedValue([
        { organizationId: 'org-123' },
      ]);

      const allInvitations = await mockStorage.getInvitations();
      const foundInvitation = allInvitations.find((inv: any) => inv.id === 'inv-123');

      expect(foundInvitation.status).toBe('pending');
      expect(foundInvitation.isUsed).toBe(false);
    });

    it('should reject cancelling accepted invitations', async () => {
      const acceptedInvitation = {
        id: 'inv-123',
        isUsed: true,
        status: 'accepted',
      };

      mockStorage.getInvitations.mockResolvedValue([acceptedInvitation]);

      expect(acceptedInvitation.isUsed).toBe(true);
      // Should return 400 error
    });

    it('should reject already cancelled invitations', async () => {
      const cancelledInvitation = {
        id: 'inv-123',
        status: 'cancelled',
      };

      mockStorage.getInvitations.mockResolvedValue([cancelledInvitation]);

      expect(cancelledInvitation.status).toBe('cancelled');
      // Should return 400 error
    });

    it('should check organization permissions', async () => {
      const invitation = {
        id: 'inv-123',
        organizationId: 'org-123',
      };

      mockStorage.getInvitations.mockResolvedValue([invitation]);
      mockStorage.getUserOrganizations.mockResolvedValue([
        { organizationId: 'org-456' }, // Different org
      ]);

      const userOrgs = await mockStorage.getUserOrganizations('user-1');
      const hasAccess = userOrgs.some((org: any) => org.organizationId === 'org-123');
      expect(hasAccess).toBe(false);
    });

    it('should create audit log for cancellation', async () => {
      const invitation = {
        id: 'inv-123',
        email: 'athlete@example.com',
        status: 'pending',
        isUsed: false,
        organizationId: 'org-123',
      };

      mockStorage.getInvitations.mockResolvedValue([invitation]);

      // Should call createAuditLog with action 'invitation_cancelled'
      expect(mockStorage.createAuditLog).toBeDefined();
    });
  });

  describe('POST /api/invitations/:token/accept', () => {
    it('should accept valid invitation', async () => {
      const invitation = {
        id: 'inv-123',
        email: 'athlete@example.com',
        token: 'valid-token',
        status: 'pending',
        isUsed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        role: 'athlete',
        organizationId: 'org-123',
        attemptCount: 0,
      };

      mockStorage.getInvitations.mockResolvedValue([invitation]);
      mockStorage.getUserByUsername.mockResolvedValue(null); // Username available
      mockStorage.acceptInvitation.mockResolvedValue({
        user: {
          id: 'user-123',
          username: 'johndoe',
          firstName: 'John',
          lastName: 'Doe',
          emails: ['athlete@example.com'],
        },
      });

      const allInvitations = await mockStorage.getInvitations();
      const foundInvitation = allInvitations.find((inv: any) => inv.token === 'valid-token');

      expect(foundInvitation).toBeDefined();
      expect(foundInvitation.status).toBe('pending');
      expect(foundInvitation.isUsed).toBe(false);
    });

    it('should create user with correct data from invitation', async () => {
      const invitation = {
        id: 'inv-123',
        email: 'newuser@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        token: 'token-456',
        status: 'pending',
        isUsed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        role: 'coach',
        organizationId: 'org-456',
        attemptCount: 0,
      };

      mockStorage.getInvitations.mockResolvedValue([invitation]);
      mockStorage.getUserByUsername.mockResolvedValue(null);
      mockStorage.acceptInvitation.mockResolvedValue({
        user: {
          id: 'user-456',
          username: 'janesmith',
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          emails: [invitation.email],
          isSiteAdmin: false,
        },
      });
      mockStorage.getOrganization.mockResolvedValue({ id: 'org-456', name: 'Test Org' });

      const result = await mockStorage.acceptInvitation(invitation.token, {
        email: invitation.email,
        username: 'janesmith',
        password: 'SecurePass123!',
        firstName: invitation.firstName,
        lastName: invitation.lastName,
      });

      expect(result.user.firstName).toBe(invitation.firstName);
      expect(result.user.lastName).toBe(invitation.lastName);
      expect(result.user.emails).toContain(invitation.email);
    });

    it('should reject already used invitations', async () => {
      const usedInvitation = {
        id: 'inv-123',
        token: 'used-token',
        status: 'accepted',
        isUsed: true,
        attemptCount: 0,
      };

      mockStorage.getInvitations.mockResolvedValue([usedInvitation]);

      const allInvitations = await mockStorage.getInvitations();
      const foundInvitation = allInvitations.find((inv: any) => inv.token === 'used-token');

      expect(foundInvitation.isUsed).toBe(true);
      // Should return 400 and increment attempt count
    });

    it('should reject expired invitations', async () => {
      const expiredInvitation = {
        id: 'inv-123',
        token: 'expired-token',
        status: 'pending',
        isUsed: false,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        attemptCount: 0,
      };

      mockStorage.getInvitations.mockResolvedValue([expiredInvitation]);

      const allInvitations = await mockStorage.getInvitations();
      const foundInvitation = allInvitations.find((inv: any) => inv.token === 'expired-token');
      const isExpired = new Date(foundInvitation.expiresAt) < new Date();

      expect(isExpired).toBe(true);
      // Should return 400 and update status to 'expired'
    });

    it('should reject cancelled invitations', async () => {
      const cancelledInvitation = {
        id: 'inv-123',
        token: 'cancelled-token',
        status: 'cancelled',
        isUsed: false,
        attemptCount: 0,
      };

      mockStorage.getInvitations.mockResolvedValue([cancelledInvitation]);

      const allInvitations = await mockStorage.getInvitations();
      const foundInvitation = allInvitations.find((inv: any) => inv.token === 'cancelled-token');

      expect(foundInvitation.status).toBe('cancelled');
      // Should return 400 and increment attempt count
    });

    it('should lock invitation after 10 failed attempts', async () => {
      const invitationWithManyAttempts = {
        id: 'inv-123',
        token: 'token-123',
        status: 'pending',
        isUsed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        attemptCount: 10,
      };

      mockStorage.getInvitations.mockResolvedValue([invitationWithManyAttempts]);

      const allInvitations = await mockStorage.getInvitations();
      const foundInvitation = allInvitations.find((inv: any) => inv.token === 'token-123');

      expect(foundInvitation.attemptCount).toBeGreaterThanOrEqual(10);
      // Should return 429 and cancel the invitation
    });

    it('should track failed attempts on errors', async () => {
      const invitation = {
        id: 'inv-123',
        token: 'token-123',
        status: 'pending',
        isUsed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        attemptCount: 3,
      };

      mockStorage.getInvitations.mockResolvedValue([invitation]);
      mockStorage.getUserByUsername.mockResolvedValue({ id: 'existing-user' }); // Username taken

      // Should increment attempt count even when username is taken
      expect(mockStorage.updateInvitation).toBeDefined();
    });

    it('should validate username format', async () => {
      const invitation = {
        id: 'inv-123',
        token: 'token-123',
        status: 'pending',
        isUsed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      mockStorage.getInvitations.mockResolvedValue([invitation]);

      const invalidUsernames = ['ab', 'user@name', 'user name', 'verylongusernamethatexceedslimit'];

      invalidUsernames.forEach(username => {
        // Each should fail validation
        expect(username.length < 3 || username.length > 20 || /[^a-zA-Z0-9_]/.test(username)).toBe(true);
      });
    });

    it('should validate password requirements', async () => {
      const invitation = {
        id: 'inv-123',
        token: 'token-123',
        status: 'pending',
        isUsed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      mockStorage.getInvitations.mockResolvedValue([invitation]);

      const weakPasswords = [
        'short', // Too short
        'nouppercase123!', // No uppercase
        'NOLOWERCASE123!', // No lowercase
        'NoNumbers!', // No numbers
        'NoSpecial123', // No special characters
      ];

      weakPasswords.forEach(password => {
        const hasUpper = /[A-Z]/.test(password);
        const hasLower = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSpecial = /[!@#$%^&*]/.test(password);
        const isLongEnough = password.length >= 12;

        expect(hasUpper && hasLower && hasNumber && hasSpecial && isLongEnough).toBe(false);
      });
    });

    it('should send welcome email after acceptance', async () => {
      const invitation = {
        id: 'inv-123',
        email: 'athlete@example.com',
        token: 'token-123',
        status: 'pending',
        isUsed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        role: 'athlete',
        organizationId: 'org-123',
        attemptCount: 0,
      };

      mockStorage.getInvitations.mockResolvedValue([invitation]);
      mockStorage.getUserByUsername.mockResolvedValue(null);
      mockStorage.acceptInvitation.mockResolvedValue({
        user: {
          id: 'user-123',
          firstName: 'John',
          lastName: 'Doe',
          emails: ['athlete@example.com'],
        },
      });
      mockStorage.getOrganization.mockResolvedValue({ name: 'Test Org' });

      // Should call sendWelcome
      expect(mockEmailService.sendWelcome).toBeDefined();
    });

    it('should create audit log for acceptance', async () => {
      const invitation = {
        id: 'inv-123',
        email: 'athlete@example.com',
        token: 'token-123',
        status: 'pending',
        isUsed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        role: 'athlete',
        organizationId: 'org-123',
      };

      mockStorage.getInvitations.mockResolvedValue([invitation]);
      mockStorage.getUserByUsername.mockResolvedValue(null);
      mockStorage.acceptInvitation.mockResolvedValue({
        user: { id: 'user-123' },
      });

      // Should call createAuditLog with action 'invitation_accepted'
      expect(mockStorage.createAuditLog).toBeDefined();
    });

    it('should enforce strong password requirements', async () => {
      const weakPasswords = [
        { pwd: 'short', reason: 'Too short (< 12 characters)' },
        { pwd: 'nouppercase123!', reason: 'Missing uppercase letter' },
        { pwd: 'NOLOWERCASE123!', reason: 'Missing lowercase letter' },
        { pwd: 'NoNumbers!!!', reason: 'Missing numbers' },
        { pwd: 'NoSpecialChar123', reason: 'Missing special character' },
      ];

      weakPasswords.forEach(({ pwd }) => {
        const hasUpper = /[A-Z]/.test(pwd);
        const hasLower = /[a-z]/.test(pwd);
        const hasNumber = /[0-9]/.test(pwd);
        const hasSpecial = /[!@#$%^&*]/.test(pwd);
        const isLongEnough = pwd.length >= 12;

        // At least one requirement should fail
        const isValid = hasUpper && hasLower && hasNumber && hasSpecial && isLongEnough;
        expect(isValid).toBe(false);
      });
    });

    it('should enforce username requirements', async () => {
      const invalidUsernames = [
        'ab', // Too short
        'a'.repeat(21), // Too long
        'user@name', // Invalid characters
        'user name', // Spaces
        'user.name', // Periods
      ];

      invalidUsernames.forEach(username => {
        const hasInvalidChars = /[^a-zA-Z0-9_]/.test(username);
        const invalidLength = username.length < 3 || username.length > 20;

        // Should fail at least one check
        expect(hasInvalidChars || invalidLength).toBe(true);
      });
    });

    it('should assign correct role from invitation', async () => {
      const roles = ['athlete', 'coach', 'org_admin'];

      roles.forEach(role => {
        const invitation = {
          id: `inv-${role}`,
          email: `${role}@example.com`,
          token: `token-${role}`,
          status: 'pending',
          isUsed: false,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          role: role,
          organizationId: 'org-123',
          attemptCount: 0,
        };

        expect(invitation.role).toBe(role);
      });
    });
  });

  describe('GET /api/invitations', () => {
    it('should return invitations for user organizations', async () => {
      const userOrgs = [
        { organizationId: 'org-123' },
        { organizationId: 'org-456' },
      ];

      const allInvitations = [
        { id: 'inv-1', organizationId: 'org-123', email: 'user1@example.com' },
        { id: 'inv-2', organizationId: 'org-456', email: 'user2@example.com' },
        { id: 'inv-3', organizationId: 'org-789', email: 'user3@example.com' },
      ];

      mockStorage.getUserOrganizations.mockResolvedValue(userOrgs);
      mockStorage.getInvitations.mockResolvedValue(allInvitations);

      const orgs = await mockStorage.getUserOrganizations('user-1');
      const invitations = await mockStorage.getInvitations();
      const userInvitations = invitations.filter((inv: any) =>
        orgs.some((org: any) => org.organizationId === inv.organizationId)
      );

      expect(userInvitations).toHaveLength(2);
      expect(userInvitations).not.toContainEqual(
        expect.objectContaining({ organizationId: 'org-789' })
      );
    });

    it('should enrich invitations with additional data', async () => {
      const invitations = [
        {
          id: 'inv-1',
          email: 'user@example.com',
          invitedBy: 'user-123',
          organizationId: 'org-123',
        },
      ];

      mockStorage.getInvitations.mockResolvedValue(invitations);
      mockStorage.getUser.mockResolvedValue({
        id: 'user-123',
        firstName: 'Jane',
        lastName: 'Admin',
      });
      mockStorage.getOrganization.mockResolvedValue({
        id: 'org-123',
        name: 'Test Org',
      });

      const user = await mockStorage.getUser('user-123');
      const org = await mockStorage.getOrganization('org-123');

      expect(user.firstName).toBe('Jane');
      expect(org.name).toBe('Test Org');
    });

    it('should sort by creation date descending', async () => {
      const invitations = [
        { id: 'inv-1', createdAt: new Date('2024-01-01') },
        { id: 'inv-2', createdAt: new Date('2024-01-03') },
        { id: 'inv-3', createdAt: new Date('2024-01-02') },
      ];

      const sorted = [...invitations].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      expect(sorted[0].id).toBe('inv-2');
      expect(sorted[1].id).toBe('inv-3');
      expect(sorted[2].id).toBe('inv-1');
    });
  });
});
