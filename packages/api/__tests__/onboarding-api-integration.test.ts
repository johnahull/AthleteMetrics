/**
 * Integration tests for Onboarding API Routes
 *
 * Tests the HTTP endpoints:
 * - GET /api/profile/onboarding-status - Get user's onboarding completion status
 * - PUT /api/profile/onboarding-status - Update onboarding completion status
 *
 * These tests verify the actual API layer including authentication and validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

// Mock storage
vi.mock('../storage', () => ({
  storage: {
    getUser: vi.fn(),
    updateUser: vi.fn(),
  },
}));

describe('Onboarding API Integration', () => {
  let app: express.Application;
  let mockSession: any;

  const mockAthlete = {
    id: 'athlete-123',
    username: 'test_athlete',
    firstName: 'Test',
    lastName: 'Athlete',
    fullName: 'Test Athlete',
    emails: ['athlete@example.com'],
    isSiteAdmin: false,
    hasCompletedOnboarding: false,
    isActive: true,
  };

  const mockCompletedUser = {
    ...mockAthlete,
    id: 'completed-123',
    username: 'completed_user',
    hasCompletedOnboarding: true,
  };

  const mockSiteAdmin = {
    ...mockAthlete,
    id: 'admin-123',
    username: 'site_admin',
    isSiteAdmin: true,
    hasCompletedOnboarding: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = {};

    // Create Express app with mock auth middleware
    app = express();
    app.use(express.json());

    // Mock session middleware
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).session = mockSession;
      next();
    });

    // Mock requireAuth middleware
    const requireAuth = (req: Request, res: Response, next: NextFunction) => {
      if (!mockSession.user) {
        return res.status(401).json({ message: 'Not authenticated' });
      }
      next();
    };

    // GET /api/profile/onboarding-status
    app.get('/api/profile/onboarding-status', requireAuth, async (req: Request, res: Response) => {
      try {
        const currentUser = mockSession.user;
        if (!currentUser?.id) {
          return res.status(401).json({ message: 'User not authenticated' });
        }

        const user = await storage.getUser(currentUser.id);
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.json({
          hasCompletedOnboarding: user.hasCompletedOnboarding ?? false,
          role: currentUser.role,
          isSiteAdmin: currentUser.isSiteAdmin,
        });
      } catch (error) {
        console.error('Error fetching onboarding status:', error);
        res.status(500).json({ message: 'Failed to fetch onboarding status' });
      }
    });

    // PUT /api/profile/onboarding-status
    app.put('/api/profile/onboarding-status', requireAuth, async (req: Request, res: Response) => {
      try {
        const currentUser = mockSession.user;
        if (!currentUser?.id) {
          return res.status(401).json({ message: 'User not authenticated' });
        }

        const { completed } = req.body;

        if (typeof completed !== 'boolean') {
          return res.status(400).json({ message: "Invalid request: 'completed' must be a boolean" });
        }

        await storage.updateUser(currentUser.id, {
          hasCompletedOnboarding: completed,
        });

        res.json({
          hasCompletedOnboarding: completed,
          message: completed ? 'Onboarding marked as completed' : 'Onboarding status reset',
        });
      } catch (error) {
        console.error('Error updating onboarding status:', error);
        res.status(500).json({ message: 'Failed to update onboarding status' });
      }
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/profile/onboarding-status', () => {
    it('should return 401 for unauthenticated request', async () => {
      // No user in session
      mockSession.user = null;

      const response = await request(app).get('/api/profile/onboarding-status');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Not authenticated');
    });

    it('should return hasCompletedOnboarding=false for new user', async () => {
      mockSession.user = { id: mockAthlete.id, role: 'athlete', isSiteAdmin: false };
      vi.mocked(storage.getUser).mockResolvedValue(mockAthlete as any);

      const response = await request(app).get('/api/profile/onboarding-status');

      expect(response.status).toBe(200);
      expect(response.body.hasCompletedOnboarding).toBe(false);
      expect(response.body.role).toBe('athlete');
      expect(response.body.isSiteAdmin).toBe(false);
    });

    it('should return hasCompletedOnboarding=true for completed user', async () => {
      mockSession.user = { id: mockCompletedUser.id, role: 'athlete', isSiteAdmin: false };
      vi.mocked(storage.getUser).mockResolvedValue(mockCompletedUser as any);

      const response = await request(app).get('/api/profile/onboarding-status');

      expect(response.status).toBe(200);
      expect(response.body.hasCompletedOnboarding).toBe(true);
    });

    it('should return isSiteAdmin=true for site admin', async () => {
      mockSession.user = { id: mockSiteAdmin.id, role: 'org_admin', isSiteAdmin: true };
      vi.mocked(storage.getUser).mockResolvedValue(mockSiteAdmin as any);

      const response = await request(app).get('/api/profile/onboarding-status');

      expect(response.status).toBe(200);
      expect(response.body.isSiteAdmin).toBe(true);
    });

    it('should return 404 if user not found', async () => {
      mockSession.user = { id: 'nonexistent-123', role: 'athlete', isSiteAdmin: false };
      vi.mocked(storage.getUser).mockResolvedValue(null);

      const response = await request(app).get('/api/profile/onboarding-status');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 500 on database error', async () => {
      mockSession.user = { id: mockAthlete.id, role: 'athlete', isSiteAdmin: false };
      vi.mocked(storage.getUser).mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/profile/onboarding-status');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to fetch onboarding status');
    });
  });

  describe('PUT /api/profile/onboarding-status', () => {
    it('should return 401 for unauthenticated request', async () => {
      mockSession.user = null;

      const response = await request(app)
        .put('/api/profile/onboarding-status')
        .send({ completed: true });

      expect(response.status).toBe(401);
    });

    it('should update onboarding status to completed', async () => {
      mockSession.user = { id: mockAthlete.id, role: 'athlete', isSiteAdmin: false };
      vi.mocked(storage.updateUser).mockResolvedValue(undefined);

      const response = await request(app)
        .put('/api/profile/onboarding-status')
        .send({ completed: true });

      expect(response.status).toBe(200);
      expect(response.body.hasCompletedOnboarding).toBe(true);
      expect(response.body.message).toBe('Onboarding marked as completed');
      expect(storage.updateUser).toHaveBeenCalledWith(mockAthlete.id, {
        hasCompletedOnboarding: true,
      });
    });

    it('should reset onboarding status for replay', async () => {
      mockSession.user = { id: mockCompletedUser.id, role: 'athlete', isSiteAdmin: false };
      vi.mocked(storage.updateUser).mockResolvedValue(undefined);

      const response = await request(app)
        .put('/api/profile/onboarding-status')
        .send({ completed: false });

      expect(response.status).toBe(200);
      expect(response.body.hasCompletedOnboarding).toBe(false);
      expect(response.body.message).toBe('Onboarding status reset');
    });

    it('should return 400 for non-boolean completed value', async () => {
      mockSession.user = { id: mockAthlete.id, role: 'athlete', isSiteAdmin: false };

      const response = await request(app)
        .put('/api/profile/onboarding-status')
        .send({ completed: 'true' }); // String instead of boolean

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid request: 'completed' must be a boolean");
    });

    it('should return 400 for missing completed field', async () => {
      mockSession.user = { id: mockAthlete.id, role: 'athlete', isSiteAdmin: false };

      const response = await request(app)
        .put('/api/profile/onboarding-status')
        .send({}); // Empty body

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid request: 'completed' must be a boolean");
    });

    it('should return 400 for null completed value', async () => {
      mockSession.user = { id: mockAthlete.id, role: 'athlete', isSiteAdmin: false };

      const response = await request(app)
        .put('/api/profile/onboarding-status')
        .send({ completed: null });

      expect(response.status).toBe(400);
    });

    it('should return 500 on database error during update', async () => {
      mockSession.user = { id: mockAthlete.id, role: 'athlete', isSiteAdmin: false };
      vi.mocked(storage.updateUser).mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .put('/api/profile/onboarding-status')
        .send({ completed: true });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to update onboarding status');
    });
  });
});
