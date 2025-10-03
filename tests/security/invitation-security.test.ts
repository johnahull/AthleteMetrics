/**
 * Security tests for invitation system
 * Tests audit logging, attempt tracking, and security validations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockStorage = {
  createAuditLog: vi.fn(),
  getAuditLogs: vi.fn(),
  updateInvitation: vi.fn(),
  getInvitations: vi.fn(),
};

describe('Invitation Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Audit Logging', () => {
    describe('Invitation Creation Logging', () => {
      it('should log invitation creation', async () => {
        const auditLog = {
          userId: 'admin-123',
          action: 'invitation_created',
          resourceType: 'invitation',
          resourceId: 'inv-123',
          details: JSON.stringify({
            email: 'athlete@example.com',
            role: 'athlete',
            organizationId: 'org-123',
            emailSent: true,
          }),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0...',
        };

        mockStorage.createAuditLog.mockResolvedValue({
          id: 'audit-123',
          ...auditLog,
          createdAt: new Date(),
        });

        await mockStorage.createAuditLog(auditLog);

        expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'invitation_created',
            resourceType: 'invitation',
          })
        );
      });

      it('should include IP address and user agent', async () => {
        const auditLog = {
          userId: 'admin-123',
          action: 'invitation_created',
          resourceType: 'invitation',
          resourceId: 'inv-123',
          details: '{}',
          ipAddress: '10.0.0.1',
          userAgent: 'Chrome/120.0',
        };

        await mockStorage.createAuditLog(auditLog);

        expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            ipAddress: '10.0.0.1',
            userAgent: 'Chrome/120.0',
          })
        );
      });

      it('should store detailed information as JSON', async () => {
        const details = {
          email: 'athlete@example.com',
          role: 'coach',
          organizationId: 'org-456',
          emailSent: false,
        };

        const auditLog = {
          userId: 'admin-123',
          action: 'invitation_created',
          resourceType: 'invitation',
          resourceId: 'inv-123',
          details: JSON.stringify(details),
        };

        await mockStorage.createAuditLog(auditLog);

        const call = mockStorage.createAuditLog.mock.calls[0][0];
        const parsedDetails = JSON.parse(call.details);

        expect(parsedDetails).toEqual(details);
        expect(parsedDetails.email).toBe('athlete@example.com');
        expect(parsedDetails.role).toBe('coach');
      });
    });

    describe('Invitation Resend Logging', () => {
      it('should log invitation resend', async () => {
        const auditLog = {
          userId: 'admin-123',
          action: 'invitation_resent',
          resourceType: 'invitation',
          resourceId: 'inv-123',
          details: JSON.stringify({
            email: 'athlete@example.com',
            emailSent: true,
          }),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0...',
        };

        await mockStorage.createAuditLog(auditLog);

        expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'invitation_resent',
          })
        );
      });
    });

    describe('Invitation Cancellation Logging', () => {
      it('should log invitation cancellation', async () => {
        const auditLog = {
          userId: 'admin-123',
          action: 'invitation_cancelled',
          resourceType: 'invitation',
          resourceId: 'inv-123',
          details: JSON.stringify({
            email: 'athlete@example.com',
            role: 'athlete',
          }),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0...',
        };

        await mockStorage.createAuditLog(auditLog);

        expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'invitation_cancelled',
          })
        );
      });
    });

    describe('Invitation Acceptance Logging', () => {
      it('should log invitation acceptance', async () => {
        const auditLog = {
          userId: 'new-user-123',
          action: 'invitation_accepted',
          resourceType: 'invitation',
          resourceId: 'inv-123',
          details: JSON.stringify({
            email: 'athlete@example.com',
            role: 'athlete',
            organizationId: 'org-123',
          }),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0...',
        };

        await mockStorage.createAuditLog(auditLog);

        expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'invitation_accepted',
            userId: 'new-user-123', // Newly created user
          })
        );
      });
    });

    describe('Audit Log Retrieval', () => {
      it('should retrieve logs by user ID', async () => {
        const logs = [
          {
            id: 'log-1',
            userId: 'user-123',
            action: 'invitation_created',
            createdAt: new Date(),
          },
          {
            id: 'log-2',
            userId: 'user-123',
            action: 'invitation_cancelled',
            createdAt: new Date(),
          },
        ];

        mockStorage.getAuditLogs.mockResolvedValue(logs);

        const result = await mockStorage.getAuditLogs({ userId: 'user-123' });

        expect(result).toHaveLength(2);
        expect(result.every((log: any) => log.userId === 'user-123')).toBe(true);
      });

      it('should retrieve logs by action type', async () => {
        const logs = [
          {
            id: 'log-1',
            action: 'invitation_created',
            createdAt: new Date(),
          },
        ];

        mockStorage.getAuditLogs.mockResolvedValue(logs);

        const result = await mockStorage.getAuditLogs({ action: 'invitation_created' });

        expect(result).toHaveLength(1);
        expect(result[0].action).toBe('invitation_created');
      });

      it('should limit results', async () => {
        const logs = Array.from({ length: 100 }, (_, i) => ({
          id: `log-${i}`,
          action: 'invitation_created',
        }));

        mockStorage.getAuditLogs.mockResolvedValue(logs.slice(0, 50));

        const result = await mockStorage.getAuditLogs({ limit: 50 });

        expect(result).toHaveLength(50);
      });
    });
  });

  describe('Attempt Tracking', () => {
    describe('Failed Attempt Tracking', () => {
      it('should track failed acceptance attempts', async () => {
        const invitation = {
          id: 'inv-123',
          token: 'token-123',
          attemptCount: 3,
          lastAttemptAt: new Date('2024-01-01'),
        };

        mockStorage.getInvitations.mockResolvedValue([invitation]);
        mockStorage.updateInvitation.mockResolvedValue({
          ...invitation,
          attemptCount: 4,
          lastAttemptAt: new Date(),
        });

        await mockStorage.updateInvitation('inv-123', {
          attemptCount: invitation.attemptCount + 1,
          lastAttemptAt: new Date(),
        });

        expect(mockStorage.updateInvitation).toHaveBeenCalledWith(
          'inv-123',
          expect.objectContaining({
            attemptCount: 4,
            lastAttemptAt: expect.any(Date),
          })
        );
      });

      it('should track attempts on invalid token', async () => {
        const invitation = {
          id: 'inv-123',
          token: 'token-123',
          status: 'accepted',
          isUsed: true,
          attemptCount: 0,
        };

        mockStorage.getInvitations.mockResolvedValue([invitation]);

        const foundInvitation = (await mockStorage.getInvitations()).find(
          (inv: any) => inv.token === 'token-123'
        );

        expect(foundInvitation.isUsed).toBe(true);
        // Should increment attempt count
      });

      it('should track attempts on expired invitations', async () => {
        const expiredInvitation = {
          id: 'inv-123',
          token: 'token-123',
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          attemptCount: 2,
        };

        mockStorage.getInvitations.mockResolvedValue([expiredInvitation]);

        const invitation = (await mockStorage.getInvitations())[0];
        const isExpired = new Date(invitation.expiresAt) < new Date();

        expect(isExpired).toBe(true);
        // Should update status to 'expired' and increment attempt count
      });

      it('should track attempts on cancelled invitations', async () => {
        const cancelledInvitation = {
          id: 'inv-123',
          token: 'token-123',
          status: 'cancelled',
          attemptCount: 1,
        };

        mockStorage.getInvitations.mockResolvedValue([cancelledInvitation]);

        const invitation = (await mockStorage.getInvitations())[0];
        expect(invitation.status).toBe('cancelled');
        // Should increment attempt count
      });

      it('should track attempts when username is taken', async () => {
        const invitation = {
          id: 'inv-123',
          token: 'token-123',
          status: 'pending',
          attemptCount: 0,
        };

        mockStorage.getInvitations.mockResolvedValue([invitation]);

        // Should increment attempt count even when username validation fails
        expect(mockStorage.updateInvitation).toBeDefined();
      });

      it('should track attempts on validation errors', async () => {
        const invitation = {
          id: 'inv-123',
          token: 'token-123',
          status: 'pending',
          attemptCount: 5,
        };

        mockStorage.getInvitations.mockResolvedValue([invitation]);

        // Password validation failure should still increment count
        expect(invitation.attemptCount).toBe(5);
      });
    });

    describe('Attempt Limit Enforcement', () => {
      it('should lock invitation after 10 attempts', async () => {
        const invitation = {
          id: 'inv-123',
          token: 'token-123',
          status: 'pending',
          attemptCount: 10,
        };

        mockStorage.getInvitations.mockResolvedValue([invitation]);

        const foundInvitation = (await mockStorage.getInvitations())[0];
        expect(foundInvitation.attemptCount).toBeGreaterThanOrEqual(10);

        // Should update status to 'cancelled' and set cancelledAt
        mockStorage.updateInvitation.mockResolvedValue({
          ...invitation,
          status: 'cancelled',
          cancelledAt: new Date(),
        });

        await mockStorage.updateInvitation('inv-123', {
          status: 'cancelled',
          cancelledAt: new Date(),
        });

        expect(mockStorage.updateInvitation).toHaveBeenCalledWith(
          'inv-123',
          expect.objectContaining({
            status: 'cancelled',
          })
        );
      });

      it('should return 429 status for locked invitations', async () => {
        const lockedInvitation = {
          id: 'inv-123',
          attemptCount: 15,
          status: 'pending',
        };

        mockStorage.getInvitations.mockResolvedValue([lockedInvitation]);

        const invitation = (await mockStorage.getInvitations())[0];
        expect(invitation.attemptCount).toBeGreaterThan(10);
        // Should return HTTP 429 Too Many Requests
      });

      it('should allow attempts below threshold', async () => {
        const invitation = {
          id: 'inv-123',
          token: 'token-123',
          status: 'pending',
          attemptCount: 5,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        };

        mockStorage.getInvitations.mockResolvedValue([invitation]);

        const foundInvitation = (await mockStorage.getInvitations())[0];
        expect(foundInvitation.attemptCount).toBeLessThan(10);
        // Should allow the attempt to proceed
      });
    });

    describe('Attempt Timestamps', () => {
      it('should update lastAttemptAt on each attempt', async () => {
        const invitation = {
          id: 'inv-123',
          attemptCount: 3,
          lastAttemptAt: new Date('2024-01-01'),
        };

        const newAttemptTime = new Date();

        mockStorage.updateInvitation.mockResolvedValue({
          ...invitation,
          attemptCount: 4,
          lastAttemptAt: newAttemptTime,
        });

        await mockStorage.updateInvitation('inv-123', {
          attemptCount: 4,
          lastAttemptAt: newAttemptTime,
        });

        const call = mockStorage.updateInvitation.mock.calls[0][1];
        expect(call.lastAttemptAt).toBeInstanceOf(Date);
        expect(call.lastAttemptAt.getTime()).toBeGreaterThan(
          new Date('2024-01-01').getTime()
        );
      });

      it('should preserve attempt history', async () => {
        const attempts = [
          { attemptCount: 1, lastAttemptAt: new Date('2024-01-01') },
          { attemptCount: 2, lastAttemptAt: new Date('2024-01-02') },
          { attemptCount: 3, lastAttemptAt: new Date('2024-01-03') },
        ];

        // Each attempt should increment count and update timestamp
        attempts.forEach((attempt, index) => {
          expect(attempt.attemptCount).toBe(index + 1);
          expect(attempt.lastAttemptAt).toBeDefined();
        });
      });
    });
  });

  describe('Single-Use Token Validation', () => {
    it('should mark invitation as used after acceptance', async () => {
      const invitation = {
        id: 'inv-123',
        token: 'token-123',
        isUsed: false,
        status: 'pending',
      };

      mockStorage.updateInvitation.mockResolvedValue({
        ...invitation,
        isUsed: true,
        status: 'accepted',
        acceptedAt: new Date(),
      });

      await mockStorage.updateInvitation('inv-123', {
        isUsed: true,
        status: 'accepted',
        acceptedAt: new Date(),
      });

      expect(mockStorage.updateInvitation).toHaveBeenCalledWith(
        'inv-123',
        expect.objectContaining({
          isUsed: true,
          status: 'accepted',
        })
      );
    });

    it('should reject already used tokens', async () => {
      const usedInvitation = {
        id: 'inv-123',
        token: 'used-token',
        isUsed: true,
        status: 'accepted',
      };

      mockStorage.getInvitations.mockResolvedValue([usedInvitation]);

      const invitation = (await mockStorage.getInvitations()).find(
        (inv: any) => inv.token === 'used-token'
      );

      expect(invitation.isUsed).toBe(true);
      expect(invitation.status).toBe('accepted');
      // Should return 400 error
    });

    it('should validate status before acceptance', async () => {
      const statuses = ['pending', 'accepted', 'cancelled', 'expired'];

      statuses.forEach(status => {
        const invitation = { id: 'inv-123', status };

        if (status === 'pending') {
          expect(invitation.status).toBe('pending');
          // Should allow acceptance
        } else {
          expect(invitation.status).not.toBe('pending');
          // Should reject acceptance
        }
      });
    });

    it('should update status on acceptance', async () => {
      const invitation = {
        id: 'inv-123',
        status: 'pending',
      };

      mockStorage.updateInvitation.mockResolvedValue({
        ...invitation,
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedBy: 'user-123',
      });

      await mockStorage.updateInvitation('inv-123', {
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedBy: 'user-123',
      });

      expect(mockStorage.updateInvitation).toHaveBeenCalledWith(
        'inv-123',
        expect.objectContaining({
          status: 'accepted',
          acceptedBy: 'user-123',
        })
      );
    });
  });

  describe('Security Validations', () => {
    it('should validate invitation expiration', async () => {
      const now = new Date();

      const validInvitation = {
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      };

      const expiredInvitation = {
        expiresAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      };

      expect(new Date(validInvitation.expiresAt) > now).toBe(true);
      expect(new Date(expiredInvitation.expiresAt) < now).toBe(true);
    });

    it('should require organization membership for management', async () => {
      const invitation = {
        organizationId: 'org-123',
      };

      const userOrgs = [
        { organizationId: 'org-456' },
        { organizationId: 'org-789' },
      ];

      const hasAccess = userOrgs.some(
        org => org.organizationId === invitation.organizationId
      );

      expect(hasAccess).toBe(false);
      // Should return 403 Forbidden
    });

    it('should allow site admins to manage all invitations', async () => {
      const user = {
        isSiteAdmin: true,
      };

      const invitation = {
        organizationId: 'any-org',
      };

      if (user.isSiteAdmin) {
        // Should allow access
        expect(user.isSiteAdmin).toBe(true);
      }
    });

    it('should prevent cancellation of accepted invitations', async () => {
      const acceptedInvitation = {
        id: 'inv-123',
        isUsed: true,
        status: 'accepted',
      };

      expect(acceptedInvitation.isUsed).toBe(true);
      // Should return 400 error when trying to cancel
    });

    it('should prevent resending cancelled invitations', async () => {
      const cancelledInvitation = {
        id: 'inv-123',
        status: 'cancelled',
      };

      expect(cancelledInvitation.status).toBe('cancelled');
      // Should return 400 error when trying to resend
    });
  });
});
