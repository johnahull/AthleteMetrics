/**
 * Achievement Routes Tests
 *
 * Tests for achievement API endpoints:
 * - GET /api/achievements - Get all achievement definitions
 * - GET /api/achievements/user/:userId - Get user's unlocked achievements
 * - GET /api/achievements/recent - Get recently unlocked achievements
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import session from 'express-session';
import { registerAchievementRoutes } from '../achievement-routes';
import { storage } from '../../storage';

// Mock storage
vi.mock('../../storage', () => ({
  storage: {
    getAchievementDefinitions: vi.fn(),
    getUserAchievements: vi.fn(),
    getUser: vi.fn(),
    getUserOrganizations: vi.fn(),
    getUserTeams: vi.fn(),
  },
}));

describe('Achievement Routes', () => {
  let app: Express;
  const mockUserId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID
  const mockOrgId = '550e8400-e29b-41d4-a716-446655440001'; // Valid UUID

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(
      session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
      })
    );

    // Mock auth middleware
    app.use((req, res, next) => {
      req.session.user = {
        id: mockUserId,
        username: 'testathlete',
        role: 'athlete',
        firstName: 'Test',
        lastName: 'Athlete',
        fullName: 'Test Athlete',
        isSiteAdmin: false,
        isActive: true,
      };
      next();
    });

    registerAchievementRoutes(app);
  });

  describe('GET /api/achievements', () => {
    it('should return all active achievement definitions', async () => {
      const mockDefinitions = [
        {
          id: 'def-1',
          code: 'FIRST_PR',
          name: 'First PR',
          description: 'Set your first personal record',
          category: 'performance',
          icon: 'Trophy',
          color: 'yellow',
          rarity: 'common',
          isActive: true,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
        },
        {
          id: 'def-2',
          code: 'SPEED_DEMON',
          name: 'Speed Demon',
          description: 'Run 10-yard fly time under 1.0s',
          category: 'performance',
          icon: 'Zap',
          color: 'blue',
          rarity: 'rare',
          isActive: true,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
        },
      ];

      vi.mocked(storage.getAchievementDefinitions).mockResolvedValue(mockDefinitions);

      const response = await request(app).get('/api/achievements');

      expect(response.status).toBe(200);
      // Dates are serialized to ISO strings in JSON response
      expect(response.body.achievements).toHaveLength(2);
      expect(response.body.achievements[0].code).toBe('FIRST_PR');
      expect(response.body.achievements[1].code).toBe('SPEED_DEMON');
      expect(storage.getAchievementDefinitions).toHaveBeenCalledWith({ isActive: true });
    });

    it('should require authentication', async () => {
      const appNoAuth = express();
      appNoAuth.use(express.json());
      appNoAuth.use(
        session({
          secret: 'test-secret',
          resave: false,
          saveUninitialized: false,
        })
      );
      registerAchievementRoutes(appNoAuth);

      const response = await request(appNoAuth).get('/api/achievements');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/achievements/user', () => {
    it('should return current user achievements when no userId provided', async () => {
      const mockAchievements = [
        {
          id: 'ua-1',
          userId: mockUserId,
          organizationId: mockOrgId,
          achievementId: 'def-1',
          unlockedAt: new Date('2025-01-15T10:00:00.000Z'),
          metadata: { metric: 'FLY10_TIME', value: 1.2 },
          achievement: {
            id: 'def-1',
            code: 'FIRST_PR',
            name: 'First PR',
            description: 'Set your first personal record',
            category: 'performance',
            icon: 'Trophy',
            color: 'yellow',
            rarity: 'common',
            isActive: true,
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
          },
        },
      ];

      // Mock user organizations to get organizationId
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { userId: mockUserId, organizationId: mockOrgId, role: 'athlete', organization: {} as any },
      ]);

      vi.mocked(storage.getUserAchievements).mockResolvedValue(mockAchievements);

      const response = await request(app).get('/api/achievements/user');

      expect(response.status).toBe(200);
      // Dates are serialized to ISO strings in JSON response
      expect(response.body.achievements).toHaveLength(1);
      expect(response.body.achievements[0].achievement.code).toBe('FIRST_PR');
      expect(response.body.achievements[0].metadata.metric).toBe('FLY10_TIME');
    });

    it('should return specific user achievements when userId provided (for coaches)', async () => {
      const coachApp = express();
      coachApp.use(express.json());
      coachApp.use(
        session({
          secret: 'test-secret',
          resave: false,
          saveUninitialized: false,
        })
      );

      const coachId = '550e8400-e29b-41d4-a716-446655440010'; // Valid UUID

      // Mock coach session
      coachApp.use((req, res, next) => {
        req.session.user = {
          id: coachId,
          username: 'testcoach',
          role: 'coach',
          firstName: 'Test',
          lastName: 'Coach',
          fullName: 'Test Coach',
          isSiteAdmin: false,
          isActive: true,
        };
        next();
      });

      registerAchievementRoutes(coachApp);

      const targetAthleteId = '550e8400-e29b-41d4-a716-446655440020'; // Valid UUID

      // Mock same organization
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { userId: coachId, organizationId: mockOrgId, role: 'coach', organization: {} as any },
      ]);
      vi.mocked(storage.getUserTeams).mockResolvedValue([
        { userId: targetAthleteId, teamId: 'team-1', team: { organizationId: mockOrgId } as any },
      ]);
      vi.mocked(storage.getUser).mockResolvedValue({
        id: targetAthleteId,
        username: 'athlete',
        role: 'athlete',
      } as any);

      const mockAchievements = [
        {
          id: 'ua-1',
          userId: targetAthleteId,
          organizationId: mockOrgId,
          achievementId: 'def-1',
          unlockedAt: new Date('2025-01-15T10:00:00.000Z'),
          metadata: {},
          achievement: {
            id: 'def-1',
            code: 'FIRST_PR',
            name: 'First PR',
            description: 'Set your first personal record',
            category: 'performance',
            icon: 'Trophy',
            color: 'yellow',
            rarity: 'common',
            isActive: true,
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
          },
        },
      ];

      vi.mocked(storage.getUserAchievements).mockResolvedValue(mockAchievements);

      const response = await request(coachApp).get(`/api/achievements/user?userId=${targetAthleteId}`);

      expect(response.status).toBe(200);
      // Dates are serialized to ISO strings in JSON response
      expect(response.body.achievements).toHaveLength(1);
      expect(response.body.achievements[0].achievement.code).toBe('FIRST_PR');
    });

    it('should deny access if athlete tries to view another athlete achievements', async () => {
      const otherAthleteId = '550e8400-e29b-41d4-a716-446655440099'; // Valid UUID, different user

      const response = await request(app).get(`/api/achievements/user?userId=${otherAthleteId}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });
  });

  describe('GET /api/achievements/recent', () => {
    it('should return recently unlocked achievements (last 7 days)', async () => {
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const mockRecentAchievements = [
        {
          id: 'ua-1',
          userId: mockUserId,
          organizationId: mockOrgId,
          achievementId: 'def-1',
          unlockedAt: recentDate,
          metadata: { metric: 'FLY10_TIME', value: 0.95 },
          achievement: {
            id: 'def-1',
            code: 'SPEED_DEMON',
            name: 'Speed Demon',
            description: 'Run 10-yard fly time under 1.0s',
            category: 'performance',
            icon: 'Zap',
            color: 'blue',
            rarity: 'rare',
            isActive: true,
            createdAt: new Date(),
          },
        },
      ];

      // Mock user organizations
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { userId: mockUserId, organizationId: mockOrgId, role: 'athlete', organization: {} as any },
      ]);

      vi.mocked(storage.getUserAchievements).mockResolvedValue(mockRecentAchievements);

      const response = await request(app).get('/api/achievements/recent');

      expect(response.status).toBe(200);
      expect(response.body.achievements).toHaveLength(1);
      expect(response.body.achievements[0].achievement.code).toBe('SPEED_DEMON');
    });

    it('should filter out achievements older than 7 days', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

      const mockAchievements = [
        {
          id: 'ua-1',
          userId: mockUserId,
          organizationId: mockOrgId,
          achievementId: 'def-1',
          unlockedAt: oldDate,
          metadata: {},
          achievement: {
            id: 'def-1',
            code: 'OLD_ACHIEVEMENT',
            name: 'Old Achievement',
            description: 'Old',
            category: 'performance',
            icon: 'Trophy',
            color: 'yellow',
            rarity: 'common',
            isActive: true,
            createdAt: new Date(),
          },
        },
        {
          id: 'ua-2',
          userId: mockUserId,
          organizationId: mockOrgId,
          achievementId: 'def-2',
          unlockedAt: recentDate,
          metadata: {},
          achievement: {
            id: 'def-2',
            code: 'RECENT_ACHIEVEMENT',
            name: 'Recent Achievement',
            description: 'Recent',
            category: 'performance',
            icon: 'Star',
            color: 'blue',
            rarity: 'rare',
            isActive: true,
            createdAt: new Date(),
          },
        },
      ];

      // Mock user organizations
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { userId: mockUserId, organizationId: mockOrgId, role: 'athlete', organization: {} as any },
      ]);

      vi.mocked(storage.getUserAchievements).mockResolvedValue(mockAchievements);

      const response = await request(app).get('/api/achievements/recent');

      expect(response.status).toBe(200);
      expect(response.body.achievements).toHaveLength(1);
      expect(response.body.achievements[0].achievement.code).toBe('RECENT_ACHIEVEMENT');
    });
  });
});
