/**
 * Goal Routes Tests
 *
 * Tests for goal API endpoints covering:
 * - GET /api/goals - Get all goals for user
 * - GET /api/goals/:id - Get specific goal
 * - POST /api/goals - Create new goal
 * - PUT /api/goals/:id - Update goal
 * - PATCH /api/goals/:id/status - Update goal status
 * - DELETE /api/goals/:id - Delete goal
 *
 * Security model tested:
 * - Athletes can CRUD their own goals
 * - Coaches can only VIEW goals for athletes in their org
 * - Site admins can VIEW any goal but not modify
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import session from 'express-session';
import { registerGoalRoutes } from '../goal-routes';
import { storage } from '../../storage';

// Mock storage
vi.mock('../../storage', () => ({
  storage: {
    getGoalsByUser: vi.fn(),
    getGoal: vi.fn(),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    deleteGoal: vi.fn(),
    getUser: vi.fn(),
    getUserOrganizations: vi.fn(),
    getUserTeams: vi.fn(),
    getMeasurements: vi.fn(),
  },
}));

// Valid UUIDs for testing
const mockAthleteId = '550e8400-e29b-41d4-a716-446655440000';
const mockCoachId = '550e8400-e29b-41d4-a716-446655440001';
const mockSiteAdminId = '550e8400-e29b-41d4-a716-446655440002';
const mockOtherAthleteId = '550e8400-e29b-41d4-a716-446655440003';
const mockOrgId = '550e8400-e29b-41d4-a716-446655440010';
const mockOtherOrgId = '550e8400-e29b-41d4-a716-446655440011';
const mockGoalId = '550e8400-e29b-41d4-a716-446655440020';
const mockTeamId = '550e8400-e29b-41d4-a716-446655440030';

describe('Goal Routes', () => {
  let athleteApp: Express;
  let coachApp: Express;
  let siteAdminApp: Express;

  // Helper to create app with specific user session
  const createAppWithUser = (user: any): Express => {
    const app = express();
    app.use(express.json());
    app.use(
      session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
      })
    );
    app.use((req, res, next) => {
      req.session.user = user;
      next();
    });
    registerGoalRoutes(app);
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create apps with different user types
    athleteApp = createAppWithUser({
      id: mockAthleteId,
      username: 'testathlete',
      role: 'athlete',
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete',
      isSiteAdmin: false,
      isActive: true,
    });

    coachApp = createAppWithUser({
      id: mockCoachId,
      username: 'testcoach',
      role: 'coach',
      firstName: 'Test',
      lastName: 'Coach',
      fullName: 'Test Coach',
      isSiteAdmin: false,
      isActive: true,
    });

    siteAdminApp = createAppWithUser({
      id: mockSiteAdminId,
      username: 'siteadmin',
      role: 'admin',
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
      isSiteAdmin: true,
      isActive: true,
    });
  });

  // ============================================
  // GET /api/goals - List Goals
  // ============================================
  describe('GET /api/goals', () => {
    const mockGoals = [
      {
        id: mockGoalId,
        userId: mockAthleteId,
        metric: 'FLY10_TIME',
        goalType: 'target_value',
        targetValue: '1.0',
        baselineValue: '1.2',
        currentValue: '1.1',
        targetDate: '2024-12-31',
        status: 'active',
        createdAt: new Date('2024-01-15'),
      },
    ];

    it('should return athlete own goals', async () => {
      vi.mocked(storage.getGoalsByUser).mockResolvedValue(mockGoals);

      const response = await request(athleteApp).get('/api/goals');

      expect(response.status).toBe(200);
      expect(response.body.goals).toHaveLength(1);
      expect(storage.getGoalsByUser).toHaveBeenCalledWith(mockAthleteId, {});
    });

    it('should filter goals by status', async () => {
      vi.mocked(storage.getGoalsByUser).mockResolvedValue(mockGoals);

      const response = await request(athleteApp).get('/api/goals?status=active');

      expect(response.status).toBe(200);
      expect(storage.getGoalsByUser).toHaveBeenCalledWith(mockAthleteId, { status: 'active' });
    });

    it('should ignore invalid status filter', async () => {
      vi.mocked(storage.getGoalsByUser).mockResolvedValue(mockGoals);

      const response = await request(athleteApp).get('/api/goals?status=invalid_status');

      expect(response.status).toBe(200);
      expect(storage.getGoalsByUser).toHaveBeenCalledWith(mockAthleteId, {});
    });

    it('should reject athlete viewing another athlete goals', async () => {
      const response = await request(athleteApp).get(`/api/goals?userId=${mockOtherAthleteId}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });

    it('should allow coach to view athlete goals in same org', async () => {
      vi.mocked(storage.getUser).mockResolvedValue({
        id: mockAthleteId,
        username: 'athlete',
        role: 'athlete',
      } as any);
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { userId: mockCoachId, organizationId: mockOrgId, role: 'coach', organization: {} as any },
      ]);
      vi.mocked(storage.getUserTeams).mockResolvedValue([
        { userId: mockAthleteId, teamId: mockTeamId, team: { organizationId: mockOrgId } as any },
      ]);
      vi.mocked(storage.getGoalsByUser).mockResolvedValue(mockGoals);

      const response = await request(coachApp).get(`/api/goals?userId=${mockAthleteId}`);

      expect(response.status).toBe(200);
      expect(storage.getGoalsByUser).toHaveBeenCalledWith(mockAthleteId, {});
    });

    it('should reject coach viewing athlete goals in different org', async () => {
      vi.mocked(storage.getUser).mockResolvedValue({
        id: mockOtherAthleteId,
        username: 'otherathlete',
        role: 'athlete',
      } as any);
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { userId: mockCoachId, organizationId: mockOrgId, role: 'coach', organization: {} as any },
      ]);
      vi.mocked(storage.getUserTeams).mockResolvedValue([
        { userId: mockOtherAthleteId, teamId: 'other-team', team: { organizationId: mockOtherOrgId } as any },
      ]);

      const response = await request(coachApp).get(`/api/goals?userId=${mockOtherAthleteId}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });

    it('should allow site admin to view any user goals', async () => {
      vi.mocked(storage.getGoalsByUser).mockResolvedValue(mockGoals);

      const response = await request(siteAdminApp).get(`/api/goals?userId=${mockAthleteId}`);

      expect(response.status).toBe(200);
      expect(storage.getGoalsByUser).toHaveBeenCalledWith(mockAthleteId, {});
    });

    it('should return 400 for invalid UUID format', async () => {
      const response = await request(athleteApp).get('/api/goals?userId=invalid-uuid');

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid user ID format');
    });

    it('should return 403 if athlete not found (security: no user enumeration)', async () => {
      vi.mocked(storage.getUser).mockResolvedValue(undefined);

      const response = await request(coachApp).get(`/api/goals?userId=${mockOtherAthleteId}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
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
      registerGoalRoutes(appNoAuth);

      const response = await request(appNoAuth).get('/api/goals');

      expect(response.status).toBe(401);
    });
  });

  // ============================================
  // GET /api/goals/:id - Get Single Goal
  // ============================================
  describe('GET /api/goals/:id', () => {
    const mockGoal = {
      id: mockGoalId,
      userId: mockAthleteId,
      metric: 'FLY10_TIME',
      goalType: 'target_value',
      targetValue: '1.0',
      baselineValue: '1.2',
      currentValue: '1.1',
      targetDate: '2024-12-31',
      status: 'active',
      createdAt: new Date('2024-01-15'),
    };

    it('should return goal for owner', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(mockGoal);

      const response = await request(athleteApp).get(`/api/goals/${mockGoalId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(mockGoalId);
    });

    it('should reject athlete viewing another athlete goal', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue({
        ...mockGoal,
        userId: mockOtherAthleteId,
      });

      const response = await request(athleteApp).get(`/api/goals/${mockGoalId}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });

    it('should allow coach to view athlete goal in same org', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(mockGoal);
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { userId: mockCoachId, organizationId: mockOrgId, role: 'coach', organization: {} as any },
      ]);
      vi.mocked(storage.getUserTeams).mockResolvedValue([
        { userId: mockAthleteId, teamId: mockTeamId, team: { organizationId: mockOrgId } as any },
      ]);

      const response = await request(coachApp).get(`/api/goals/${mockGoalId}`);

      expect(response.status).toBe(200);
    });

    it('should reject coach viewing goal from different org', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue({
        ...mockGoal,
        userId: mockOtherAthleteId,
      });
      vi.mocked(storage.getUserOrganizations).mockResolvedValue([
        { userId: mockCoachId, organizationId: mockOrgId, role: 'coach', organization: {} as any },
      ]);
      vi.mocked(storage.getUserTeams).mockResolvedValue([
        { userId: mockOtherAthleteId, teamId: 'other-team', team: { organizationId: mockOtherOrgId } as any },
      ]);

      const response = await request(coachApp).get(`/api/goals/${mockGoalId}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });

    it('should allow site admin to view any goal', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(mockGoal);

      const response = await request(siteAdminApp).get(`/api/goals/${mockGoalId}`);

      expect(response.status).toBe(200);
    });

    it('should return 404 for non-existent goal', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(undefined);

      const response = await request(athleteApp).get(`/api/goals/${mockGoalId}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('Goal not found');
    });

    it('should return 400 for invalid goal ID format', async () => {
      const response = await request(athleteApp).get('/api/goals/invalid-uuid');

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid goal ID format');
    });
  });

  // ============================================
  // POST /api/goals - Create Goal
  // ============================================
  describe('POST /api/goals', () => {
    // Helper to get future date string
    const getFutureDate = () => {
      const date = new Date();
      date.setFullYear(date.getFullYear() + 1);
      return date.toISOString().split('T')[0];
    };

    const getValidGoalData = () => ({
      metric: 'FLY10_TIME',
      goalType: 'target_value',
      targetValue: 1.0,
      baselineValue: 1.2,
      targetDate: getFutureDate(),
    });

    const getCreatedGoal = () => ({
      id: mockGoalId,
      userId: mockAthleteId,
      metric: 'FLY10_TIME',
      goalType: 'target_value',
      targetValue: 1.0,
      baselineValue: 1.2,
      targetDate: getFutureDate(),
      currentValue: 1.2,
      status: 'active',
      createdAt: new Date(),
    });

    it('should create goal for athlete', async () => {
      const validGoalData = getValidGoalData();
      const createdGoal = getCreatedGoal();
      vi.mocked(storage.createGoal).mockResolvedValue(createdGoal);

      const response = await request(athleteApp)
        .post('/api/goals')
        .send(validGoalData);

      expect(response.status).toBe(201);
      expect(response.body.id).toBe(mockGoalId);
      expect(storage.createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockAthleteId,
          metric: 'FLY10_TIME',
          status: 'active',
        })
      );
    });

    it('should use provided baseline value', async () => {
      const createdGoal = getCreatedGoal();
      vi.mocked(storage.createGoal).mockResolvedValue(createdGoal);

      const dataWithBaseline = {
        metric: 'FLY10_TIME',
        goalType: 'target_value',
        targetValue: 1.0,
        baselineValue: 1.15,
        targetDate: getFutureDate(),
      };

      const response = await request(athleteApp)
        .post('/api/goals')
        .send(dataWithBaseline);

      expect(response.status).toBe(201);
      expect(storage.createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          baselineValue: 1.15,
        })
      );
    });

    it('should return 400 if baseline value not provided', async () => {
      // Schema requires baselineValue, so this validates the Zod schema
      const dataWithoutBaseline = {
        metric: 'FLY10_TIME',
        goalType: 'target_value',
        targetValue: 1.0,
        targetDate: '2024-12-31',
      };

      const response = await request(athleteApp)
        .post('/api/goals')
        .send(dataWithoutBaseline);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid input data');
    });

    it('should reject coach creating goal', async () => {
      const validGoalData = getValidGoalData();
      const response = await request(coachApp)
        .post('/api/goals')
        .send(validGoalData);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });

    it('should reject site admin creating goal', async () => {
      const validGoalData = getValidGoalData();
      const response = await request(siteAdminApp)
        .post('/api/goals')
        .send(validGoalData);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });

    it('should return 400 for invalid input data', async () => {
      const invalidData = {
        metric: '', // Invalid: empty
        goalType: 'invalid_type', // Invalid enum
        targetValue: 'not-a-number',
      };

      const response = await request(athleteApp)
        .post('/api/goals')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid input data');
    });

    it('should force userId to current user (prevent privilege escalation)', async () => {
      const createdGoal = getCreatedGoal();
      vi.mocked(storage.createGoal).mockResolvedValue(createdGoal);

      const dataWithFakeUserId = {
        metric: 'FLY10_TIME',
        goalType: 'target_value',
        targetValue: 1.0,
        baselineValue: 1.2, // Must include baselineValue
        targetDate: getFutureDate(),
        userId: mockOtherAthleteId, // Attempt to create for another user
      };

      const response = await request(athleteApp)
        .post('/api/goals')
        .send(dataWithFakeUserId);

      expect(response.status).toBe(201);
      // Verify userId was overwritten to current user
      expect(storage.createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockAthleteId, // Should be athlete's own ID
        })
      );
    });
  });

  // ============================================
  // PUT /api/goals/:id - Update Goal
  // ============================================
  describe('PUT /api/goals/:id', () => {
    const existingGoal = {
      id: mockGoalId,
      userId: mockAthleteId,
      metric: 'FLY10_TIME',
      goalType: 'target_value',
      targetValue: '1.0',
      baselineValue: '1.2',
      currentValue: '1.1',
      targetDate: '2024-12-31',
      status: 'active',
      createdAt: new Date('2024-01-15'),
    };

    it('should update own goal', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(existingGoal);
      vi.mocked(storage.updateGoal).mockResolvedValue({
        ...existingGoal,
        targetValue: '0.95',
      });

      const response = await request(athleteApp)
        .put(`/api/goals/${mockGoalId}`)
        .send({ targetValue: 0.95 });

      expect(response.status).toBe(200);
      expect(storage.updateGoal).toHaveBeenCalledWith(
        mockGoalId,
        mockAthleteId,
        expect.objectContaining({ targetValue: 0.95 })
      );
    });

    it('should set achievedAt when status changes to achieved', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(existingGoal);
      vi.mocked(storage.updateGoal).mockResolvedValue({
        ...existingGoal,
        status: 'achieved',
        achievedAt: new Date(),
      });

      const response = await request(athleteApp)
        .put(`/api/goals/${mockGoalId}`)
        .send({ status: 'achieved' });

      expect(response.status).toBe(200);
      expect(storage.updateGoal).toHaveBeenCalledWith(
        mockGoalId,
        mockAthleteId,
        expect.objectContaining({
          status: 'achieved',
          achievedAt: expect.any(Date),
        })
      );
    });

    it('should not set achievedAt if already achieved', async () => {
      const achievedGoal = {
        ...existingGoal,
        status: 'achieved',
        achievedAt: new Date('2024-06-01'),
      };
      vi.mocked(storage.getGoal).mockResolvedValue(achievedGoal);
      vi.mocked(storage.updateGoal).mockResolvedValue(achievedGoal);

      const response = await request(athleteApp)
        .put(`/api/goals/${mockGoalId}`)
        .send({ status: 'achieved', notes: 'Updated notes' });

      expect(response.status).toBe(200);
      // achievedAt should not be in update data since already achieved
      expect(storage.updateGoal).toHaveBeenCalledWith(
        mockGoalId,
        mockAthleteId,
        expect.not.objectContaining({
          achievedAt: expect.any(Date),
        })
      );
    });

    it('should reject updating another user goal', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue({
        ...existingGoal,
        userId: mockOtherAthleteId,
      });

      const response = await request(athleteApp)
        .put(`/api/goals/${mockGoalId}`)
        .send({ targetValue: 0.95 });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });

    it('should reject coach updating athlete goal', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(existingGoal);

      const response = await request(coachApp)
        .put(`/api/goals/${mockGoalId}`)
        .send({ targetValue: 0.95 });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });

    it('should reject site admin updating goal', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(existingGoal);

      const response = await request(siteAdminApp)
        .put(`/api/goals/${mockGoalId}`)
        .send({ targetValue: 0.95 });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });

    it('should return 404 for non-existent goal', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(undefined);

      const response = await request(athleteApp)
        .put(`/api/goals/${mockGoalId}`)
        .send({ targetValue: 0.95 });

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid UUID format', async () => {
      const response = await request(athleteApp)
        .put('/api/goals/invalid-uuid')
        .send({ targetValue: 0.95 });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid goal ID format');
    });

    it('should return 400 for invalid input data', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(existingGoal);

      const response = await request(athleteApp)
        .put(`/api/goals/${mockGoalId}`)
        .send({ status: 'invalid_status' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid input data');
    });
  });

  // ============================================
  // PATCH /api/goals/:id/status - Update Status
  // ============================================
  describe('PATCH /api/goals/:id/status', () => {
    const existingGoal = {
      id: mockGoalId,
      userId: mockAthleteId,
      metric: 'FLY10_TIME',
      goalType: 'target_value',
      targetValue: '1.0',
      baselineValue: '1.2',
      currentValue: '1.1',
      targetDate: '2024-12-31',
      status: 'active',
      createdAt: new Date('2024-01-15'),
    };

    it('should update status to achieved', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(existingGoal);
      vi.mocked(storage.updateGoal).mockResolvedValue({
        ...existingGoal,
        status: 'achieved',
        achievedAt: new Date(),
      });

      const response = await request(athleteApp)
        .patch(`/api/goals/${mockGoalId}/status`)
        .send({ status: 'achieved' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('achieved');
      expect(response.body.achievedAt).toBeDefined();
    });

    it('should update status to abandoned', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(existingGoal);
      vi.mocked(storage.updateGoal).mockResolvedValue({
        ...existingGoal,
        status: 'abandoned',
      });

      const response = await request(athleteApp)
        .patch(`/api/goals/${mockGoalId}/status`)
        .send({ status: 'abandoned' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('abandoned');
    });

    it('should reject invalid status value', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(existingGoal);

      const response = await request(athleteApp)
        .patch(`/api/goals/${mockGoalId}/status`)
        .send({ status: 'invalid_status' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Status must be one of');
    });

    it('should reject empty status', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(existingGoal);

      const response = await request(athleteApp)
        .patch(`/api/goals/${mockGoalId}/status`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should reject coach updating athlete goal status', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(existingGoal);

      const response = await request(coachApp)
        .patch(`/api/goals/${mockGoalId}/status`)
        .send({ status: 'achieved' });

      expect(response.status).toBe(403);
    });

    it('should reject site admin updating goal status', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(existingGoal);

      const response = await request(siteAdminApp)
        .patch(`/api/goals/${mockGoalId}/status`)
        .send({ status: 'achieved' });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent goal', async () => {
      vi.mocked(storage.getGoal).mockResolvedValue(undefined);

      const response = await request(athleteApp)
        .patch(`/api/goals/${mockGoalId}/status`)
        .send({ status: 'achieved' });

      expect(response.status).toBe(404);
    });
  });

  // ============================================
  // DELETE /api/goals/:id - Delete Goal
  // ============================================
  describe('DELETE /api/goals/:id', () => {
    const existingGoal = {
      id: mockGoalId,
      userId: mockAthleteId,
      metric: 'FLY10_TIME',
      goalType: 'target_value',
      targetValue: '1.0',
      baselineValue: '1.2',
      currentValue: '1.1',
      targetDate: '2024-12-31',
      status: 'active',
      createdAt: new Date('2024-01-15'),
    };

    it('should delete own goal', async () => {
      vi.mocked(storage.deleteGoal).mockResolvedValue(undefined);

      const response = await request(athleteApp).delete(`/api/goals/${mockGoalId}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted successfully');
      expect(storage.deleteGoal).toHaveBeenCalledWith(mockGoalId, mockAthleteId);
    });

    it('should silently succeed when deleting non-existent or non-owned goal (security: no enumeration)', async () => {
      // Storage layer enforces ownership by using WHERE userId = currentUserId
      // If goal doesn't exist or belongs to someone else, delete affects 0 rows
      // This is intentional to prevent user enumeration attacks
      vi.mocked(storage.deleteGoal).mockResolvedValue(undefined);

      const response = await request(athleteApp).delete(`/api/goals/${mockGoalId}`);

      expect(response.status).toBe(200);
      expect(storage.deleteGoal).toHaveBeenCalledWith(mockGoalId, mockAthleteId);
    });

    it('should use different userId for coach attempting delete (ownership enforced in storage)', async () => {
      vi.mocked(storage.deleteGoal).mockResolvedValue(undefined);

      const response = await request(coachApp).delete(`/api/goals/${mockGoalId}`);

      expect(response.status).toBe(200);
      // Ownership is enforced in storage layer - coach's userId won't match goal's userId
      expect(storage.deleteGoal).toHaveBeenCalledWith(mockGoalId, mockCoachId);
    });

    it('should use different userId for site admin attempting delete (ownership enforced in storage)', async () => {
      vi.mocked(storage.deleteGoal).mockResolvedValue(undefined);

      const response = await request(siteAdminApp).delete(`/api/goals/${mockGoalId}`);

      expect(response.status).toBe(200);
      // Ownership is enforced in storage layer - admin's userId won't match goal's userId
      expect(storage.deleteGoal).toHaveBeenCalledWith(mockGoalId, mockSiteAdminId);
    });

    it('should return 400 for invalid UUID format', async () => {
      const response = await request(athleteApp).delete('/api/goals/invalid-uuid');

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid goal ID format');
    });
  });
});
