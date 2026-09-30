/**
 * Server setup and route registration
 *
 * This file contains:
 * - Session configuration and middleware
 * - Security middleware (CSRF, rate limiting, sanitization)
 * - Route registration via registerAllRoutes()
 * - Default admin user initialization
 *
 * Route handlers are defined in modular files under ./routes/
 */

import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "http";
import session from "express-session";
import passport from "passport";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import csrf from "csrf";
import DOMPurify from "isomorphic-dompurify";
import { storage } from "./storage";
import { PermissionChecker } from "./permissions";
import { shouldSkipRateLimiting } from "./utils/rate-limit-utils";
import { isSiteAdmin } from "@shared/auth-utils";
import { z } from "zod";
import bcrypt from "bcrypt";
import { AccessController } from "./access-control";
import { METRIC_CONFIG } from "@shared/analytics-types";
import { AuthSecurity } from "./auth/security";
import { validateAIProviderConfiguration } from "./services/ai-insights-service";
import { registerAllRoutes } from "./routes/index";
import { configurePassport } from "./auth/passport-config";
import { registerOAuthRoutes } from "./routes/oauth-routes";

// Session configuration
declare module 'express-session' {
  interface SessionData {
    sessionToken?: string; // Added for enhanced auth
    user?: {
      id: string;
      username: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      athleteId?: string;
      isSiteAdmin?: boolean; // Added for clarity
      primaryOrganizationId?: string; // Added to store primary org ID
      emailVerified?: boolean; // Added for enhanced auth
    };
    // Keep old admin for transition
    admin?: boolean;
    // Impersonation fields
    originalUser?: {
      id: string;
      username: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      athleteId?: string;
      isSiteAdmin?: boolean;
      primaryOrganizationId?: string; // Added to store primary org ID
      emailVerified?: boolean; // Added for enhanced auth
    };
    isImpersonating?: boolean;
    impersonationStartTime?: Date;
  }
}

// Initialize permission checker and access controller
const permissionChecker = new PermissionChecker(storage);
const accessController = new AccessController(storage);

// User type for session user objects
interface SessionUser {
  id: string;
  role?: string;
  isSiteAdmin?: boolean | string;
  admin?: boolean;
  primaryOrganizationId?: string;
  username?: string;
  athleteId?: string;
}

// Centralized error handling utility
const handleError = (error: unknown, res: Response, operation: string, statusCode: number = 500) => {
  console.error(`Error in ${operation}:`, error);
  
  // Handle different error types
  if (error instanceof z.ZodError) {
    return res.status(400).json({ 
      message: "Validation error", 
      errors: error.errors 
    });
  }
  
  if (error instanceof Error) {
    // Don't expose internal error messages in production
    const isProduction = process.env.NODE_ENV === 'production';
    return res.status(statusCode).json({ 
      message: isProduction ? `Failed to ${operation}` : error.message 
    });
  }
  
  return res.status(statusCode).json({ 
    message: `Failed to ${operation}` 
  });
};

// Measurement filters type
interface MeasurementFilters {
  userId?: string;
  athleteId?: string;
  playerId?: string;
  teamIds?: string[];
  organizationId?: string;
  metric?: string;
  dateFrom?: string;
  dateTo?: string;
  birthYearFrom?: number;
  birthYearTo?: number;
  ageFrom?: number;
  ageTo?: number;
  search?: string;
  sport?: string;
  gender?: string;
  position?: string;
  includeUnverified?: boolean;
}

// Legacy helper functions (to be removed gradually)
const canManageUsers = async (userId: string, organizationId: string): Promise<boolean> => {
  return await accessController.canManageOrganization(userId, organizationId);
};

// Helper functions for access control
const canAccessOrganization = async (user: SessionUser | null | undefined, organizationId: string): Promise<boolean> => {
  if (!user?.id) return false;
  return await accessController.canAccessOrganization(user.id, organizationId);
};

const hasRole = (user: SessionUser | null | undefined, role: string): boolean => {
  return user?.role === role;
};

// Helper to get default unit for a metric from METRIC_CONFIG
const getDefaultUnit = (metric: string): string => {
  const config = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  // Use nullish coalescing to allow empty string units (e.g., RSI)
  return config?.unit ?? 's'; // Default to seconds if metric not found
};

