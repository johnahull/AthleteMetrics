import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

/**
 * Tests for production error sanitization
 *
 * Verifies that sensitive error information (stack traces, database errors,
 * file paths) is not exposed to clients in production mode, while preserving
 * detailed errors for development debugging.
 *
 * OWASP A05:2021 - Security Misconfiguration (Information Disclosure)
 */
describe('Error Sanitization', () => {
  let app: express.Application;
  let originalEnv: string | undefined;

  // Recreate the error handler from server/index.ts
  const createErrorHandler = () => {
    return (err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;

      // In production, sanitize ALL error messages to prevent information disclosure
      let message = err.message || "Internal Server Error";
      if (process.env.NODE_ENV === 'production') {
        const safeMessages: Record<number, string> = {
          400: 'Bad Request',
          401: 'Unauthorized',
          403: 'Forbidden',
          404: 'Not Found',
          409: 'Conflict',
          422: 'Validation Error',
          429: 'Too Many Requests',
          500: 'Internal Server Error',
          503: 'Service Unavailable'
        };
        message = safeMessages[status] || 'Internal Server Error';
      }

      res.status(status).json({ message });
    };
  };

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;

    // Create fresh Express app for each test
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Production Mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should sanitize 500 Internal Server Error messages', async () => {
      app.get('/test', () => {
        const error: any = new Error('Detailed error: database connection failed at /var/app/db.ts:42');
        error.status = 500;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal Server Error');
      expect(response.body.message).not.toContain('database connection');
      expect(response.body.message).not.toContain('/var/app/db.ts');
    });

    it('should sanitize 400 Bad Request messages', async () => {
      app.post('/test', () => {
        const error: any = new Error('Invalid UUID format for user.mfaSecret field');
        error.status = 400;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).post('/test').send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Bad Request');
      expect(response.body.message).not.toContain('UUID');
      expect(response.body.message).not.toContain('mfaSecret');
    });

    it('should sanitize 401 Unauthorized messages', async () => {
      app.get('/test', () => {
        const error: any = new Error('JWT token expired at 2025-10-10T12:00:00Z');
        error.status = 401;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Unauthorized');
      expect(response.body.message).not.toContain('JWT');
      expect(response.body.message).not.toContain('expired');
    });

    it('should sanitize 403 Forbidden messages', async () => {
      app.get('/test', () => {
        const error: any = new Error('Access denied: requires SUPER_ADMIN role');
        error.status = 403;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Forbidden');
      expect(response.body.message).not.toContain('SUPER_ADMIN');
      expect(response.body.message).not.toContain('Access denied');
    });

    it('should sanitize 404 Not Found messages', async () => {
      app.get('/test', () => {
        const error: any = new Error('File not found: /app/config/secrets.json');
        error.status = 404;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Not Found');
      expect(response.body.message).not.toContain('secrets.json');
      expect(response.body.message).not.toContain('/app/config');
    });

    it('should sanitize 409 Conflict messages', async () => {
      app.post('/test', () => {
        const error: any = new Error('Unique constraint violation on users.email');
        error.status = 409;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).post('/test').send({});

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Conflict');
      expect(response.body.message).not.toContain('Unique constraint');
      expect(response.body.message).not.toContain('users.email');
    });

    it('should sanitize 422 Validation Error messages', async () => {
      app.post('/test', () => {
        const error: any = new Error('Validation failed: password must contain special characters');
        error.status = 422;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).post('/test').send({});

      expect(response.status).toBe(422);
      expect(response.body.message).toBe('Validation Error');
      expect(response.body.message).not.toContain('password');
      expect(response.body.message).not.toContain('special characters');
    });

    it('should sanitize 429 Rate Limit messages', async () => {
      app.get('/test', () => {
        const error: any = new Error('Rate limit exceeded: 100 requests from IP 192.168.1.1');
        error.status = 429;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(429);
      expect(response.body.message).toBe('Too Many Requests');
      expect(response.body.message).not.toContain('192.168.1.1');
      expect(response.body.message).not.toContain('100 requests');
    });

    it('should sanitize 503 Service Unavailable messages', async () => {
      app.get('/test', () => {
        const error: any = new Error('Database maintenance in progress, retry at 14:00 UTC');
        error.status = 503;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Service Unavailable');
      expect(response.body.message).not.toContain('Database maintenance');
      expect(response.body.message).not.toContain('14:00 UTC');
    });

    it('should use fallback message for unknown status codes', async () => {
      app.get('/test', () => {
        const error: any = new Error('Custom error with sensitive data');
        error.status = 418; // I'm a teapot (not in safe list)
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(418);
      expect(response.body.message).toBe('Internal Server Error');
      expect(response.body.message).not.toContain('Custom error');
      expect(response.body.message).not.toContain('sensitive data');
    });

    it('should not expose stack traces in response body', async () => {
      app.get('/test', () => {
        const error = new Error('Error with stack trace');
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(500);
      expect(response.body).not.toHaveProperty('stack');
      expect(JSON.stringify(response.body)).not.toContain('at Object');
      expect(JSON.stringify(response.body)).not.toContain('.ts:');
    });
  });

  describe('Development Mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should preserve detailed error messages in development', async () => {
      app.get('/test', () => {
        const error: any = new Error('Detailed error: database connection failed');
        error.status = 500;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Detailed error: database connection failed');
    });

    it('should preserve 400 error details in development', async () => {
      app.post('/test', () => {
        const error: any = new Error('Invalid UUID format for user.id');
        error.status = 400;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).post('/test').send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid UUID format for user.id');
    });

    it('should preserve validation error details in development', async () => {
      app.post('/test', () => {
        const error: any = new Error('Validation failed: email must be valid');
        error.status = 422;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).post('/test').send({});

      expect(response.status).toBe(422);
      expect(response.body.message).toBe('Validation failed: email must be valid');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should handle errors without status codes', async () => {
      app.get('/test', () => {
        throw new Error('Error without status code');
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal Server Error');
    });

    it('should handle errors without messages', async () => {
      app.get('/test', () => {
        const error: any = new Error();
        error.status = 500;
        throw error;
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal Server Error');
    });

    it('should handle non-Error objects', async () => {
      app.get('/test', () => {
        throw { status: 500, message: 'Custom error object' };
      });
      app.use(createErrorHandler());

      const response = await request(app).get('/test');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal Server Error');
    });
  });
});
