/**
 * Organization management routes
 */

import type { Express } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { OrganizationService } from "../services/organization-service";
import { OrganizationTypeService } from "../services/organization-type-service";
import { profileMergeService } from "../services/profile-merge-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { requireOrgAccess } from "../permissions/middleware";
import { storage } from "../storage";
import type { OrganizationType } from "@shared/schema";
import { isSafeLogoUrl } from "./report-branding-utils";
// Session types are loaded globally

const organizationService = new OrganizationService();
const organizationTypeService = new OrganizationTypeService();

/**
 * Rate limiter for public directory endpoints
 * Prevents abuse of unauthenticated endpoints
 */
const directoryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per 15 minutes
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

/**
 * Sanitize error messages for production
 * Prevents leaking sensitive implementation details in error responses
 */
function sanitizeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  // In production, only return safe error messages to prevent info disclosure
  const isProduction = process.env.NODE_ENV === 'production';

  // Allowlist of error messages safe to expose (don't reveal internal paths, SQL, etc.)
  const safeErrors = [
    'Unauthorized',
    'not found',
    'access denied',
    'Invalid',
    'confirmation',
    'dependencies',
    'already exists',
    'already'
  ];

  if (isProduction) {
    const isSafeError = safeErrors.some(safe => error.message.includes(safe));
    return isSafeError ? error.message : fallback;
  }

  // In development, return full error message for debugging
  return error.message;
}

/**
 * Rate limit configuration constants
 * These values balance security with usability for different operations
 */
const RATE_LIMITS = {
  /** Conservative: Prevent organization spam while allowing legitimate admin work */
  ORG_CREATION: 5,
  /** Conservative: Prevent abuse while allowing frequent settings updates */
  ORG_UPDATE: 5,
  /** Moderate: Balance safety with usability for user management */
  USER_DELETION: 10,
  /** Very conservative: Destructive operation requiring extra caution */
  ORG_DELETION: 5,
  /** Very conservative: Profile merges are high-impact operations */
  PROFILE_MERGE: 5,
} as const;

// Rate limiting for organization creation
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.ORG_CREATION,
  message: { message: "Too many organization creation attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Always enforce rate limiting in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
});

// Rate limiting for organization updates
const updateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.ORG_UPDATE,
  message: { message: "Too many organization update attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Always enforce rate limiting in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
});

// Stricter rate limiting for user deletion operations
const userDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.USER_DELETION,
  message: { message: "Too many deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Always enforce rate limiting in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
});

// Rate limiting for organization deletion operations
const orgDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.ORG_DELETION,
  message: { message: "Too many organization deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Always enforce rate limiting in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
  // Combine IP and user ID to prevent bypass via IP spoofing
  // Uses ipKeyGenerator for proper IPv6 handling
  // SECURITY NOTE: This mitigates but does not completely prevent bypass via IP rotation
  // (e.g., cloud VPN services, mobile networks, proxy rotation). Additional protections:
  // - Audit logging captures all attempts for forensic analysis
  // - CSRF protection prevents automated attacks without valid session
  // - User account-based limiting (userId in key) prevents single-user abuse
  // - For advanced protection, consider: device fingerprinting, behavior analysis, or CAPTCHA
  keyGenerator: (req) => {
    const userId = req.session?.user?.id;
    const ip = req.ip || 'unknown';
    const normalizedIp = ipKeyGenerator(ip);
    return userId ? `${normalizedIp}-${userId}` : normalizedIp;
  },
});

// Rate limiting for profile merge operations (high-impact, destructive)
const profileMergeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: RATE_LIMITS.PROFILE_MERGE,
  message: { message: "Too many profile merge attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false;
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
  keyGenerator: (req) => {
    const userId = req.session?.user?.id;
    const ip = req.ip || 'unknown';
    const normalizedIp = ipKeyGenerator(ip);
    return userId ? `${normalizedIp}-${userId}` : normalizedIp;
  },
});

/**
 * Validate that a string is a valid UUIDv4
 * Includes length check to prevent ReDoS attacks
 */
function isValidUUID(id: string): boolean {
  // Validate length first to prevent ReDoS (UUIDs are always 36 characters)
  if (!id || id.length !== 36) {
    return false;
  }
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return UUID_REGEX.test(id);
}

