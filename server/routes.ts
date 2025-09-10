import type { Express } from "express";
import { createServer } from "http";
import session from "express-session";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import csrf from "csrf";
import { body, validationResult } from "express-validator";
import DOMPurify from "isomorphic-dompurify";
import { storage } from "./storage";
import { PermissionChecker, ACTIONS, RESOURCES, ROLES } from "./permissions";
import { insertOrganizationSchema, insertTeamSchema, insertAthleteSchema, insertMeasurementSchema, insertInvitationSchema, insertUserSchema, updateProfileSchema, changePasswordSchema, createSiteAdminSchema, userOrganizations } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcrypt";
import { AccessController } from "./access-control";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { requireAuth, requireSiteAdmin, requireOrganizationAccess, requireTeamAccess, requireAthleteAccess, errorHandler } from "./middleware";
import multer from "multer";
import csv from "csv-parser";
import { ocrService } from "./ocr/ocr-service";
import { OCRProcessingResult } from '@shared/ocr-types';
import enhancedAuthRoutes from './routes/enhanced-auth';

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

// Legacy helper functions (to be removed gradually)
const isSiteAdmin = (user: any): boolean => {
  return user?.isSiteAdmin === true || user?.isSiteAdmin === 'true' || user?.role === "site_admin" || user?.admin === true;
};

const canManageUsers = async (userId: string, organizationId: string): Promise<boolean> => {
  return await accessController.canManageOrganization(userId, organizationId);
};

// Helper functions for access control
const canAccessOrganization = async (user: any, organizationId: string): Promise<boolean> => {
  if (!user?.id) return false;
  return await accessController.canAccessOrganization(user.id, organizationId);
};

const hasRole = (user: any, role: string): boolean => {
  return user?.role === role;
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
async function initializeDefaultUser() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    // Require admin credentials to be set in environment variables
    if (!adminEmail || !adminPassword) {
      console.error("SECURITY: ADMIN_EMAIL and ADMIN_PASSWORD environment variables must be set");
      process.exit(1);
    }

    // Validate password strength
    if (adminPassword.length < 12) {
      console.error("SECURITY: ADMIN_PASSWORD must be at least 12 characters long");
      process.exit(1);
    }

    // Check if admin user already exists by email or username
    const existingUserByEmail = await storage.getUserByEmail(adminEmail);
    const existingUserByUsername = await storage.getUserByUsername("admin");

    if (!existingUserByEmail && !existingUserByUsername) {
      await storage.createUser({
        username: "admin",
        emails: [adminEmail],
        password: adminPassword,
        firstName: "Site",
        lastName: "Administrator",
        role: "site_admin",
        isSiteAdmin: "true"
      });
      console.log("Site administrator account created successfully");
    } else {
      console.log("Site administrator account already exists");
    }
  } catch (error) {
    console.error("Error initializing default user:", error);
    process.exit(1);
  }
}

