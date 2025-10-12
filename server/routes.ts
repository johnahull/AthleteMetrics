import type { Express, Request, Response, NextFunction } from "express";
import { createServer } from "http";
import session from "express-session";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import csrf from "csrf";
import { body, validationResult } from "express-validator";
import DOMPurify from "isomorphic-dompurify";
import { storage } from "./storage";
import { PermissionChecker, ACTIONS, RESOURCES, ROLES } from "./permissions";
import { validateUuidsOrThrow, validateUuidParams } from "./utils/validation";
import { sanitizeCSVValue } from "./utils/csv-utils";
import { insertOrganizationSchema, insertTeamSchema, insertAthleteSchema, insertMeasurementSchema, insertInvitationSchema, insertUserSchema, updateProfileSchema, changePasswordSchema, createSiteAdminSchema, userOrganizations, archiveTeamSchema, updateTeamMembershipSchema, type Invitation } from "@shared/schema";
import { isSiteAdmin } from "@shared/auth-utils";
import { TEAM_NAME_CONSTRAINTS } from "@shared/constants";
import { z, ZodError } from "zod";
import bcrypt from "bcrypt";
import { AccessController } from "./access-control";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { requireAuth, requireSiteAdmin, requireOrganizationAccess, requireTeamAccess, requireAthleteAccess, errorHandler } from "./middleware";
import { validateAnalyticsRequest } from "./validation/analytics-validation";
import { METRIC_CONFIG } from "@shared/analytics-types";
import { AuthSecurity } from "./auth/security";
import multer from "multer";
import csv from "csv-parser";
import { ocrService } from "./ocr/ocr-service";
import { findBestAthleteMatch, type MatchingCriteria, type MatchResult } from "./athlete-matching";
import { reviewQueue } from "./review-queue";
import type { ImportResult } from "@shared/import-types";
import {
  ValidationViolation,
  ValidationFix,
  ProcessedImportRow,
  BulkOperationResult,
  OperationResult,
  OperationError,
  ImportPreview,
  CsvRow,
  ExportRow
} from "./types/bulk-operations";
import { OCRProcessingResult } from '@shared/ocr-types';
import enhancedAuthRoutes from './routes/enhanced-auth';
import { registerAllRoutes } from "./routes/index";
import { emailService } from "./services/email-service";

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
  try {
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

    // Check if admin user already exists by username
    const existingUser = await storage.getUserByUsername(adminUser);

    if (!existingUser) {
      // Note: Site admins have role=site_admin and isSiteAdmin=true
      // role is for organization-level permissions (athlete, coach, org_admin, site_admin)
      // while isSiteAdmin grants platform-wide access independent of organizations
      await storage.createUser({
        username: adminUser,
        emails: adminEmail ? [adminEmail] : [], // Optional email
        password: adminPassword,
        firstName: "Site",
        lastName: "Administrator",
        role: "site_admin",
        isSiteAdmin: true
      });
      console.log(`Site administrator account created successfully: ${adminUser}`);
    } else {
      // User exists - check if password needs to be synced with environment variable
      const passwordMatches = await bcrypt.compare(adminPassword, existingUser.password);
      const needsPrivilegeRestore = existingUser.isSiteAdmin !== true;

      // Combine updates into single atomic operation to prevent race conditions
      if (!passwordMatches || needsPrivilegeRestore) {
        // CRITICAL: Revoke sessions BEFORE password update to prevent race condition
        // This ensures no one can log in during the window between update and revocation
        let revokedCount = 0;
        if (!passwordMatches) {
          revokedCount = await AuthSecurity.revokeAllSessions(existingUser.id);
        }

        const updateData: any = {};

        if (!passwordMatches) {
          // Password in environment has changed - update the database
          // Note: updateUser will hash the password automatically
          updateData.password = adminPassword;
          updateData.passwordChangedAt = new Date();
        }

        if (needsPrivilegeRestore) {
          // Ensure isSiteAdmin flag is set (in case it was changed)
          updateData.isSiteAdmin = true;
        }

        // Single atomic update to prevent race conditions
        // Only call updateUser if there are changes to make
        if (Object.keys(updateData).length > 0) {
          await storage.updateUser(existingUser.id, updateData);
        }

        // Create audit logs for security events
        if (!passwordMatches) {
          await storage.createAuditLog({
            userId: existingUser.id,
            action: 'admin_password_synced',
            resourceType: 'user',
            resourceId: existingUser.id,
            details: JSON.stringify({
              username: adminUser,
              syncReason: 'environment_variable_mismatch',
              timestamp: new Date().toISOString()
            }),
            ipAddress: '127.0.0.1', // Server-initiated
            userAgent: 'System',
          });

          // Audit log for session revocation
          await storage.createAuditLog({
            userId: existingUser.id,
            action: 'sessions_revoked',
            resourceType: 'user',
            resourceId: existingUser.id,
            details: JSON.stringify({
              reason: 'password_sync',
              count: revokedCount,
              timestamp: new Date().toISOString()
            }),
            ipAddress: '127.0.0.1',
            userAgent: 'System',
          });

          console.log(`Site administrator password synced with environment variable: ${adminUser}`);
          console.log(`Revoked ${revokedCount} active session(s) for security`);
        }

        if (needsPrivilegeRestore && updateData.isSiteAdmin) {
          await storage.createAuditLog({
            userId: existingUser.id,
            action: 'privilege_restored',
            resourceType: 'user',
            resourceId: existingUser.id,
            details: JSON.stringify({
              username: adminUser,
              previousState: 'isSiteAdmin=false',
              newState: 'isSiteAdmin=true',
              restorationReason: 'startup_verification',
              timestamp: new Date().toISOString()
            }),
            ipAddress: '0.0.0.0',
            userAgent: 'System',
          });
          console.log(`Site administrator privileges restored: ${adminUser}`);
        }
      } else {
        console.log(`Site administrator account already exists: ${adminUser}`);
      }
    }
  } catch (error) {
    // Rethrow errors from test mocks (e.g., when process.exit is mocked)
    if (error instanceof Error && error.message === 'process.exit called') {
      throw error;
    }
    console.error("Error initializing default user:", error);
    process.exit(1);
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
      const { db } = await import("./db");

      sessionConfig.store = new PgStore({
        pool: db as any, // Drizzle's db object is compatible with Pool interface
        tableName: 'session',
        createTableIfMissing: true, // Creates table if it doesn't exist
        pruneSessionInterval: 60 * 15, // Prune expired sessions every 15 minutes
      });
      console.log('Using PostgreSQL session store');
      sessionStoreConfigured = true;
    } catch (error: any) {
      console.warn('Failed to create PostgreSQL store:', error?.message || error);
      console.warn('WARNING: Using in-memory session store. Sessions will be lost on server restart!');
    }
  }

  app.use(session(sessionConfig));

  // Register new refactored routes - AFTER session middleware
  registerAllRoutes(app);

  // Security headers middleware
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for UI components
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
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

    // Skip CSRF for certain API endpoints that use other authentication
    // Note: req.path is relative to the mount point, so '/api' prefix is not included
    // - /login and /register: Pre-authentication endpoints
    // - /invitations/:token/accept: Public endpoint for new users without sessions
    //   Token format restricted to alphanumeric, dash, and underscore to prevent path traversal
    // - /import/photo, /import/parse-csv, /import/:type: File upload endpoints that use multipart/form-data
    //   SECURITY: Only specific multipart endpoints bypass CSRF, not all /import/* routes
    // - /invitations/:token/accept: New user registration endpoint (no session yet)
    //   SECURITY: Protected by: (1) single-use token, (2) SameSite cookies, (3) Referer header check, (4) rate limiting
    const skipCsrfPaths = ['/login', '/register', '/import/photo', '/import/parse-csv'];
    const skipCsrfPatterns = [
      /^\/invitations\/[a-zA-Z0-9_-]+\/accept$/,  // Invitation acceptance for new users
      /^\/import\/(athletes|measurements)$/  // Dynamic import type endpoints (multipart only)
    ];

    if (skipCsrfPaths.some(path => req.path.startsWith(path)) ||
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
    const secret = csrfTokens.secretSync();
    const token = csrfTokens.create(secret);

    // Store secret in session
    (req.session as any).csrfSecret = secret;

    res.json({ csrfToken: token });
  });

  // Apply CSRF protection to state-changing routes
  app.use('/api', csrfProtection);

  // Input sanitization middleware
  const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    // Sanitize string fields in request body
    if (req.body && typeof req.body === 'object') {
      for (const key in req.body) {
        if (typeof req.body[key] === 'string') {
          req.body[key] = DOMPurify.sanitize(req.body[key]);
        }
      }
    }
    next();
  };

  // Apply input sanitization to all routes
  app.use(sanitizeInput);

  // Rate limiting for authentication endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 5, // Limit each IP to 5 requests per windowMs
    message: {
      error: "Too many authentication attempts, please try again in 15 minutes"
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
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

  // Apply general rate limiting to all API routes
  app.use('/api', apiLimiter);

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

  // ⚠️ LEGACY ROUTES - These have been refactored to new service layer
  // Authentication routes are now handled by ./routes/auth-routes.ts
  
  /*
  // Authentication routes - USERNAME ONLY
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Username-based authentication
      const user = await storage.authenticateUser(username, password);
      if (user) {
        // Check if user is active
        if (user.isActive === false) {
          return res.status(401).json({ message: "Account has been deactivated. Please contact your administrator." });
        }

        // Determine user role - site admin or organization role
        let userRole: string;
        let redirectUrl = "/";
        const userOrgs = await storage.getUserOrganizations(user.id);

        // If user is site admin, use site_admin role
        if (user.isSiteAdmin === true) {
          userRole = "site_admin";
          redirectUrl = "/";
        } else {
          // For non-site admins, get their organization role (should be only one per organization)
          if (userOrgs && userOrgs.length > 0) {
            // Use the role from the first organization (users should only have one role per org)
            userRole = userOrgs[0].role;

            // Set redirect based on role
            if (userRole === "athlete") {
              redirectUrl = `/athletes/${user.id}`;
            } else {
              redirectUrl = "/";
            }
          } else {
            // If user has no organization roles and is not site admin, this is an error
            return res.status(500).json({ message: "User has no valid role assignments" });
          }
        }

        // Regenerate session to prevent session fixation attacks
        req.session.regenerate((err) => {
          if (err) {
            console.error('Session regeneration error:', err);
            return res.status(500).json({ message: "Login failed due to session error" });
          }
          
          req.session.user = {
            id: user.id,
            username: user.username,
            email: user.emails?.[0] || `${user.username}@temp.local`, // Use first email for backward compatibility in session
            firstName: user.firstName,
            lastName: user.lastName,
            role: userRole,
            isSiteAdmin: user.isSiteAdmin === true,
            athleteId: userRole === "athlete" ? user.id : undefined, // Use user ID as athlete ID for athletes
            primaryOrganizationId: userOrgs.length > 0 ? userOrgs[0].organizationId : undefined
          };
          
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error('Session save error:', saveErr);
              return res.status(500).json({ message: "Login failed due to session error" });
            }
            
            // Log successful authentication without sensitive details
            // User authenticated successfully - logging removed for production

            return res.json({ 
              success: true, 
              user: req.session.user,
              redirectUrl
            });
          });
        });
      } else {
        res.status(401).json({ message: "Invalid credentials" });
      }
    } catch (error) {
      return handleError(error, res, "login");
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session.user) {
      return res.json({ 
        user: {
          ...req.session.user,
          athleteId: req.session.user.athleteId // Ensure athleteId is included
        }
      });
    }
    res.status(401).json({ message: "Not authenticated" });
  });

  // Get current user's organizations
  app.get("/api/auth/me/organizations", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userOrganizations = await storage.getUserOrganizations(currentUser.id);
      res.json(userOrganizations);
    } catch (error) {
      console.error("Error fetching user organizations:", error);
      res.status(500).json({ message: "Failed to fetch user organizations" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Mount enhanced authentication routes
  app.use('/api/auth', enhancedAuthRoutes);

  // Admin Impersonation routes (Site Admin only)
  app.post("/api/admin/impersonate/:userId", requireSiteAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const currentUser = req.session.user;

      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Check if already impersonating
      if (req.session.isImpersonating) {
        return res.status(400).json({ message: "Already impersonating a user" });
      }

      // Get the target user
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Don't allow impersonating yourself
      if (targetUser.id === currentUser.id) {
        return res.status(400).json({ message: "Cannot impersonate yourself" });
      }

      // Don't allow impersonating other site admins
      if (targetUser.isSiteAdmin === true) {
        return res.status(400).json({ message: "Cannot impersonate other site administrators" });
      }

      // Determine the target user's role
      let targetRole: string;
      const userOrgs = await storage.getUserOrganizations(targetUser.id);

      if (targetUser.isSiteAdmin === true) {
        targetRole = "site_admin";
      } else {
        // For non-site admins, get their organization role
        if (userOrgs && userOrgs.length > 0) {
          // Use the first organization role (users should only have one role per org)
          targetRole = userOrgs[0].role;
        } else {
          return res.status(400).json({ message: "Target user has no valid role assignments" });
        }
      }

      // Store original user and set up impersonation
      req.session.originalUser = {
        ...currentUser,
        primaryOrganizationId: currentUser.primaryOrganizationId // Ensure primary org is saved
      };
      req.session.user = {
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.emails?.[0] || `${targetUser.username}@temp.local`, // Use first email for backward compatibility in session
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        role: targetRole,
        isSiteAdmin: targetUser.isSiteAdmin === true,
        athleteId: targetRole === "athlete" ? targetUser.id : undefined, // Use user ID as athlete ID for athletes
        primaryOrganizationId: userOrgs.length > 0 ? userOrgs[0].organizationId : undefined
      };
      req.session.isImpersonating = true;
      req.session.impersonationStartTime = new Date();

      // Log the impersonation event

      res.json({ 
        success: true, 
        message: `Now impersonating ${targetUser.firstName} ${targetUser.lastName}`,
        user: req.session.user,
        impersonationStatus: {
          isImpersonating: true,
          originalUser: currentUser,
          targetUser: req.session.user,
          startTime: req.session.impersonationStartTime
        }
      });
    } catch (error) {
      console.error("Impersonation error:", error);
      res.status(500).json({ message: "Failed to start impersonation" });
    }
  });

  app.post("/api/admin/stop-impersonation", requireAuth, async (req, res) => {
    try {
      if (!req.session.isImpersonating || !req.session.originalUser) {
        return res.status(400).json({ message: "Not currently impersonating" });
      }

      const originalUser = req.session.originalUser;
      const impersonatedUser = req.session.user;

      // Restore original user
      req.session.user = originalUser;
      req.session.originalUser = undefined;
      req.session.isImpersonating = false;
      req.session.impersonationStartTime = undefined;

      // Log the end of impersonation

      res.json({ 
        success: true, 
        message: "Stopped impersonation", 
        user: req.session.user,
        impersonationStatus: {
          isImpersonating: false
        }
      });
    } catch (error) {
      console.error("Stop impersonation error:", error);
      res.status(500).json({ message: "Failed to stop impersonation" });
    }
  });

  app.get("/api/admin/impersonation-status", requireAuth, (req, res) => {
    try {
      if (req.session.isImpersonating && req.session.originalUser) {
        res.json({
          isImpersonating: true,
          originalUser: req.session.originalUser,
          targetUser: req.session.user,
          startTime: req.session.impersonationStartTime
        });
      } else {
        res.json({
          isImpersonating: false
        });
      }
    } catch (error) {
      console.error("Impersonation status error:", error);
      res.status(500).json({ message: "Failed to get impersonation status" });
    }
  });

  // Organization routes (Site Admin only)
  app.get("/api/organizations", requireSiteAdmin, async (req, res) => {
    try {
      const organizations = await storage.getOrganizations();
      res.json(organizations);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  // Get single organization (accessible by members and site admins)
  app.get("/api/organizations/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Simple access check
      try {
        await accessController.requireOrganizationAccess(currentUser.id, id);
      } catch (error) {
        return res.status(403).json({ 
          message: "Access denied. You can only view organizations you belong to."
        });
      }

      const organization = await storage.getOrganization(id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  // Get organizations accessible to current user based on their role
  app.get("/api/my-organizations", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      if (isSiteAdmin(currentUser)) {
        const organizations = await storage.getOrganizations();
        res.json(organizations);
      } else {
        // Get organizations where user has any role
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const organizations = userOrgs.map(uo => uo.organization);
        res.json(organizations);
      }
    } catch (error) {
      return handleError(error, res, "fetch organizations");
    }
  });

  app.post("/api/organizations", createLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const organizationData = insertOrganizationSchema.parse(req.body);
      const organization = await storage.createOrganization(organizationData);
      res.status(201).json(organization);
    } catch (error) {
      return handleError(error, res, "create organization");
    }
  });

  // User management routes (Site Admin only)
  app.post("/api/users", createLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);

      // If organization specified, validate and add user to it
      if (req.body.organizationId) {
        // Validate organization exists
        const org = await storage.getOrganization(req.body.organizationId);
        if (!org) {
          return res.status(400).json({ message: "Invalid organization ID" });
        }
        
        // Validate organizationId is a valid UUID/string format
        if (typeof req.body.organizationId !== 'string' || req.body.organizationId.trim().length === 0) {
          return res.status(400).json({ message: "Organization ID must be a valid string" });
        }
        
        await storage.addUserToOrganization(user.id, req.body.organizationId, userData.role);
      }

      res.status(201).json({ id: user.id, emails: user.emails, firstName: user.firstName, lastName: user.lastName });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Failed to create user" });
      }
    }
  });
  */

  // ⚠️ END OF LEGACY AUTH/USER ROUTES - Now using refactored service layer
  
  /**
   * Get teams with organization filtering
   * @route GET /api/teams
   * @query {string} [organizationId] - Filter teams by organization (site admins only)
   * @access All authenticated users (filtered by organization access)
   * @returns {Object[]} teams - Array of team objects
   * @returns {string} teams[].id - Team UUID
   * @returns {string} teams[].name - Team name
   * @returns {string} teams[].level - Team level (Club, HS, College)
   * @returns {string} teams[].organizationId - Organization UUID
   * @returns {string} teams[].isArchived - Archive status ("true"/"false")
   * @throws {401} User not authenticated
   * @throws {403} No organization access
   * @throws {500} Server error fetching teams
   */
  app.get("/api/teams", requireAuth, async (req, res) => {
    try {
      const {organizationId} = req.query;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Determine organization context for filtering
      let orgContextForFiltering: string | undefined;

      if (userIsSiteAdmin) {
        // Site admins can request specific org or all teams
        orgContextForFiltering = organizationId as string;
      } else {
        // Non-site admins should only see teams from their organization
        const requestedOrgId = organizationId as string;
        if (requestedOrgId) {
          if (!await canAccessOrganization(currentUser, requestedOrgId)) {
            return res.status(403).json({ message: "Access denied to this organization" });
          }
          orgContextForFiltering = requestedOrgId;
        } else {
          // Use user's primary organization
          if (!currentUser.primaryOrganizationId) {
            return res.json([]); // No primary org, so no teams to show
          }
          orgContextForFiltering = currentUser.primaryOrganizationId;
        }
      }

      const teams = await storage.getTeams(orgContextForFiltering);
      res.json(teams);
    } catch (error) {
      console.error("Error fetching teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  /**
   * Create a new team
   * @route POST /api/teams
   * @body {Object} teamData - Team creation data
   * @body {string} teamData.name - Team name (required)
   * @body {string} teamData.level - Team level: "Club", "HS", or "College" (required)
   * @body {string} [teamData.organizationId] - Organization UUID (auto-assigned for non-site admins)
   * @body {string} [teamData.season] - Team season
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} team - Created team object
   * @returns {string} team.id - Team UUID
   * @returns {string} team.name - Team name
   * @returns {string} team.level - Team level
   * @returns {string} team.organizationId - Organization UUID
   * @throws {400} Validation error or invalid organization
   * @throws {401} User not authenticated
   * @throws {403} Athletes cannot create teams or organization access denied
   * @throws {500} Server error during team creation
   */
  app.post("/api/teams", createLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot create teams
      if (currentUser.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot create teams" });
      }

      // Get user's organization for non-site-admins
      let organizationId = req.body.organizationId;

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!organizationId && !userIsSiteAdmin) {
        // For org admins and coaches, get their primary organization
        if (!currentUser.primaryOrganizationId) {
          return res.status(400).json({ message: "User is not associated with any organization" });
        }
        organizationId = currentUser.primaryOrganizationId;
      }

      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }

      // Validate organizationId is a valid UUID/string format
      if (typeof organizationId !== 'string' || organizationId.trim().length === 0) {
        return res.status(400).json({ message: "Organization ID must be a valid string" });
      }

      // Validate organization exists
      const org = await storage.getOrganization(organizationId);
      if (!org) {
        return res.status(400).json({ message: "Invalid organization ID" });
      }

      // Validate user has access to the organization
      if (!userIsSiteAdmin && !await canAccessOrganization(currentUser, organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const teamData = insertTeamSchema.parse({ ...req.body, organizationId });
      const team = await storage.createTeam(teamData);
      res.status(201).json(team);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating team:", error);
        res.status(500).json({ message: "Failed to create team" });
      }
    }
  });

  app.patch("/api/teams/:id", requireAuth, requireTeamAccess('write'), async (req, res) => {
    try {
      const { id } = req.params;

      // Check if team exists
      const existingTeam = await storage.getTeam(id);
      if (!existingTeam) {
        return res.status(404).json({ message: "Team not found" });
      }

      const teamData = insertTeamSchema.partial().parse(req.body);

      // Ensure organizationId cannot be updated
      delete teamData.organizationId;

      const updatedTeam = await storage.updateTeam(id, teamData);

      res.json(updatedTeam);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else if (error instanceof Error) {
        console.error("Error updating team:", error);

        // Handle specific storage layer errors
        if (error.message === "Team not found") {
          return res.status(404).json({ message: "Team not found" });
        }

        if (error.message === "No valid fields to update") {
          return res.status(400).json({ message: error.message });
        }

        // Check for unique constraint violation (specifically for team name uniqueness)
        if ('code' in error && error.code === '23505') {
          const constraintName = (error as any).constraint;
          // Use exact constraint name matching to avoid false positives
          if (constraintName && TEAM_NAME_CONSTRAINTS.has(constraintName)) {
            return res.status(409).json({
              message: "A team with this name already exists in this organization. Please choose a different name.",
              errorCode: 'DUPLICATE_TEAM_NAME'
            });
          }
        }

        res.status(500).json({ message: "Failed to update team" });
      } else {
        console.error("Error updating team:", error);
        res.status(500).json({ message: "Failed to update team" });
      }
    }
  });

  app.delete("/api/teams/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot delete teams
      if (currentUser.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot delete teams" });
      }

      // Get the team to check access
      const team = await storage.getTeam(id);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Validate user has access to the team's organization
      if (!userIsSiteAdmin && !await canAccessOrganization(currentUser, team.organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      await storage.deleteTeam(id);
      res.json({ message: "Team deleted successfully" });
    } catch (error) {
      console.error("Error deleting team:", error);
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  // Team archiving endpoints
  app.post("/api/teams/:id/archive", requireAuth, archiveLimiter, async (req, res) => {
    try {
      const { id: teamId } = req.params;
      const archiveData = archiveTeamSchema.parse({ teamId, ...req.body });
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot archive teams
      if (currentUser.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot archive teams" });
      }

      // Get the team to check access
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Check if team is already archived
      if (team.isArchived === true) {
        return res.status(400).json({ message: "Team is already archived" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Validate user has access to the team's organization
      if (!userIsSiteAdmin && !await canAccessOrganization(currentUser, team.organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      // Archive the team
      const archiveDate = archiveData.archiveDate || new Date();
      const archivedTeam = await storage.archiveTeam(teamId, archiveDate, archiveData.season);
      
      res.json(archivedTeam);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error archiving team:", error);
        res.status(500).json({ message: "Failed to archive team" });
      }
    }
  });

  app.post("/api/teams/:id/unarchive", requireAuth, archiveLimiter, async (req, res) => {
    try {
      const { id: teamId } = req.params;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot unarchive teams
      if (currentUser.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot unarchive teams" });
      }

      // Get the team to check access
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Check if team is already active
      if (team.isArchived !== true) {
        return res.status(400).json({ message: "Team is not archived" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Validate user has access to the team's organization
      if (!userIsSiteAdmin && !await canAccessOrganization(currentUser, team.organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      // Unarchive the team
      const unarchivedTeam = await storage.unarchiveTeam(teamId);
      
      res.json(unarchivedTeam);
    } catch (error) {
      console.error("Error unarchiving team:", error);
      res.status(500).json({ message: "Failed to unarchive team" });
    }
  });

  app.patch("/api/teams/:teamId/members/:userId", requireAuth, async (req, res) => {
    try {
      const { teamId, userId } = req.params;
      const membershipData = updateTeamMembershipSchema.parse({ teamId, userId, ...req.body });
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot modify team memberships
      if (currentUser.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot modify team memberships" });
      }

      // Get the team to check access
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Validate user has access to the team's organization
      if (!userIsSiteAdmin && !await canAccessOrganization(currentUser, team.organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      // Update team membership
      const updatedMembership = await storage.updateTeamMembership(teamId, userId, membershipData);
      
      res.json(updatedMembership);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error updating team membership:", error);
        res.status(500).json({ message: "Failed to update team membership" });
      }
    }
  });

  /**
   * Add multiple athletes to a team
   * @route POST /api/teams/:teamId/add-athletes
   * @param {string} teamId - UUID of the team
   * @body {string[]} athleteIds - Array of athlete UUIDs (max 100)
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} result - Operation results with success/error details
   * @returns {Object[]} result.results - Array of successful additions
   * @returns {Object[]} result.errors - Array of failed additions with reasons
   * @throws {400} Invalid input, duplicate IDs, or validation errors
   * @throws {401} User not authenticated
   * @throws {403} Insufficient permissions or access denied
   * @throws {404} Team not found
   * @throws {500} Server error during transaction
   */
  app.post("/api/teams/:teamId/add-athletes", createLimiter, requireAuth, async (req, res) => {
    const { teamId } = req.params;
    try {
      const { athleteIds } = req.body;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot modify team memberships
      if (currentUser.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot modify team memberships" });
      }

      // Validate input
      if (!Array.isArray(athleteIds) || athleteIds.length === 0) {
        return res.status(400).json({ message: "athleteIds must be a non-empty array" });
      }

      // Limit number of athletes to prevent DoS attacks
      if (athleteIds.length > 100) {
        return res.status(400).json({ message: "Cannot add more than 100 athletes at once" });
      }

      // Validate all athleteIds are valid UUIDs
      try {
        validateUuidsOrThrow(athleteIds, "athlete IDs");
      } catch (error: any) {
        return res.status(400).json({
          message: error.message
        });
      }

      // Check for duplicate IDs within the request
      const uniqueIds = new Set(athleteIds);
      if (uniqueIds.size !== athleteIds.length) {
        const duplicates = athleteIds.filter((id, index) => athleteIds.indexOf(id) !== index);
        return res.status(400).json({
          message: `Duplicate athlete IDs found: ${[...new Set(duplicates)].join(", ")}`
        });
      }

      // Get the team to check access
      const team = await storage.getTeam(teamId);
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Validate user has access to the team and its organization
      if (!team || (!userIsSiteAdmin && !await canAccessOrganization(currentUser, team.organizationId))) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Use transaction to ensure atomicity
      const result = await db.transaction(async (tx: any) => {
        const results = [];
        const errors = [];

        // Validate all athletes first (batch operation)
        const athleteValidationPromises = athleteIds.map(async (athleteId) => {
          try {
            // Check if athlete exists
            const athlete = await storage.getUser(athleteId);
            if (!athlete) {
              return { athleteId, error: "Athlete not found", valid: false };
            }

            // Validate organization access for non-site admins
            if (!userIsSiteAdmin) {
              const [athleteOrgs, currentUserOrgs] = await Promise.all([
                storage.getUserOrganizations(athleteId),
                storage.getUserOrganizations(currentUser.id)
              ]);

              const hasSharedOrg = athleteOrgs.some(aOrg =>
                currentUserOrgs.some(uOrg => uOrg.organizationId === aOrg.organizationId)
              );

              if (!hasSharedOrg) {
                return { athleteId, error: "Access denied to this athlete", valid: false };
              }
            }

            // Check if athlete is already on the team
            const existingMemberships = await storage.getUserTeams(athleteId);
            const isActiveOnTeam = existingMemberships.some(membership =>
              membership.teamId === teamId && membership.isActive === true
            );

            if (isActiveOnTeam) {
              return { athleteId, error: "Athlete is already on this team", valid: false };
            }

            return { athleteId, athlete, valid: true };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown validation error";
            console.error(`Error validating athlete ${athleteId}:`, error);
            return { athleteId, error: `Validation failed: ${errorMessage}`, valid: false };
          }
        });

        // Wait for all validations to complete
        const validationResults = await Promise.all(athleteValidationPromises);

        // Separate valid athletes from errors
        const validAthletes = validationResults.filter(result => result.valid);
        const validationErrors = validationResults.filter(result => !result.valid);

        errors.push(...validationErrors);

        // Add valid athletes to team (batch operation)
        if (validAthletes.length > 0) {
          const addAthletePromises = validAthletes.map(async ({ athleteId }) => {
            try {
              const newMembership = await storage.addUserToTeam(athleteId, teamId);
              return { athleteId, membership: newMembership, success: true };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              console.error(`Error adding athlete ${athleteId} to team ${teamId}:`, error);
              return { athleteId, error: `Failed to add athlete: ${errorMessage}`, success: false };
            }
          });

          const addResults = await Promise.all(addAthletePromises);

          // Separate successful additions from failures
          results.push(...addResults.filter(result => result.success));
          errors.push(...addResults.filter(result => !result.success));
        }

        return { results, errors };
      });

      // Prepare response
      const response = {
        success: result.results.length,
        errorCount: result.errors.length,
        results: result.results,
        errors: result.errors.length > 0 ? result.errors : undefined,
        teamId,
        teamName: team.name
      };

      // If all failed, return error status
      if (result.results.length === 0 && result.errors.length > 0) {
        return res.status(400).json({
          message: "Failed to add any athletes to team",
          ...response
        });
      }

      // Audit log for successful bulk operation
      if (result.results.length > 0) {
        // Bulk team operation completed - logging removed for production
      }

      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error in bulk add athletes operation for team ${teamId}:`, error);

      res.status(500).json({
        message: "Failed to add athletes to team",
        error: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        teamId: teamId
      });
    }
  });

  /**
   * Remove athlete from team
   * @route DELETE /api/teams/:teamId/athletes/:athleteId
   * @param {string} teamId - UUID of the team
   * @param {string} athleteId - UUID of the athlete to remove
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} result - Success message with operation details
   * @returns {string} result.message - Success confirmation message
   * @returns {string} result.teamId - ID of the team
   * @returns {string} result.athleteId - ID of the removed athlete
   * @throws {400} Invalid UUID format for parameters
   * @throws {401} User not authenticated
   * @throws {403} Insufficient permissions or access denied
   * @throws {404} Team or athlete not found
   * @throws {500} Server error during removal operation
   */
  app.delete("/api/teams/:teamId/athletes/:athleteId", teamManagementLimiter, requireAuth, async (req, res) => {
    const { teamId, athleteId } = req.params;
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot modify team memberships
      if (currentUser.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot modify team memberships" });
      }

      // Validate UUIDs
      if (!validateUuidParams(req, res, ['teamId', 'athleteId'])) {
        return; // Response already sent by validateUuidParams
      }

      // Get the team and athlete to check access
      const team = await storage.getTeam(teamId);
      const athlete = await storage.getUser(athleteId);
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Validate user has access to both the team and athlete
      if (!team || !athlete ||
          (!userIsSiteAdmin && !await canAccessOrganization(currentUser, team.organizationId))) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate athlete belongs to the same organization (if not site admin)
      if (!userIsSiteAdmin) {
        const [athleteOrgs, currentUserOrgs] = await Promise.all([
          storage.getUserOrganizations(athleteId),
          storage.getUserOrganizations(currentUser.id)
        ]);

        const hasSharedOrg = athleteOrgs.some(aOrg =>
          currentUserOrgs.some(uOrg => uOrg.organizationId === aOrg.organizationId)
        );

        if (!hasSharedOrg) {
          return res.status(403).json({ message: "Access denied to this athlete" });
        }
      }

      // Check if athlete is actually on the team
      const existingMemberships = await storage.getUserTeams(athleteId);
      const isActiveOnTeam = existingMemberships.some(membership =>
        membership.teamId === teamId && membership.isActive === true
      );

      if (!isActiveOnTeam) {
        return res.status(400).json({ message: "Athlete is not currently on this team" });
      }

      // Remove athlete from team
      await storage.removeUserFromTeam(athleteId, teamId);

      // Audit log
      // Team operation completed - logging removed for production

      res.json({
        message: "Athlete removed from team successfully",
        teamId,
        teamName: team.name,
        athleteId,
        athleteName: `${athlete.firstName} ${athlete.lastName}`
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error removing athlete ${athleteId} from team ${teamId}:`, error);

      res.status(500).json({
        message: "Failed to remove athlete from team",
        error: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        teamId,
        athleteId
      });
    }
  });

  /**
   * Remove multiple athletes from a team
   * @route DELETE /api/teams/:teamId/remove-athletes
   * @param {string} teamId - UUID of the team
   * @body {string[]} athleteIds - Array of athlete UUIDs (max 100)
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} result - Operation results with success/error details
   * @returns {number} result.success - Number of successful removals
   * @returns {number} result.errorCount - Number of failed removals
   * @returns {Object[]} result.results - Array of successful removals
   * @returns {Object[]} [result.errors] - Array of failed operations (if any)
   * @throws {400} Invalid input or validation errors
   * @throws {401} User not authenticated
   * @throws {403} Insufficient permissions or access denied
   * @throws {404} Team not found
   * @throws {500} Server error during transaction
   */
  app.delete("/api/teams/:teamId/remove-athletes", teamManagementLimiter, requireAuth, async (req, res) => {
    const { teamId } = req.params;
    try {
      const { athleteIds } = req.body;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot modify team memberships
      if (currentUser.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot modify team memberships" });
      }

      // Validate input
      if (!Array.isArray(athleteIds) || athleteIds.length === 0) {
        return res.status(400).json({ message: "athleteIds must be a non-empty array" });
      }

      // Limit number of athletes to prevent DoS attacks
      if (athleteIds.length > 100) {
        return res.status(400).json({ message: "Cannot remove more than 100 athletes at once" });
      }

      // Validate all athleteIds are valid UUIDs
      try {
        validateUuidsOrThrow(athleteIds, "athlete IDs");
      } catch (error: any) {
        return res.status(400).json({
          message: error.message
        });
      }

      // Check for duplicate IDs within the request
      const uniqueIds = new Set(athleteIds);
      if (uniqueIds.size !== athleteIds.length) {
        const duplicates = athleteIds.filter((id, index) => athleteIds.indexOf(id) !== index);
        return res.status(400).json({
          message: `Duplicate athlete IDs found: ${[...new Set(duplicates)].join(", ")}`
        });
      }

      // Get the team to check access
      const team = await storage.getTeam(teamId);
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Validate user has access to the team and its organization
      if (!team || (!userIsSiteAdmin && !await canAccessOrganization(currentUser, team.organizationId))) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Use transaction to ensure atomicity
      const result = await db.transaction(async (tx: any) => {
        const results = [];
        const errors = [];

        // Validate all athletes first (batch operation)
        const athleteValidationPromises = athleteIds.map(async (athleteId) => {
          try {
            // Check if athlete exists
            const athlete = await storage.getUser(athleteId);
            if (!athlete) {
              return { athleteId, error: "Athlete not found", valid: false };
            }

            // Validate organization access for non-site admins
            if (!userIsSiteAdmin) {
              const [athleteOrgs, currentUserOrgs] = await Promise.all([
                storage.getUserOrganizations(athleteId),
                storage.getUserOrganizations(currentUser.id)
              ]);

              const hasSharedOrg = athleteOrgs.some(aOrg =>
                currentUserOrgs.some(uOrg => uOrg.organizationId === aOrg.organizationId)
              );

              if (!hasSharedOrg) {
                return { athleteId, error: "Access denied to this athlete", valid: false };
              }
            }

            // Check if athlete is currently on the team
            const existingMemberships = await storage.getUserTeams(athleteId);
            const isActiveOnTeam = existingMemberships.some(membership =>
              membership.teamId === teamId && membership.isActive === true
            );

            if (!isActiveOnTeam) {
              return { athleteId, error: "Athlete is not currently on this team", valid: false };
            }

            return { athleteId, athlete, valid: true };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown validation error";
            console.error(`Error validating athlete ${athleteId}:`, error);
            return { athleteId, error: `Validation failed: ${errorMessage}`, valid: false };
          }
        });

        // Wait for all validations to complete
        const validationResults = await Promise.all(athleteValidationPromises);

        // Separate valid athletes from errors
        const validAthletes = validationResults.filter(result => result.valid);
        const validationErrors = validationResults.filter(result => !result.valid);

        errors.push(...validationErrors);

        // Remove valid athletes from team (batch operation)
        if (validAthletes.length > 0) {
          const removeAthletePromises = validAthletes.map(async ({ athleteId }) => {
            try {
              await storage.removeUserFromTeam(athleteId, teamId);
              return { athleteId, success: true };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              console.error(`Error removing athlete ${athleteId} from team ${teamId}:`, error);
              return { athleteId, error: `Failed to remove athlete: ${errorMessage}`, success: false };
            }
          });

          const removeResults = await Promise.all(removeAthletePromises);

          // Separate successful removals from failures
          results.push(...removeResults.filter(result => result.success));
          errors.push(...removeResults.filter(result => !result.success));
        }

        return { results, errors };
      });

      // Prepare response
      const response = {
        success: result.results.length,
        errorCount: result.errors.length,
        results: result.results,
        errors: result.errors.length > 0 ? result.errors : undefined,
        teamId,
        teamName: team.name
      };

      // If all failed, return error status
      if (result.results.length === 0 && result.errors.length > 0) {
        return res.status(400).json({
          message: "Failed to remove any athletes from team",
          ...response
        });
      }

      // Return success response
      res.json({
        message: result.results.length === athleteIds.length
          ? `Successfully removed all ${result.results.length} athletes from team`
          : `Successfully removed ${result.results.length} of ${athleteIds.length} athletes from team`,
        ...response
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Error in bulk remove athletes for team ${teamId}:`, error);

      res.status(500).json({
        message: "Failed to remove athletes from team",
        error: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        teamId
      });
    }
  });

  // Athlete routes
  app.get("/api/athletes", requireAuth, async (req, res) => {
    try {
      const {teamId, birthYearFrom, birthYearTo, search, gender, organizationId, page, limit } = req.query;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Determine organization context for filtering
      let orgContextForFiltering: string | undefined;

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (userIsSiteAdmin) {
        // Site admins can request specific org or all athletes
        orgContextForFiltering = organizationId as string;
      } else {
        // Non-site admins should only see athletes from their organization

        // Use user's primary organization if no specific org is requested
        const requestedOrgId = organizationId as string;
        if (requestedOrgId) {
          if (!await canAccessOrganization(currentUser, requestedOrgId)) {
            return res.status(403).json({ message: "Access denied to this organization" });
          }
          orgContextForFiltering = requestedOrgId;
        } else {
          // Use user's primary organization
          if (!currentUser.primaryOrganizationId) {
            return res.json([]); // No primary org, so no athletes to show
          }
          orgContextForFiltering = currentUser.primaryOrganizationId;
        }

        // Athletes can only see their own athlete data
        if (currentUser.role === "athlete" && currentUser.athleteId) {
          const filters = {
            userId: currentUser.athleteId, // Convert athleteId to userId for database query
            organizationId: orgContextForFiltering,
          };
          const athletes = await storage.getAthletes(filters);
          return res.json(athletes);
        }
      }

      const filters = {
        teamId: teamId as string,
        birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
        birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
        search: search as string,
        gender: gender as string,
        organizationId: orgContextForFiltering,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      };

      const athletes = await storage.getAthletes(filters);

      // Transform athletes to match the expected athlete format
      // IMPORTANT: Explicitly include emails to ensure they're sent to frontend
      const athletesList = athletes.map((athlete) => ({
        ...athlete,
        emails: athlete.emails || [], // Explicitly include emails field
        phoneNumbers: athlete.phoneNumbers || [],
        teams: athlete.teams,
        hasLogin: athlete.password !== "INVITATION_PENDING",
        isActive: athlete.isActive === true
      }));

      // Stronger cache-busting headers and disable ETags
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Last-Modified', new Date().toUTCString());
      res.removeHeader('ETag'); // Remove ETag to prevent 304 responses
      res.json(athletesList);
    } catch (error) {
      console.error("Error fetching athletes:", error);
      res.status(500).json({ message: "Failed to fetch athletes" });
    }
  });

  app.get("/api/athletes/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const athlete = await storage.getAthlete(id);
      if (!athlete) {
        return res.status(404).json({ message: "Athlete not found" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Athletes can only view their own athlete data
      if (currentUser.role === "athlete") {
        if (currentUser.athleteId !== id) {
          return res.status(403).json({ message: "Athletes can only view their own profile" });
        }
      } else if (!userIsSiteAdmin) {
        // Coaches and org admins can only view athletes from their organization
        // Check if user has access to the same organization as the athlete
        const userOrgs = await storage.getUserOrganizations(currentUser.id);

        if (userOrgs.length === 0) {
          return res.status(403).json({ message: "Access denied - no organization access" });
        }

        // Get the athlete's teams to determine organization
        const athleteTeams = await storage.getAthleteTeams(id);

        if (athleteTeams.length === 0) {
          return res.status(403).json({ message: "Athlete not associated with any team" });
        }

        // Get athlete organization IDs directly from the teams (which include organization data)
        const athleteOrganizations = athleteTeams.map(team => team.organization.id);

        // Check if user has access to any of the athlete's organizations
        const hasAccess = athleteOrganizations.some(athleteOrgId => 
          userOrgs.some(userOrg => userOrg.organizationId === athleteOrgId)
        );

        if (!hasAccess) {
          return res.status(403).json({ message: "Access denied to this athlete" });
        }
      }

      res.json(athlete);
    } catch (error) {
      console.error("Error fetching athlete:", error);
      res.status(500).json({ message: "Failed to fetch athlete" });
    }
  });

  app.post("/api/athletes", createLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      // Athletes cannot create athlete records
      if (currentUser?.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot create athlete records" });
      }

      const athleteData = insertAthleteSchema.parse(req.body);

      // Athlete data received - debug logging removed for production

      // Add organization context for non-site admins
      const userIsSiteAdmin = isSiteAdmin(currentUser);
      if (!userIsSiteAdmin && currentUser?.primaryOrganizationId) {
        athleteData.organizationId = currentUser.primaryOrganizationId;
      }

      const athlete = await storage.createAthlete(athleteData);

      // Athlete created successfully - debug logging removed for production

      res.status(201).json(athlete);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating athlete:", error);
        res.status(500).json({ message: "Failed to create athlete" });
      }
    }
  });

  app.patch("/api/athletes/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const athleteData = insertAthleteSchema.partial().parse(req.body);
      const updatedAthlete = await storage.updateAthlete(id, athleteData);
      res.json(updatedAthlete);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error updating athlete:", error);
        res.status(500).json({ message: "Failed to update athlete" });
      }
    }
  });

  app.delete("/api/athletes/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteAthlete(id);
      res.json({ message: "Athlete deleted successfully" });
    } catch (error) {
      console.error("Error deleting athlete:", error);
      res.status(500).json({ message: "Failed to delete athlete" });
    }
  });

  // Keep existing measurement routes
  app.get("/api/measurements", requireAuth, async (req, res) => {
    try {
      const {athleteId, teamIds, metric, dateFrom, dateTo, birthYearFrom, birthYearTo, ageFrom, ageTo, search, sport, gender, position, organizationId } = req.query;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Athletes can only view their own measurements
      if (currentUser.role === "athlete") {
        if (!currentUser.athleteId) {
          return res.json([]);
        }

        const filters: MeasurementFilters = {
          athleteId: currentUser.athleteId,
          metric: metric as string,
          dateFrom: dateFrom as string,
          dateTo: dateTo as string,
          includeUnverified: true
        };

        const measurements = await storage.getMeasurements(filters);
        return res.json(measurements);
      }

      // For coaches and org admins, filter by their organization
      let orgContextForFiltering: string | undefined;

      if (userIsSiteAdmin) {
        orgContextForFiltering = organizationId as string;
      } else {
        const requestedOrgId = organizationId as string;
        if (requestedOrgId) {
          if (!await canAccessOrganization(currentUser, requestedOrgId)) {
            return res.status(403).json({ message: "Access denied to this organization" });
          }
          orgContextForFiltering = requestedOrgId;
        } else {
          if (!currentUser.primaryOrganizationId) {
            return res.json([]);
          }
          orgContextForFiltering = currentUser.primaryOrganizationId;
        }
      }

      const filters: MeasurementFilters = {
        athleteId: athleteId as string,
        teamIds: teamIds ? (teamIds as string).split(',') : undefined,
        metric: metric as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
        birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
        ageFrom: ageFrom ? parseInt(ageFrom as string) : undefined,
        ageTo: ageTo ? parseInt(ageTo as string) : undefined,
        search: search as string,
        sport: sport as string,
        gender: gender as string,
        position: position as string,
        organizationId: orgContextForFiltering,
        includeUnverified: true
      };

      const measurements = await storage.getMeasurements(filters);
      res.json(measurements);
    } catch (error) {
      console.error("Error fetching measurements:", error);
      res.status(500).json({ message: "Failed to fetch measurements" });
    }
  });

  // Get athlete's active teams at a specific date (for measurement form)
  app.get("/api/athletes/:id/active-teams", createLimiter, requireAuth, async (req, res) => {
    try {
      const { id: userId } = req.params;
      const { date } = req.query;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Authorization: Athletes can only view their own teams
      if (currentUser.role === "athlete") {
        const athleteUserId = currentUser.athleteId || currentUser.id;
        if (!athleteUserId || athleteUserId !== userId) {
          console.warn(`[Security] Athlete access attempt - User: ${currentUser.id}, Target: ${userId}, AthleteId: ${athleteUserId}`);
          return res.status(403).json({ message: "Athletes can only view their own teams" });
        }
      } else if (!userIsSiteAdmin) {
        // Coaches and org admins: verify athlete is in their organization
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        if (userOrgs.length === 0) {
          return res.status(403).json({ message: "Access denied - no organization access" });
        }

        const athleteOrgs = await storage.getUserOrganizations(userId);
        const hasSharedOrg = userOrgs.some(userOrg =>
          athleteOrgs.some(athleteOrg => athleteOrg.organizationId === userOrg.organizationId)
        );

        if (!hasSharedOrg) {
          return res.status(403).json({ message: "Access denied - athlete not in your organization" });
        }
      }

      // Use current date if not provided, validate date format
      let measurementDate = new Date();
      if (date) {
        const parsedDate = new Date(date as string);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        measurementDate = parsedDate;
      }

      // Get athlete's active teams at the measurement date
      const activeTeams = await storage.getAthleteActiveTeamsAtDate(userId, measurementDate);

      res.json(activeTeams);
    } catch (error) {
      console.error("Error fetching athlete's active teams:", error);
      res.status(500).json({ message: "Failed to fetch active teams" });
    }
  });

  app.post("/api/measurements", createLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(400).json({ message: "User not authenticated" });
      }

      // Athletes cannot submit measurements
      if (currentUser?.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot submit measurements" });
      }

      // Parse the measurement data and ensure submittedBy is set
      const { submittedBy, ...requestData } = req.body;
      const parsedData = insertMeasurementSchema.parse(requestData);
      const measurementData = {
        ...parsedData,
        submittedBy: currentUser.id  // Always use current user's ID
      };

      // Validate user can access the athlete being measured
      const userIsSiteAdmin = isSiteAdmin(currentUser);
      if (!userIsSiteAdmin) {
        const athlete = await storage.getAthlete(measurementData.userId);
        if (!athlete) {
          return res.status(404).json({ message: "Athlete not found" });
        }

        // Check if athlete is in user's organization
        const athleteTeams = await storage.getAthleteTeams(measurementData.userId);
        const athleteOrganizations = athleteTeams.map(team => team.organization.id);

        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const userOrganizationIds = userOrgs.map(userOrg => userOrg.organizationId);

        const hasAccess = athleteOrganizations.some(orgId => 
          userOrganizationIds.includes(orgId)
        );

        // Log access validation result without exposing IDs
        // Measurement access validation completed - debug logging removed for production

        if (!hasAccess) {
          return res.status(403).json({ message: "Cannot create measurements for athletes outside your organization" });
        }
      }

      const measurement = await storage.createMeasurement(measurementData, currentUser.id);
      res.status(201).json(measurement);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating measurement:", error);
        res.status(500).json({ message: "Failed to create measurement" });
      }
    }
  });

  // Measurement verification route (org admins only)
  app.put("/api/measurements/:id/verify", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Only org admins can verify measurements
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        // Check if user is org admin in any organization
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const isOrgAdmin = userOrgs.some(org => org.role === "org_admin");

        if (!isOrgAdmin) {
          return res.status(403).json({ message: "Only organization administrators can verify measurements" });
        }
      }

      // Get measurement to verify user has access to the athlete's organization
      const measurement = await storage.getMeasurement(id);
      if (!measurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      if (!userIsSiteAdmin) {
        // Check if measurement's athlete is in user's organization
        const athlete = await storage.getAthlete(measurement.userId);
        if (!athlete) {
          return res.status(404).json({ message: "Athlete not found" });
        }

        const athleteTeams = await storage.getAthleteTeams(measurement.userId);
        const athleteOrganizations = athleteTeams
          .map(pt => pt.organization.id);

        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const hasAccess = athleteOrganizations.some(orgId => 
          userOrgs.some(userOrg => userOrg.organizationId === orgId && userOrg.role === "org_admin")
        );

        if (!hasAccess) {
          return res.status(403).json({ message: "Cannot verify measurements for athletes outside your organization" });
        }
      }

      // Update measurement verification - use the verifyMeasurement method instead
      const updatedMeasurement = await storage.verifyMeasurement(id, currentUser.id);

      res.json(updatedMeasurement);
    } catch (error) {
      console.error("Error verifying measurement:", error);
      res.status(500).json({ message: "Failed to verify measurement" });
    }
  });

  // Update measurement route (coaches and org admins only)
  app.patch("/api/measurements/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get measurement to verify it exists and user has access
      const measurement = await storage.getMeasurement(id);
      if (!measurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        // Check if measurement's athlete is in user's organization
        const athlete = await storage.getAthlete(measurement.userId);
        if (!athlete) {
          return res.status(404).json({ message: "Athlete not found" });
        }

        const athleteTeams = await storage.getAthleteTeams(measurement.userId);
        const athleteOrganizations = athleteTeams
          .map(pt => pt.organization.id);

        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const hasAccess = athleteOrganizations.some(orgId => 
          userOrgs.some(userOrg => userOrg.organizationId === orgId)
        );

        if (!hasAccess) {
          return res.status(403).json({ message: "Cannot update measurements for athletes outside your organization" });
        }

        // Athletes cannot update measurements
        if (currentUser.role === "athlete") {
          return res.status(403).json({ message: "Athletes cannot update measurements" });
        }
      }

      // Update measurement
      const updatedMeasurement = await storage.updateMeasurement(id, updateData);
      res.json(updatedMeasurement);
    } catch (error) {
      console.error("Error updating measurement:", error);
      res.status(500).json({ message: "Failed to update measurement" });
    }
  });

  // Delete measurement route (coaches and org admins only)
  app.delete("/api/measurements/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get measurement to verify it exists and user has access
      const measurement = await storage.getMeasurement(id);
      if (!measurement) {
        return res.status(404).json({ message: "Measurement not found" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        // Check if measurement's athlete is in user's organization
        const athlete = await storage.getAthlete(measurement.userId);
        if (!athlete) {
          return res.status(404).json({ message: "Athlete not found" });
        }

        const athleteTeams = await storage.getAthleteTeams(measurement.userId);
        const athleteOrganizations = athleteTeams
          .map(pt => pt.organization.id);

        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const hasAccess = athleteOrganizations.some(orgId => 
          userOrgs.some(userOrg => userOrg.organizationId === orgId)
        );

        if (!hasAccess) {
          return res.status(403).json({ message: "Cannot delete measurements for athletes outside your organization" });
        }

        // Athletes cannot delete measurements
        if (currentUser.role === "athlete") {
          return res.status(403).json({ message: "Athletes cannot delete measurements" });
        }
      }

      // Delete measurement
      await storage.deleteMeasurement(id);
      res.status(200).json({
        success: true,
        message: "Measurement deleted successfully"
      });
    } catch (error) {
      console.error("Error deleting measurement:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete measurement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Bulk delete measurements route (coaches and org admins only)
  app.post("/api/measurements/bulk-delete", requireAuth, async (req, res) => {
    try {
      const { measurementIds } = req.body;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      if (!Array.isArray(measurementIds) || measurementIds.length === 0) {
        return res.status(400).json({ message: "No measurement IDs provided" });
      }

      // Limit bulk operations to 100 measurements at once
      if (measurementIds.length > 100) {
        return res.status(400).json({ message: "Cannot delete more than 100 measurements at once" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);
      const userOrgs = !userIsSiteAdmin ? await storage.getUserOrganizations(currentUser.id) : [];
      const userOrgIds = userOrgs.map(org => org.organizationId);

      // Verify user has access to all measurements
      const failedChecks: string[] = [];
      const validIds: string[] = [];

      for (const id of measurementIds) {
        const measurement = await storage.getMeasurement(id);

        if (!measurement) {
          failedChecks.push(`Measurement ${id} not found`);
          continue;
        }

        if (!userIsSiteAdmin) {
          // Check if measurement's athlete is in user's organization
          const athlete = await storage.getAthlete(measurement.userId);
          if (!athlete) {
            failedChecks.push(`Athlete not found for measurement ${id}`);
            continue;
          }

          const athleteTeams = await storage.getAthleteTeams(measurement.userId);
          const athleteOrganizations = athleteTeams.map(pt => pt.organization.id);

          const hasAccess = athleteOrganizations.some(orgId => userOrgIds.includes(orgId));

          if (!hasAccess) {
            failedChecks.push(`No access to measurement ${id} (athlete outside your organization)`);
            continue;
          }

          // Athletes cannot delete measurements
          if (currentUser.role === "athlete") {
            return res.status(403).json({ message: "Athletes cannot delete measurements" });
          }
        }

        validIds.push(id);
      }

      if (failedChecks.length > 0) {
        return res.status(403).json({
          message: "Access denied for some measurements",
          errors: failedChecks
        });
      }

      // Delete all valid measurements
      const results = {
        deleted: 0,
        failed: [] as string[]
      };

      for (const id of validIds) {
        try {
          await storage.deleteMeasurement(id);
          results.deleted++;
        } catch (error) {
          results.failed.push(id);
          console.error(`Failed to delete measurement ${id}:`, error);
        }
      }

      res.status(200).json({
        success: true,
        deleted: results.deleted,
        failed: results.failed.length,
        failedIds: results.failed,
        message: `Successfully deleted ${results.deleted} measurement${results.deleted !== 1 ? 's' : ''}${results.failed.length > 0 ? ` (${results.failed.length} failed)` : ''}`
      });
    } catch (error) {
      console.error("Error bulk deleting measurements:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to delete measurements"
      });
    }
  });

  // Rate limiting for analytics endpoints - configurable via environment variables
  const analyticsLimiter = rateLimit({
    windowMs: parseInt(process.env.ANALYTICS_RATE_WINDOW_MS || '900000'), // Default: 15 minutes
    limit: parseInt(process.env.ANALYTICS_RATE_LIMIT || '50'), // Default: 50 requests per window
    message: { 
      message: process.env.ANALYTICS_RATE_LIMIT_MESSAGE || "Too many analytics requests, please try again later." 
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting in test environment to allow integration tests
      if (process.env.NODE_ENV === 'test') {
        return true;
      }

      // Production safeguard: Never bypass rate limiting in production environment
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        return false; // Always enforce rate limiting in production
      }

      // Skip rate limiting only if explicitly enabled via environment flag in non-production
      // This prevents accidental bypass in production
      const userIsSiteAdmin = isSiteAdmin(req.session.user);
      return process.env.BYPASS_ANALYTICS_RATE_LIMIT === 'true' && userIsSiteAdmin;
    }
  });

  // Keep existing analytics routes
  app.get("/api/analytics/dashboard", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      const requestedOrgId = req.query.organizationId as string;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Determine organization context based on user role
      let organizationId: string | undefined;

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (userIsSiteAdmin) {
        // Site admin must select an organization - no site-wide access
        if (!requestedOrgId) {
          return res.status(400).json({
            message: "Organization ID required. Please select an organization to view dashboard."
          });
        }
        organizationId = requestedOrgId;
      } else {
        // Org admins and coaches see their organization stats only
        organizationId = currentUser.primaryOrganizationId;
        if (!organizationId) {
          // Fallback to user's first organization from userOrganizations
          const userOrgs = await storage.getUserOrganizations(currentUser.id);
          organizationId = userOrgs[0]?.organizationId;
          if (!organizationId) {
            return res.status(400).json({ message: "User not associated with any organization" });
          }
        }

        // Validate user has access to requested organization if different from primary
        if (requestedOrgId && requestedOrgId !== organizationId) {
          if (!await canAccessOrganization(currentUser, requestedOrgId)) {
            return res.status(403).json({ message: "Access denied to requested organization" });
          }
          organizationId = requestedOrgId;
        }
      }

      const stats = await storage.getDashboardStats(organizationId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Advanced Analytics POST endpoint
  app.post("/api/analytics/dashboard", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      const analyticsRequest = req.body;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Comprehensive input validation for analytics request
      const validation = validateAnalyticsRequest(analyticsRequest);
      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid analytics request",
          errors: validation.errors
        });
      }

      // Use validated data
      const validatedRequest = validation.data!;

      // Role-based access control for advanced analytics
      const userRole = currentUser.role;
      const userIsSiteAdmin = isSiteAdmin(currentUser);
      
      // Check if the request is for coach analytics (multi/intra group analysis)
      const isCoachAnalyticsRequest = validatedRequest.analysisType === 'multi_group' ||
                                    validatedRequest.analysisType === 'intra_group';
      
      if (isCoachAnalyticsRequest && !userIsSiteAdmin && userRole !== 'coach' && userRole !== 'org_admin') {
        return res.status(403).json({ 
          message: "Access denied. Coach analytics is only available to coaches and organization administrators.",
          userRole: userRole
        });
      }

      // Import and instantiate the analytics service
      const { AnalyticsService } = await import("./analytics-simple");
      const analyticsService = new AnalyticsService();

      // Get analytics data using validated request
      const analyticsData = await analyticsService.getAnalyticsData(validatedRequest);
      
      res.json(analyticsData);
    } catch (error) {
      console.error("Error processing analytics request:", error);
      res.status(500).json({ message: "Failed to process analytics request" });
    }
  });

  app.get("/api/analytics/teams", analyticsLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      const requestedOrgId = req.query.organizationId as string;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Determine organization context based on user role
      let organizationId: string | undefined;

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (userIsSiteAdmin) {
        // Site admin can request specific org stats, but require organization context to prevent data leakage
        organizationId = requestedOrgId;
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for team statistics" });
        }
      } else {
        // Non-site admins see their organization stats only
        organizationId = currentUser.primaryOrganizationId;
        if (!organizationId) {
          return res.json([]); // No organization context, return empty stats
        }

        // Validate user has access to requested organization if different from primary
        if (requestedOrgId && requestedOrgId !== organizationId) {
          if (!await canAccessOrganization(currentUser, requestedOrgId)) {
            return res.status(403).json({ message: "Access denied to requested organization" });
          }
          organizationId = requestedOrgId;
        }
      }

      const teamStats = await storage.getTeamStats(organizationId);
      res.json(teamStats);
    } catch (error) {
      console.error("Error fetching team stats:", error);
      res.status(500).json({ message: "Failed to fetch team stats" });
    }
  });

  // Helper function to send invitation email and track status
  async function sendInvitationEmailWithTracking(
    invitation: Invitation,
    invitedById: string,
    req: any
  ): Promise<boolean> {
    try {
      const expiryDays = parseInt(process.env.INVITATION_EXPIRY_DAYS || '7', 10);
      const inviter = await storage.getUser(invitedById);
      const organization = await storage.getOrganization(invitation.organizationId);
      const inviteLink = `${process.env.APP_URL || req.protocol + '://' + req.get('host')}/accept-invitation?token=${invitation.token}`;

      const emailSent = await emailService.sendInvitation(invitation.email, {
        recipientName: invitation.firstName && invitation.lastName
          ? `${invitation.firstName} ${invitation.lastName}`
          : invitation.email,
        inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : 'AthleteMetrics Team',
        organizationName: organization?.name || 'the organization',
        invitationLink: inviteLink,
        expiryDays,
        role: invitation.role === 'org_admin' ? 'Organization Admin' : invitation.role === 'coach' ? 'Coach' : 'Athlete'
      });

      // Update invitation with email sent status
      if (emailSent) {
        await storage.updateInvitation(invitation.id, {
          emailSent: true,
          emailSentAt: new Date()
        });
      }

      return emailSent;
    } catch (error) {
      console.error(`Failed to send invitation email to ${invitation.email}:`, error);
      return false;
    }
  }

  // Invitation routes
  // Unified invitation endpoint - handles all invitation types
  app.post("/api/invitations", createLimiter, requireAuth, async (req, res) => {
    try {
      const { email, firstName, lastName, role, organizationId, teamIds, athleteId } = req.body;

      // Get current user info for invitedBy
      const invitedById = req.session.user?.id;

      if (!invitedById) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Handle athlete invitation (send to all their emails)
      if (athleteId && role === "athlete") {
        const athlete = await storage.getAthlete(athleteId);
        if (!athlete) {
          return res.status(404).json({ message: "Athlete not found" });
        }

        // Validate organization exists
        const org = await storage.getOrganization(organizationId);
        if (!org) {
          return res.status(400).json({ message: "Invalid organization ID" });
        }

        // Check permissions using unified function
        const permissionCheck = await checkInvitationPermissions(invitedById, 'general', role, organizationId);
        if (!permissionCheck.allowed) {
          return res.status(403).json({ message: permissionCheck.reason || "Insufficient permissions to invite users" });
        }

        // Validate team IDs if provided
        if (teamIds && Array.isArray(teamIds) && teamIds.length > 0) {
          for (const teamId of teamIds) {
            const team = await storage.getTeam(teamId);
            if (!team) {
              return res.status(400).json({ message: `Team with ID ${teamId} not found` });
            }
            if (team.organizationId !== organizationId) {
              return res.status(400).json({ message: `Team ${teamId} does not belong to organization ${organizationId}` });
            }
          }
        }

        // Send invitations to all athlete's email addresses
        const invitations = [];
        const athleteEmails = athlete.emails || [];

        if (athleteEmails.length === 0) {
          return res.status(400).json({ message: "Athlete has no email addresses on file" });
        }

        for (const athleteEmail of athleteEmails) {
          try {
            // Check for existing pending invitations to prevent duplicates
            const existingInvitations = await storage.getInvitations();
            const existingInvitation = existingInvitations.find(inv =>
              inv.email === athleteEmail &&
              inv.organizationId === organizationId &&
              !inv.isUsed &&
              inv.status !== 'cancelled' &&
              inv.status !== 'expired' &&
              new Date(inv.expiresAt) > new Date()
            );

            if (existingInvitation) {
              // Skip this email, it already has a pending invitation
              continue;
            }

            const invitation = await storage.createInvitation({
              email: athleteEmail,
              firstName: athlete.firstName,
              lastName: athlete.lastName,
              organizationId,
              teamIds: teamIds || [],
              role,
              invitedBy: invitedById,
              playerId: athlete.id,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Expires in 7 days
            });
            invitations.push(invitation);
          } catch (error) {
            console.error('Failed to create athlete invitation');
            throw error; // Re-throw to catch in outer handler
          }
        }

        if (invitations.length === 0) {
          return res.status(400).json({ message: "All email addresses already have pending invitations" });
        }

        // Generate invite links and send emails
        const inviteLinks = [];
        const emailResults = [];

        for (const inv of invitations) {
          const inviteLink = `${process.env.APP_URL || req.protocol + '://' + req.get('host')}/accept-invitation?token=${inv.token}`;
          inviteLinks.push(inviteLink);

          // Send invitation email using shared helper
          const emailSent = await sendInvitationEmailWithTracking(inv, invitedById, req);
          emailResults.push({ email: inv.email, sent: emailSent });
        }

        return res.status(201).json({
          invitations: invitations.map(inv => ({ id: inv.id, email: inv.email })),
          inviteLinks,
          emailResults,
          athlete: {
            id: athlete.id,
            firstName: athlete.firstName,
            lastName: athlete.lastName
          },
          message: `${invitations.length} invitations created for ${athlete.firstName} ${athlete.lastName}`
        });
      }

      // Handle regular invitation (single email)
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      if (!role) {
        return res.status(400).json({ message: "Role is required" });
      }

      if (!organizationId) {
        return res.status(400).json({ message: "Organization is required" });
      }

      // Validate organizationId is a valid string format
      if (typeof organizationId !== 'string' || organizationId.trim().length === 0) {
        return res.status(400).json({ message: "Organization ID must be a valid string" });
      }

      // Validate organization exists
      const org = await storage.getOrganization(organizationId);
      if (!org) {
        return res.status(400).json({ message: "Invalid organization ID" });
      }

      // Check permissions using unified function
      const permissionCheck = await checkInvitationPermissions(invitedById, 'general', role, organizationId);
      if (!permissionCheck.allowed) {
        return res.status(403).json({ message: permissionCheck.reason || "Insufficient permissions to invite users" });
      }

      // Validate team IDs if provided
      if (teamIds && Array.isArray(teamIds) && teamIds.length > 0) {
        for (const teamId of teamIds) {
          const team = await storage.getTeam(teamId);
          if (!team) {
            return res.status(400).json({ message: `Team with ID ${teamId} not found` });
          }
          if (team.organizationId !== organizationId) {
            return res.status(400).json({ message: `Team ${teamId} does not belong to organization ${organizationId}` });
          }
        }
      }

      const expiryDays = parseInt(process.env.INVITATION_EXPIRY_DAYS || '7', 10);
      const invitation = await storage.createInvitation({
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        organizationId,
        teamIds: teamIds || [],
        role,
        invitedBy: invitedById,
        expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
      });

      // Generate invite link
      const inviteLink = `${process.env.APP_URL || req.protocol + '://' + req.get('host')}/accept-invitation?token=${invitation.token}`;

      // Send invitation email using shared helper
      const emailSent = await sendInvitationEmailWithTracking(invitation, invitedById, req);

      // Audit log
      await storage.createAuditLog({
        userId: invitedById,
        action: 'invitation_created',
        resourceType: 'invitation',
        resourceId: invitation.id,
        details: JSON.stringify({
          email: invitation.email,
          role: invitation.role,
          organizationId: invitation.organizationId,
          emailSent
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      return res.status(201).json({
        id: invitation.id,
        email: invitation.email,
        inviteLink,
        emailSent,
        message: `Invitation created for ${firstName || ''} ${lastName || ''} (${email})`.trim()
      });
    } catch (error) {
      console.error("Error creating invitation:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create invitation";
      res.status(500).json({ message: errorMessage, error: String(error) });
    }
  });

  /**
   * Resend invitation email
   */
  app.post("/api/invitations/:invitationId/resend", invitationLimiter, requireAuth, async (req, res) => {
    try {
      const { invitationId } = req.params;
      const userId = req.session.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get the invitation
      const invitation = await storage.getInvitationById(invitationId);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Check if user has permission (must be in the same organization with appropriate role)
      const userOrgs = await storage.getUserOrganizations(userId);
      const currentUser = req.session.user;
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Find user's role in the invitation's organization
      const userOrgRole = userOrgs.find(org => org.organizationId === invitation.organizationId);

      if (!userOrgRole && !userIsSiteAdmin) {
        return res.status(403).json({ message: "Insufficient permissions - you are not a member of this organization" });
      }

      // Check role-based permissions
      const isOrgAdmin = userOrgRole?.role === "org_admin";
      const isCoach = userOrgRole?.role === "coach";

      // Site admins can resend any invitation
      // Org admins can resend any invitation in their org
      // Coaches can only resend athlete invitations
      if (!userIsSiteAdmin && !isOrgAdmin) {
        if (!isCoach || invitation.role !== 'athlete') {
          return res.status(403).json({ message: "Insufficient permissions to resend this invitation" });
        }
      }

      // Check if invitation is still pending
      if (invitation.isUsed) {
        return res.status(400).json({ message: "Invitation has already been accepted" });
      }

      if (invitation.status === 'cancelled') {
        return res.status(400).json({ message: "Invitation has been cancelled" });
      }

      // Extend expiration regardless of current state (atomic update)
      // This prevents race conditions and ensures the invitation is valid when resent
      const expiryDays = parseInt(process.env.INVITATION_EXPIRY_DAYS || '7', 10);
      const newExpiration = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
      await storage.updateInvitation(invitationId, {
        expiresAt: newExpiration,
        status: 'pending'
      });

      // Send invitation email using shared helper
      const emailSent = await sendInvitationEmailWithTracking(invitation, userId, req);

      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'invitation_resent',
        resourceType: 'invitation',
        resourceId: invitationId,
        details: JSON.stringify({
          email: invitation.email,
          emailSent
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        emailSent,
        message: emailSent
          ? "Invitation email resent successfully"
          : "Invitation updated but email sending failed"
      });
    } catch (error) {
      console.error("Error resending invitation:", error);
      res.status(500).json({ message: "Failed to resend invitation" });
    }
  });

  /**
   * Cancel invitation
   */
  app.post("/api/invitations/:invitationId/cancel", invitationLimiter, requireAuth, async (req, res) => {
    try {
      const { invitationId } = req.params;
      const userId = req.session.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get the invitation
      const invitation = await storage.getInvitationById(invitationId);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Check if user has permission (must be in the same organization with appropriate role)
      const userOrgs = await storage.getUserOrganizations(userId);
      const currentUser = req.session.user;
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Find user's role in the invitation's organization
      const userOrgRole = userOrgs.find(org => org.organizationId === invitation.organizationId);

      if (!userOrgRole && !userIsSiteAdmin) {
        return res.status(403).json({ message: "Insufficient permissions - you are not a member of this organization" });
      }

      // Check role-based permissions
      const isOrgAdmin = userOrgRole?.role === "org_admin";
      const isCoach = userOrgRole?.role === "coach";

      // Site admins can cancel any invitation
      // Org admins can cancel any invitation in their org
      // Coaches can only cancel athlete invitations
      if (!userIsSiteAdmin && !isOrgAdmin) {
        if (!isCoach || invitation.role !== 'athlete') {
          return res.status(403).json({ message: "Insufficient permissions to cancel this invitation" });
        }
      }

      // Check if invitation is already used or cancelled
      if (invitation.isUsed) {
        return res.status(400).json({ message: "Cannot cancel an accepted invitation" });
      }

      if (invitation.status === 'cancelled') {
        return res.status(400).json({ message: "Invitation is already cancelled" });
      }

      // Cancel the invitation
      await storage.updateInvitation(invitationId, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: userId
      });

      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'invitation_cancelled',
        resourceType: 'invitation',
        resourceId: invitationId,
        details: JSON.stringify({
          email: invitation.email,
          role: invitation.role
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        message: "Invitation cancelled successfully"
      });
    } catch (error) {
      console.error("Error cancelling invitation:", error);
      res.status(500).json({ message: "Failed to cancel invitation" });
    }
  });

  /**
   * Send email verification
   */
  app.post("/api/auth/send-verification-email", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.isEmailVerified) {
        return res.status(400).json({ message: "Email is already verified" });
      }

      // Create verification token
      const { token } = await storage.createEmailVerificationToken(userId, user.emails[0]);

      // Generate verification link
      const verificationLink = `${process.env.APP_URL || req.protocol + '://' + req.get('host')}/verify-email?token=${token}`;

      // Send verification email
      const emailSent = await emailService.sendEmailVerification(user.emails[0], {
        userName: `${user.firstName} ${user.lastName}`,
        verificationLink
      });

      if (!emailSent) {
        return res.status(500).json({ message: "Failed to send verification email" });
      }

      res.json({
        success: true,
        message: "Verification email sent successfully"
      });
    } catch (error) {
      console.error("Error sending verification email:", error);
      res.status(500).json({ message: "Failed to send verification email" });
    }
  });

  /**
   * Verify email token
   */
  app.post("/api/auth/verify-email/:token", authLimiter, async (req, res) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({ message: "Verification token is required" });
      }

      const result = await storage.verifyEmailToken(token);

      if (!result.success) {
        return res.status(400).json({ message: "Invalid or expired verification token" });
      }

      // Update session if user is currently logged in
      if (req.session.user && req.session.user.id === result.userId) {
        req.session.user.emailVerified = true;
      }

      res.json({
        success: true,
        message: "Email verified successfully"
      });
    } catch (error) {
      console.error("Error verifying email:", error);
      res.status(500).json({ message: "Failed to verify email" });
    }
  });


  /**
   * Get all invitations for user's organizations
   */
  app.get("/api/invitations", requireAuth, async (req, res) => {
    try {
      const userId = req.session.user?.id;
      const currentUser = req.session.user;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get user's organizations
      const userOrgs = await storage.getUserOrganizations(userId);

      if (userOrgs.length === 0) {
        return res.json([]);
      }

      // Check role-based authorization
      const userIsSiteAdmin = isSiteAdmin(currentUser);
      const isOrgAdmin = userOrgs.some(org => org.role === "org_admin");
      const isCoach = userOrgs.some(org => org.role === "coach");

      // Only Site Admins, Org Admins, and Coaches can view invitations
      if (!userIsSiteAdmin && !isOrgAdmin && !isCoach) {
        return res.status(403).json({ message: "Insufficient permissions to view invitations" });
      }

      // Get all invitations for these organizations
      const allInvitations = await storage.getInvitations();
      const userInvitations = allInvitations.filter(invitation =>
        userOrgs.some(userOrg => userOrg.organizationId === invitation.organizationId)
      );

      // Filter invitations based on role
      const filteredInvitations = userInvitations.filter(invitation => {
        // Site admins and org admins see all invitations
        if (userIsSiteAdmin || isOrgAdmin) {
          return true;
        }
        // Coaches only see athlete invitations
        if (isCoach) {
          return invitation.role === 'athlete';
        }
        return false;
      });

      // Enrich with additional data
      const enrichedInvitations = await Promise.all(
        filteredInvitations.map(async (invitation) => {
          const inviter = await storage.getUser(invitation.invitedBy);
          const organization = await storage.getOrganization(invitation.organizationId);

          return {
            ...invitation,
            inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : 'Unknown',
            organizationName: organization?.name || 'Unknown'
          };
        })
      );

      // Sort by creation date (newest first)
      enrichedInvitations.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      res.json(enrichedInvitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  app.get("/api/invitations/athletes", requireAuth, async (req, res) => {
    try {
      const user = (req as any).session.user;

      if (!user || !user.id) {
        return res.json([]);
      }

      const userOrgs = await storage.getUserOrganizations(user.id);

      if (userOrgs.length === 0) {
        return res.json([]);
      }

      const allInvitations = await storage.getInvitations();

      const athleteInvitations = allInvitations.filter(invitation =>
        invitation.role === 'athlete' &&
        !invitation.isUsed &&
        userOrgs.some(userOrg => userOrg.organizationId === invitation.organizationId)
      );

      // Enrich with athlete data - handle errors gracefully
      const enrichedInvitations = await Promise.all(
        athleteInvitations.map(async (invitation) => {
          try {
            if (invitation.playerId) {
              const athlete = await storage.getAthlete(invitation.playerId);
              return {
                ...invitation,
                firstName: invitation.firstName || athlete?.firstName,
                lastName: invitation.lastName || athlete?.lastName
              };
            }
            return invitation;
          } catch (athleteError) {
            console.error(`Error fetching athlete for invitation ${invitation.id}:`, athleteError);
            return invitation;
          }
        })
      );

      res.json(enrichedInvitations);
    } catch (error) {
      console.error("Error fetching athlete invitations:", error);
      res.status(500).json({ message: "Failed to fetch athlete invitations", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/invitations/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const invitation = await storage.getInvitation(token);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      console.log('[INVITATION DETAILS] Invitation found:', {
        id: invitation.id,
        email: invitation.email,
        playerId: invitation.playerId,
        role: invitation.role
      });

      if (invitation.isUsed === true) {
        return res.status(400).json({ message: "Invitation already used" });
      }

      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ message: "Invitation expired" });
      }

      const responseData = {
        email: invitation.email,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        role: invitation.role,
        organizationId: invitation.organizationId,
        teamIds: invitation.teamIds,
        playerId: invitation.playerId // Include player/user ID if this is for an existing athlete
      };

      console.log('[INVITATION DETAILS] Sending response:', responseData);

      res.json(responseData);
    } catch (error) {
      console.error("Error fetching invitation:", error);
      res.status(500).json({ message: "Failed to fetch invitation" });
    }
  });

  app.delete("/api/invitations/:id", requireAuth, async (req, res) => {
    try {
      const { id: invitationId } = req.params;
      const userId = req.session.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const invitation = await storage.getInvitationById(invitationId);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      const currentUser = req.session.user;
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Check if user has permission (Site Admin, Org Admin, or Coach)
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgRole = userOrgs.find(org => org.organizationId === invitation.organizationId);
      const isOrgAdmin = userOrgRole?.role === "org_admin";
      const isCoach = userOrgRole?.role === "coach";

      // Allow Site Admins, Org Admins, and Coaches to delete invitations
      if (!userIsSiteAdmin && !isOrgAdmin && !isCoach) {
        return res.status(403).json({ message: "Insufficient permissions - only site admins, organization admins, and coaches can delete invitations" });
      }

      // Delete the invitation only - do not remove user from organization
      // Users who accepted invitations should remain in the organization
      await storage.deleteInvitation(invitationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting invitation:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete invitation";
      res.status(500).json({
        error: "Failed to delete invitation",
        message: errorMessage,
        details: error instanceof Error ? error.stack : String(error)
      });
    }
  });

  app.post("/api/invitations/:token/accept", authLimiter, async (req, res) => {
    try {
      const { token } = req.params;
      const { password, firstName, lastName, username } = req.body;

      // CSRF-like protection: Verify request came from same origin (Referer header check)
      // This provides defense-in-depth even though we can't use CSRF tokens for new users
      const referer = req.headers.referer || req.headers.origin;
      const host = req.headers.host;
      if (referer && host) {
        const refererHost = new URL(referer).host;
        if (refererHost !== host) {
          console.warn(`Invitation acceptance blocked: Referer mismatch. Expected: ${host}, Got: ${refererHost}`);
          return res.status(403).json({ message: "Invalid request origin" });
        }
      }

      // Validate username using shared validation
      const { validateUsername } = await import('@shared/username-validation');
      const usernameValidation = validateUsername(username);
      if (!usernameValidation.valid) {
        return res.status(400).json({ message: usernameValidation.errors[0] });
      }

      // Validate password using shared validation
      const { validatePassword } = await import('@shared/password-requirements');
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.errors[0] });
      }

      // Check if username already exists
      // Use generic message to prevent username enumeration
      const existingUser = await storage.getUserByUsername(username);

      // Add constant-time delay to prevent timing-based username enumeration
      // Always delay 100ms regardless of whether username exists
      await new Promise(resolve => setTimeout(resolve, 100));

      if (existingUser) {
        return res.status(400).json({ message: "Username unavailable. Please choose a different username." });
      }

      // Get invitation (without the isUsed check to track failed attempts)
      const invitation = await storage.getInvitationByToken(token);

      if (!invitation) {
        console.error("Invitation not found for token:", token);
        return res.status(404).json({ message: "Invitation not found" });
      }

      // Check if invitation is already used
      if (invitation.isUsed || invitation.status === 'accepted') {
        await storage.updateInvitation(invitation.id, {
          lastAttemptAt: new Date(),
          attemptCount: (invitation.attemptCount || 0) + 1
        });
        return res.status(400).json({ message: "This invitation has already been used" });
      }

      // Check if invitation is cancelled
      if (invitation.status === 'cancelled') {
        await storage.updateInvitation(invitation.id, {
          lastAttemptAt: new Date(),
          attemptCount: (invitation.attemptCount || 0) + 1
        });
        return res.status(400).json({ message: "This invitation has been cancelled" });
      }

      // Check if invitation is expired
      if (new Date(invitation.expiresAt) < new Date()) {
        await storage.updateInvitation(invitation.id, {
          lastAttemptAt: new Date(),
          attemptCount: (invitation.attemptCount || 0) + 1,
          status: 'expired'
        });
        return res.status(400).json({ message: "This invitation has expired" });
      }

      // Check attempt count (max 10 attempts)
      if ((invitation.attemptCount || 0) >= 10) {
        await storage.updateInvitation(invitation.id, {
          status: 'cancelled',
          cancelledAt: new Date()
        });
        return res.status(429).json({ message: "Too many failed attempts. This invitation has been locked." });
      }

      const result = await storage.acceptInvitation(token, {
        email: invitation.email,
        username,
        password,
        firstName,
        lastName
      });

      console.log("Invitation accepted successfully, user created:", result.user.id);

      // Audit log
      await storage.createAuditLog({
        userId: result.user.id,
        action: 'invitation_accepted',
        resourceType: 'invitation',
        resourceId: invitation.id,
        details: JSON.stringify({
          email: invitation.email,
          role: invitation.role,
          organizationId: invitation.organizationId
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      // Send welcome email
      const organization = await storage.getOrganization(invitation.organizationId);
      await emailService.sendWelcome(result.user.emails[0], {
        userName: `${result.user.firstName} ${result.user.lastName}`,
        organizationName: organization?.name || 'the organization',
        role: invitation.role === 'org_admin' ? 'Organization Admin' : invitation.role === 'coach' ? 'Coach' : 'Athlete'
      });

      // Use the role from the invitation
      let userRole = invitation.role;
      if (result.user.isSiteAdmin === true) {
        userRole = "site_admin";
      }

      // Log the new user in - regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error during invitation acceptance:', err);
          return res.status(500).json({ message: "Account creation successful but login failed" });
        }

        req.session.user = {
          id: result.user.id,
          username: result.user.username,
          email: result.user.emails?.[0] || `${result.user.username}@temp.local`,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: userRole,
          isSiteAdmin: result.user.isSiteAdmin === true
        };

        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error during invitation acceptance:', saveErr);
            return res.status(500).json({ message: "Account creation successful but login failed" });
          }

          // Determine redirect URL based on user role
          let redirectUrl = "/";
          if (userRole === "athlete") {
            // For athletes, redirect to their user ID
            redirectUrl = `/athletes/${result.user.id}`;
          }

          res.json({ 
            success: true, 
            user: req.session.user,
            message: "Account created successfully!",
            redirectUrl
          });
        });
      });
    } catch (error) {
      console.error("Error accepting invitation:", error);

      // Track failed attempt if we have the invitation
      const { token } = req.params;
      if (token) {
        try {
          const invitation = await storage.getInvitationByToken(token);
          if (invitation && !invitation.isUsed) {
            await storage.updateInvitation(invitation.id, {
              lastAttemptAt: new Date(),
              attemptCount: (invitation.attemptCount || 0) + 1
            });
          }
        } catch (trackError) {
          console.error("Error tracking failed attempt:", trackError);
        }
      }

      // Handle Zod validation errors with user-friendly messages
      if (error instanceof ZodError) {
        const firstError = error.errors[0];
        const field = firstError.path.join('.');
        const message = firstError.message;

        return res.status(400).json({
          message: `${field ? field + ': ' : ''}${message}`
        });
      }

      // Handle other known errors
      const errorMessage = error instanceof Error ? error.message : "Failed to accept invitation";
      const statusCode = errorMessage.includes("not found") || errorMessage.includes("Invalid") ? 404 : 500;

      res.status(statusCode).json({ message: errorMessage });
    }
  });

  // User management routes
  app.get("/api/organizations-with-users", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (userIsSiteAdmin) {
        try {
          const orgsWithUsers = await storage.getOrganizationsWithUsers();
          res.json(orgsWithUsers);
        } catch (storageError) {
          console.error("Error in getOrganizationsWithUsers:", storageError);
          // Return organizations without invitations if invitation query fails
          const organizations = await storage.getOrganizations();
          const orgsWithUsers = await Promise.all(
            organizations.map(async (org) => {
              try {
                const users = await storage.getOrganizationUsers(org.id);
                return {
                  ...org,
                  users,
                  invitations: []
                };
              } catch (error) {
                console.error(`Error getting users for org ${org.id}:`, error);
                return {
                  ...org,
                  users: [],
                  invitations: []
                };
              }
            })
          );
          res.json(orgsWithUsers);
        }
      } else {
        // Get user's roles across all organizations to check access
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        const hasOrgAccess = userOrgs.some(uo => uo.role === "org_admin" || uo.role === "coach");

        if (hasOrgAccess) {
          // Org admins and coaches can see their own organizations
          try {
            const orgsWithUsers = await storage.getOrganizationsWithUsersForUser(currentUser.id);
            res.json(orgsWithUsers);
          } catch (storageError) {
            console.error("Error in getOrganizationsWithUsersForUser:", storageError);
            res.json([]);
          }
        } else {
          // Athletes and other roles have no access
          res.json([]);
        }
      }
    } catch (error) {
      console.error("Error fetching organizations with users:", error);
      res.status(500).json({ message: "Failed to fetch organizations with users" });
    }
  });

  app.get("/api/organizations/:id/profile", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes have no access to organization profiles
      const userRoles = await storage.getUserRoles(currentUser.id);
      if (userRoles.includes("athlete") && !await accessController.isSiteAdmin(currentUser.id)) {
        return res.status(403).json({ message: "Athletes cannot access organization profiles" });
      }

      // Check organization access
      try {
        await accessController.requireOrganizationAccess(currentUser.id, id);
      } catch (error) {
        return res.status(403).json({ 
          message: "Access denied. You can only view organizations you belong to."
        });
      }

      // Get organization profile
      const orgProfile = await storage.getOrganizationProfile(id);
      if (!orgProfile) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json(orgProfile);
    } catch (error) {
      console.error("Error fetching organization profile:", error);
      res.status(500).json({ message: "Failed to fetch organization profile" });
    }
  });

  // Organization User Management Routes (for org admins)
  // NOTE: DELETE and POST routes for /api/organizations/:id/users are now handled
  // in server/routes/organization-routes.ts to avoid duplication


  // GET /api/users/:id/profile - Get user profile information
  app.get("/api/users/:id/profile", requireAuth, async (req, res) => {
    try {
      const { id: userId } = req.params;
      const currentUser = req.session.user;

      // Check if user has access (site admin, org admin, or viewing own profile)
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin && currentUser?.id !== userId) {
        // Check if current user is an org admin in any shared organization
        const userOrgs = await storage.getUserOrganizations(userId);
        const currentUserOrgs = await storage.getUserOrganizations(currentUser?.id || "");

        const hasSharedOrg = userOrgs.some(userOrg => 
          currentUserOrgs.some(currentUserOrg => 
            currentUserOrg.organizationId === userOrg.organizationId && 
            currentUserOrg.role === "org_admin"
          )
        );

        if (!hasSharedOrg) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // Get user information
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get user's organizations and roles
      const userOrgs = await storage.getUserOrganizations(userId);
      const organizations = await Promise.all(
        userOrgs.map(async (userOrg) => {
          const org = await storage.getOrganization(userOrg.organizationId);
          return {
            id: org?.id,
            name: org?.name,
            role: userOrg.role
          };
        })
      );

      // Determine user role
      let userRole = "athlete";
      if (user.isSiteAdmin === true) {
        userRole = "site_admin";
      } else if (userOrgs && userOrgs.length > 0) {
        // Use the first organization role (users should only have one role per org)
        userRole = userOrgs[0].role;
      }

      const userProfile = {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        emails: user.emails,
        role: userRole,
        organizations: organizations.filter(org => org.id && org.name)
      };

      res.json(userProfile);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Site Admin Management Routes
  app.get("/api/site-admins", requireSiteAdmin, async (req, res) => {
    try {
      const siteAdmins = await storage.getSiteAdminUsers();
      res.json(siteAdmins);
    } catch (error) {
      console.error("Error fetching site admins:", error);
      res.status(500).json({ message: "Failed to fetch site admins" });
    }
  });

  // REMOVED: Duplicate site admin creation route now handled by ./routes/user-routes.ts
  // The user-routes.ts version includes proper rate limiting and uses UserService


  // Note: Role update endpoint moved to user-routes.ts for better organization and security
  // The implementation there properly prevents site admin role modification

  // PUT /api/users/:id/status - Toggle user active/inactive status (site admin only)
  app.put("/api/users/:id/status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const currentUser = req.session.user;

      // Only site admins can activate/deactivate users
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        return res.status(403).json({ message: "Access denied. Only site administrators can activate/deactivate users." });
      }

      // Cannot deactivate self
      if (currentUser?.id === id) {
        return res.status(400).json({ message: "You cannot deactivate your own account." });
      }

      // Update user status
      const user = await storage.updateUser(id, { isActive: isActive ? true : false });

      res.json({ 
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        user 
      });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  // GET /api/users/check-username - Check if username is available
  app.get("/api/users/check-username", async (req, res) => {
    try {
      const { username } = req.query;

      if (!username || typeof username !== 'string') {
        return res.status(400).json({ message: "Username is required" });
      }

      const existingUser = await storage.getUserByUsername(username);

      res.json({ 
        available: !existingUser,
        username: username
      });
    } catch (error) {
      console.error("Error checking username:", error);
      res.status(500).json({ message: "Failed to check username availability" });
    }
  });

  // Verify single role constraint (Site Admin only)
  app.get("/api/admin/verify-roles", requireSiteAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      const violations: any[] = [];
      const fixes: any[] = [];

      for (const user of users) {
        if (user.isSiteAdmin === true) continue; // Skip site admins

        const validation = await storage.validateUserRoleConstraint(user.id);
        if (!validation.valid) {
          violations.push({
            userId: user.id,
            userName: `${user.firstName} ${user.lastName}`,
            email: user.emails[0],
            violations: validation.violations
          });

          // Auto-fix by keeping only the first role per organization
          const userOrgRelations = await db.select()
            .from(userOrganizations)
            .where(eq(userOrganizations.userId, user.id));

          const orgRoleMap = new Map<string, string>();
          for (const relation of userOrgRelations) {
            if (!orgRoleMap.has(relation.organizationId)) {
              orgRoleMap.set(relation.organizationId, relation.role);
            }
          }

          // Remove all roles and re-add single role per org
          await db.delete(userOrganizations)
            .where(eq(userOrganizations.userId, user.id));

          for (const [orgId, role] of Array.from(orgRoleMap.entries())) {
            await db.insert(userOrganizations).values({
              userId: user.id,
              organizationId: orgId,
              role
            });
            fixes.push({
              userId: user.id,
              organizationId: orgId,
              keptRole: role
            });
          }
        }
      }

      res.json({
        totalUsersChecked: users.length,
        violationsFound: violations.length,
        violations,
        fixesApplied: fixes.length,
        fixes,
        message: violations.length === 0 ? "All users have valid single roles per organization" : `Fixed ${fixes.length} role constraint violations`
      });
    } catch (error) {
      console.error("Error verifying roles:", error);
      res.status(500).json({ message: "Failed to verify role constraints" });
    }
  });

  app.delete("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteUser(id);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Profile management routes
  app.put("/api/profile", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      // Handle old admin system
      if (req.session.admin && !currentUser) {
        return res.status(400).json({ message: "Profile updates not available for legacy admin account. Please use the new user system." });
      }

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const profileData = updateProfileSchema.parse(req.body);
      const updatedUser = await storage.updateUser(currentUser.id, profileData);

      // Update session with new data
      if (req.session.user) {
        req.session.user = {
          ...req.session.user,
          email: updatedUser.emails?.[0] || `${updatedUser.username}@temp.local`,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
        };
      }

      res.json({
        id: updatedUser.id,
        email: updatedUser.emails?.[0] || `${updatedUser.username}@temp.local`,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error updating profile:", error);
        res.status(500).json({ message: "Failed to update profile" });
      }
    }
  });

  app.put("/api/profile/password", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      // Handle old admin system
      if (req.session.admin && !currentUser) {
        return res.status(400).json({ message: "Password changes not available for legacy admin account. Please use the new user system." });
      }

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const passwordData = changePasswordSchema.parse(req.body);

      // Get current user from database to check password
      const dbUser = await storage.getUser(currentUser.id);
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(passwordData.currentPassword, dbUser.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Update password
      await storage.updateUser(currentUser.id, { password: passwordData.newPassword });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error changing password:", error);
        res.status(500).json({ message: "Failed to change password" });
      }
    }
  });

  // SECURITY: Configure multer for CSV file uploads with strict validation
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: parseInt(process.env.MAX_CSV_FILE_SIZE || '5242880'), // Default 5MB (5 * 1024 * 1024)
      files: 1, // Only allow single file uploads
    },
    fileFilter: (req, file, cb) => {
      // SECURITY: Strict file type validation - check both MIME type and extension
      const allowedMimeTypes = ['text/csv', 'application/csv', 'text/plain'];
      const hasValidMime = allowedMimeTypes.includes(file.mimetype);
      const hasValidExtension = file.originalname.toLowerCase().endsWith('.csv');

      if (hasValidMime && hasValidExtension) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only CSV files are allowed.'));
      }
    }
  });
  // NOTE: For production deployments, consider adding virus scanning middleware
  // (e.g., ClamAV integration) before processing uploaded files

  // SECURITY: Configure multer for image uploads (OCR) with strict validation
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: parseInt(process.env.MAX_IMAGE_FILE_SIZE || '10485760'), // Default 10MB (10 * 1024 * 1024)
      files: 1, // Only allow single file uploads
    },
    fileFilter: (req, file, cb) => {
      // SECURITY: Strict file type validation for images and PDFs
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
      const fileExtension = file.originalname.toLowerCase().match(/\.[^.]*$/)?.[0] || '';

      const hasValidMime = allowedMimes.includes(file.mimetype);
      const hasValidExtension = allowedExtensions.includes(fileExtension);

      if (hasValidMime && hasValidExtension) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only image files (JPG, PNG, WebP) and PDF files are allowed.'));
      }
    }
  });

  // Photo OCR upload route (must come before generic import route)
  app.post("/api/import/photo", uploadLimiter, requireAuth, imageUpload.single('file'), async (req, res) => {
    try {
      const currentUser = req.session.user;
      const file = req.file;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot upload photos for import
      if (currentUser?.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot import measurement data" });
      }

      if (!file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }

      // Parse import options
      const optionsJson = req.body.options;
      const options = optionsJson ? JSON.parse(optionsJson) : {
        measurementMode: 'match_only',
        teamHandling: 'auto_create_confirm',
        organizationId: undefined
      };

      const measurementMode = options.measurementMode || 'match_only';
      const teamHandling = options.teamHandling || 'auto_create_confirm';

      // Debug logging removed for production: Processing OCR for file

      // Extract text and data using OCR
      const ocrResult = await ocrService.extractTextFromImage(file.buffer);

      // Debug logging removed for production: OCR completed with confidence and extracted measurements

      // Convert extracted data to the same format as CSV import
      const processedData: any[] = [];
      const errors: any[] = [];
      const warnings: string[] = [...ocrResult.warnings];
      const createdAthletes: any[] = [];

      for (let i = 0; i < ocrResult.extractedData.length; i++) {
        const extracted = ocrResult.extractedData[i];
        const rowNum = i + 1;

        try {
          if (!extracted.firstName || !extracted.lastName || !extracted.metric || !extracted.value) {
            errors.push({ 
              row: rowNum, 
              error: `Incomplete data: ${extracted.rawText}`,
              data: extracted
            });
            continue;
          }

          // Validate and clean the measurement value
          const numericValue = parseFloat(extracted.value);
          if (isNaN(numericValue) || numericValue <= 0) {
            errors.push({ 
              row: rowNum, 
              error: `Invalid measurement value: ${extracted.value}`,
              data: extracted
            });
            continue;
          }

          // Find or create the athlete
          const athletes = await storage.getAthletes({
            search: `${extracted.firstName} ${extracted.lastName}`
          });

          let userId: string | null = null;
          let athleteCreated = false;

          if (athletes.length > 0) {
            // Found existing athlete(s)
            const exactMatch = athletes.find(a =>
              a.firstName.toLowerCase() === extracted.firstName!.toLowerCase() &&
              a.lastName.toLowerCase() === extracted.lastName!.toLowerCase()
            );

            if (exactMatch) {
              userId = exactMatch.id;
            } else {
              // Partial match - suggest the closest one
              userId = athletes[0].id;
              warnings.push(`Using closest match for ${extracted.firstName} ${extracted.lastName}: ${athletes[0].firstName} ${athletes[0].lastName}`);
            }
          } else {
            // No match found - check if we should create
            if (measurementMode === 'create_athletes') {
              // Create the athlete (OCR doesn't extract team info currently)
              const newAthlete = await storage.createUser({
                firstName: extracted.firstName!,
                lastName: extracted.lastName!,
                emails: [`${extracted.firstName?.toLowerCase()}.${extracted.lastName?.toLowerCase()}@ocr-import.local`],
                username: `${extracted.firstName?.toLowerCase()}_${extracted.lastName?.toLowerCase()}_${Date.now()}`,
                role: 'athlete' as const,
                password: 'INVITATION_PENDING',
                isActive: false
              });

              userId = newAthlete.id;
              athleteCreated = true;
              createdAthletes.push({ id: newAthlete.id, name: `${newAthlete.firstName} ${newAthlete.lastName}` });

              // Add to organization if specified
              if (options.organizationId) {
                try {
                  await storage.addUserToOrganization(userId, options.organizationId, 'athlete');
                } catch (error) {
                  console.warn(`Could not add athlete ${userId} to organization ${options.organizationId}:`, error);
                }
              }
            } else {
              // Match-only mode - error if not found
              errors.push({
                row: rowNum,
                error: `Athlete not found: ${extracted.firstName} ${extracted.lastName}. Enable "Create athletes if needed" to auto-create.`,
                data: extracted
              });
              continue;
            }
          }

          // Calculate age if not provided
          let age = extracted.age ? parseInt(extracted.age) : undefined;
          if (!age && extracted.date) {
            const user = await storage.getUser(userId);
            if (user?.birthDate) {
              const measurementDate = new Date(extracted.date);
              const birthDate = new Date(user.birthDate);
              age = measurementDate.getFullYear() - birthDate.getFullYear();
              if (measurementDate < new Date(measurementDate.getFullYear(), birthDate.getMonth(), birthDate.getDate())) {
                age -= 1;
              }
            }
          }

          // Use current date if no date extracted
          const measurementDate = extracted.date || new Date().toISOString().split('T')[0];

          // Create measurement data
          const measurementData = {
            userId: userId,
            date: measurementDate,
            metric: extracted.metric as any,
            value: numericValue,
            age: age || 18, // Default age if we can't determine it
            notes: `OCR Import - Raw: ${extracted.rawText} (Confidence: ${extracted.confidence}%)`
          };

          // Create the measurement
          const measurement = await storage.createMeasurement(measurementData, currentUser.id);
          
          processedData.push({
            measurement,
            athlete: `${extracted.firstName} ${extracted.lastName}`,
            rawText: extracted.rawText,
            confidence: extracted.confidence
          });

        } catch (error) {
          console.error(`Error processing measurement ${rowNum}:`, error);
          errors.push({ 
            row: rowNum, 
            error: `Processing failed: ${error}`,
            data: extracted
          });
        }
      }

      res.json({
        success: true,
        message: `OCR processing completed`,
        results: {
          totalExtracted: ocrResult.extractedData.length,
          successful: processedData.length,
          failed: errors.length,
          ocrConfidence: ocrResult.confidence,
          extractedText: ocrResult.text,
          processedData,
          errors,
          warnings,
          createdAthletes: createdAthletes.length > 0 ? createdAthletes : undefined
        }
      });

    } catch (error) {
      console.error("Photo OCR import error:", error);
      res.status(500).json({ 
        message: "Failed to process image", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Import routes

  // Parse CSV and return headers with suggested mappings
  app.post("/api/import/parse-csv", uploadLimiter, requireAuth, upload.single('file'), async (req, res) => {
    try {
      const { type } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Parse CSV headers
      const csvText = file.buffer.toString('utf-8');
      const lines = csvText.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        return res.status(400).json({ message: "CSV file is empty" });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

      // Parse first 20 rows for preview
      const rows: any[] = [];
      const maxPreviewRows = Math.min(20, lines.length - 1);

      for (let i = 1; i <= maxPreviewRows; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        rows.push(row);
      }

      // Auto-detect column mappings
      const systemFields = type === 'athletes'
        ? ['firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear', 'gender', 'emails', 'phoneNumbers', 'sports', 'height', 'weight', 'school', 'teamName']
        : ['firstName', 'lastName', 'teamName', 'date', 'age', 'metric', 'value', 'units', 'flyInDistance', 'notes', 'gender'];

      const suggestedMappings: any[] = [];

      // Simple auto-detection based on column name similarity
      headers.forEach(csvColumn => {
        const normalized = csvColumn.toLowerCase().replace(/[\s_-]/g, '');

        for (const systemField of systemFields) {
          const normalizedSystem = systemField.toLowerCase().replace(/[\s_-]/g, '');

          if (normalized === normalizedSystem ||
              normalized.includes(normalizedSystem) ||
              normalizedSystem.includes(normalized)) {
            suggestedMappings.push({
              csvColumn,
              systemField,
              isRequired: ['firstName', 'lastName', 'date', 'metric', 'value'].includes(systemField),
              autoDetected: true
            });
            break;
          }
        }
      });

      res.json({
        headers,
        rows,
        suggestedMappings
      });
    } catch (error) {
      console.error('CSV parse error:', error);
      res.status(500).json({ message: "Failed to parse CSV", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/import/:type", uploadLimiter, requireAuth, upload.single('file'), async (req, res) => {
    try {
      const { type } = req.params;
      const { createMissing, teamId, preview, confirmData, options: optionsJson } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (type !== 'athletes' && type !== 'measurements') {
        return res.status(400).json({ message: "Invalid import type. Use 'athletes' or 'measurements'" });
      }

      // Parse import options
      const options = optionsJson ? JSON.parse(optionsJson) : {
        athleteMode: 'smart_import',
        measurementMode: 'match_only',
        teamHandling: 'auto_create_confirm',
        updateExisting: true,
        skipDuplicates: false
      };

      const results: any[] = [];
      const errors: any[] = [];
      const warnings: any[] = [];
      let totalRows = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let matchedCount = 0;
      let skippedCount = 0;

      // Track created teams and athletes
      const createdTeams = new Map<string, { id: string, name: string, athleteCount: number }>();
      const createdAthletes: Array<{ id: string, name: string }> = [];

      // Parse CSV data
      const csvData: any[] = [];
      const csvText = file.buffer.toString('utf-8');

      // Split CSV into lines and parse
      const lines = csvText.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(400).json({ message: "CSV file is empty" });
      }

      // SECURITY: Enforce row limit to prevent memory exhaustion
      const MAX_CSV_ROWS = parseInt(process.env.MAX_CSV_ROWS || '10000');
      if (lines.length - 1 > MAX_CSV_ROWS) {
        return res.status(400).json({
          message: `CSV file exceeds maximum row limit. Maximum ${MAX_CSV_ROWS} rows allowed, but file contains ${lines.length - 1} data rows.`
        });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: any = {};
        headers.forEach((header, index) => {
          // Apply sanitization to prevent CSV formula injection
          row[header] = sanitizeCSVValue(values[index] || '');
        });
        csvData.push(row);
        totalRows++;
      }

      // Preview mode: analyze teams and return preview data
      if (preview === 'true' && type === 'athletes') {
        const teamMap = new Map<string, { athleteNames: string[], athleteCount: number }>();

        // Extract team information from CSV
        for (const row of csvData) {
          const { firstName, lastName, teamName } = row;
          if (teamName && teamName.trim()) {
            const normalizedTeamName = teamName.trim();
            if (!teamMap.has(normalizedTeamName)) {
              teamMap.set(normalizedTeamName, { athleteNames: [], athleteCount: 0 });
            }
            const teamInfo = teamMap.get(normalizedTeamName)!;
            teamInfo.athleteNames.push(`${firstName} ${lastName}`);
            teamInfo.athleteCount++;
          }
        }

        // Get current user's organization context
        const currentUser = req.session.user!;
        let organizationId: string | undefined;
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        organizationId = userOrgs[0]?.organizationId;

        // Check which teams exist
        const allTeams = await storage.getTeams();
        const missingTeams: any[] = [];

        for (const [teamName, info] of teamMap.entries()) {
          const existingTeam = allTeams.find(t =>
            t.name?.toLowerCase().trim() === teamName.toLowerCase().trim() &&
            (!organizationId || t.organization?.id === organizationId)
          );

          if (!existingTeam) {
            missingTeams.push({
              teamName,
              exists: false,
              athleteCount: info.athleteCount,
              athleteNames: info.athleteNames
            });
          }
        }

        return res.json({
          type: 'athletes',
          totalRows,
          missingTeams,
          previewData: csvData,
          requiresConfirmation: missingTeams.length > 0
        });
      }

      if (type === 'athletes') {
        // PERFORMANCE: Pre-load all athletes to avoid N+1 query problem
        // Instead of querying database for each CSV row, load all athletes once and use in-memory lookup
        let organizationId: string | undefined = options.organizationId;
        if (!organizationId) {
          const currentUser = req.session.user!;
          const userOrgs = await storage.getUserOrganizations(currentUser.id);
          organizationId = userOrgs[0]?.organizationId;
        }

        const allAthletes = organizationId
          ? await storage.getAthletes({ organizationId })
          : await storage.getAthletes();

        // Create fast lookup map: "firstname:lastname" => athlete
        const athleteMap = new Map(
          allAthletes.map(a => [
            `${a.firstName.toLowerCase()}:${a.lastName.toLowerCase()}`,
            a
          ])
        );

        // Process athletes import
        for (let i = 0; i < csvData.length; i++) {
          const row = csvData[i];
          const rowNum = i + 2; // Account for header row
          try {
            const { firstName, lastName, birthDate, birthYear, graduationYear, emails, phoneNumbers, sports, height, weight, school, teamName, gender } = row;

            if (!firstName || !lastName) {
              errors.push({ row: rowNum, error: "First name and last name are required" });
              continue;
            }

            // REQUIRE team assignment in CSV
            if (!teamName || !teamName.trim()) {
              errors.push({ row: rowNum, error: `Team name is required for ${firstName} ${lastName}. All athletes must be assigned to a team.` });
              continue;
            }

            // Validate gender field if provided
            let validatedGender: string | undefined;
            if (gender && gender.trim()) {
              const trimmedGender = gender.trim();
              if (['Male', 'Female', 'Not Specified'].includes(trimmedGender)) {
                validatedGender = trimmedGender;
              } else {
                warnings.push({
                  row: `Row ${rowNum} (${firstName} ${lastName})`,
                  warning: `Invalid gender value '${trimmedGender}'. Using 'Not Specified' instead. Valid values: Male, Female, Not Specified`
                });
                validatedGender = 'Not Specified';
              }
            }

            // Smart contact data detection and placement
            const contactData = smartPlaceContactData(row);
            const emailArray = contactData.emails;
            const phoneArray = contactData.phoneNumbers;
            
            // Add any warnings to import results for user feedback
            if (contactData.warnings.length > 0) {
              contactData.warnings.forEach(warning => {
                warnings.push({ 
                  row: `Row ${rowNum} (${firstName} ${lastName})`, 
                  warning: warning 
                });
              });
            }
            const sportsArray = sports ? sports.split(';').map((s: string) => s.trim()).filter(Boolean) : [];

            // Generate username
            const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, '');
            let username = baseUsername;
            let counter = 1;
            while (await storage.getUserByUsername(username)) {
              username = `${baseUsername}${counter}`;
              counter++;
            }

            const athleteData = {
              username,
              firstName,
              lastName,
              emails: emailArray.length > 0 ? emailArray : [`${username}@temp.local`],
              phoneNumbers: phoneArray,
              birthDate: birthDate || undefined,
              birthYear: birthYear && !isNaN(parseInt(birthYear)) ? parseInt(birthYear) : (birthDate ? new Date(birthDate).getFullYear() : undefined),
              graduationYear: graduationYear && !isNaN(parseInt(graduationYear)) ? parseInt(graduationYear) : undefined,
              sports: sportsArray,
              height: height && !isNaN(parseInt(height)) ? parseInt(height) : undefined,
              weight: weight && !isNaN(parseInt(weight)) ? parseInt(weight) : undefined,
              school: school || undefined,
              gender: validatedGender,
              password: 'INVITATION_PENDING', // Inactive until invited
              isActive: false,
              role: "athlete"
            };

            // Get organization context
            let organizationId: string | undefined = options.organizationId;
            if (!organizationId) {
              const currentUser = req.session.user!;
              const userOrgs = await storage.getUserOrganizations(currentUser.id);
              organizationId = userOrgs[0]?.organizationId;
            }

            // Handle team resolution
            let targetTeamId: string | undefined = teamId; // Legacy default

            if (teamName && teamName.trim()) {
              const normalizedTeamName = teamName.trim();
              const allTeams = await storage.getTeams();
              let team = allTeams.find(t =>
                t.name?.toLowerCase().trim() === normalizedTeamName.toLowerCase().trim() &&
                (!organizationId || t.organization?.id === organizationId)
              );

              // Handle team creation based on teamHandling mode
              if (!team) {
                if (options.teamHandling === 'auto_create_silent' ||
                    (options.teamHandling === 'auto_create_confirm' && confirmData)) {
                  // Create team automatically
                  if (organizationId) {
                    // SECURITY: Verify user has permission to create teams in this organization
                    const currentUser = req.session.user!;
                    const userIsSiteAdmin = isSiteAdmin(currentUser);

                    if (!userIsSiteAdmin) {
                      // Check if user belongs to the target organization AND has proper role
                      const userOrgs = await storage.getUserOrganizations(currentUser.id);
                      const orgMembership = userOrgs.find(org => org.organizationId === organizationId);

                      if (!orgMembership) {
                        errors.push({
                          row: rowNum,
                          error: `Unauthorized: Cannot create team "${normalizedTeamName}". User does not belong to this organization.`
                        });
                        continue;
                      }

                      // SECURITY: Only org_admin and coach roles can create teams
                      if (!['org_admin', 'coach'].includes(orgMembership.role)) {
                        errors.push({
                          row: rowNum,
                          error: `Unauthorized: Role '${orgMembership.role}' cannot create teams. Only organization admins and coaches can create teams.`
                        });
                        continue;
                      }
                    }

                    // CONCURRENCY: Handle race condition where another request creates the same team
                    try {
                      const newTeam = await storage.createTeam({
                        organizationId,
                        name: normalizedTeamName,
                        level: undefined,
                        notes: 'Auto-created during athlete import'
                      });
                      team = newTeam as any;

                      if (!createdTeams.has(normalizedTeamName)) {
                        createdTeams.set(normalizedTeamName, {
                          id: newTeam.id,
                          name: newTeam.name,
                          athleteCount: 0
                        });
                      }
                      createdTeams.get(normalizedTeamName)!.athleteCount++;
                    } catch (createError: any) {
                      // Check if this is a unique constraint violation (team was created by concurrent request)
                      if (createError.code === '23505' || createError.message?.includes('unique')) {
                        // Re-fetch the team that was just created by another request
                        const allTeams = await storage.getTeams();
                        team = allTeams.find(t =>
                          t.name?.toLowerCase().trim() === normalizedTeamName.toLowerCase().trim() &&
                          t.organization?.id === organizationId
                        );

                        if (!team) {
                          // Team should exist but wasn't found - this is unexpected
                          errors.push({
                            row: rowNum,
                            error: `Failed to create or find team "${normalizedTeamName}" after concurrent creation attempt`
                          });
                          continue;
                        }
                      } else {
                        // Different error - rethrow
                        throw createError;
                      }
                    }
                  }
                } else if (options.teamHandling === 'require_existing') {
                  errors.push({ row: rowNum, error: `Team "${normalizedTeamName}" does not exist and team creation is disabled` });
                  continue;
                }
                // For 'leave_teamless', team remains undefined
              }

              if (team) {
                targetTeamId = team.id;
              }
            }

            // Mode-specific athlete handling
            let athlete;
            let action: string;
            const athleteMode = options.athleteMode || 'smart_import';

            if (athleteMode === 'create_only') {
              // Always create new athlete, never match
              athlete = await storage.createUser(athleteData as any);
              action = 'created';
              createdAthletes.push({
                id: athlete.id,
                name: `${athlete.firstName} ${athlete.lastName}`
              });

            } else {
              // PERFORMANCE: Use pre-loaded athlete map instead of database query
              const lookupKey = `${firstName.toLowerCase()}:${lastName.toLowerCase()}`;
              const matchedAthlete = athleteMap.get(lookupKey);

              if (matchedAthlete) {
                // Found existing athlete
                athlete = matchedAthlete;

                if (athleteMode === 'smart_import' || athleteMode === 'match_and_update') {
                  // Update athlete info
                  if (options.updateExisting !== false) {
                    await storage.updateUser(athlete.id, {
                      birthDate: athleteData.birthDate,
                      birthYear: athleteData.birthYear,
                      graduationYear: athleteData.graduationYear,
                      sports: athleteData.sports,
                      height: athleteData.height,
                      weight: athleteData.weight,
                      school: athleteData.school,
                      gender: athleteData.gender
                    } as any);
                    action = 'updated';
                  } else {
                    action = 'matched';
                  }
                } else {
                  // match_only mode - just match without updating
                  action = 'matched';
                }

              } else {
                // No existing athlete found
                if (athleteMode === 'smart_import' || athleteMode === 'create_only') {
                  // Create new athlete for smart_import and create_only modes
                  athlete = await storage.createUser(athleteData as any);
                  action = 'created';
                  createdAthletes.push({
                    id: athlete.id,
                    name: `${athlete.firstName} ${athlete.lastName}`
                  });

                  // PERFORMANCE: Add newly created athlete to map for future lookups in this import
                  const newAthleteKey = `${athlete.firstName.toLowerCase()}:${athlete.lastName.toLowerCase()}`;
                  athleteMap.set(newAthleteKey, { ...athlete, teams: [] });
                } else {
                  // match_and_update or match_only - error if not found
                  errors.push({ row: rowNum, error: `Athlete ${firstName} ${lastName} not found (mode: ${athleteMode})` });
                  continue;
                }
              }
            }

            // Add athlete to organization first (if we have one)
            if (athlete && organizationId && action === 'created') {
              try {
                await storage.addUserToOrganization(athlete.id, organizationId, 'athlete');
              } catch (error) {
                // Organization membership might already exist, that's okay
                console.warn(`Could not add athlete ${athlete.id} to organization ${organizationId}:`, error);
              }
            }

            // Add to team if specified
            if (targetTeamId && athlete) {
              try {
                await storage.addUserToTeam(athlete.id, targetTeamId);
              } catch (error) {
                // Team membership might already exist, that's okay
                console.warn(`Could not add athlete ${athlete.id} to team ${targetTeamId}:`, error);
              }
            }

            results.push({
              action,
              athlete: {
                id: athlete.id,
                name: `${athlete.firstName} ${athlete.lastName}`,
                username: athlete.username
              }
            });
          } catch (error) {
            console.error('Error processing athlete row:', error);
            errors.push({ row: rowNum, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }
      } else if (type === 'measurements') {
        // Process measurements import
        for (let i = 0; i < csvData.length; i++) {
          const row = csvData[i];
          const rowNum = i + 2; // Account for header row
          try {
            const { firstName, lastName, teamName, date, age, metric, value, units, flyInDistance, notes, gender } = row;

            // Validate required fields
            if (!firstName || !lastName || !teamName || !date || !metric || !value) {
              errors.push({ row: rowNum, error: "First name, last name, team name, date, metric, and value are required" });
              continue;
            }

            // Get organization context for filtering
            let organizationId: string | undefined;
            const currentUser = req.session.user!;
            if (teamName) {
              // Try to find the team to get organization context
              const teams = await storage.getTeams();
              const team = teams.find(t => t.name?.toLowerCase().trim() === teamName.toLowerCase().trim());
              organizationId = team?.organization?.id;
            }
            if (!organizationId) {
              // Fallback to current user's primary organization
              const userOrgs = await storage.getUserOrganizations(currentUser.id);
              organizationId = userOrgs[0]?.organizationId;
            }

            // Use simplified athlete matching system with organization filtering
            const athletes = await storage.getAthletes({
              search: `${firstName} ${lastName}`,
              organizationId: organizationId
            });

            // Build matching criteria
            const matchingCriteria: MatchingCriteria = {
              firstName,
              lastName,
              teamName
            };

            // Find best match using advanced matching algorithm
            const matchResult: MatchResult = findBestAthleteMatch(matchingCriteria, athletes);

            let matchedAthlete;
            const measurementMode = options.measurementMode || 'match_only';

            if (matchResult.type === 'none') {
              // No suitable match found
              if (measurementMode === 'create_athletes') {
                // Auto-create athlete
                const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, '');
                let username = baseUsername;
                let counter = 1;
                while (await storage.getUserByUsername(username)) {
                  username = `${baseUsername}${counter}`;
                  counter++;
                }

                const newAthlete = await storage.createUser({
                  username,
                  firstName,
                  lastName,
                  emails: [`${username}@temp.local`],
                  phoneNumbers: [],
                  gender: gender || 'Not Specified',
                  password: 'INVITATION_PENDING',
                  isActive: false,
                  role: 'athlete'
                } as any);

                matchedAthlete = newAthlete;
                createdAthletes.push({
                  id: newAthlete.id,
                  name: `${firstName} ${lastName}`
                });

                // Add to team if specified
                if (teamName) {
                  const teams = await storage.getTeams();
                  let team = teams.find(t => t.name?.toLowerCase().trim() === teamName.toLowerCase().trim());

                  // Handle team creation if needed
                  if (!team && organizationId &&
                      (options.teamHandling === 'auto_create_silent' ||
                       options.teamHandling === 'auto_create_confirm')) {
                    const newTeam = await storage.createTeam({
                      organizationId,
                      name: teamName,
                      level: undefined,
                      notes: 'Auto-created during measurement import'
                    });
                    team = newTeam as any;

                    if (!createdTeams.has(teamName)) {
                      createdTeams.set(teamName, {
                        id: newTeam.id,
                        name: newTeam.name,
                        athleteCount: 0
                      });
                    }
                    createdTeams.get(teamName)!.athleteCount++;
                  }

                  if (team) {
                    try {
                      await storage.addUserToTeam(newAthlete.id, team.id);
                      if (team.organization?.id) {
                        await storage.addUserToOrganization(newAthlete.id, team.organization.id, 'athlete');
                      }
                    } catch (error) {
                      console.warn(`Could not add athlete to team:`, error);
                    }
                  }
                }

                warnings.push(`Row ${rowNum}: Created new athlete ${firstName} ${lastName}`);

              } else {
                // match_only mode - fail if not found
                let errorMsg = `No matching athlete found for ${firstName} ${lastName}`;
                if (teamName) {
                  errorMsg += ` in team "${teamName}"`;
                }

                // Suggest alternatives if available
                if (matchResult.alternatives && matchResult.alternatives.length > 0) {
                  const suggestions = matchResult.alternatives
                    .slice(0, 2)
                    .map(alt => `${alt.firstName} ${alt.lastName} (${alt.matchReason})`)
                    .join(', ');
                  errorMsg += `. Similar athletes found: ${suggestions}`;
                }

                errors.push({ row: rowNum, error: errorMsg });
                continue;
              }
            }

            // Handle review queue based on mode
            const shouldReview = measurementMode === 'review_all' ||
                                (measurementMode === 'review_low_confidence' &&
                                 (matchResult.requiresManualReview || matchResult.confidence < 75));

            if (shouldReview && matchResult.candidate) {
              // Add to review queue instead of processing immediately
              const reviewItem = reviewQueue.addItem({
                type: 'measurement',
                originalData: row,
                matchingCriteria,
                suggestedMatch: matchResult.candidate ? {
                  id: matchResult.candidate.id,
                  firstName: matchResult.candidate.firstName,
                  lastName: matchResult.candidate.lastName,
                  confidence: matchResult.confidence,
                  reason: matchResult.candidate.matchReason
                } : undefined,
                alternatives: matchResult.alternatives?.map(alt => ({
                  id: alt.id,
                  firstName: alt.firstName,
                  lastName: alt.lastName,
                  confidence: alt.matchScore,
                  reason: alt.matchReason
                })),
                createdBy: req.session.user!.id
              });

              results.push({
                action: 'pending_review',
                reviewItem: {
                  id: reviewItem.id,
                  reason: `Low confidence match (${matchResult.confidence}%) requires manual review`
                }
              });
              continue;
            }

            matchedAthlete = matchResult.candidate;

            if (!matchedAthlete) {
              errors.push({ row: rowNum, error: `No valid athlete match found for ${firstName} ${lastName}` });
              continue;
            }

            // Add warning for medium-confidence matches that were auto-approved
            if (matchResult.confidence < 90) {
              const warningMsg = `${firstName} ${lastName} matched to ${matchedAthlete.firstName} ${matchedAthlete.lastName} ` +
                `(confidence: ${matchResult.confidence}%, reason: ${matchedAthlete.matchReason})`;
              warnings.push(warningMsg);
            }

            const measurementData = {
              userId: matchedAthlete.id,
              date,
              age: age && !isNaN(parseInt(age)) ? parseInt(age) : undefined,
              metric,
              value: parseFloat(value),
              units: units || getDefaultUnit(metric),
              flyInDistance: flyInDistance && !isNaN(parseInt(flyInDistance)) ? parseInt(flyInDistance) : undefined,
              notes: notes || undefined,
              isVerified: "false"
            };

            const measurement = await storage.createMeasurement(measurementData, req.session.user!.id);

            results.push({
              action: 'created',
              measurement: {
                id: measurement.id,
                athlete: `${matchedAthlete.firstName} ${matchedAthlete.lastName}`,
                metric: measurement.metric,
                value: measurement.value,
                date: measurement.date
              }
            });
          } catch (error) {
            console.error('Error processing measurement row:', error);
            errors.push({ row: rowNum, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }
      }

      const pendingReviewCount = results.filter(r => r.action === 'pending_review').length;

      // Count different action types for summary
      createdCount = results.filter(r => r.action === 'created').length;
      updatedCount = results.filter(r => r.action === 'updated').length;
      matchedCount = results.filter(r => r.action === 'matched' || r.action === 'matched_and_deactivated').length;
      skippedCount = results.filter(r => r.action === 'skipped').length;

      const response: ImportResult = {
        type,
        totalRows,
        results,
        errors,
        warnings,
        summary: {
          successful: createdCount + updatedCount + matchedCount,
          created: createdCount,
          updated: updatedCount,
          matched: matchedCount,
          failed: errors.length,
          warnings: warnings.length,
          skipped: skippedCount,
          pendingReview: pendingReviewCount
        },
        options
      };

      // Add created teams if any
      if (createdTeams.size > 0) {
        response.createdTeams = Array.from(createdTeams.values());
      }

      // Add created athletes if any
      if (createdAthletes.length > 0) {
        response.createdAthletes = createdAthletes;
      }

      res.json(response);
    } catch (error) {
      console.error('Import error:', error);
      res.status(500).json({ message: "Import failed", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Review Queue endpoints
  app.get("/api/import/review-queue", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get organization context for filtering (if needed)
      const organizationId = (currentUser as any)?.organizationId || '';
      
      const queue = reviewQueue.getPendingItems(organizationId);
      res.json(queue);
    } catch (error) {
      console.error('Review queue error:', error);
      res.status(500).json({ message: "Failed to fetch review queue", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/import/review-decision", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { itemId, action, selectedAthleteId, notes } = req.body;
      
      if (!itemId || !action) {
        return res.status(400).json({ message: "Item ID and action are required" });
      }

      // Validate action parameter
      if (!['approve', 'reject', 'select_alternative'].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Must be 'approve', 'reject', or 'select_alternative'" });
      }

      if (action === 'select_alternative' && !selectedAthleteId) {
        return res.status(400).json({ message: "Selected athlete ID is required for select_alternative action" });
      }

      const decision = {
        itemId,
        action,
        selectedAthleteId,
        notes
      };

      const updatedItem = reviewQueue.processDecision(decision, currentUser.id);
      
      if (!updatedItem) {
        return res.status(404).json({ message: "Review item not found" });
      }

      // If approved, process the measurement
      if (updatedItem.status === 'approved') {
        try {
          const originalData = updatedItem.originalData;
          const athleteId = selectedAthleteId || updatedItem.suggestedMatch?.id;
          
          if (athleteId && updatedItem.type === 'measurement') {
            const measurementData = {
              userId: athleteId,
              date: originalData.date,
              age: originalData.age && !isNaN(parseInt(originalData.age)) ? parseInt(originalData.age) : undefined,
              metric: originalData.metric,
              value: parseFloat(originalData.value),
              units: originalData.units || getDefaultUnit(originalData.metric),
              flyInDistance: originalData.flyInDistance && !isNaN(parseInt(originalData.flyInDistance)) ? parseInt(originalData.flyInDistance) : undefined,
              notes: originalData.notes || `Approved from review queue by ${currentUser.firstName} ${currentUser.lastName}`,
              isVerified: "false"
            };

            const measurement = await storage.createMeasurement(measurementData, currentUser.id);
            
            res.json({
              success: true,
              item: updatedItem,
              measurement: {
                id: measurement.id,
                metric: measurement.metric,
                value: measurement.value,
                date: measurement.date
              }
            });
          } else {
            res.json({ success: true, item: updatedItem });
          }
        } catch (error) {
          console.error('Error processing approved measurement:', error);
          res.status(500).json({ message: "Failed to process approved measurement", error: error instanceof Error ? error.message : 'Unknown error' });
        }
      } else {
        res.json({ success: true, item: updatedItem });
      }
    } catch (error) {
      console.error('Review decision error:', error);
      res.status(500).json({ message: "Failed to process review decision", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Export routes
  app.get("/api/export/athletes", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get all athletes with comprehensive data
      const athletes = await storage.getAthletes();

      // Transform to CSV format with all database fields
      const csvHeaders = [
        'id', 'firstName', 'lastName', 'fullName', 'username', 'emails', 'phoneNumbers',
        'birthDate', 'birthYear', 'graduationYear', 'school', 'sports', 'height', 'weight',
        'teams', 'isActive', 'createdAt'
      ];

      const csvRows = (athletes as any[]).map((athlete: any) => {
        const teams = athlete.teams ? athlete.teams.map((t: any) => t.name).join(';') : '';
        const emails = Array.isArray(athlete.emails) ? athlete.emails.join(';') : (athlete.emails || '');
        const phoneNumbers = Array.isArray(athlete.phoneNumbers) ? athlete.phoneNumbers.join(';') : (athlete.phoneNumbers || '');
        const sports = Array.isArray(athlete.sports) ? athlete.sports.join(';') : (athlete.sports || '');

        return [
          athlete.id,
          athlete.firstName,
          athlete.lastName,
          athlete.fullName,
          athlete.username,
          emails,
          phoneNumbers,
          athlete.birthDate || '',
          athlete.birthYear || '',
          athlete.graduationYear || '',
          athlete.school || '',
          sports,
          athlete.height || '',
          athlete.weight || '',
          teams,
          athlete.isActive,
          athlete.createdAt
        ].map(field => {
          // SECURITY: Sanitize for formula injection, then escape for CSV format
          let value = String(field || '');
          value = sanitizeCSVValue(value);

          // Escape commas and quotes for CSV
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',');
      });

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="athletes.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting athletes:", error);
      res.status(500).json({ message: "Failed to export athletes" });
    }
  });

  app.get("/api/export/measurements", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Extract query parameters for filtering
      const {playerId, teamIds, metric, dateFrom, dateTo, birthYearFrom, birthYearTo, ageFrom, ageTo, search, sport, gender, organizationId } = req.query;

      const filters: MeasurementFilters = {
        playerId: playerId as string,
        teamIds: teamIds ? (teamIds as string).split(',') : undefined,
        metric: metric as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
        birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
        ageFrom: ageFrom ? parseInt(ageFrom as string) : undefined,
        ageTo: ageTo ? parseInt(ageTo as string) : undefined,
        search: search as string,
        sport: sport as string,
        gender: gender as string,
        organizationId: organizationId as string,
        includeUnverified: true
      };

      // Get measurements with filtering
      const measurements = await storage.getMeasurements(filters);

      // Transform to CSV format with all database fields including gender
      const csvHeaders = [
        'id', 'firstName', 'lastName', 'fullName', 'birthYear', 'gender', 'teams',
        'date', 'age', 'metric', 'value', 'units', 'flyInDistance', 'notes',
        'submittedBy', 'verifiedBy', 'isVerified', 'createdAt'
      ];

      const csvRows = measurements.map(measurement => {
        const user = measurement.user;
        const teams = user?.teams ? user.teams.map((t: any) => t.name).join(';') : '';
        const submittedBy = measurement.submittedBy || '';
        const verifiedBy = measurement.verifiedBy || '';

        return [
          measurement.id,
          user?.firstName || '',
          user?.lastName || '',
          user?.fullName || '',
          user?.birthYear || '',
          user?.gender || '',
          teams,
          measurement.date,
          measurement.age,
          measurement.metric,
          measurement.value,
          measurement.units,
          measurement.flyInDistance || '',
          measurement.notes || '',
          submittedBy,
          verifiedBy,
          measurement.isVerified,
          measurement.createdAt
        ].map(field => {
          // SECURITY: Sanitize for formula injection, then escape for CSV format
          let value = String(field || '');
          value = sanitizeCSVValue(value);

          // Escape commas and quotes for CSV
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',');
      });

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="measurements.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting measurements:", error);
      res.status(500).json({ message: "Failed to export measurements" });
    }
  });

  app.get("/api/export/teams", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get all teams with comprehensive data
      const teams = await storage.getTeams();

      // Transform to CSV format with all database fields
      const csvHeaders = [
        'id', 'name', 'organizationId', 'organizationName', 'level', 'notes', 'createdAt'
      ];

      const csvRows = teams.map(team => {
        return [
          team.id,
          team.name,
          team.organizationId,
          team.organization?.name || '',
          team.level || '',
          team.notes || '',
          team.createdAt
        ].map(field => {
          // Escape commas and quotes for CSV
          const value = String(field || '');
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',');
      });

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="teams.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting teams:", error);
      res.status(500).json({ message: "Failed to export teams" });
    }
  });

  // Admin endpoint to fix contact data for all athletes
  app.post("/api/admin/fix-contact-data", requireAuth, async (req, res) => {
    try {
      // Check if user is site admin
      if (req.session.user!.role !== 'site_admin') {
        return res.status(403).json({ message: "Only site administrators can perform this action" });
      }

      const results: any[] = [];
      const errors: any[] = [];

      // Get all users (athletes)
      const allUsers = await storage.getAthletes();
      
      for (const user of allUsers) {
        try {
          let hasChanges = false;
          const currentEmails = [...(user.emails || [])];
          const currentPhones = [...(user.phoneNumbers || [])];
          const newEmails: string[] = [];
          const newPhones: string[] = [];
          
          // Check phone numbers for emails
          currentPhones.forEach(phone => {
            if (isValidEmail(phone)) {
              // Found email in phone numbers
              if (!currentEmails.includes(phone) && !newEmails.includes(phone)) {
                newEmails.push(phone);
                hasChanges = true;
                results.push({
                  userId: user.id,
                  name: `${user.firstName} ${user.lastName}`,
                  action: `Moved email "${phone}" from phone numbers to emails`
                });
              }
            } else {
              // Keep as phone number
              newPhones.push(phone);
            }
          });

          // If we found emails in phone numbers, update the user
          if (hasChanges) {
            const updatedEmails = [...currentEmails, ...newEmails];
            await storage.updateUser(user.id, {
              emails: updatedEmails,
              phoneNumbers: newPhones
            });
          }
        } catch (error) {
          console.error(`Error processing user ${user.id}:`, error);
          errors.push({
            userId: user.id,
            name: `${user.firstName} ${user.lastName}`,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.json({
        message: `Contact data cleanup completed. ${results.length} changes made, ${errors.length} errors.`,
        results,
        errors,
        totalUsers: allUsers.length
      });

    } catch (error) {
      console.error('Contact data cleanup error:', error);
      res.status(500).json({ message: "Contact data cleanup failed", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return server;
}