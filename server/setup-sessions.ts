/**
 * Session configuration and setup
 */

import { type Express } from "express";
import session from "express-session";

export async function setupSessions(app: Express) {
  // Session setup with security best practices
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error("SECURITY: SESSION_SECRET environment variable must be set");
    process.exit(1);
  }

  if (sessionSecret.length < 32) {
    console.error("SECURITY: SESSION_SECRET must be at least 32 characters long");
    process.exit(1);
  }

  // Initialize Redis client for session storage (optional)
  let redisClient = null;
  try {
    // Try to dynamically import Redis packages if available
    // @ts-expect-error - Redis is an optional dependency that may not be installed
    const redisModule = await import("redis").catch(() => null);

    if (redisModule) {
      const { createClient } = redisModule;
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 60000
        }
      });

      redisClient.on('error', (err: any) => {
        console.warn('Redis client error:', err);
        console.warn('Falling back to in-memory session store');
      });

      // Try to connect to Redis
      await redisClient.connect().catch((err: any) => {
        console.warn('Could not connect to Redis:', err);
        console.warn('Using in-memory session store instead');
        redisClient = null;
      });
    } else {
      console.warn('Redis module not available');
    }
  } catch (error: any) {
    console.warn('Redis packages not available or initialization failed:', error?.message || error);
    console.warn('Using in-memory session store instead');
    redisClient = null;
  }

  // Configure session store
  const sessionConfig: any = {
    secret: sessionSecret,
    resave: false,  // Don't save unchanged sessions
    saveUninitialized: false,  // Don't create sessions for unauthenticated users
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
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
        console.log('Using Redis session store');
      } else {
        console.warn('connect-redis module not available');
        console.warn('WARNING: Using in-memory session store. Sessions will be lost on server restart!');
      }
    } catch (error: any) {
      console.warn('Failed to create Redis store:', error?.message || error);
      console.warn('WARNING: Using in-memory session store. Sessions will be lost on server restart!');
    }
  } else {
    console.warn('WARNING: Using in-memory session store. Sessions will be lost on server restart!');
  }

  app.use(session(sessionConfig));
}