export function registerOrganizationRoutes(app: Express) {
  /**
   * Get all organizations (site admin only)
   */
  app.get("/api/organizations", requireSiteAdmin, async (req, res) => {
    try {
      const organizations = await organizationService.getAllOrganizations(req.session.user!.id);
      res.json(organizations);
    } catch (error) {
      console.error("Get organizations error:", error);
      res.status(500).json({ message: sanitizeError(error, "Failed to fetch organizations") });
    }
  });

  /**
   * Get public organization directory (no auth required)
   * IMPORTANT: This route MUST be registered before /api/organizations/:id
   * to prevent the :id param from matching "public"
   * GET /api/organizations/public
   */
  app.get("/api/organizations/public", directoryLimiter, async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const orgType = req.query.orgType as OrganizationType | undefined;

      const organizations = await storage.getPublicOrganizations({ search, orgType });
      res.json({ organizations });
    } catch (error) {
      console.error("Error fetching public organizations:", error);
      res.status(500).json({ message: "Failed to fetch public organizations" });
    }
  });

  /**
   * Get organization by join code (no auth required)
   * IMPORTANT: This route MUST be registered before /api/organizations/:id
   * GET /api/organizations/join/:code
   */
  app.get("/api/organizations/join/:code", directoryLimiter, async (req, res) => {
    try {
      const { code } = req.params;

      if (!code || code.length < 4) {
        return res.status(400).json({ message: "Invalid join code" });
      }

      const organization = await storage.getOrganizationByJoinCode(code);

      if (!organization) {
        return res.status(404).json({ message: "Organization not found or join code is invalid" });
      }

      if (!organization.allowMembershipRequests) {
        return res.status(400).json({ message: "This organization is not accepting membership requests" });
      }

      // Return limited public info
      res.json({
        organization: {
          id: organization.id,
          name: organization.name,
          description: organization.description,
          location: organization.location,
          orgType: organization.orgType,
          autoApproveRequests: organization.autoApproveRequests,
        }
      });
    } catch (error) {
      console.error("Error fetching organization by join code:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  /**
   * Get organization by ID
   */
  app.get("/api/organizations/:id", requireAuth, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }
      const organization = await organizationService.getOrganizationById(
        organizationId, 
        req.session.user!.id
      );
      
      if (!organization) {
        return res.status(404).json({ message: "Organization not found or access denied" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Get organization error:", error);
      res.status(500).json({ message: sanitizeError(error, "Failed to fetch organization") });
    }
  });

  /**
   * Get user's organizations
   * Returns all organizations for site admins, assigned organizations for regular users
   */
  app.get("/api/my-organizations", requireAuth, async (req, res) => {
    try {
      const organizations = await organizationService.getAccessibleOrganizations(req.session.user!.id);
      res.json(organizations);
    } catch (error) {
      console.error("Get user organizations error:", error);
      res.status(500).json({ message: "Failed to fetch user organizations" });
    }
  });

  /**
   * Create organization (site admin only)
   */
  app.post("/api/organizations", createLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const organization = await organizationService.createOrganization(
        req.body,
        req.session.user!.id
      );

      // Invalidate organization type caches when new organization is created
      organizationTypeService.invalidateCache(`orgs:`);

      res.status(201).json(organization);
    } catch (error) {
      console.error("Create organization error:", error);
      res.status(400).json({ message: sanitizeError(error, "Failed to create organization") });
    }
  });

  /**
   * Update organization settings (site admin only)
   * Used by settings page to update basic info, feature flags, and status
   */
  app.patch("/api/organizations/:id", updateLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      // COPPA validation: coppaEnabled=true requires a contact email
      if (req.body.coppaEnabled === true && !req.body.coppaContactEmail) {
        return res.status(400).json({
          code: 'coppa_contact_email_required',
          message: 'A COPPA contact email is required when enabling the minor athlete consent flow.',
        });
      }

      // Capture request context for audit logging
      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      const updatedOrganization = await organizationService.updateOrganization(
        organizationId,
        req.body,
        req.session.user!.id,
        context
      );

      // Invalidate organization type caches when organization is updated
      // This ensures cached metrics/benchmarks reflect any org type changes
      organizationTypeService.invalidateCache(`orgs:`);

      res.json(updatedOrganization);
    } catch (error) {
      console.error("Update organization error:", error);
      const message = sanitizeError(error, "Failed to update organization");
      const statusCode = message.includes("Unauthorized") ? 403
        : message.includes("not found") ? 404
        : message.includes("already exists") ? 400
        : message.includes("Invalid") ? 400
        : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Update organization settings (Org Admin only - limited fields)
   * PATCH /api/organizations/:id/org-settings
   *
   * Allows org admins to update only aiEnabled flag (if aiEnabledBySiteAdmin is true)
   */
  app.patch("/api/organizations/:id/org-settings", updateLimiter, requireAuth, requireOrgAccess({ role: 'org_admin', fromParam: 'id' }), async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      // Get organization
      const org = await storage.getOrganization(organizationId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Org-admin authorization is enforced by requireOrgAccess middleware.

      // Only allow updating specific org-admin fields
      const { aiEnabled, wellnessEnabled, eventsEnabled, sprintFvEnabled, brandLogoUrl, brandPrimaryColor, brandSecondaryColor, brandTagline, aiPromptContext } = req.body;

      // Build updates object with only the fields that were provided
      const updates: {
        aiEnabled?: boolean;
        wellnessEnabled?: boolean;
        eventsEnabled?: boolean;
        sprintFvEnabled?: boolean;
        brandLogoUrl?: string | null;
        brandPrimaryColor?: string | null;
        brandSecondaryColor?: string | null;
        brandTagline?: string | null;
        aiPromptContext?: string | null;
      } = {};

      // Validate and handle aiEnabled
      if (aiEnabled !== undefined) {
        if (typeof aiEnabled !== 'boolean') {
          return res.status(400).json({ message: "aiEnabled must be boolean" });
        }

        // If trying to enable AI, check that site admin has permitted it
        if (aiEnabled === true && !org.aiEnabledBySiteAdmin) {
          return res.status(403).json({
            message: "AI features must be enabled by site administrator first"
          });
        }

        updates.aiEnabled = aiEnabled;
      }

      // Validate and handle wellnessEnabled
      if (wellnessEnabled !== undefined) {
        if (typeof wellnessEnabled !== 'boolean') {
          return res.status(400).json({ message: "wellnessEnabled must be boolean" });
        }

        // Check if wellness is enabled at site level
        const siteSettings = await storage.getSiteSettings();
        if (wellnessEnabled === true && !siteSettings?.wellnessModuleEnabled) {
          return res.status(403).json({
            message: "Wellness module must be enabled by site administrator first"
          });
        }

        updates.wellnessEnabled = wellnessEnabled;
      }

      // Validate and handle eventsEnabled
      if (eventsEnabled !== undefined) {
        if (typeof eventsEnabled !== 'boolean') {
          return res.status(400).json({ message: "eventsEnabled must be boolean" });
        }

        updates.eventsEnabled = eventsEnabled;
      }

      // Validate and handle sprintFvEnabled
      if (sprintFvEnabled !== undefined) {
        if (typeof sprintFvEnabled !== 'boolean') {
          return res.status(400).json({ message: "sprintFvEnabled must be boolean" });
        }

        if (sprintFvEnabled === true) {
          const siteSettingsForFv = await storage.getSiteSettings();
          if (!siteSettingsForFv?.sprintFvEnabled) {
            return res.status(403).json({
              message: "Sprint F-V profiling must be enabled by site administrator first"
            });
          }
        }

        updates.sprintFvEnabled = sprintFvEnabled;
      }

      // Validate and handle branding fields.
      // Note: branding is intentionally available to all orgs regardless of plan/tier.
      // If branding becomes a premium feature, add a feature gate here similar to aiEnabled.
      if (brandLogoUrl !== undefined) {
        if (brandLogoUrl === null || brandLogoUrl === '') {
          updates.brandLogoUrl = null;
        } else if (typeof brandLogoUrl !== 'string' || brandLogoUrl.length > 2000 || !isSafeLogoUrl(brandLogoUrl)) {
          return res.status(400).json({ message: "Logo URL must be a public HTTPS URL (max 2000 characters)" });
        } else {
          updates.brandLogoUrl = brandLogoUrl;
        }
      }

      if (brandPrimaryColor !== undefined) {
        if (brandPrimaryColor === null || brandPrimaryColor === '') {
          updates.brandPrimaryColor = null;
        } else if (typeof brandPrimaryColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(brandPrimaryColor)) {
          return res.status(400).json({ message: "Primary color must be a valid hex color (e.g. #1a365d)" });
        } else {
          updates.brandPrimaryColor = brandPrimaryColor;
        }
      }

      if (brandSecondaryColor !== undefined) {
        if (brandSecondaryColor === null || brandSecondaryColor === '') {
          updates.brandSecondaryColor = null;
        } else if (typeof brandSecondaryColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(brandSecondaryColor)) {
          return res.status(400).json({ message: "Secondary color must be a valid hex color (e.g. #2d8659)" });
        } else {
          updates.brandSecondaryColor = brandSecondaryColor;
        }
      }

      if (brandTagline !== undefined) {
        if (brandTagline === null || brandTagline === '') {
          updates.brandTagline = null;
        } else if (typeof brandTagline !== 'string' || brandTagline.length > 200) {
          return res.status(400).json({ message: "Tagline must be 200 characters or less" });
        } else {
          updates.brandTagline = brandTagline;
        }
      }

      // Validate and handle aiPromptContext.
      // Note: aiPromptContext is preserved in the DB even when AI is later disabled.
      // This is intentional — it avoids data loss and lets the context resume when
      // AI is re-enabled. The guard below only prevents *setting* context while
      // AI is off; it does not clear existing context on disable.
      if (aiPromptContext !== undefined) {
        if (aiPromptContext === null || aiPromptContext === '') {
          updates.aiPromptContext = null;
        } else if (typeof aiPromptContext !== 'string') {
          return res.status(400).json({ message: "AI prompt context must be a string" });
        } else if (aiPromptContext.length > 2000) {
          return res.status(400).json({ message: "AI prompt context must be 2000 characters or less" });
        } else {
          // Block setting context when AI is disabled at either level (matches frontend UX).
          // Use updates.aiEnabled ?? org.aiEnabled so a single request that enables AI
          // and sets context simultaneously is accepted (avoids requiring two API calls).
          if (!org.aiEnabledBySiteAdmin) {
            return res.status(403).json({
              message: "AI features must be enabled by site administrator first"
            });
          }
          const effectiveAiEnabled = updates.aiEnabled ?? org.aiEnabled;
          if (!effectiveAiEnabled) {
            return res.status(403).json({
              message: "AI features must be enabled for this organization first"
            });
          }
          // Store the raw value; sanitizeForPrompt() is applied at prompt-build time
          // in ai-insights-service.ts. Org admins are trusted users — storing raw lets
          // them see exactly what they entered. The 2000-char limit above is the primary
          // write-time guard; sanitization on read prevents injection into AI prompts.
          updates.aiPromptContext = aiPromptContext;
        }
      }

      // Require at least one field to update
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "At least one setting field is required" });
      }

      // Capture request context for audit logging
      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      // Update the allowed fields
      const updated = await storage.updateOrganization(organizationId, updates);

      // Invalidate organization type caches when organization is updated
      organizationTypeService.invalidateCache(`orgs:`);

      // Create audit log for AI flag change by org admin
      if (updates.aiEnabled !== undefined && updates.aiEnabled !== org.aiEnabled) {
        await storage.createAuditLog({
          userId: user.id,
          action: updates.aiEnabled ? 'org_ai_enabled_by_org_admin' : 'org_ai_disabled_by_org_admin',
          resourceType: 'organization',
          resourceId: organizationId,
          details: JSON.stringify({
            organizationName: org.name,
            previousValue: org.aiEnabled,
            newValue: updates.aiEnabled
          }),
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null,
        });
      }

      // Create audit log for wellness flag change by org admin
      if (updates.wellnessEnabled !== undefined && updates.wellnessEnabled !== org.wellnessEnabled) {
        await storage.createAuditLog({
          userId: user.id,
          action: updates.wellnessEnabled ? 'org_wellness_enabled' : 'org_wellness_disabled',
          resourceType: 'organization',
          resourceId: organizationId,
          details: JSON.stringify({
            organizationName: org.name,
            previousValue: org.wellnessEnabled,
            newValue: updates.wellnessEnabled
          }),
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null,
        });
      }

      // Create audit log for events flag change by org admin
      if (updates.eventsEnabled !== undefined && updates.eventsEnabled !== org.eventsEnabled) {
        await storage.createAuditLog({
          userId: user.id,
          action: updates.eventsEnabled ? 'org_events_enabled' : 'org_events_disabled',
          resourceType: 'organization',
          resourceId: organizationId,
          details: JSON.stringify({
            organizationName: org.name,
            previousValue: org.eventsEnabled,
            newValue: updates.eventsEnabled
          }),
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null,
        });
      }

      // Create audit log for Sprint F-V flag change by org admin
      if (updates.sprintFvEnabled !== undefined && updates.sprintFvEnabled !== org.sprintFvEnabled) {
        await storage.createAuditLog({
          userId: user.id,
          action: updates.sprintFvEnabled ? 'org_sprint_fv_enabled' : 'org_sprint_fv_disabled',
          resourceType: 'organization',
          resourceId: organizationId,
          details: JSON.stringify({
            organizationName: org.name,
            previousValue: org.sprintFvEnabled,
            newValue: updates.sprintFvEnabled
          }),
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null,
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Update organization settings error:", error);
      const message = sanitizeError(error, "Failed to update organization settings");
      const statusCode = message.includes("Unauthorized") ? 403
        : message.includes("not found") ? 404
        : message.includes("Invalid") ? 400
        : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Get organization profile with users
   */
  app.get("/api/organizations/:id/profile", requireAuth, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }
      const profile = await organizationService.getOrganizationProfile(
        organizationId, 
        req.session.user!.id
      );
      
      res.json(profile);
    } catch (error) {
      console.error("Get organization profile error:", error);
      const message = sanitizeError(error, "Failed to fetch organization profile");
      const statusCode = message.includes("Unauthorized") ? 403 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Remove user from organization
   */
  app.delete("/api/organizations/:id/users/:userId", userDeleteLimiter, requireAuth, async (req, res) => {
    try {
      const { id: organizationId, userId } = req.params;

      // Validate UUID formats
      if (!isValidUUID(organizationId) || !isValidUUID(userId)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      
      await organizationService.removeUserFromOrganization(
        organizationId,
        userId,
        req.session.user!.id
      );
      
      res.json({ message: "User removed from organization successfully" });
    } catch (error) {
      console.error("Remove user from organization error:", error);
      const message = sanitizeError(error, "Failed to remove user from organization");
      const statusCode = message.includes("Unauthorized") ? 403 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Add user to organization
   */
  // Only organization administrators (or site admins) may add users.
  app.post("/api/organizations/:id/users", requireAuth, requireOrgAccess({ role: 'org_admin', fromParam: 'id' }), async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      const user = await organizationService.addUserToOrganization(
        organizationId,
        req.body,
        req.session.user!.id
      );

      res.status(201).json(user);
    } catch (error) {
      console.error("Add user to organization error:", error);
      const message = sanitizeError(error, "Failed to add user to organization");
      const statusCode = message.includes("Unauthorized") ? 403 : 400;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Update user role within organization
   * Allows org admins to change roles of users within their organization
   */
  app.put("/api/organizations/:id/users/:userId/role", updateLimiter, requireAuth, requireOrgAccess({ role: 'org_admin', fromParam: 'id' }), async (req, res) => {
    try {
      const { id: organizationId, userId } = req.params;
      const { role } = req.body;
      const requestingUser = req.session.user!;
      const isSiteAdmin = requestingUser.isSiteAdmin === true;

      // Validate UUID formats
      if (!isValidUUID(organizationId) || !isValidUUID(userId)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      // Validate role
      const validRoles = ['org_admin', 'coach', 'athlete'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be org_admin, coach, or athlete" });
      }

      // Prevent users from changing their own role
      if (userId === requestingUser.id) {
        return res.status(403).json({ message: "Cannot change your own role" });
      }

      // Org-admin authorization is enforced by requireOrgAccess middleware.

      // Check if target user is in this organization
      const targetUserRoles = await storage.getUserRoles(userId, organizationId);
      if (targetUserRoles.length === 0) {
        return res.status(404).json({ message: "User not found in this organization" });
      }

      // Additional permission checks for org admins (not site admins)
      if (!isSiteAdmin) {
        const targetCurrentRole = targetUserRoles[0];

        // Org admins can't demote other org admins (only site admins can)
        if (targetCurrentRole === 'org_admin' && role !== 'org_admin') {
          return res.status(403).json({ message: "Only site administrators can demote organization administrators" });
        }
      }

      // Update the user's role in the organization
      await storage.updateUserOrganizationRole(userId, organizationId, role);

      // Create audit log
      await storage.createAuditLog({
        userId: requestingUser.id,
        action: 'user_role_updated',
        resourceType: 'user_organization',
        resourceId: userId,
        details: JSON.stringify({
          organizationId,
          newRole: role,
          updatedBy: requestingUser.id
        }),
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      });

      res.json({ message: "User role updated successfully", role });
    } catch (error) {
      console.error("Update user organization role error:", error);
      const message = sanitizeError(error, "Failed to update user role");
      const statusCode = message.includes("Unauthorized") || message.includes("Access denied") ? 403 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Get organizations with users (legacy endpoint for compatibility)
   */
  app.get("/api/organizations-with-users", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user!;

      // Get user's organizations
      const userOrganizations = await organizationService.getAccessibleOrganizations(currentUser.id);

      // For site admins, get all organizations
      if (currentUser.isSiteAdmin === true) {
        const allOrganizations = await organizationService.getAllOrganizations(currentUser.id);
        const orgIds = allOrganizations.map(org => org.id);

        // Fetch all profiles in batch (optimized to avoid N+1 queries)
        const profilesMap = await organizationService.getOrganizationProfilesBatch(orgIds, currentUser.id);

        const organizationsWithUsers = allOrganizations.map(org => {
          const profile = profilesMap.get(org.id);
          return {
            ...org,
            users: profile?.users || [],
            invitations: profile?.invitations || []
          };
        });

        res.json(organizationsWithUsers);
      } else {
        // For non-admin users, return their organizations with user lists
        const orgIds = userOrganizations.map(org => org.id);

        // Fetch all profiles in batch (optimized to avoid N+1 queries)
        const profilesMap = await organizationService.getOrganizationProfilesBatch(orgIds, currentUser.id);

        const organizationsWithUsers = userOrganizations.map(org => {
          const profile = profilesMap.get(org.id);
          return {
            ...org,
            users: profile?.users || [],
            invitations: profile?.invitations || []
          };
        });

        res.json(organizationsWithUsers);
      }
    } catch (error) {
      console.error("Get organizations with users error:", error);
      res.status(500).json({ message: "Failed to fetch organizations with users" });
    }
  });

  /**
   * Update organization status (deactivate/reactivate) (site admin only)
   */
  app.patch("/api/organizations/:id/status", orgDeleteLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }

      // Capture request context for audit logging
      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      if (isActive) {
        await organizationService.reactivateOrganization(organizationId, req.session.user!.id, context);
        res.json({ message: "Organization reactivated successfully" });
      } else {
        await organizationService.deactivateOrganization(organizationId, req.session.user!.id, context);
        res.json({ message: "Organization deactivated successfully" });
      }
    } catch (error) {
      console.error("Update organization status error:", error);
      const message = sanitizeError(error, "Failed to update organization status");
      const statusCode = message.includes("Unauthorized") ? 403
        : message.includes("not found") ? 404
        : message.includes("already") ? 400
        : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Get organization dependency counts (site admin only)
   */
  app.get("/api/organizations/:id/dependencies", requireSiteAdmin, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      // Capture request context for audit logging
      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      const counts = await organizationService.getOrganizationDependencyCounts(
        organizationId,
        req.session.user!.id,
        context
      );
      res.json(counts);
    } catch (error) {
      console.error("Get organization dependencies error:", error);
      const message = sanitizeError(error, "Failed to fetch organization dependencies");
      const statusCode = message.includes("Unauthorized") ? 403 : message.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Delete organization permanently (site admin only)
   * Requires confirmation name and organization must have no dependencies
   */
  app.delete("/api/organizations/:id", orgDeleteLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const organizationId = req.params.id;

      // Validate UUID format
      if (!isValidUUID(organizationId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }

      const { confirmationName } = req.body;

      if (!confirmationName) {
        return res.status(400).json({ message: "Confirmation name is required" });
      }

      // Capture request context for audit logging
      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };

      await organizationService.deleteOrganization(
        organizationId,
        confirmationName,
        req.session.user!.id,
        context
      );

      res.json({ message: "Organization deleted successfully" });
    } catch (error) {
      console.error("Delete organization error:", error);
      const message = sanitizeError(error, "Failed to delete organization");
      const statusCode = message.includes("Unauthorized") ? 403
        : message.includes("not found") ? 404
        : message.includes("dependencies") || message.includes("confirmation") ? 400
        : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Preview profile merge (org admin only)
   * Returns what would happen if two athlete profiles were merged
   * POST /api/organizations/:orgId/merge-profiles/preview
   */
  app.post("/api/organizations/:orgId/merge-profiles/preview", profileMergeLimiter, requireAuth, requireOrgAccess({ role: 'org_admin', fromParam: 'orgId' }), async (req, res) => {
    try {
      const { orgId } = req.params;
      const { sourceUserId, targetUserId } = req.body;

      // Validate UUID formats
      if (!isValidUUID(orgId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }
      if (!sourceUserId || !isValidUUID(sourceUserId)) {
        return res.status(400).json({ message: "Invalid source user ID format" });
      }
      if (!targetUserId || !isValidUUID(targetUserId)) {
        return res.status(400).json({ message: "Invalid target user ID format" });
      }

      // Org-admin authorization is enforced by requireOrgAccess middleware.

      const preview = await profileMergeService.previewMerge(
        orgId,
        sourceUserId,
        targetUserId,
        req.session.user!.id
      );

      res.json(preview);
    } catch (error) {
      console.error("Profile merge preview error:", error);
      const message = sanitizeError(error, "Failed to preview profile merge");
      const statusCode = message.includes("Unauthorized") ? 403
        : message.includes("not found") ? 404
        : message.includes("not a member") ? 400
        : message.includes("Can only merge") ? 400
        : 500;
      res.status(statusCode).json({ message });
    }
  });

  /**
   * Execute profile merge (org admin only)
   * Merges source athlete profile into target, then soft-deletes source
   * POST /api/organizations/:orgId/merge-profiles
   */
  app.post("/api/organizations/:orgId/merge-profiles", profileMergeLimiter, requireAuth, requireOrgAccess({ role: 'org_admin', fromParam: 'orgId' }), async (req, res) => {
    try {
      const { orgId } = req.params;
      const { sourceUserId, targetUserId, conflictResolution, dryRun } = req.body;

      // Validate UUID formats
      if (!isValidUUID(orgId)) {
        return res.status(400).json({ message: "Invalid organization ID format" });
      }
      if (!sourceUserId || !isValidUUID(sourceUserId)) {
        return res.status(400).json({ message: "Invalid source user ID format" });
      }
      if (!targetUserId || !isValidUUID(targetUserId)) {
        return res.status(400).json({ message: "Invalid target user ID format" });
      }

      // Prevent merging same user (fail-fast validation)
      if (sourceUserId === targetUserId) {
        return res.status(400).json({ message: "Cannot merge a user with themselves" });
      }

      // Org-admin authorization is enforced by requireOrgAccess middleware.

      // Capture request context for audit logging
      const context = {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };

      const result = await profileMergeService.mergeProfiles(
        orgId,
        sourceUserId,
        targetUserId,
        req.session.user!.id,
        { dryRun, conflictResolution },
        context
      );

      res.json(result);
    } catch (error) {
      console.error("Profile merge error:", error);
      const message = sanitizeError(error, "Failed to merge profiles");
      const statusCode = message.includes("Unauthorized") ? 403
        : message.includes("not found") ? 404
        : message.includes("Cannot merge") ? 400
        : message.includes("not a member") ? 400
        : message.includes("Can only merge") ? 400
        : 500;
      res.status(statusCode).json({ message });
    }
  });
}