// Unified invitation permission checker
const checkInvitationPermissions = async (inviterId: string, invitationType: 'general', targetRole: string, organizationId?: string | null): Promise<{ allowed: boolean; reason?: string }> => {
  if (!inviterId) {
    return { allowed: false, reason: "No inviter ID provided" };
  }

  const inviter = await storage.getUser(inviterId);
  if (!inviter) {
    return { allowed: false, reason: "Inviter not found" };
  }

  // Site admins can invite anyone to any role anywhere
  if (isSiteAdmin(inviter)) {
    return { allowed: true };
  }

  // For non-site admins, organization context is required
  if (!organizationId) {
    return { allowed: false, reason: "Organization context required for non-site admin invitations" };
  }

  // Check inviter's roles in the organization
  const inviterRoles = await storage.getUserRoles(inviterId, organizationId);

  // Organization admins can invite anyone within their organization
  if (inviterRoles.includes("org_admin")) {
    return { allowed: true };
  }

  // Coaches can only invite athletes
  if (inviterRoles.includes("coach")) {
    if (targetRole === "athlete") {
      return { allowed: true };
    } else {
      return { allowed: false, reason: "Coaches can only invite athletes" };
    }
  }

  // If user has roles but none with invitation permissions
  if (inviterRoles.length > 0) {
    return { allowed: false, reason: "Insufficient permissions to send invitations" };
  }

  // If no organization context and not site admin, deny
  return { allowed: false, reason: "Insufficient permissions to send invitations" };
};

// Old requireSiteAdmin removed - now using middleware version

