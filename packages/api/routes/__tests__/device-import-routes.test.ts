/**
 * Device Import Routes — Auth, Validation, and Permission Tests
 *
 * Tests that all 5 device import endpoints enforce authentication,
 * org-role authorization (coach/admin), and Zod request validation.
 * Uses mocked storage and service to test route logic in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import session from 'express-session';

// Mock vite module
vi.mock('../../vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

// Mock storage
vi.mock('../../storage', () => ({
  storage: {
    getUserRoles: vi.fn(),
  },
}));

// Mock service to avoid DB calls
vi.mock('../../services/device-import-service', () => ({
  DeviceImportService: vi.fn().mockImplementation(() => ({
    parseAndMatch: vi.fn().mockResolvedValue({
      batchId: 'test-batch-id',
      preview: { athletes: [], summary: { totalAthletes: 0, exactMatches: 0, fuzzyMatches: 0, unmatched: 0, totalDrills: 0, outlierCount: 0 } },
      sessions: [],
      warnings: [],
    }),
    commitBatch: vi.fn().mockResolvedValue({
      measurementsCreated: 0,
      measurementsSkipped: 0,
      measurementsReplaced: 0,
      athletesImported: 0,
    }),
    rollbackBatch: vi.fn().mockResolvedValue(undefined),
    getBatches: vi.fn().mockResolvedValue([]),
    getBatchDetail: vi.fn().mockResolvedValue({ id: 'test-batch-id', status: 'completed' }),
  })),
}));

// Mock rate limiting to not interfere
vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock auth helpers
vi.mock('../../utils/auth-helpers', () => ({
  isSiteAdmin: vi.fn((user: any) => user?.isSiteAdmin === true),
}));

vi.mock('../../utils/rate-limit-utils', () => ({
  shouldSkipRateLimiting: vi.fn(() => true),
}));

import { storage } from '../../storage';
import { registerDeviceImportRoutes } from '../device-import-routes';

function createApp(sessionUser: any) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    })
  );
  // Inject session user
  app.use((req, _res, next) => {
    (req as any).session.user = sessionUser;
    next();
  });
  registerDeviceImportRoutes(app);
  return app;
}

// ============================================================================
// Authentication & Authorization
// ============================================================================

describe('Device Import Routes — Auth', () => {
  const coachUser = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
  const athleteUser = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
  const adminUser = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/import/device/parse', () => {
    it('returns 403 when athlete tries to parse', async () => {
      const app = createApp(athleteUser);
      (storage.getUserRoles as any).mockResolvedValue(['athlete']);

      const res = await request(app)
        .post('/api/import/device/parse')
        .field('source', 'dashr')
        .field('organizationId', 'org-1')
        .attach('file', Buffer.from('Date,First Name,Last Name,Type,Final Time\n'), {
          filename: 'test.csv',
          contentType: 'text/csv',
        });

      expect(res.status).toBe(403);
    });

    it('returns 200 when coach parses valid CSV', async () => {
      const app = createApp(coachUser);
      (storage.getUserRoles as any).mockResolvedValue(['coach']);

      const csvContent = 'Date,First Name,Last Name,Type,Final Time\n01/01/2025 10:00:00,John,Doe,Dash,4.5\n';
      const res = await request(app)
        .post('/api/import/device/parse')
        .field('source', 'dashr')
        .field('organizationId', 'org-1')
        .attach('file', Buffer.from(csvContent), {
          filename: 'test.csv',
          contentType: 'text/csv',
        });

      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid source', async () => {
      const app = createApp(coachUser);
      (storage.getUserRoles as any).mockResolvedValue(['coach']);

      const res = await request(app)
        .post('/api/import/device/parse')
        .field('source', 'invalid')
        .field('organizationId', 'org-1')
        .attach('file', Buffer.from('data'), {
          filename: 'test.csv',
          contentType: 'text/csv',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/import/device/commit', () => {
    it('returns 403 when athlete tries to commit', async () => {
      const app = createApp(athleteUser);
      (storage.getUserRoles as any).mockResolvedValue(['athlete']);

      const res = await request(app)
        .post('/api/import/device/commit')
        .send({
          batchId: '00000000-0000-4000-8000-000000000001',
          organizationId: 'org-1',
          duplicateStrategy: 'skip',
          addMissingEventMetrics: false,
          athletes: [],
        });

      expect(res.status).toBe(403);
    });

    it('returns 200 when coach commits', async () => {
      const app = createApp(coachUser);
      (storage.getUserRoles as any).mockResolvedValue(['coach']);

      const res = await request(app)
        .post('/api/import/device/commit')
        .send({
          batchId: '00000000-0000-4000-8000-000000000001',
          organizationId: 'org-1',
          duplicateStrategy: 'skip',
          addMissingEventMetrics: false,
          athletes: [],
        });

      expect(res.status).toBe(200);
    });

    it('returns 400 for missing batchId', async () => {
      const app = createApp(coachUser);
      (storage.getUserRoles as any).mockResolvedValue(['coach']);

      const res = await request(app)
        .post('/api/import/device/commit')
        .send({
          organizationId: 'org-1',
          duplicateStrategy: 'skip',
          athletes: [],
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/import/device/batches', () => {
    it('returns 403 when athlete tries to list batches', async () => {
      const app = createApp(athleteUser);
      (storage.getUserRoles as any).mockResolvedValue(['athlete']);

      const res = await request(app)
        .get('/api/import/device/batches')
        .query({ organizationId: 'org-1' });

      expect(res.status).toBe(403);
    });

    it('returns 400 for missing organizationId', async () => {
      const app = createApp(coachUser);

      const res = await request(app)
        .get('/api/import/device/batches');

      expect(res.status).toBe(400);
    });

    it('returns 200 for coach with valid org', async () => {
      const app = createApp(coachUser);
      (storage.getUserRoles as any).mockResolvedValue(['coach']);

      const res = await request(app)
        .get('/api/import/device/batches')
        .query({ organizationId: 'org-1' });

      expect(res.status).toBe(200);
    });

    it('site admin bypasses role check', async () => {
      const app = createApp(adminUser);

      const res = await request(app)
        .get('/api/import/device/batches')
        .query({ organizationId: 'org-1' });

      expect(res.status).toBe(200);
      expect(storage.getUserRoles).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/import/device/batches/:batchId', () => {
    it('returns 403 when athlete tries to get detail', async () => {
      const app = createApp(athleteUser);
      (storage.getUserRoles as any).mockResolvedValue(['athlete']);

      const res = await request(app)
        .get('/api/import/device/batches/00000000-0000-4000-8000-000000000001')
        .query({ organizationId: 'org-1' });

      expect(res.status).toBe(403);
    });

    it('returns 200 for coach', async () => {
      const app = createApp(coachUser);
      (storage.getUserRoles as any).mockResolvedValue(['coach']);

      const res = await request(app)
        .get('/api/import/device/batches/00000000-0000-4000-8000-000000000001')
        .query({ organizationId: 'org-1' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/import/device/batches/:batchId/rollback', () => {
    it('returns 403 when athlete tries to rollback', async () => {
      const app = createApp(athleteUser);
      (storage.getUserRoles as any).mockResolvedValue(['athlete']);

      const res = await request(app)
        .post('/api/import/device/batches/00000000-0000-4000-8000-000000000001/rollback')
        .send({ organizationId: 'org-1' });

      expect(res.status).toBe(403);
    });

    it('returns 200 for coach', async () => {
      const app = createApp(coachUser);
      (storage.getUserRoles as any).mockResolvedValue(['coach']);

      const res = await request(app)
        .post('/api/import/device/batches/00000000-0000-4000-8000-000000000001/rollback')
        .send({ organizationId: 'org-1' });

      expect(res.status).toBe(200);
    });

    it('returns 400 for missing organizationId', async () => {
      const app = createApp(coachUser);

      const res = await request(app)
        .post('/api/import/device/batches/00000000-0000-4000-8000-000000000001/rollback')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
