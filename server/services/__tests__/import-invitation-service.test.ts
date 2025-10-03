/**
 * Test suite for ImportService and InvitationService
 * Tests file upload handling and invitation management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportService } from '../import-service';
import { InvitationService } from '../invitation-service';
import { reviewQueue } from '../../review-queue';

// Mock the storage
const mockStorage = {
  createInvitation: vi.fn(),
  getOrganizationInvitations: vi.fn(),
  getInvitation: vi.fn(),
  deleteInvitation: vi.fn(),
  getUserOrganizations: vi.fn(),
};

// Mock review queue
vi.mock('../../review-queue', () => ({
  reviewQueue: {
    getItem: vi.fn(),
    processDecision: vi.fn(),
  }
}));

describe('ImportService', () => {
  let importService: ImportService;

  beforeEach(() => {
    // @ts-ignore - mocking storage
    importService = new ImportService();
    // @ts-ignore - inject mock storage
    importService['storage'] = mockStorage;
    vi.clearAllMocks();
  });

  describe('importPhoto', () => {
    it('should handle photo upload successfully', async () => {
      const mockFile = {
        originalname: 'athlete-photo.jpg',
        size: 1024,
        buffer: Buffer.from('fake image data')
      } as Express.Multer.File;

      const result = await importService.importPhoto(mockFile, 'user-1');

      expect(result.message).toBe('Photo uploaded successfully');
      expect(result.filename).toBe('athlete-photo.jpg');
    });
  });

  describe('importCSV', () => {
    it('should handle CSV import successfully', async () => {
      const mockFile = {
        originalname: 'athletes.csv',
        size: 2048,
        buffer: Buffer.from('id,name\n1,John')
      } as Express.Multer.File;

      const result = await importService.importCSV('athletes', mockFile, 'user-1');

      expect(result.message).toBe('athletes import initiated');
      expect(result.filename).toBe('athletes.csv');
    });
  });

  describe('getReviewQueueItem', () => {
    it('should retrieve review queue item', async () => {
      const mockItem = {
        id: 'review-1',
        status: 'pending',
        createdAt: new Date()
      };

      vi.mocked(reviewQueue.getItem).mockReturnValue(mockItem as any);

      const result = await importService.getReviewQueueItem('review-1', 'user-1');

      expect(result).toEqual(mockItem);
      expect(reviewQueue.getItem).toHaveBeenCalledWith('review-1');
    });

    it('should return null for non-existent item', async () => {
      vi.mocked(reviewQueue.getItem).mockReturnValue(undefined);

      const result = await importService.getReviewQueueItem('invalid', 'user-1');

      expect(result).toBeNull();
    });
  });

  describe('processReviewDecision', () => {
    it('should process approval decision', async () => {
      const mockResult = {
        id: 'review-1',
        status: 'approved' as const,
        reviewedAt: new Date(),
        reviewedBy: 'user-1'
      };

      vi.mocked(reviewQueue.processDecision).mockReturnValue(mockResult as any);

      const decision = { itemId: 'review-1', action: 'approve' as const, notes: 'Looks good' };
      const result = await importService.processReviewDecision(decision, 'user-1');

      expect(result.status).toBe('approved');
      expect(reviewQueue.processDecision).toHaveBeenCalledWith(decision, 'user-1');
    });

    it('should throw error for non-existent review item', async () => {
      vi.mocked(reviewQueue.processDecision).mockReturnValue(null);

      const decision = { itemId: 'invalid', action: 'approve' as const };

      await expect(
        importService.processReviewDecision(decision, 'user-1')
      ).rejects.toThrow('Review item not found');
    });
  });
});

describe('InvitationService', () => {
  let invitationService: InvitationService;

  beforeEach(() => {
    // @ts-ignore - mocking storage
    invitationService = new InvitationService();
    // @ts-ignore - inject mock storage
    invitationService['storage'] = mockStorage;
    vi.clearAllMocks();

    // Mock organization access by default
    mockStorage.getUserOrganizations.mockResolvedValue([
      { organizationId: 'org-1', organization: { id: 'org-1', name: 'Test Org' } }
    ]);
  });

  describe('createInvitation', () => {
    it('should create invitation successfully', async () => {
      const mockInvitation = {
        id: 'inv-1',
        email: 'athlete@example.com',
        organizationId: 'org-1',
        role: 'athlete',
        token: 'abc123'
      };

      mockStorage.createInvitation.mockResolvedValue(mockInvitation);

      const data = {
        email: 'athlete@example.com',
        firstName: 'John',
        lastName: 'Doe',
        organizationId: 'org-1',
        role: 'athlete' as const
      };

      const result = await invitationService.createInvitation(data, 'user-1');

      expect(result).toEqual(mockInvitation);
      expect(mockStorage.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'athlete@example.com',
          organizationId: 'org-1',
          invitedBy: 'user-1'
        })
      );
    });

    it('should check organization access', async () => {
      mockStorage.getUserOrganizations.mockResolvedValue([
        { organizationId: 'org-2', organization: { id: 'org-2', name: 'Other Org' } }
      ]);

      const data = {
        email: 'test@example.com',
        organizationId: 'org-1',
        role: 'athlete' as const
      };

      await expect(
        invitationService.createInvitation(data, 'user-1')
      ).rejects.toThrow();
    });

    it('should handle playerId null to undefined conversion', async () => {
      mockStorage.createInvitation.mockResolvedValue({
        id: 'inv-1',
        email: 'test@example.com',
        organizationId: 'org-1'
      });

      const data = {
        email: 'test@example.com',
        organizationId: 'org-1',
        role: 'athlete' as const,
        playerId: null
      };

      await invitationService.createInvitation(data, 'user-1');

      expect(mockStorage.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          playerId: undefined
        })
      );
    });
  });

  describe('getOrganizationInvitations', () => {
    it('should retrieve organization invitations', async () => {
      const mockInvitations = [
        { id: '1', email: 'athlete1@example.com' },
        { id: '2', email: 'athlete2@example.com' }
      ];

      mockStorage.getOrganizationInvitations.mockResolvedValue(mockInvitations);

      const result = await invitationService.getOrganizationInvitations('org-1', 'user-1');

      expect(result).toEqual(mockInvitations);
      expect(mockStorage.getOrganizationInvitations).toHaveBeenCalledWith('org-1');
    });

    it('should require organizationId', async () => {
      await expect(
        invitationService.getOrganizationInvitations('', 'user-1')
      ).rejects.toThrow('Organization ID is required');
    });
  });

  describe('getInvitationByToken', () => {
    it('should retrieve invitation by token', async () => {
      const mockInvitation = {
        id: 'inv-1',
        email: 'test@example.com',
        token: 'abc123'
      };

      mockStorage.getInvitation.mockResolvedValue(mockInvitation);

      const result = await invitationService.getInvitationByToken('abc123');

      expect(result).toEqual(mockInvitation);
    });

    it('should return null for non-existent token', async () => {
      mockStorage.getInvitation.mockResolvedValue(undefined);

      const result = await invitationService.getInvitationByToken('invalid');

      expect(result).toBeNull();
    });
  });

  describe('deleteInvitation', () => {
    it('should delete invitation successfully', async () => {
      mockStorage.getInvitation.mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-1',
        email: 'test@example.com'
      });
      mockStorage.deleteInvitation.mockResolvedValue(undefined);

      await invitationService.deleteInvitation('inv-1', 'user-1');

      expect(mockStorage.deleteInvitation).toHaveBeenCalledWith('inv-1');
    });

    it('should throw error for non-existent invitation', async () => {
      mockStorage.getInvitation.mockResolvedValue(undefined);

      await expect(
        invitationService.deleteInvitation('invalid', 'user-1')
      ).rejects.toThrow('Invitation not found');
    });

    it('should check organization access before deletion', async () => {
      mockStorage.getInvitation.mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-2',
        email: 'test@example.com'
      });
      mockStorage.getUserOrganizations.mockResolvedValue([
        { organizationId: 'org-1', organization: { id: 'org-1', name: 'Test Org' } }
      ]);

      await expect(
        invitationService.deleteInvitation('inv-1', 'user-1')
      ).rejects.toThrow();
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation successfully', async () => {
      mockStorage.getInvitation.mockResolvedValue({
        id: 'inv-1',
        email: 'test@example.com',
        token: 'abc123'
      });

      const result = await invitationService.acceptInvitation('abc123', 'password123');

      expect(result.message).toBe('Invitation accepted successfully');
    });

    it('should throw error for non-existent invitation', async () => {
      mockStorage.getInvitation.mockResolvedValue(undefined);

      await expect(
        invitationService.acceptInvitation('invalid', 'password123')
      ).rejects.toThrow('Invitation not found or expired');
    });
  });
});