// Initialize default site admin user
export async function initializeDefaultUser() {
  // Environment validation is outside try-catch to allow process.exit errors to propagate in tests
  const adminUser = process.env.ADMIN_USER;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL; // Optional: email address for admin

  // Require admin credentials to be set in environment variables
  if (!adminUser || !adminPassword) {
    console.error("SECURITY: ADMIN_USER and ADMIN_PASSWORD environment variables must be set");
    process.exit(1);
  }

  // Validate username
  if (adminUser.length < 3) {
    console.error("SECURITY: ADMIN_USER must be at least 3 characters long");
    process.exit(1);
  }

  // Validate password strength and complexity
  if (adminPassword.length < 12) {
    console.error("SECURITY: ADMIN_PASSWORD must be at least 12 characters long");
    process.exit(1);
  }

  // Validate password complexity (same requirements as user passwords)
  const { PASSWORD_REGEX } = await import("@shared/password-requirements");
  if (!PASSWORD_REGEX.lowercase.test(adminPassword)) {
    console.error("SECURITY: ADMIN_PASSWORD must contain at least one lowercase letter");
    process.exit(1);
  }
  if (!PASSWORD_REGEX.uppercase.test(adminPassword)) {
    console.error("SECURITY: ADMIN_PASSWORD must contain at least one uppercase letter");
    process.exit(1);
  }
  if (!PASSWORD_REGEX.number.test(adminPassword)) {
    console.error("SECURITY: ADMIN_PASSWORD must contain at least one number");
    process.exit(1);
  }
  if (!PASSWORD_REGEX.specialChar.test(adminPassword)) {
    console.error("SECURITY: ADMIN_PASSWORD must contain at least one special character");
    process.exit(1);
  }

  try {
    // Combine updates into single atomic operation to prevent race conditions
    // Always enter transaction to perform secure user lookup with row lock
    const { db } = await import("./db");
    const { eq } = await import("drizzle-orm");
    const { users } = await import("@shared/schema");

    // Use database transaction for atomicity
    // This eliminates TOCTOU vulnerability by fetching and locking user in single atomic operation
    let revokedCount = 0;
    let passwordMatches = false;
    let userCreated = false;

    try {
      await db.transaction(async (tx) => {
      // CRITICAL: Fetch and lock user row inside transaction to prevent TOCTOU
      // This prevents race condition where user data could change between fetch and lock
      // SELECT FOR UPDATE locks the row AND fetches fresh data in one atomic operation
      const existingUsers = await tx.select()
        .from(users)
        .where(eq(users.username, adminUser))
        .for('update'); // SELECT ... FOR UPDATE (row-level lock)

      if (existingUsers.length === 0) {
        // User doesn't exist - create new admin user
        // Note: Site admins have role=site_admin and isSiteAdmin=true
        // role is for organization-level permissions (athlete, coach, org_admin, site_admin)
        // while isSiteAdmin grants platform-wide access independent of organizations
        const bcryptImport = await import("bcrypt");
        const hashedPassword = await bcryptImport.default.hash(adminPassword, 14);

        await tx.insert(users).values({
          username: adminUser,
          emails: adminEmail ? [adminEmail] : [], // Optional email
          password: hashedPassword,
          passwordChangedAt: new Date(),
          firstName: "Site",
          lastName: "Administrator",
          fullName: "Site Administrator",
          isSiteAdmin: true
        });

        userCreated = true;
        return; // Exit transaction early for new user creation
      }

      // User exists - check if password needs to be synced with environment variable
      const lockedUser = existingUsers[0];

      // CRITICAL: Compare password INSIDE transaction using fresh data from locked row
      // This prevents TOCTOU vulnerability where password could change between fetch and use
      // Using lockedUser.password ensures we compare against current value
      // Note: lockedUser.password should always exist for site admin users (non-OAuth)
      passwordMatches = lockedUser.password ? await bcrypt.compare(adminPassword, lockedUser.password) : false;

      // Check privilege restoration AFTER password comparison to use fresh transaction context
      const needsPrivilegeRestore = lockedUser.isSiteAdmin !== true;

      const updateData: any = {};

      if (!passwordMatches) {
        // Password in environment has changed - update the database
        // Note: Must hash manually in transaction (can't use storage.updateUser)
        // Use 14 rounds per OWASP recommendation for high-value admin accounts
        // (Higher than standard 12 rounds due to elevated privilege level)
        const bcryptImport = await import("bcrypt");
        updateData.password = await bcryptImport.default.hash(adminPassword, 14);
        updateData.passwordChangedAt = new Date();

        // CRITICAL: Revoke all sessions when password changes
        // This ensures all active sessions are invalidated and users must re-authenticate
        // with the new password for security
        // Pass tx to ensure session deletion is part of the same transaction
        revokedCount = await AuthSecurity.revokeAllSessions(lockedUser.id, { throwOnError: true, tx });
      }

      if (needsPrivilegeRestore) {
        // SECURITY: Auto-restore isSiteAdmin flag only if explicitly enabled
        // This prevents automatic privilege escalation after security team demotes admin
        // DEFAULT: false (requires explicit opt-in for security)
        const allowPrivilegeRestore = process.env.ALLOW_ADMIN_PRIVILEGE_RESTORE === 'true';

        if (allowPrivilegeRestore) {
          // Ensure isSiteAdmin flag is set (in case it was changed)
          updateData.isSiteAdmin = true;
          console.warn('SECURITY WARNING: Auto-restoring site admin privileges. Set ALLOW_ADMIN_PRIVILEGE_RESTORE=false to disable.');
        } else {
          console.error('SECURITY ALERT: Site admin privileges were revoked but auto-restore is disabled. Manual intervention required.');
          console.error('To restore privileges, set ALLOW_ADMIN_PRIVILEGE_RESTORE=true and restart the server.');

          // CRITICAL: Audit log for blocked privilege restoration attempt
          // This creates a security audit trail when automatic privilege escalation is prevented
          const { auditLogs } = await import("@shared/schema");
          const SYSTEM_IP = '127.0.0.1';
          await tx.insert(auditLogs).values({
            userId: lockedUser.id,
            action: 'privilege_restoration_blocked',
            resourceType: 'user',
            resourceId: lockedUser.id,
            details: JSON.stringify({
              username: adminUser,
              currentState: 'isSiteAdmin=false',
              attemptedAction: 'auto_restore_privileges',
              blockReason: 'ALLOW_ADMIN_PRIVILEGE_RESTORE=false',
              securityNote: 'Manual intervention required',
              timestamp: new Date().toISOString()
            }),
            ipAddress: SYSTEM_IP,
            userAgent: 'System',
          });
        }
      }

      // Single atomic update within transaction to prevent race conditions
      if (Object.keys(updateData).length > 0) {
        await tx.update(users)
          .set(updateData)
          .where(eq(users.id, lockedUser.id));
      }

      // Create audit logs INSIDE transaction for atomicity
      // Use consistent IP address for all server-initiated actions
      const SYSTEM_IP = '127.0.0.1';
      const { auditLogs } = await import("@shared/schema");

      if (!passwordMatches) {
        // Audit log for password sync
        await tx.insert(auditLogs).values({
          userId: lockedUser.id,
          action: 'admin_password_synced',
          resourceType: 'user',
          resourceId: lockedUser.id,
          details: JSON.stringify({
            username: adminUser,
            syncReason: 'environment_variable_mismatch',
            timestamp: new Date().toISOString()
          }),
          ipAddress: SYSTEM_IP, // Server-initiated
          userAgent: 'System',
        });

        // Audit log for session revocation with count
        await tx.insert(auditLogs).values({
          userId: lockedUser.id,
          action: 'sessions_revoked',
          resourceType: 'user',
          resourceId: lockedUser.id,
          details: JSON.stringify({
            reason: 'password_sync',
            revokedCount: revokedCount,
            securityContext: 'password_change',
            timestamp: new Date().toISOString()
          }),
          ipAddress: SYSTEM_IP,
          userAgent: 'System',
        });
      }

      // Only create privilege_restored audit log if privileges were actually restored
      // (not if restoration was blocked by ALLOW_ADMIN_PRIVILEGE_RESTORE=false)
      if (needsPrivilegeRestore && updateData.isSiteAdmin === true) {
        // Audit log for privilege restoration
        await tx.insert(auditLogs).values({
          userId: lockedUser.id,
          action: 'privilege_restored',
          resourceType: 'user',
          resourceId: lockedUser.id,
          details: JSON.stringify({
            username: adminUser,
            previousState: 'isSiteAdmin=false',
            newState: 'isSiteAdmin=true',
            restorationReason: 'startup_verification',
            timestamp: new Date().toISOString()
          }),
          ipAddress: SYSTEM_IP,
          userAgent: 'System',
        });
      }
    });
    } catch (txError: any) {
      // Handle duplicate username errors from transaction
      // This can happen when multiple processes/tests try to create the admin user concurrently
      const errorMessage = txError?.message || String(txError);
      const isDuplicateUsername = (errorMessage.includes('duplicate key') || errorMessage.includes('duplicate')) &&
                                   (errorMessage.includes('users_username_unique') || errorMessage.includes('username'));

      if (isDuplicateUsername) {
        // Admin user already exists (created by concurrent transaction) - this is OK
        console.log(`Admin user "${adminUser}" already exists (created by concurrent process)`);
        return; // Exit function successfully - user exists
      }

      // Re-throw other transaction errors
      throw txError;
    }

    // Console logging after successful transaction
    if (userCreated) {
      console.log(`Site administrator account created successfully: ${adminUser}`);
    } else if (!passwordMatches) {
      console.log(`Site administrator password synced with environment variable: ${adminUser}`);
      console.log(`Revoked ${revokedCount} active session(s) for security`);
    }
  } catch (error) {
    console.error("Error initializing default user:", error);

    // In test environments, throw the error so tests can assert on it
    // In production, exit the process to prevent running with broken admin setup
    if (process.env.NODE_ENV === 'test') {
      throw error;
    } else {
      process.exit(1);
    }
  }
}

