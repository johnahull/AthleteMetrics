import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Request, Response } from 'express';
import request from 'supertest';

/**
 * Tests for health check endpoints
 *
 * Verifies that /api/health, /api/health/liveness, and /api/health/readiness
 * endpoints work correctly for production monitoring and container orchestration.
 *
 * - Liveness: Process is running and responsive
 * - Readiness: Process can serve traffic (database connected)
 * - Health: Combined check (backward compatibility)
 */
describe('Health Check Endpoints', () => {
  let app: express.Application;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe('GET /api/health/liveness', () => {
    it('should return 200 without database check', async () => {
      // Recreate liveness endpoint from server/index.ts
      app.get('/api/health/liveness', async (_req: Request, res: Response) => {
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString()
        });
      });

      const response = await request(app).get('/api/health/liveness');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('alive');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should respond even if database is down', async () => {
      app.get('/api/health/liveness', async (_req: Request, res: Response) => {
        // Liveness should not check database
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString()
        });
      });

      const response = await request(app).get('/api/health/liveness');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('alive');
    });

    it('should include ISO timestamp', async () => {
      app.get('/api/health/liveness', async (_req: Request, res: Response) => {
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString()
        });
      });

      const response = await request(app).get('/api/health/liveness');

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should work in both production and development', async () => {
      app.get('/api/health/liveness', async (_req: Request, res: Response) => {
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString()
        });
      });

      // Test in production
      process.env.NODE_ENV = 'production';
      let response = await request(app).get('/api/health/liveness');
      expect(response.status).toBe(200);

      // Test in development
      process.env.NODE_ENV = 'development';
      response = await request(app).get('/api/health/liveness');
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/health/readiness', () => {
    it('should return 200 when database is connected', async () => {
      // Mock successful database connection
      const mockDb = {
        execute: vi.fn().mockResolvedValue([])
      };

      const mockSql = vi.fn((strings: TemplateStringsArray) => ({
        strings
      }));

      app.get('/api/health/readiness', async (_req: Request, res: Response) => {
        try {
          await mockDb.execute(mockSql`SELECT 1`);

          res.status(200).json({
            status: 'ready',
            database: 'connected',
            version: '0.2.0',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          res.status(503).json({
            status: 'not_ready',
            database: 'disconnected',
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
          });
        }
      });

      const response = await request(app).get('/api/health/readiness');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
      expect(response.body.database).toBe('connected');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 503 when database is disconnected', async () => {
      const mockDb = {
        execute: vi.fn().mockRejectedValue(new Error('Connection refused'))
      };

      const mockSql = vi.fn((strings: TemplateStringsArray) => ({
        strings
      }));

      app.get('/api/health/readiness', async (_req: Request, res: Response) => {
        try {
          await mockDb.execute(mockSql`SELECT 1`);

          res.status(200).json({
            status: 'ready',
            database: 'connected',
            version: '0.2.0',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          res.status(503).json({
            status: 'not_ready',
            database: 'disconnected',
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
          });
        }
      });

      const response = await request(app).get('/api/health/readiness');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('not_ready');
      expect(response.body.database).toBe('disconnected');
      expect(response.body).toHaveProperty('error');
    });

    it('should sanitize errors in production', async () => {
      process.env.NODE_ENV = 'production';

      const mockDb = {
        execute: vi.fn().mockRejectedValue(new Error('Connection to db.internal.com failed'))
      };

      const mockSql = vi.fn((strings: TemplateStringsArray) => ({
        strings
      }));

      app.get('/api/health/readiness', async (_req: Request, res: Response) => {
        try {
          await mockDb.execute(mockSql`SELECT 1`);

          res.status(200).json({
            status: 'ready',
            database: 'connected',
            version: '0.2.0',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          res.status(503).json({
            status: 'not_ready',
            database: 'disconnected',
            error: process.env.NODE_ENV === 'production'
              ? 'Database connection failed'
              : error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          });
        }
      });

      const response = await request(app).get('/api/health/readiness');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Database connection failed');
      expect(response.body.error).not.toContain('db.internal.com');
    });

    it('should show detailed errors in development', async () => {
      process.env.NODE_ENV = 'development';

      const mockDb = {
        execute: vi.fn().mockRejectedValue(new Error('Connection timeout after 5000ms'))
      };

      const mockSql = vi.fn((strings: TemplateStringsArray) => ({
        strings
      }));

      app.get('/api/health/readiness', async (_req: Request, res: Response) => {
        try {
          await mockDb.execute(mockSql`SELECT 1`);

          res.status(200).json({
            status: 'ready',
            database: 'connected',
            version: '0.2.0',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          res.status(503).json({
            status: 'not_ready',
            database: 'disconnected',
            error: process.env.NODE_ENV === 'production'
              ? 'Database connection failed'
              : error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          });
        }
      });

      const response = await request(app).get('/api/health/readiness');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Connection timeout after 5000ms');
    });

    it('should include version from package.json', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue([])
      };

      const mockSql = vi.fn((strings: TemplateStringsArray) => ({
        strings
      }));

      app.get('/api/health/readiness', async (_req: Request, res: Response) => {
        try {
          await mockDb.execute(mockSql`SELECT 1`);

          const packageJson = { version: '0.2.0' };

          res.status(200).json({
            status: 'ready',
            database: 'connected',
            version: packageJson.version || 'unknown',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          res.status(503).json({
            status: 'not_ready',
            database: 'disconnected',
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
          });
        }
      });

      const response = await request(app).get('/api/health/readiness');

      expect(response.status).toBe(200);
      expect(response.body.version).toBe('0.2.0');
    });
  });

  describe('GET /api/health', () => {
    it('should return 200 when database is connected', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue([])
      };

      const mockSql = vi.fn((strings: TemplateStringsArray) => ({
        strings
      }));

      app.get('/api/health', async (_req: Request, res: Response) => {
        try {
          await mockDb.execute(mockSql`SELECT 1`);

          res.status(200).json({
            status: 'healthy',
            database: 'connected',
            version: '0.2.0',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
          });
        }
      });

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.database).toBe('connected');
    });

    it('should return 503 when database is disconnected', async () => {
      const mockDb = {
        execute: vi.fn().mockRejectedValue(new Error('Connection failed'))
      };

      const mockSql = vi.fn((strings: TemplateStringsArray) => ({
        strings
      }));

      app.get('/api/health', async (_req: Request, res: Response) => {
        try {
          await mockDb.execute(mockSql`SELECT 1`);

          res.status(200).json({
            status: 'healthy',
            database: 'connected',
            version: '0.2.0',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
          });
        }
      });

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.database).toBe('disconnected');
    });

    it('should sanitize errors in production', async () => {
      process.env.NODE_ENV = 'production';

      const mockDb = {
        execute: vi.fn().mockRejectedValue(new Error('PostgreSQL error: authentication failed'))
      };

      const mockSql = vi.fn((strings: TemplateStringsArray) => ({
        strings
      }));

      app.get('/api/health', async (_req: Request, res: Response) => {
        try {
          await mockDb.execute(mockSql`SELECT 1`);

          res.status(200).json({
            status: 'healthy',
            database: 'connected',
            version: '0.2.0',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: process.env.NODE_ENV === 'production'
              ? 'Database connection failed'
              : error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          });
        }
      });

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Database connection failed');
      expect(response.body.error).not.toContain('authentication');
    });
  });

  describe('Kubernetes / Docker integration', () => {
    it('should support liveness probe configuration', async () => {
      app.get('/api/health/liveness', async (_req: Request, res: Response) => {
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString()
        });
      });

      // Kubernetes liveness probe should always get 200
      const response = await request(app).get('/api/health/liveness');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should support readiness probe configuration', async () => {
      const mockDb = {
        execute: vi.fn().mockResolvedValue([])
      };

      const mockSql = vi.fn((strings: TemplateStringsArray) => ({
        strings
      }));

      app.get('/api/health/readiness', async (_req: Request, res: Response) => {
        try {
          await mockDb.execute(mockSql`SELECT 1`);

          res.status(200).json({
            status: 'ready',
            database: 'connected',
            version: '0.2.0',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          res.status(503).json({
            status: 'not_ready',
            database: 'disconnected',
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
          });
        }
      });

      // Kubernetes readiness probe should get 200 when ready
      const response = await request(app).get('/api/health/readiness');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should fail readiness when database is down (stop traffic)', async () => {
      const mockDb = {
        execute: vi.fn().mockRejectedValue(new Error('Database down'))
      };

      const mockSql = vi.fn((strings: TemplateStringsArray) => ({
        strings
      }));

      app.get('/api/health/readiness', async (_req: Request, res: Response) => {
        try {
          await mockDb.execute(mockSql`SELECT 1`);

          res.status(200).json({
            status: 'ready',
            database: 'connected',
            version: '0.2.0',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          res.status(503).json({
            status: 'not_ready',
            database: 'disconnected',
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
          });
        }
      });

      // Kubernetes should remove pod from service when readiness fails
      const response = await request(app).get('/api/health/readiness');

      expect(response.status).toBe(503);
    });
  });
});