export function registerRoutes(app: Express) {
  const server = createServer(app);


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

  app.use(session({
    secret: sessionSecret,
    resave: false,  // Don't save unchanged sessions
    saveUninitialized: false,  // Don't create sessions for unauthenticated users
    cookie: { 
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      httpOnly: true, // Prevent XSS attacks
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict' // CSRF protection
    }
  }));

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

  // Input sanitization middleware
  const sanitizeInput = (req: any, res: any, next: any) => {
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
  initializeDefaultUser();

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
        if (user.isActive === "false") {
          return res.status(401).json({ message: "Account has been deactivated. Please contact your administrator." });
        }

        // Determine user role - site admin or organization role
        let userRole: string;
        let redirectUrl = "/";
        const userOrgs = await storage.getUserOrganizations(user.id);

        // If user is site admin, use site_admin role
        if (user.isSiteAdmin === "true") {
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

        req.session.user = {
          id: user.id,
          username: user.username,
          email: user.emails?.[0] || `${user.username}@temp.local`, // Use first email for backward compatibility in session
          firstName: user.firstName,
          lastName: user.lastName,
          role: userRole,
          isSiteAdmin: user.isSiteAdmin === "true",
          athleteId: userRole === "athlete" ? user.id : undefined, // Use user ID as athlete ID for athletes
          primaryOrganizationId: userOrgs.length > 0 ? userOrgs[0].organizationId : undefined
        };

        // Log successful authentication without sensitive details
        console.log(`User authenticated successfully (${user.id}): role=${userRole}, orgs=${userOrgs ? userOrgs.length : 0}`);

        return res.json({ 
          success: true, 
          user: req.session.user,
          redirectUrl
        });
      }

      res.status(401).json({ message: "Invalid credentials" });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
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
      if (targetUser.isSiteAdmin === "true") {
        return res.status(400).json({ message: "Cannot impersonate other site administrators" });
      }

      // Determine the target user's role
      let targetRole: string;
      const userOrgs = await storage.getUserOrganizations(targetUser.id);

      if (targetUser.isSiteAdmin === "true") {
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
        isSiteAdmin: targetUser.isSiteAdmin === "true",
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
      console.error("Error fetching user organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  app.post("/api/organizations", requireSiteAdmin, async (req, res) => {
    try {
      const organizationData = insertOrganizationSchema.parse(req.body);
      const organization = await storage.createOrganization(organizationData);
      res.status(201).json(organization);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating organization:", error);
        res.status(500).json({ message: "Failed to create organization" });
      }
    }
  });

  // User management routes (Site Admin only)
  app.post("/api/users", requireSiteAdmin, async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);

      // If organization specified, add user to it
      if (req.body.organizationId) {
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

  // Team routes with basic organization support
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

  app.post("/api/teams", requireAuth, async (req, res) => {
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
      const teamData = insertTeamSchema.partial().parse(req.body);
      const updatedTeam = await storage.updateTeam(id, teamData);
      res.json(updatedTeam);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
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

  // Athlete routes
  app.get("/api/athletes", requireAuth, async (req, res) => {
    try {
      const {teamId, birthYearFrom, birthYearTo, search, gender, organizationId } = req.query;
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
      };

      const athletes = await storage.getAthletes(filters);

      // Transform athletes to match the expected athlete format
      const athletesList = athletes.map((athlete) => ({
        ...athlete,
        teams: athlete.teams,
        hasLogin: athlete.password !== "INVITATION_PENDING",
        isActive: athlete.isActive === "true"
      }));

      console.log(`Returning ${athletesList.length} athletes`);
      console.log('Team assignments:', athletesList.map(a => `${a.teams.length} teams`).join(', '));

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

  app.post("/api/athletes", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      // Athletes cannot create athlete records
      if (currentUser?.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot create athlete records" });
      }

      const athleteData = insertAthleteSchema.parse(req.body);

      console.log('Received athlete data in API:', athleteData);

      // Add organization context for non-site admins
      const userIsSiteAdmin = isSiteAdmin(currentUser);
      if (!userIsSiteAdmin && currentUser?.primaryOrganizationId) {
        athleteData.organizationId = currentUser.primaryOrganizationId;
      }

      const athlete = await storage.createAthlete(athleteData);

      console.log('Athlete created successfully with', athleteData.teamIds?.length || 0, 'team assignments');

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
      const {athleteId, teamIds, metric, dateFrom, dateTo, birthYearFrom, birthYearTo, ageFrom, ageTo, search, sport, gender, organizationId } = req.query;
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

        const filters: any = {
          playerId: currentUser.athleteId,
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

      const filters: any = {
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

  app.post("/api/measurements", requireAuth, async (req, res) => {
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
        console.log(`Measurement access validation: hasAccess=${hasAccess}`);

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

  // Keep existing analytics routes
  app.get("/api/analytics/dashboard", requireAuth, async (req, res) => {
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
        // Site admin can request specific org stats
        organizationId = requestedOrgId;
        // For site admins, if no organization specified, require it to prevent accidental data exposure
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for dashboard statistics" });
        }
      } else {
        // Org admins and coaches see their organization stats only
        organizationId = currentUser.primaryOrganizationId;
        if (!organizationId) {
          return res.status(400).json({ message: "User not associated with any organization" });
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

  app.get("/api/analytics/teams", requireAuth, async (req, res) => {
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

  // Invitation routes
  // Unified invitation endpoint - handles all invitation types
  app.post("/api/invitations", requireAuth, async (req, res) => {
    try {
      const { email, firstName, lastName, role, organizationId, teamIds, athleteId } = req.body;

      // Get current user info for invitedBy
      let invitedById = req.session.user?.id;
      if (!invitedById && req.session.admin) {
        const siteAdmin = await storage.getUserByUsername("admin");
        invitedById = siteAdmin?.id;
      }

      if (!invitedById) {
        return res.status(400).json({ message: "Unable to determine current user" });
      }

      // Handle athlete invitation (send to all their emails)
      if (athleteId && role === "athlete") {
        const athlete = await storage.getAthlete(athleteId);
        if (!athlete) {
          return res.status(404).json({ message: "Athlete not found" });
        }

        // Check permissions using unified function
        const permissionCheck = await checkInvitationPermissions(invitedById, 'general', role, organizationId);
        if (!permissionCheck.allowed) {
          return res.status(403).json({ message: permissionCheck.reason || "Insufficient permissions to invite users" });
        }

        // Send invitations to all athlete's email addresses
        const invitations = [];
        const athleteEmails = athlete.emails || [];

        if (athleteEmails.length === 0) {
          return res.status(400).json({ message: "Athlete has no email addresses on file" });
        }

        for (const athleteEmail of athleteEmails) {
          try {
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
            console.error(`Failed to create invitation for ${athleteEmail}:`, error);
          }
        }

        if (invitations.length === 0) {
          return res.status(500).json({ message: "Failed to create any invitations" });
        }

        // Generate invite links for all emails
        const inviteLinks = invitations.map(inv => 
          `${req.protocol}://${req.get('host')}/accept-invitation?token=${inv.token}`
        );

        console.log(`Created ${invitations.length} invitations for athlete ${athlete.firstName} ${athlete.lastName}`);

        return res.status(201).json({
          invitations: invitations.map(inv => ({ id: inv.id, email: inv.email })),
          inviteLinks,
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

      // Check permissions using unified function
      const permissionCheck = await checkInvitationPermissions(invitedById, 'general', role, organizationId);
      if (!permissionCheck.allowed) {
        return res.status(403).json({ message: permissionCheck.reason || "Insufficient permissions to invite users" });
      }

      const invitation = await storage.createInvitation({
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        organizationId,
        teamIds: teamIds || [],
        role,
        invitedBy: invitedById,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Expires in 7 days
      });

      // Generate invite link for email sending (token should not be exposed to client)
      const inviteLink = `${req.protocol}://${req.get('host')}/accept-invitation?token=${invitation.token}`;

      // Log invitation creation for admin reference
      console.log(`Invitation created: ${invitation.id} for ${email}`);

      return res.status(201).json({
        id: invitation.id,
        email: invitation.email,
        inviteLink, // Include link for email sending, but not raw token
        message: `Invitation created for ${firstName || ''} ${lastName || ''} (${email})`.trim()
      });
    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(500).json({ message: "Failed to create invitation" });
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
        invitation.isUsed === 'false' &&
        userOrgs.some(userOrg => userOrg.organizationId === invitation.organizationId)
      );

      // Enrich with athlete data
      const enrichedInvitations = await Promise.all(
        athleteInvitations.map(async (invitation) => {
          if (invitation.playerId) {
            const athlete = await storage.getAthlete(invitation.playerId);
            return {
              ...invitation,
              firstName: athlete?.firstName,
              lastName: athlete?.lastName
            };
          }
          return invitation;
        })
      );

      res.json(enrichedInvitations);
    } catch (error) {
      console.error("Error fetching athlete invitations:", error);
      res.status(500).json({ error: "Failed to fetch athlete invitations" });
    }
  });

  app.get("/api/invitations/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const invitation = await storage.getInvitation(token);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      if (invitation.isUsed === "true") {
        return res.status(400).json({ message: "Invitation already used" });
      }

      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ message: "Invitation expired" });
      }

      res.json({
        email: invitation.email,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        role: invitation.role,
        organizationId: invitation.organizationId,
        teamIds: invitation.teamIds
      });
    } catch (error) {
      console.error("Error fetching invitation:", error);
      res.status(500).json({ message: "Failed to fetch invitation" });
    }
  });

  app.delete("/api/invitations/:id", requireAuth, async (req, res) => {
    try {
      const { id: invitationId } = req.params;
      const invitation = await storage.getInvitationById(invitationId);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      const currentUser = req.session.user;
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Check if current user has permission to delete the invitation
      if (!userIsSiteAdmin && currentUser?.id !== invitation.invitedBy) {
        // If not site admin, they must be the one who sent the invitation
        return res.status(403).json({ message: "Access denied. You can only delete invitations you sent." });
      }

      // If the invited user is already in the organization, remove them first
      if (invitation.organizationId) {
        const invitedUser = await storage.getUserByEmail(invitation.email);
        if (invitedUser) {
          await storage.removeUserFromOrganization(invitedUser.id, invitation.organizationId);
        }
      }

      await storage.deleteInvitation(invitationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ error: "Failed to delete invitation" });
    }
  });

  app.post("/api/invitations/:token/accept", authLimiter, async (req, res) => {
    try {
      const { token } = req.params;
      const { password, firstName, lastName, username } = req.body;

      if (!username || typeof username !== 'string' || username.trim().length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters long" });
      }

      if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        return res.status(400).json({ message: "Username can only contain letters, numbers, periods, hyphens, and underscores" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already taken. Please choose a different username." });
      }

      const invitation = await storage.getInvitation(token);
      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      const result = await storage.acceptInvitation(token, {
        email: invitation.email,
        username,
        password,
        firstName,
        lastName
      });

      // Use the role from the invitation
      let userRole = invitation.role;
      if (result.user.isSiteAdmin === "true") {
        userRole = "site_admin";
      }

      // Log the new user in
      req.session.user = {
        id: result.user.id,
        username: result.user.username,
        email: result.user.emails?.[0] || `${result.user.username}@temp.local`,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: userRole,
        isSiteAdmin: result.user.isSiteAdmin === "true"
      };

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
    } catch (error) {
      console.error("Error accepting invitation:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
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

  // DELETE /api/organizations/:id/users/:userId - Remove user from organization
  app.delete("/api/organizations/:id/users/:userId", requireAuth, async (req, res) => {
    try {
      const { id: organizationId, userId } = req.params;
      const currentUser = req.session.user;

      // Check if user has admin access to this organization
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      if (!userIsSiteAdmin) {
        const userRoles = await storage.getUserRoles(currentUser.id, organizationId);
        const isOrgAdmin = userRoles.includes("org_admin");
        if (!isOrgAdmin) {
          return res.status(403).json({ message: "Access denied. Only organization admins can delete users." });
        }
      }

      // Prevent users from deleting themselves
      if (currentUser?.id === userId) {
        const isSiteAdminUser = isSiteAdmin(currentUser);
        const userRolesToCheck = await storage.getUserRoles(userId, organizationId);
        const isOrgAdminUser = userRolesToCheck.includes("org_admin");

        if (isSiteAdminUser) {
          return res.status(400).json({ message: "Site administrators cannot delete themselves. Please have another administrator remove your access." });
        } else if (isOrgAdminUser) {
          return res.status(400).json({ message: "Organization administrators cannot delete themselves. Please have another administrator remove your access." });
        } else {
          return res.status(400).json({ message: "You cannot delete yourself from the organization." });
        }
      }

      // Check if the organization exists
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Check if the user exists and is part of this organization
      const userOrgs = await storage.getUserOrganizations(userId);
      const isUserInOrg = userOrgs.some(org => org.organizationId === organizationId);
      if (!isUserInOrg) {
        return res.status(404).json({ message: "User not found in this organization" });
      }

      // Check if user is an org admin and if they're the last one
      const userRolesToDelete = await storage.getUserRoles(userId, organizationId);
      if (userRolesToDelete.includes("org_admin")) {
        // Count total org admins in this organization
        const orgProfile = await storage.getOrganizationProfile(organizationId);
        const orgAdmins = orgProfile?.coaches.filter(coach => 
          coach.roles.includes("org_admin")
        ) || [];

        if (orgAdmins.length <= 1) {
          return res.status(400).json({ 
            message: "Cannot delete the last organization administrator. Each organization must have at least one admin." 
          });
        }
      }

      // Remove user from organization
      await storage.removeUserFromOrganization(userId, organizationId);

      res.json({ message: "User removed from organization successfully" });
    } catch (error) {
      console.error("Error removing user from organization:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Organization User Management Routes (for org admins)
  app.post("/api/organizations/:id/users", requireAuth, async (req, res) => {
    try {
      const { id: organizationId } = req.params;
      const currentUser = req.session.user;

      // Check if user has access to manage this organization
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      if (!userIsSiteAdmin) {
        if (!await canManageUsers(currentUser.id, organizationId)) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const { role, ...userData } = req.body;
      const { emails, ...otherUserData } = req.body;
      const parsedUserData = insertUserSchema.omit({ role: true }).parse({
        ...otherUserData,
        emails: emails || [otherUserData.email || `${otherUserData.username}@temp.local`]
      });

      // Validate single role
      if (!role || typeof role !== 'string') {
        return res.status(400).json({ message: "A single role must be specified" });
      }

      // Validate role value
      const validRoles = ["org_admin", "coach", "athlete"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role: ${role}. Must be one of: ${validRoles.join(", ")}` });
      }

      // Org admins cannot create site admins
      if (!userIsSiteAdmin && role === "site_admin") {
        return res.status(403).json({ message: "Cannot create site administrators" });
      }

      // Always create new user - email addresses are not unique identifiers for athletes
      const user = await storage.createUser({
        ...parsedUserData,
        role: "athlete" // Default role, will be overridden by organization role
      });

      // Add user to organization with the specified role (removes any existing roles first)
      await storage.addUserToOrganization(user.id, organizationId, role);

      res.status(201).json({ 
        id: user.id, 
        emails: user.emails, 
        firstName: user.firstName, 
        lastName: user.lastName, 
        role: role,
        message: "User created successfully"
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Failed to create user" });
      }
    }
  });


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
      if (user.isSiteAdmin === "true") {
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

  // Get all users (site admin only)
  app.get("/api/users", requireSiteAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error) {
      console.error("Error getting users:", error);
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  app.post("/api/site-admins", requireSiteAdmin, async (req, res) => {
    try {
      const adminData = createSiteAdminSchema.parse(req.body);

      const newUser = await storage.createUser({
        username: adminData.username,
        emails: [adminData.username + "@admin.local"], // Use username as email with dummy domain
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        password: adminData.password,
        role: "site_admin",
        isSiteAdmin: "true"
      });

      res.json({
        user: {
          id: newUser.id,
          email: newUser.emails?.[0] || `${newUser.username}@admin.local`,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: "site_admin",
        },
        message: "Site admin created successfully"
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error creating site admin:", error);
        res.status(500).json({ message: "Failed to create site admin" });
      }
    }
  });


  app.put("/api/users/:id/role", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { role, organizationId } = req.body;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get the user to check current role and organization membership
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user belongs to any organization
      const userOrgs = await storage.getUserOrganizations(id);
      const isOrgUser = userOrgs && userOrgs.length > 0;

      // Authorization checks
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        // For non-site admins, check org admin permissions
        if (!organizationId) {
          return res.status(400).json({ message: "Organization ID required for role changes" });
        }

        if (!await canManageUsers(currentUser.id, organizationId)) {
          return res.status(403).json({ message: "Access denied. Only organization admins can change user roles." });
        }

        // Check if target user is in the same organization
        const targetUserRoles = await storage.getUserRoles(id, organizationId);
        if (targetUserRoles.length === 0) {
          return res.status(403).json({ message: "User not found in this organization" });
        }

        // Prevent org admins from modifying themselves
        if (currentUser.id === id) {
          return res.status(403).json({ message: "You cannot change your own role" });
        }

        // Org admins can only change roles of coaches and other org admins (not athletes)
        const canChangeRole = targetUserRoles.some(userRole => ["org_admin", "coach"].includes(userRole));
        if (!canChangeRole) {
          return res.status(403).json({ message: "You can only change roles of coaches and organization admins" });
        }

        // Org admins cannot promote users to site admin
        if (role === "site_admin") {
          return res.status(403).json({ message: "Cannot promote users to site administrator" });
        }
      }

      // Role validation rules
      if (isOrgUser && role === "site_admin") {
        return res.status(400).json({ 
          message: "Users from organizations cannot be made site admins" 
        });
      }

      // Prevent conflicting role combinations: athlete vs coach/org_admin
      // Note: Since roles are stored in userOrganizations, we'll get current roles from the organization context
      const currentUserRoles = await storage.getUserRoles(id, organizationId || userOrgs[0]?.organizationId);
      const hasAthleteRole = currentUserRoles.includes('athlete');
      const hasCoachOrAdminRole = currentUserRoles.some(r => ['coach', 'org_admin'].includes(r));
      
      if ((hasAthleteRole && (role === 'coach' || role === 'org_admin')) ||
          (hasCoachOrAdminRole && role === 'athlete')) {
        return res.status(400).json({ 
          message: "Athletes cannot be coaches or admins, and coaches/admins cannot be athletes" 
        });
      }

      // Valid roles for organization users
      if (isOrgUser && !['athlete', 'coach', 'org_admin'].includes(role)) {
        return res.status(400).json({ 
          message: "Invalid role for organization user" 
        });
      }

      // Athletes cannot have their roles changed by org admins
      if (!userIsSiteAdmin) {
        const targetUserCurrentRoles = await storage.getUserRoles(id, organizationId || userOrgs[0]?.organizationId);
        if (targetUserCurrentRoles.includes("athlete")) {
          return res.status(403).json({ message: "Athlete roles cannot be changed by organization admins" });
        }
      }

      // Update user role differently based on who is making the change
      if (userIsSiteAdmin) {
        // Site admins can update roles in all organizations the user belongs to
        if (isOrgUser) {
          for (const userOrg of userOrgs) {
            // Use addUserToOrganization to ensure single role per org
            await storage.addUserToOrganization(id, userOrg.organizationId, role);
          }
        }
        const updatedUser = await storage.getUser(id);
        res.json(updatedUser);
      } else {
        // Org admins can only update role in their specific organization
        // Use addUserToOrganization to ensure single role per org
        await storage.addUserToOrganization(id, organizationId!, role);

        // Get updated user info to return
        const updatedUser = await storage.getUser(id);
        res.json(updatedUser);
      }
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

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
      const user = await storage.updateUser(id, { isActive: isActive ? "true" : "false" });

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
        if (user.isSiteAdmin === "true") continue; // Skip site admins

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

  // Configure multer for CSV file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Only CSV files are allowed'));
      }
    }
  });

  // Configure multer for image uploads (OCR)
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit for images
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only image files (JPG, PNG, WebP) and PDF files are allowed'));
      }
    }
  });

  // Import routes
  app.post("/api/import/:type", requireAuth, upload.single('file'), async (req, res) => {
    try {
      const { type } = req.params;
      const { createMissing, teamId } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (type !== 'athletes' && type !== 'measurements') {
        return res.status(400).json({ message: "Invalid import type. Use 'athletes' or 'measurements'" });
      }

      const results: any[] = [];
      const errors: any[] = [];
      const warnings: any[] = [];
      let totalRows = 0;

      // Parse CSV data
      const csvData: any[] = [];
      const csvText = file.buffer.toString('utf-8');

      // Split CSV into lines and parse
      const lines = csvText.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(400).json({ message: "CSV file is empty" });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        csvData.push(row);
        totalRows++;
      }

      if (type === 'athletes') {
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
              isActive: "false",
              role: "athlete"
            };

            // Create or find athlete
            let athlete;
            if (createMissing === 'true') {
              athlete = await storage.createUser(athleteData as any);

              // Add to team if specified
              if (teamId) {
                await storage.addUserToTeam(athlete.id, teamId);

                // Also add to organization as athlete
                const team = await storage.getTeam(teamId);
                if (team?.organization?.id) {
                  await storage.addUserToOrganization(athlete.id, team.organization.id, 'athlete');
                }
              }
            } else {
              // Match existing athlete by name and birth year
              const existingAthlete = await storage.getAthletes({
                search: `${firstName} ${lastName}`
              });

              const matchedAthlete = existingAthlete.find(p => 
                p.firstName?.toLowerCase() === firstName.toLowerCase() && 
                p.lastName?.toLowerCase() === lastName.toLowerCase() &&
                (birthYear ? p.birthYear === parseInt(birthYear) : true)
              );

              if (matchedAthlete) {
                athlete = matchedAthlete;
                
                // Check if athlete is already on the target team using reliable method
                let isAlreadyOnTeam = false;
                if (teamId) {
                  try {
                    const userTeams = await storage.getUserTeams(athlete.id);
                    isAlreadyOnTeam = userTeams.some((ut: any) => String(ut.team.id) === String(teamId));
                  } catch (error) {
                    console.warn(`Could not check team membership for user ${athlete.id}:`, error);
                    // Err on the side of caution - don't deactivate if we can't verify membership
                    isAlreadyOnTeam = true;
                  }
                }
                
                // If athlete is not already on the team, mark them as inactive when importing
                // Only deactivate if we have a target team to check against
                if (teamId && !isAlreadyOnTeam) {
                  await storage.updateUser(athlete.id, { isActive: "false" });
                  athlete.isActive = "false"; // Update local object for consistency
                  
                  results.push({
                    action: 'matched_and_deactivated',
                    athlete: {
                      id: athlete.id,
                      name: `${athlete.firstName} ${athlete.lastName}`,
                      username: athlete.username,
                      note: 'Athlete deactivated as they were not already on the target team'
                    }
                  });
                  continue; // Skip the normal results.push below to avoid duplication
                }
                
              } else {
                errors.push({ row: rowNum, error: `Athlete ${firstName} ${lastName} not found` });
                continue;
              }
            }

            results.push({
              action: createMissing === 'true' ? 'created' : 'matched',
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

            // Find athlete by name and team
            // Note: gender field can be included in CSV for additional matching context
            const athletes = await storage.getAthletes({
              search: `${firstName} ${lastName}`
            });

            let matchedAthlete;
            if (teamName) {
              // Clean up team name for comparison
              const cleanTeamName = teamName.toLowerCase().trim();
              
              // Match by firstName + lastName + team
              matchedAthlete = (athletes as any[]).find((p: any) => 
                p.firstName?.toLowerCase().trim() === firstName.toLowerCase().trim() && 
                p.lastName?.toLowerCase().trim() === lastName.toLowerCase().trim() &&
                p.teams?.some((team: any) => team.name?.toLowerCase().trim() === cleanTeamName)
              );

              // If no exact match, try partial team name matching
              if (!matchedAthlete) {
                matchedAthlete = (athletes as any[]).find((p: any) => 
                  p.firstName?.toLowerCase().trim() === firstName.toLowerCase().trim() && 
                  p.lastName?.toLowerCase().trim() === lastName.toLowerCase().trim() &&
                  p.teams?.some((team: any) => {
                    const teamNameClean = team.name?.toLowerCase().trim();
                    return teamNameClean?.includes(cleanTeamName) || cleanTeamName.includes(teamNameClean);
                  })
                );
              }
            } else {
              // Fallback to just name matching if no team specified
              matchedAthlete = athletes.find(p => 
                p.firstName?.toLowerCase().trim() === firstName.toLowerCase().trim() && 
                p.lastName?.toLowerCase().trim() === lastName.toLowerCase().trim()
              );
            }

            if (!matchedAthlete) {
              // Add debugging information to error message
              const nameMatches = (athletes as any[]).filter((p: any) => 
                p.firstName?.toLowerCase().trim() === firstName.toLowerCase().trim() && 
                p.lastName?.toLowerCase().trim() === lastName.toLowerCase().trim()
              );
              
              let errorMsg;
              if (teamName) {
                if (nameMatches.length > 0) {
                  const availableTeams = nameMatches.flatMap((p: any) => p.teams?.map((t: any) => t.name) || []).join(', ');
                  errorMsg = `Athlete ${firstName} ${lastName} not found in team "${teamName}". Available teams: ${availableTeams}`;
                } else {
                  errorMsg = `Athlete ${firstName} ${lastName} not found in team "${teamName}"`;
                }
              } else {
                errorMsg = `Athlete ${firstName} ${lastName} not found`;
              }
              errors.push({ row: rowNum, error: errorMsg });
              continue;
            }

            const measurementData = {
              userId: matchedAthlete.id,
              date,
              age: age && !isNaN(parseInt(age)) ? parseInt(age) : undefined,
              metric,
              value: parseFloat(value),
              units: units || (metric === 'FLY10_TIME' ? 's' : metric === 'VERTICAL_JUMP' ? 'in' : ''),
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

      res.json({
        type,
        totalRows,
        results,
        errors,
        warnings,
        summary: {
          successful: results.length,
          failed: errors.length,
          warnings: warnings.length
        }
      });
    } catch (error) {
      console.error('Import error:', error);
      res.status(500).json({ message: "Import failed", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Photo OCR upload route
  app.post("/api/import/photo", requireAuth, imageUpload.single('file'), async (req, res) => {
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

      console.log(`Processing OCR for file: ${file.originalname}, size: ${file.size} bytes, type: ${file.mimetype}`);

      // Extract text and data using OCR
      const ocrResult = await ocrService.extractTextFromImage(file.buffer);
      
      console.log(`OCR completed with confidence: ${ocrResult.confidence}%, extracted ${ocrResult.extractedData.length} measurements`);

      // Convert extracted data to the same format as CSV import
      const processedData: any[] = [];
      const errors: any[] = [];
      const warnings: string[] = [...ocrResult.warnings];

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

          // Find or suggest creating the athlete
          const athletes = await storage.getAthletes({
            search: `${extracted.firstName} ${extracted.lastName}`
          });

          let userId: string | null = null;
          
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
            errors.push({ 
              row: rowNum, 
              error: `Athlete not found: ${extracted.firstName} ${extracted.lastName}. Please create the athlete first or use CSV import with createMissing=true.`,
              data: extracted
            });
            continue;
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
          warnings
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

      const filters: any = {
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