export async function registerRoutes(app: Express) {
  const server = createServer(app);

  // Session setup with security best practices - MUST BE BEFORE ROUTES
  // Note: SESSION_SECRET validation is now done at startup in server/index.ts
  const sessionSecret = process.env.SESSION_SECRET!; // Already validated at startup

  // Initialize Redis client for session storage (optional)
  let redisClient = null;
  try {
    // Try to dynamically import Redis packages if available
    // @vite-ignore prevents Vite from bundling Redis during build (optional runtime dependency)
    // @ts-expect-error - Redis is an optional dependency that may not be installed
    const redisModule = await import(/* @vite-ignore */ "redis").catch(() => null);
    
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
  // Detect localhost for cookie security - CI runs production mode on localhost
  const databaseUrl = process.env.DATABASE_URL || '';
  const isLocalhost = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');

  const sessionConfig: any = {
    secret: sessionSecret,
    resave: false,  // Don't save unchanged sessions
    saveUninitialized: false,  // Don't create sessions for unauthenticated users
    cookie: {
      // Secure cookies only in production AND not on localhost
      // CI runs NODE_ENV=production but uses localhost database/server
      // Secure cookies require HTTPS, which localhost doesn't provide
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      httpOnly: true, // Prevent XSS attacks
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict' // CSRF protection
    }
  };

  // Try Redis first (if available), then PostgreSQL, then fall back to memory store
  let sessionStoreConfigured = false;

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
        sessionStoreConfigured = true;
      }
    } catch (error: any) {
      console.warn('Failed to create Redis store:', error?.message || error);
    }
  }

  // If Redis is not available, use PostgreSQL session store
  if (!sessionStoreConfigured) {
    try {
      const connectPgSimple = await import("connect-pg-simple");
      const PgStore = connectPgSimple.default(session);
      const { sessionPool } = await import("./db");

      sessionConfig.store = new PgStore({
        pool: sessionPool, // Use pg.Pool (required for connect-pg-simple compatibility)
        tableName: 'session',
        createTableIfMissing: process.env.NODE_ENV !== 'production', // Only auto-create in development
        pruneSessionInterval: 60 * 15, // Prune expired sessions every 15 minutes
        errorLog: (error: any) => {
          console.error('CRITICAL: Session store error:', error);
          if (error.message?.includes('does not exist') && process.env.NODE_ENV === 'production') {
            console.error('Run database migration to create session table');
            process.exit(1); // Fail startup if table missing in production
          }
        }
      });
      console.log('Using PostgreSQL session store');
      sessionStoreConfigured = true;
    } catch (error: any) {
      console.warn('Failed to create PostgreSQL store:', error?.message || error);
      console.warn('WARNING: Using in-memory session store. Sessions will be lost on server restart!');
    }
  }

  app.use(session(sessionConfig));

  // Initialize Passport for OAuth authentication
  configurePassport();
  app.use(passport.initialize());
  app.use(passport.session());

  // CRITICAL: Sync req.session.user.id to database userId column for session revocation
  // connect-pg-simple does NOT automatically sync custom columns - we must do this manually
  // This middleware ensures that when password changes trigger revokeAllUserSessions(),
  // the query on the userId column actually finds sessions to delete
  // In-memory cache to track which sessions have had their userId synced to the database
  // This prevents redundant UPDATE queries on every request in stateless deployments
  // Uses a Map to store session IDs with timestamps for TTL-based cleanup
  // Max size: 10,000 entries | TTL: 24 hours (matches session cookie lifetime)
  const syncedSessions = new Map<string, number>();
  const SYNCED_SESSIONS_MAX_SIZE = 10000;
  const SYNCED_SESSIONS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Cleanup expired entries periodically to prevent memory leak
  // Runs every hour to remove sessions older than TTL
  setInterval(() => {
    try {
      const now = Date.now();
      let cleaned = 0;
      for (const [sessionId, timestamp] of syncedSessions.entries()) {
        if (now - timestamp > SYNCED_SESSIONS_TTL_MS) {
          syncedSessions.delete(sessionId);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`Cleaned ${cleaned} expired session sync entries from cache`);
      }
    } catch (error) {
      console.error('Error during session cache cleanup:', error);
      // On error, clear the entire cache as a safety fallback
      // This prevents corrupted state and allows clean restart
      syncedSessions.clear();
      console.warn('Session cache cleared due to cleanup error - will rebuild on next requests');
    }
  }, 60 * 60 * 1000); // Run every hour

  // Session table name constant (used by connect-pg-simple)
  const SESSION_TABLE = 'session';

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    // Only sync if user is authenticated and session exists
    if (req.session && (req.session as any).user?.id) {
      const sessionUserId = (req.session as any).user.id;

      // Check if we need to update the database userId column
      // Only update if the session has a user but the database column is not yet set
      // AND if we haven't already synced this session (tracked via in-memory cache)
      // Also check if cached entry has expired (older than TTL)
      const cachedTimestamp = syncedSessions.get(req.sessionID);
      const isExpired = cachedTimestamp && (Date.now() - cachedTimestamp > SYNCED_SESSIONS_TTL_MS);

      if (sessionUserId && req.sessionID && (!cachedTimestamp || isExpired)) {
        try {
          const { pgClient } = await import("./db");

          // Update the userId column in the database to match req.session.user.id
          // This uses a raw query because Drizzle doesn't have direct access to connect-pg-simple's session store
          // Note: postgres-js uses SQL template strings, not .query() method
          // IMPORTANT: Only sync if the user exists (prevents FK violations during test cleanup)
          // The WHERE user_id IS NULL condition makes this idempotent for multi-instance deployments
          // Multiple instances may attempt the UPDATE, but only one will succeed
          const result = await pgClient`
            UPDATE ${pgClient.unsafe(SESSION_TABLE)}
            SET user_id = ${sessionUserId}
            WHERE sid = ${req.sessionID}
            AND user_id IS NULL
            AND EXISTS (SELECT 1 FROM users WHERE id = ${sessionUserId})
          `;

          // Only add to cache if we actually updated a row (count > 0)
          // This prevents caching failed updates while still being race-safe
          if (result.count > 0) {
            // Implement simple LRU eviction: if at max size, remove oldest entry
            if (syncedSessions.size >= SYNCED_SESSIONS_MAX_SIZE) {
              const oldestKey = syncedSessions.keys().next().value;
              if (oldestKey) {
                syncedSessions.delete(oldestKey);
              }
            }
            syncedSessions.set(req.sessionID, Date.now());
          }
        } catch (error) {
          // Log error but don't block the request - session is still valid
          // Don't add to cache on error so it can be retried on next request
          console.error('Failed to sync session userId:', error);
        }
      }
    }
    next();
  });

  // NOTE: Application routes are registered further below, AFTER the security
  // middleware (helmet, CSRF, input sanitization, rate limiting). Express runs
  // middleware in registration order and a matched route ends the chain, so the
  // security middleware must be registered first to actually protect the routes.

  // Security headers middleware
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], // Allow inline styles and Google Fonts
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"], // Allow Google Fonts (googleapis.com for CSS, gstatic.com for font files) for service worker caching
        fontSrc: ["'self'", "https://fonts.gstatic.com"], // Allow Google Fonts CDN
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    } : false, // Disable CSP in development for Vite compatibility
    crossOriginEmbedderPolicy: false, // Allow for development
  }));

  // CSRF protection setup
  const csrfTokens = new csrf();

  // CSRF protection middleware
  const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF for GET requests (safe operations)
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    // Allow disabling CSRF outside production so the integration test suite can
    // drive the API without fetching a token. This is IGNORED when
    // NODE_ENV === 'production', where CSRF is always enforced. (The test suite
    // runs under NODE_ENV=development, so a NODE_ENV-based check is unreliable;
    // the flag is set explicitly by tests/setup/integration-setup.ts.)
    if (process.env.NODE_ENV !== 'production' && process.env.DISABLE_CSRF === 'true') {
      return next();
    }

    // CSRF only defends against an attacker riding a victim's authenticated
    // session cookie. A request with no authenticated identity (mirrors
    // requireAuth: no session.user and no legacy session.admin) has no such
    // surface, so skip it. This covers every pre-authentication and public
    // token-based endpoint (registration, COPPA/parent consent links,
    // invitation/event-invitation accept-decline, email verification, magic
    // links) without having to enumerate each one — those tokens are themselves
    // unguessable and provide the CSRF protection. Authenticated mutations still
    // require a token (the web client attaches one to every request).
    const isAuthenticated = !!((req.session as any)?.user || (req.session as any)?.admin);
    if (!isAuthenticated) {
      return next();
    }

    // Skip CSRF for certain API endpoints that use other authentication
    // Note: req.path is relative to the mount point, so '/api' prefix is not included
    // - /login and /register: Pre-authentication endpoints
    // - /invitations/:token/accept: Public endpoint for new users without sessions
    //   Token format restricted to alphanumeric, dash, and underscore to prevent path traversal
    // - /import/photo, /import/parse-csv, /import/:type: File upload endpoints that use multipart/form-data
    //   SECURITY: Only specific multipart endpoints bypass CSRF, not all /import/* routes
    // - /invitations/:token/accept: New user registration endpoint (no session yet)
    //   SECURITY: Protected by: (1) single-use token, (2) SameSite cookies, (3) Referer header check, (4) rate limiting
    // Pre-authentication endpoints bypass CSRF since users don't have sessions yet
    // These are protected by: rate limiting, email verification tokens, and SameSite cookies
    const skipCsrfPaths = [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/validate-reset-token',
      '/auth/verify-email',
      '/import/photo',
      '/import/parse-csv',
      '/api/wellness/responses'
    ];
    const skipCsrfPatterns = [
      /^\/invitations\/[a-zA-Z0-9_-]+\/accept$/,  // Invitation acceptance for new users
      /^\/import\/(athletes|measurements)$/  // Dynamic import type endpoints (multipart only)
    ];
    // Note: /api/wellness/responses bypasses CSRF for magic-link access
    // Authenticated access still validates organization membership in the route handler

    // Use exact path matching to prevent path traversal attacks
    // Do NOT use startsWith() as it allows bypasses like "/login/../protected"
    if (skipCsrfPaths.includes(req.path) ||
        skipCsrfPatterns.some(pattern => pattern.test(req.path))) {
      return next();
    }

    // Check for CSRF token in headers or body
    const token = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'] || req.body._csrf;

    if (!token) {
      return res.status(403).json({ error: 'CSRF token missing' });
    }

    // Validate CSRF token
    const secret = (req.session as any)?.csrfSecret;
    if (!secret) {
      return res.status(403).json({ error: 'Invalid session' });
    }

    try {
      if (!csrfTokens.verify(secret, token as string)) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
      }
    } catch (error) {
      return res.status(403).json({ error: 'CSRF token validation failed' });
    }

    next();
  };

  // Generate CSRF token endpoint
  app.get('/api/csrf-token', (req: Request, res: Response) => {
    // Reuse existing secret to prevent multi-tab invalidation
    let secret = (req.session as any)?.csrfSecret;
    if (!secret) {
      secret = csrfTokens.secretSync();
      (req.session as any).csrfSecret = secret;
    }

    const token = csrfTokens.create(secret);
    res.json({ csrfToken: token });
  });

  // Apply CSRF protection to state-changing routes
  app.use('/api', csrfProtection);

  // Input sanitization middleware
  // Credential and opaque-token fields are never HTML-sanitized: DOMPurify would
  // silently truncate a password/token containing an HTML-special character
  // (e.g. "abc<def" -> "abc"), corrupting the value before the handler hashes or
  // compares it and locking the user out. These fields are never rendered as
  // HTML, so sanitizing them has no security benefit.
  const SANITIZE_SKIP_FIELDS = new Set([
    'password',
    'currentpassword',
    'newpassword',
    'oldpassword',
    'confirmpassword',
    'confirmnewpassword',
    'token',
    '_csrf',
  ]);
  const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    // Sanitize string fields in request body
    if (req.body && typeof req.body === 'object') {
      for (const key in req.body) {
        if (typeof req.body[key] === 'string' && !SANITIZE_SKIP_FIELDS.has(key.toLowerCase())) {
          req.body[key] = DOMPurify.sanitize(req.body[key]);
        }
      }
    }
    next();
  };

  // Apply input sanitization to all routes
  app.use(sanitizeInput);

  // Request-scoped cache middleware for performance optimization
  // Attaches a Map to req.cache for caching expensive operations within a request
  const { requestCacheMiddleware } = await import("./middleware/request-cache");
  app.use(requestCacheMiddleware);

  // Rate limiting for authentication endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 5, // Limit each IP to 5 requests per windowMs
    message: {
      error: "Too many authentication attempts, please try again in 15 minutes"
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req) => shouldSkipRateLimiting(req, 'auth')
  });

  // Rate limiting for API endpoints (general usage)
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: "Too many requests, please try again later"
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for local development
      return req.ip === '127.0.0.1' || req.ip === '::1';
    }
  });

  // Rate limiting for file upload endpoints
  // SECURITY: Reduced from 10,000/hour to prevent abuse
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: parseInt(process.env.UPLOAD_RATE_LIMIT || '20'), // Default: 20 uploads per 15 min
    message: {
      error: "Too many file uploads, please try again in 15 minutes"
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Rate limiting for creation endpoints
  const createLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 50, // Limit each IP to 50 create operations per windowMs
    message: {
      error: "Too many creation attempts, please slow down"
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Rate limiting for archive/unarchive operations (more restrictive)
  const archiveLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 20, // Limit each user to 20 archive operations per hour
    message: {
      error: "Too many archive operations, please try again later. Archive operations are limited to prevent abuse."
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for localhost and optionally in development if flag is set
      const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
      // Production safeguard: Never bypass rate limiting in production environment
      const isProduction = process.env.NODE_ENV === 'production';
      const bypassForDev = !isProduction && process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
      return isLocalhost || bypassForDev;
    }
  });

  // Rate limiting for team management operations (delete/modify team memberships)
  const teamManagementLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 30, // Limit each IP to 30 team management operations per 15 minutes
    message: {
      error: "Too many team management operations, please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for localhost and optionally in development if flag is set
      const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
      // Production safeguard: Never bypass rate limiting in production environment
      const isProduction = process.env.NODE_ENV === 'production';
      const bypassForDev = !isProduction && process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
      return isLocalhost || bypassForDev;
    }
  });

  // Rate limiting for invitation operations (resend/cancel)
  const invitationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10, // Limit each IP to 10 invitation operations per 15 minutes
    message: {
      error: "Too many invitation operations, please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
      const isProduction = process.env.NODE_ENV === 'production';
      const bypassForDev = !isProduction && process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
      return isLocalhost || bypassForDev;
    }
  });

  // Rate limiting for test email operations (development/staging only)
  const testEmailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 5, // Limit each IP to 5 test email operations per 15 minutes
    message: {
      error: "Too many test email requests, please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
      const isProduction = process.env.NODE_ENV === 'production';
      const bypassForDev = !isProduction && process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
      return isLocalhost || bypassForDev;
    }
  });

  // Apply general rate limiting to all API routes
  app.use('/api', apiLimiter);

  // Register application routes AFTER the security middleware above so that
  // helmet, CSRF protection, input sanitization and rate limiting all run
  // before any route handler can end the request.
  // Register OAuth routes - BEFORE other routes
  registerOAuthRoutes(app);
  // Register new refactored routes - AFTER session middleware
  registerAllRoutes(app);

  // Email validation function
  const isValidEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value.trim());
  };

  // Phone number validation function
  const isValidPhoneNumber = (value: string): boolean => {
    // Remove all non-digit characters for validation
    const cleaned = value.replace(/\D/g, '');
    // Support various formats:
    // - US/Canada: 10 digits or 1 + 10 digits
    // - International: 7-15 digits, optionally starting with +
    // - Extensions are not supported in this simplified version
    return /^(\+?1?\d{10}|\+?\d{7,15})$/.test(cleaned) && cleaned.length >= 7 && cleaned.length <= 15;
  };

  // Smart data placement function - detects emails and phone numbers regardless of column
  const smartPlaceContactData = (row: any): { emails: string[], phoneNumbers: string[], warnings: string[] } => {
    const emails: string[] = [];
    const phoneNumbers: string[] = [];
    const warnings: string[] = [];
    
    // Check all possible contact fields for smart detection
    const contactFields = ['emails', 'phoneNumbers', 'email', 'phone', 'contact', 'contactInfo'];
    
    contactFields.forEach(field => {
      if (row[field] && row[field].trim()) {
        const values = row[field].split(/[,;]/).map((v: string) => v.trim()).filter(Boolean);
        
        values.forEach((value: string) => {
          if (isValidEmail(value)) {
            if (!emails.includes(value)) {
              emails.push(value);
              if (field === 'phoneNumbers' || field === 'phone') {
                warnings.push(`Found email "${value}" in phone number field, moved to emails`);
              }
            }
          } else if (isValidPhoneNumber(value)) {
            if (!phoneNumbers.includes(value)) {
              phoneNumbers.push(value);
              if (field === 'emails' || field === 'email') {
                warnings.push(`Found phone number "${value}" in email field, moved to phone numbers`);
              }
            }
          } else if (value.length > 0) {
            // If it's not empty but doesn't match either format, warn about it
            warnings.push(`Unrecognized contact format: "${value}" in ${field} field`);
          }
        });
      }
    });
    
    return { emails, phoneNumbers, warnings };
  };

  // Initialize default user
  await initializeDefaultUser();

  // Validate AI provider configuration
  validateAIProviderConfiguration();

  // All routes are now registered via registerAllRoutes(app) above
  // The legacy route handlers have been fully migrated to modular route files in ./routes/

  return server;
}
