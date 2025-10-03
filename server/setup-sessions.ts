/**
 * Session configuration and setup
 */

import { type Express } from "express";
import session from "express-session";
import { env, isProduction } from "./config/env";
import { logger } from "./utils/logger";

export async function setupSessions(app: Express) {
  // Initialize Redis client for session storage (optional)
  let redisClient = null;
  try {
    // Try to dynamically import Redis packages if available
    // @ts-expect-error - Redis is an optional dependency that may not be installed
    const redisModule = await import("redis").catch(() => null);

    if (redisModule) {
      const { createClient } = redisModule;
      const redisUrl = env.REDIS_URL || 'redis://localhost:6379';
      redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000,  // 5s is better than 60s for health checks
          reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000),  // Exponential backoff capped at 3s
        }
      });

      redisClient.on('error', (err: any) => {
        logger.warn('Redis client error', { error: err });
        logger.warn('Falling back to in-memory session store');
      });

      // Try to connect to Redis
      await redisClient.connect().catch((err: any) => {
        logger.warn('Could not connect to Redis', { error: err });
        logger.warn('Using in-memory session store instead');
        redisClient = null;
      });
    } else {
      logger.warn('Redis module not available');
    }
  } catch (error: any) {
    logger.warn('Redis packages not available or initialization failed', { error: error?.message || error });
    logger.warn('Using in-memory session store instead');
    redisClient = null;
  }

  // Configure session store
  const sessionConfig: any = {
    secret: env.SESSION_SECRET,
    resave: false,  // Don't save unchanged sessions
    saveUninitialized: false,  // Don't create sessions for unauthenticated users
    cookie: {
      secure: isProduction, // HTTPS only in production
      httpOnly: true, // Prevent XSS attacks
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict' // CSRF protection
    }
  };

  // Use Redis store if available, otherwise fall back to memory store
  if (redisClient) {
    try {
      // @ts-expect-error - connect-redis is an optional dependency that may not be installed
      const redisStoreModule = await import("connect-redis").catch(() => null);
      if (redisStoreModule) {
        const { RedisStore } = redisStoreModule;
        sessionConfig.store = new RedisStore({
          client: redisClient,
          prefix: 'athletemetrics:sess:',
          ttl: 24 * 60 * 60 // 24 hours in seconds
        });
        logger.info('Using Redis session store');
      } else {
        logger.warn('connect-redis module not available');
        logger.warn('WARNING: Using in-memory session store. Sessions will be lost on server restart!');

        // Critical warning in production but allow degraded mode for availability
        if (isProduction) {
          logger.error('CRITICAL: Redis session store unavailable in production!');
          logger.error('Sessions will be lost on restart. This is NOT recommended for production.');
          logger.error('Install connect-redis package for production deployments.');
        }
      }
    } catch (error: any) {
      logger.warn('Failed to create Redis store', { error: error?.message || error });
      logger.warn('WARNING: Using in-memory session store. Sessions will be lost on server restart!');

      // Critical warning in production but allow degraded mode for availability
      if (isProduction) {
        logger.error('CRITICAL: Redis session store failed to initialize in production!');
        logger.error('Sessions will be lost on restart. This is NOT recommended for production.');
        logger.error('Check REDIS_URL and ensure Redis is available.');
      }
    }
  } else {
    logger.warn('WARNING: Using in-memory session store. Sessions will be lost on server restart!');

    // Critical warning in production but allow degraded mode for availability
    if (isProduction) {
      logger.error('CRITICAL: Redis session store unavailable in production!');
      logger.error('Sessions will be lost on restart. This is NOT recommended for production.');
      logger.error('Set REDIS_URL and ensure redis package is installed.');
    }
  }

  app.use(session(sessionConfig));
}
