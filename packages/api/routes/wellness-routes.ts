/**
 * Wellness Questionnaire REST API Routes
 *
 * Provides endpoints for:
 * - Template management (CRUD)
 * - Request creation and distribution
 * - Response submission (both authenticated and magic link)
 * - Analytics queries (team summaries, athlete trends)
 */

import type { Express, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { storage } from "../storage";
import { db } from "../db";
import {
  validateDateString,
  validateQuestionIds,
  validateDateRange,
  limitArraySize,
} from "../lib/validation-utils";
import {
  validateTemplate,
  hasValidStatusConfig,
  getStatusConfig,
} from "../lib/wellness-type-guards";
import {
  requireAuth,
  requireOrganizationAccess,
  requireWellnessAccess,
  requireWellnessEnabled,
  type AuthenticatedRequest,
} from "../middleware";
import {
  createWellnessTemplateSchema,
  updateWellnessTemplateSchema,
  createWellnessRequestSchema,
  updateWellnessRequestSchema,
  submitWellnessResponseSchema,
  generateResponseValidationSchema,
} from "@shared/wellness-validation";
import type { WellnessRequest, WellnessResponse } from "@shared/wellness-types";
import type { WellnessTrendDataPoint } from "@shared/wellness-analytics-types";
import { calculateAthleteStatus, getCommonInjuries, calculateTrend } from "@shared/wellness-status-utils";
import { WELLNESS_CONSTANTS } from "@shared/wellness-constants";
import { userTeams, userOrganizations } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { emailService } from "../services/email-service";
import { WellnessAccessService } from "../auth/wellness-access";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

// Helper function to check if rate limiting should be bypassed
const shouldBypassRateLimit = (): boolean => {
  // SECURITY: Never bypass rate limiting in production
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  // In non-production environments, allow bypass for testing
  return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
};

// Helper function to create secure error response (prevents error message leakage in production)
const createErrorResponse = (message: string, error?: Error) => {
  const response: any = { message };
  if (process.env.NODE_ENV !== 'production' && error) {
    response.error = error.message;
  }
  return response;
};

// Helper function to verify if an athlete is targeted by a wellness request
async function verifyAthleteIsTargeted(request: WellnessRequest, athleteId: string): Promise<boolean> {
  // Check direct targeting
  if (request.targetAthleteIds?.includes(athleteId)) {
    return true;
  }

  // Check team-based targeting
  if (request.targetTeamIds && request.targetTeamIds.length > 0) {
    const athleteTeams = await storage.getUserTeams(athleteId);
    const athleteTeamIds = athleteTeams.map(ut => ut.team.id);
    return request.targetTeamIds.some(teamId => athleteTeamIds.includes(teamId));
  }

  return false;
}

// Rate limiting configurations
const batchLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.BATCH,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => shouldBypassRateLimit(),
});

const highVolumeLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.HIGH_VOLUME,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => shouldBypassRateLimit(),
});

// Stricter rate limiting for analytics endpoints (sensitive athlete data)
const analyticsLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.ANALYTICS, // 50 requests per 15 min (vs 200 for high volume)
  message: { message: "Too many analytics requests. Please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => shouldBypassRateLimit(),
});

// Strict rate limiting for magic link token validation (security-sensitive)
const tokenValidationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.TOKEN_VALIDATION, // 10 requests per 15 min - prevents brute force
  message: { message: "Too many authentication attempts. Please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => shouldBypassRateLimit(),
  keyGenerator: (req) => ipKeyGenerator(req.ip || 'unknown'), // IPv6-aware IP normalization
});

/**
 * Register all wellness questionnaire routes
 */
export function registerWellnessRoutes(app: Express) {
  // =============================================================================
  // TEMPLATE ENDPOINTS
  // =============================================================================

  /**
   * POST /api/organizations/:organizationId/wellness/templates
   * Create a new wellness template
   * Access: Coach, Org Admin
   */
  app.post(
    "/api/organizations/:organizationId/wellness/templates",
    batchLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    requireWellnessEnabled,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const validation = createWellnessTemplateSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid template data",
            errors: validation.error.errors,
          });
        }

        const template = await storage.createWellnessTemplate({
          organizationId,
          name: validation.data.name,
          description: validation.data.description,
          config: validation.data.config,
          isDefault: validation.data.isDefault,
          isActive: validation.data.isActive,
          createdBy: req.user!.id,
        });

        res.status(201).json(template);
      } catch (error: any) {
        console.error("Failed to create wellness template:", error);
        res.status(500).json(createErrorResponse("Failed to create wellness template", error));
      }
    }
  );

  /**
   * GET /api/organizations/:organizationId/wellness/templates
   * List all templates for an organization
   * Access: All authenticated users in organization
   */
  app.get(
    "/api/organizations/:organizationId/wellness/templates",
    highVolumeLimiter,
    requireAuth,
    requireOrganizationAccess(),
    requireWellnessEnabled,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const activeOnly = req.query.activeOnly === 'true';

        const templates = await storage.getWellnessTemplates(organizationId, { activeOnly });

        res.json(templates);
      } catch (error: any) {
        console.error("Failed to fetch wellness templates:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness templates", error));
      }
    }
  );

  /**
   * GET /api/organizations/:organizationId/wellness/templates/:id
   * Get single template by ID
   * Access: All authenticated users in organization
   */
  app.get(
    "/api/organizations/:organizationId/wellness/templates/:id",
    highVolumeLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;

        const template = await storage.getWellnessTemplate(id);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        res.json(template);
      } catch (error: any) {
        console.error("Failed to fetch wellness template:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness template", error));
      }
    }
  );

  /**
   * GET /api/wellness/templates/:id
   * Get wellness template by ID (for public wellness submissions)
   * Access: Public (no authentication required)
   * Security: Only returns system templates or templates accessed via valid magic link
   * Note: Returns only public-safe fields (excludes createdBy, organizationId for security)
   */
  app.get(
    "/api/wellness/templates/:id",
    highVolumeLimiter,
    async (req, res: Response) => {
      try {
        const { id } = req.params;

        const template = await storage.getWellnessTemplate(id);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        // SECURITY: Only allow access to system templates via public endpoint
        // Organization-specific templates require authentication or valid magic link
        if (template.organizationId !== null && !template.isSystemSeeded) {
          return res.status(404).json({ message: "Template not found" });
        }

        // Return only public-safe fields for unauthenticated access
        // Exclude sensitive fields: organizationId, createdBy
        const publicTemplate = {
          id: template.id,
          name: template.name,
          description: template.description,
          config: template.config, // Question configuration is safe to expose
          isActive: template.isActive,
        };

        res.json(publicTemplate);
      } catch (error: any) {
        console.error("Failed to fetch wellness template:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness template", error));
      }
    }
  );

  /**
   * PUT /api/organizations/:organizationId/wellness/templates/:id
   * Update a wellness template
   * Access: Coach, Org Admin
   */
  app.put(
    "/api/organizations/:organizationId/wellness/templates/:id",
    batchLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const validation = updateWellnessTemplateSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid template data",
            errors: validation.error.errors,
          });
        }

        const template = await storage.getWellnessTemplate(id);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        // Verify template belongs to the organization
        if (template.organizationId !== req.params.organizationId) {
          return res.status(403).json({
            message: "Access denied to this template"
          });
        }

        const updated = await storage.updateWellnessTemplate(id, validation.data);

        res.json(updated);
      } catch (error: any) {
        console.error("Failed to update wellness template:", error);
        res.status(500).json(createErrorResponse("Failed to update wellness template", error));
      }
    }
  );

  /**
   * DELETE /api/organizations/:organizationId/wellness/templates/:id
   * Delete a wellness template
   * Access: Coach, Org Admin
   */
  app.delete(
    "/api/organizations/:organizationId/wellness/templates/:id",
    batchLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;

        const template = await storage.getWellnessTemplate(id);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        // Verify template belongs to the organization
        if (template.organizationId !== req.params.organizationId) {
          return res.status(403).json({
            message: "Access denied to this template"
          });
        }

        await storage.deleteWellnessTemplate(id);

        res.status(204).send();
      } catch (error: any) {
        console.error("Failed to delete wellness template:", error);
        res.status(500).json(createErrorResponse("Failed to delete wellness template", error));
      }
    }
  );

  /**
   * GET /api/organizations/:organizationId/wellness/library
   * Get wellness template library (global system templates only)
   * Organization-specific templates appear in the Templates tab instead
   * Access: All authenticated users in organization
   */
  app.get(
    "/api/organizations/:organizationId/wellness/library",
    highVolumeLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const { category, tags, search } = req.query;

        // Get ONLY global system templates (NULL organization_id)
        // Library tab should only show system-seeded templates
        const globalTemplates = await storage.getSystemWellnessTemplates();

        let filteredTemplates = globalTemplates;

        // Filter by category if provided
        if (category && typeof category === 'string') {
          filteredTemplates = filteredTemplates.filter(t => t.category === category);
        }

        // Filter by tags if provided (comma-separated)
        if (tags && typeof tags === 'string') {
          const tagArray = tags.split(',').map(t => t.trim());
          filteredTemplates = filteredTemplates.filter(t =>
            t.tags && tagArray.some(tag => t.tags!.includes(tag))
          );
        }

        // Search in name and description if provided
        if (search && typeof search === 'string') {
          const searchLower = search.toLowerCase();
          filteredTemplates = filteredTemplates.filter(t =>
            t.name.toLowerCase().includes(searchLower) ||
            (t.description && t.description.toLowerCase().includes(searchLower))
          );
        }

        // Library only shows system-seeded templates (organizationId IS NULL)
        // Organization-specific templates appear in the Templates tab instead
        res.json({
          systemTemplates: filteredTemplates,
          orgTemplates: [], // Empty - org templates don't appear in library
          total: filteredTemplates.length,
        });
      } catch (error: any) {
        console.error("Failed to fetch wellness library:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness library", error));
      }
    }
  );

  /**
   * POST /api/organizations/:organizationId/wellness/templates/:id/clone
   * Clone a template to the organization
   * Access: Coach, Org Admin
   */
  app.post(
    "/api/organizations/:organizationId/wellness/templates/:id/clone",
    batchLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    requireWellnessEnabled,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId, id } = req.params;

        // Get the source template
        const sourceTemplate = await storage.getWellnessTemplate(id);
        if (!sourceTemplate) {
          return res.status(404).json({ message: "Template not found" });
        }

        // Clone the template
        const clonedTemplate = await storage.createWellnessTemplate({
          organizationId,
          name: `${sourceTemplate.name} (Copy)`,
          description: sourceTemplate.description,
          config: sourceTemplate.config,
          isDefault: false,
          isActive: true,
          category: sourceTemplate.category,
          tags: sourceTemplate.tags,
          isSystemSeeded: false, // Cloned templates are not system-seeded
          sourceTemplateId: sourceTemplate.id, // Track the source
          createdBy: req.user!.id,
        });

        res.status(201).json(clonedTemplate);
      } catch (error: any) {
        console.error("Failed to clone wellness template:", error);
        res.status(500).json(createErrorResponse("Failed to clone wellness template", error));
      }
    }
  );

  // =============================================================================
  // REQUEST ENDPOINTS
  // =============================================================================

  /**
   * POST /api/organizations/:organizationId/wellness/requests
   * Create a new wellness request and send notifications
   * Access: Coach, Org Admin
   */
  app.post(
    "/api/organizations/:organizationId/wellness/requests",
    batchLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const validation = createWellnessRequestSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid request data",
            errors: validation.error.errors,
          });
        }

        const data = validation.data;

        // Generate public token for magic link methods
        let publicToken: string | undefined;
        if (data.distributionMethod === 'magic_link' || data.distributionMethod === 'qr_code' || data.distributionMethod === 'team_link') {
          publicToken = WellnessAccessService.generateMagicLinkToken();
        }

        // Create request
        const request = await storage.createWellnessRequest({
          organizationId,
          templateId: data.templateId,
          requestedBy: req.user!.id,
          distributionMethod: data.distributionMethod,
          targetAthleteIds: data.targetAthleteIds || [],
          targetTeamIds: data.targetTeamIds || [],
          publicToken,
          requiresAuth: data.requiresAuth || false,
          scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : undefined,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
          status: 'active',
        });

        // Send email notifications for magic link distribution
        const emailResults = {
          sent: 0,
          failed: 0,
          errors: [] as Array<{ athleteName: string; email: string; error: string }>,
        };

        if (data.distributionMethod === 'magic_link' && publicToken) {
          try {
            const magicLinks = await WellnessAccessService.generateMagicLinksForRequest(request.id);
            const template = await storage.getWellnessTemplate(data.templateId);
            const coach = await storage.getUser(req.user!.id);
            const organization = await storage.getOrganization(organizationId);

            // Calculate expiry days
            const expiryDays = data.expiresAt
              ? Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : 7;

            // Batch fetch all athletes to avoid N+1 query
            const athleteIds = Array.from(magicLinks.keys());
            const athletes = await storage.getUsersByIds(athleteIds);
            const athleteMap = new Map(athletes.map(a => [a.id, a]));

            // Send email to each targeted athlete
            for (const [athleteId, magicLink] of magicLinks.entries()) {
              const athlete = athleteMap.get(athleteId);
              if (athlete && athlete.emails && athlete.emails.length > 0) {
                try {
                  await emailService.sendWellnessRequest(athlete.emails[0], {
                    athleteName: athlete.fullName,
                    coachName: coach!.fullName,
                    organizationName: organization!.name,
                    magicLink,
                    expiryDays,
                    templateName: template!.name,
                    estimatedMinutes: ((template!.config as any).questions?.length || WELLNESS_CONSTANTS.DEFAULT_QUESTION_COUNT) * WELLNESS_CONSTANTS.MINUTES_PER_QUESTION,
                  });
                  emailResults.sent++;
                } catch (emailError) {
                  console.error(`Failed to send email to ${athlete.emails[0]}:`, emailError);
                  emailResults.failed++;
                  emailResults.errors.push({
                    athleteName: athlete.fullName,
                    email: athlete.emails[0],
                    error: (emailError as Error).message,
                  });
                }
              }
            }
          } catch (emailError) {
            console.error("Failed to generate magic links:", emailError);
            // Don't fail the request creation if email generation fails
          }
        }

        // Include email notification status in response
        res.status(201).json({
          ...request,
          emailNotifications: data.distributionMethod === 'magic_link' ? emailResults : undefined,
        });
      } catch (error: any) {
        console.error("Failed to create wellness request:", error);
        res.status(500).json(createErrorResponse("Failed to create wellness request", error));
      }
    }
  );

  /**
   * GET /api/organizations/:organizationId/wellness/requests
   * List all requests for an organization
   * Access: Coach, Org Admin
   */
  app.get(
    "/api/organizations/:organizationId/wellness/requests",
    highVolumeLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const status = req.query.status as string | undefined;

        const requests = await storage.getWellnessRequests(organizationId, { status: status as any });

        res.json(requests);
      } catch (error: any) {
        console.error("Failed to fetch wellness requests:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness requests", error));
      }
    }
  );

  /**
   * GET /api/organizations/:organizationId/wellness/requests/:id
   * Get single request by ID
   * Access: Coach, Org Admin
   */
  app.get(
    "/api/organizations/:organizationId/wellness/requests/:id",
    highVolumeLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;

        const request = await storage.getWellnessRequest(id);
        if (!request) {
          return res.status(404).json({ message: "Request not found" });
        }

        res.json(request);
      } catch (error: any) {
        console.error("Failed to fetch wellness request:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness request", error));
      }
    }
  );

  /**
   * GET /api/wellness/requests/by-token/:token
   * Get wellness request by public token (for magic links)
   * Access: Public (no authentication required)
   */
  app.get(
    "/api/wellness/requests/by-token/:token",
    highVolumeLimiter,
    async (req, res: Response) => {
      try {
        const { token } = req.params;

        const request = await storage.getWellnessRequestByToken(token);
        if (!request) {
          return res.status(404).json({ message: "Wellness request not found" });
        }

        // Check if expired
        if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
          return res.status(410).json({ message: "This wellness request has expired" });
        }

        res.json(request);
      } catch (error: any) {
        console.error("Failed to fetch wellness request by token:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness request", error));
      }
    }
  );

  /**
   * GET /api/wellness/requests/by-token/:token/template
   * Get wellness template for a valid request token
   * Access: Public (token acts as authentication)
   */
  app.get(
    "/api/wellness/requests/by-token/:token/template",
    highVolumeLimiter,
    async (req, res: Response) => {
      try {
        const { token } = req.params;

        // Validate token and get request
        const request = await storage.getWellnessRequestByToken(token);
        if (!request) {
          return res.status(404).json({ message: "Wellness request not found" });
        }

        // Check if expired
        if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
          return res.status(410).json({ message: "This wellness request has expired" });
        }

        // Get template - token proves legitimate access
        const template = await storage.getWellnessTemplate(request.templateId);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        // Return public-safe template fields
        const publicTemplate = {
          id: template.id,
          name: template.name,
          description: template.description,
          config: template.config,
          isActive: template.isActive,
        };

        res.json(publicTemplate);
      } catch (error: any) {
        console.error("Failed to fetch template by token:", error);
        res.status(500).json(createErrorResponse("Failed to fetch template", error));
      }
    }
  );

  /**
   * GET /api/wellness/requests/by-token/:token/targeted-athletes
   * Get list of targeted athletes for a wellness request (for athlete dropdown)
   * Access: Public (no authentication required)
   */
  app.get(
    "/api/wellness/requests/by-token/:token/targeted-athletes",
    highVolumeLimiter,
    async (req, res: Response) => {
      try {
        const { token } = req.params;

        // Get wellness request by token
        const request = await storage.getWellnessRequestByToken(token);
        if (!request) {
          return res.status(404).json({ message: "Wellness request not found" });
        }

        // Check if expired
        if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
          return res.status(410).json({ message: "This wellness request has expired" });
        }

        // Collect all target athlete IDs
        const targetAthleteIds: string[] = [];

        // Add directly targeted athletes
        if (request.targetAthleteIds) {
          targetAthleteIds.push(...request.targetAthleteIds);
        }

        // Add athletes from targeted teams (query userTeams table)
        if (request.targetTeamIds && request.targetTeamIds.length > 0) {
          for (const teamId of request.targetTeamIds) {
            // Query userTeams table to get all active members of this team
            const teamMembers = await db
              .select()
              .from(userTeams)
              .where(
                and(
                  eq(userTeams.teamId, teamId),
                  eq(userTeams.isActive, true)
                )
              );

            // Extract user IDs from team memberships
            const memberIds = teamMembers.map((member: any) => member.userId);
            targetAthleteIds.push(...memberIds);
          }
        }

        // Remove duplicates
        const uniqueAthleteIds = [...new Set(targetAthleteIds)];

        // Batch fetch user details
        const athletes = await storage.getUsersByIds(uniqueAthleteIds);

        // Get primary team for each athlete
        const athletesWithTeams = await Promise.all(
          athletes.map(async (athlete) => {
            const userTeams = await storage.getUserTeams(athlete.id);
            const primaryTeam = userTeams.length > 0 ? userTeams[0].team : null;

            return {
              id: athlete.id,
              fullName: athlete.fullName,
              teamName: primaryTeam?.name || null,
              teamId: primaryTeam?.id || null,
            };
          })
        );

        res.json({ athletes: athletesWithTeams });
      } catch (error: any) {
        console.error("Failed to fetch targeted athletes:", error);
        res.status(500).json(createErrorResponse("Failed to fetch targeted athletes", error));
      }
    }
  );

  /**
   * PUT /api/organizations/:organizationId/wellness/requests/:id/cancel
   * Cancel a wellness request
   * Access: Coach, Org Admin
   */
  app.put(
    "/api/organizations/:organizationId/wellness/requests/:id/cancel",
    batchLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;

        const request = await storage.getWellnessRequest(id);
        if (!request) {
          return res.status(404).json({ message: "Request not found" });
        }

        const updated = await storage.updateWellnessRequest(id, { status: 'cancelled' });

        res.json(updated);
      } catch (error: any) {
        console.error("Failed to cancel wellness request:", error);
        res.status(500).json(createErrorResponse("Failed to cancel wellness request", error));
      }
    }
  );

  /**
   * DELETE /api/organizations/:organizationId/wellness/requests/:id
   * Delete a wellness request permanently
   * Access: Coach, Org Admin
   */
  app.delete(
    "/api/organizations/:organizationId/wellness/requests/:id",
    batchLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;

        const request = await storage.getWellnessRequest(id);
        if (!request) {
          return res.status(404).json({ message: "Request not found" });
        }

        await storage.deleteWellnessRequest(id);

        res.status(204).send();
      } catch (error: any) {
        console.error("Failed to delete wellness request:", error);
        res.status(500).json({
          message: "Failed to delete wellness request",
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/organizations/:organizationId/wellness/requests/:requestId/completion-rate
   * Get accurate completion rate for a wellness request
   * Properly expands team targets to athlete counts
   * Access: Coach, Org Admin
   */
  app.get(
    "/api/organizations/:organizationId/wellness/requests/:requestId/completion-rate",
    requireAuth,
    requireOrganizationAccess("coach"),
    requireWellnessEnabled,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId, requestId } = req.params;

        const completionRate = await storage.getRequestCompletionRate(
          organizationId,
          requestId
        );

        res.json(completionRate);
      } catch (error: any) {
        console.error("Error calculating completion rate:", error);
        res.status(500).json(createErrorResponse("Failed to calculate completion rate", error));
      }
    }
  );

  // =============================================================================
  // RESPONSE ENDPOINTS
  // =============================================================================

  /**
   * POST /api/wellness/responses
   * Submit a wellness response (supports both authenticated and magic link access)
   * Access: Authenticated user OR valid magic link
   * Security: Uses strict token validation rate limiter to prevent brute force attacks
   */
  app.post(
    "/api/wellness/responses",
    tokenValidationLimiter, // Stricter rate limiting for magic link validation
    requireWellnessAccess(false),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const validation = submitWellnessResponseSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid response data",
            errors: validation.error.errors,
          });
        }

        const data = validation.data;

        // Get template to validate responses match question structure
        const template = await storage.getWellnessTemplate(data.templateId);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        // For authenticated users (not magic link access), verify organization membership
        if ((req.user as any).accessMethod === 'authenticated' || !(req.user as any).accessMethod) {
          const userOrgs = await storage.getUserOrganizations(req.user!.id);
          const hasAccess = userOrgs.some(uo => uo.organizationId === template.organizationId);

          // Site admins can access any organization
          const user = await storage.getUser(req.user!.id);
          const isSiteAdmin = user?.isSiteAdmin === true;

          if (!hasAccess && !isSiteAdmin) {
            return res.status(403).json({
              message: "You don't have access to this organization's wellness requests"
            });
          }
        }

        // Validate requestId belongs to same organization as template (prevents cross-org data leakage)
        if (data.requestId) {
          const request = await storage.getWellnessRequest(data.requestId);
          if (!request) {
            return res.status(404).json({ message: "Request not found" });
          }

          // Verify request belongs to same organization as template
          if (request.organizationId !== template.organizationId) {
            return res.status(400).json({
              message: "Request and template must belong to the same organization"
            });
          }

          // For magic link access, verify the submitted requestId and templateId match the validated request
          if ((req.user as any).accessMethod === 'magic_link') {
            const validatedRequest = (req as any).wellnessRequest;

            // SECURITY: Verify that the request and template IDs in the body match what was validated in middleware
            // This prevents attackers from submitting responses to different requests/templates using a stolen token
            if (!validatedRequest || validatedRequest.id !== data.requestId) {
              return res.status(403).json({
                message: "Request ID does not match the authenticated magic link"
              });
            }

            if (validatedRequest.templateId !== data.templateId) {
              return res.status(403).json({
                message: "Template ID does not match the authenticated magic link"
              });
            }

            // NOTE: Authorization check (athlete is targeted) is already performed in requireWellnessAccess middleware
            // No need to duplicate the check here
          }
        }

        // Validate responses match template questions
        try {
          const responseSchema = generateResponseValidationSchema(template.config as any);
          responseSchema.parse(data.responses);
        } catch (validationError: any) {
          // Log validation error for debugging (without sensitive response data)
          console.error('Response validation error:', validationError.message || 'Unknown validation error');

          // Transform Zod errors into user-friendly messages
          const friendlyErrors = validationError.errors?.map((err: any) => {
            const field = err.path.join('.');
            let message = err.message;

            // Customize messages for common validation failures
            if (err.code === 'invalid_type' && err.expected === 'object') {
              message = `Question "${field}" requires an answer`;
            } else if (err.code === 'too_small') {
              message = `Answer for "${field}" is too short (minimum ${err.minimum} characters)`;
            } else if (err.code === 'too_big') {
              message = `Answer for "${field}" is too long (maximum ${err.maximum} characters)`;
            }

            return { field, message };
          }) || [];

          return res.status(400).json({
            message: "Some answers don't match the expected format. Please check your responses and try again.",
            errors: friendlyErrors,
          });
        }

        // Get user details (handle both authenticated and magic link submissions)
        let userId: string;
        let userFullName: string;
        let teamId: string | undefined;
        let teamNameSnapshot: string | undefined;

        if ((req.user as any).accessMethod === 'magic_link') {
          const selectedAthleteId = req.body.selectedAthleteId;

          if (selectedAthleteId) {
            // Athlete selected from dropdown - use real user ID
            // SECURITY: Verify athlete is in targeted list
            const request = await storage.getWellnessRequest(data.requestId!);
            if (!request) {
              return res.status(404).json({ message: "Request not found" });
            }

            const isTargeted = await verifyAthleteIsTargeted(request as any, selectedAthleteId);

            if (!isTargeted) {
              return res.status(403).json({
                message: "Selected athlete is not authorized for this request"
              });
            }

            const user = await storage.getUser(selectedAthleteId);
            if (!user) {
              return res.status(404).json({ message: "Selected athlete not found" });
            }

            const userTeams = await storage.getUserTeams(selectedAthleteId);
            const primaryTeam = userTeams.length > 0 ? userTeams[0].team : null;

            userId = user.id;
            userFullName = user.fullName;
            teamId = primaryTeam?.id;
            teamNameSnapshot = primaryTeam?.name;
          } else {
            // Manual entry fallback - current behavior
            userId = 'magic-link-submission';
            userFullName = (req.body.athleteName as string) || 'Anonymous Athlete';
            teamId = undefined;
            teamNameSnapshot = undefined;
          }
        } else {
          // Authenticated submission: get user from database
          const user = await storage.getUser(req.user!.id);
          if (!user) {
            return res.status(404).json({ message: "User not found" });
          }

          // Get team details if user belongs to teams
          const userTeams = await storage.getUserTeams(req.user!.id);
          const primaryTeam = userTeams.length > 0 ? userTeams[0].team : null;

          userId = user.id;
          userFullName = user.fullName;
          teamId = primaryTeam?.id;
          teamNameSnapshot = primaryTeam?.name;
        }

        // Create response
        const response = await storage.createWellnessResponse({
          requestId: data.requestId,
          organizationId: template.organizationId || '',
          templateId: data.templateId,
          userId,
          userFullName,
          teamId: teamId || null,
          teamNameSnapshot: teamNameSnapshot || null,
          submittedAt: new Date(),
          date: data.date,
          responses: data.responses,
          accessMethod: (req.user as any).accessMethod || data.accessMethod || 'authenticated',
          ipAddress: req.ip || req.socket.remoteAddress || null,
          userAgent: req.get('user-agent') || null,
        });

        res.status(201).json(response);
      } catch (error: any) {
        console.error("Failed to submit wellness response:", error);
        res.status(500).json(createErrorResponse("Failed to submit wellness response", error));
      }
    }
  );

  /**
   * GET /api/wellness/responses/:id
   * Get single response by ID
   * Access: Authenticated user (coach/athlete viewing own data)
   */
  app.get(
    "/api/wellness/responses/:id",
    highVolumeLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;

        const response = await storage.getWellnessResponse(id);
        if (!response) {
          return res.status(404).json({ message: "Response not found" });
        }

        // Check authorization - user can only view their own responses or coach can view team responses
        if (req.user!.id !== response.userId) {
          // Check if user is a coach in the organization
          const userOrgs = await storage.getUserOrganizations(req.user!.id);
          const hasOrgAccess = userOrgs.some(org =>
            org.organizationId === response.organizationId && (org.role === 'coach' || org.role === 'org_admin')
          );

          if (!hasOrgAccess && !req.user!.isSiteAdmin) {
            return res.status(403).json({ message: "Access denied" });
          }
        }

        res.json(response);
      } catch (error: any) {
        console.error("Failed to fetch wellness response:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness response", error));
      }
    }
  );

  // =============================================================================
  // ATHLETE-SPECIFIC ENDPOINTS
  // =============================================================================

  /**
   * GET /api/wellness/my-requests
   * Get pending wellness requests for authenticated athlete
   * Access: Authenticated user (athlete)
   */
  app.get(
    "/api/wellness/my-requests",
    highVolumeLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;

        // Get all wellness requests targeted at this user
        // This includes requests with targetAthleteIds containing this user
        // and requests with targetTeamIds where the user is a team member
        const userTeams = await storage.getUserTeams(userId);
        const teamIds = userTeams.map(ut => ut.teamId);

        // Get user's organizations to scope requests
        const userOrgs = await storage.getUserOrganizations(userId);
        const orgIds = userOrgs.map(uo => uo.organizationId);

        // Get all active requests for user's organizations (batch query to avoid N+1)
        const allRequests = await storage.getWellnessRequestsByOrganizations(orgIds, { status: 'active' });

        // Filter requests targeted at this user
        const myRequests = allRequests.filter(request => {
          // Check if user is directly targeted
          if (request.targetAthleteIds && request.targetAthleteIds.includes(userId)) {
            return true;
          }

          // Check if any of user's teams are targeted
          if (request.targetTeamIds && request.targetTeamIds.some((teamId: string) => teamIds.includes(teamId))) {
            return true;
          }

          return false;
        });

        res.json(myRequests);
      } catch (error: any) {
        console.error("Failed to fetch athlete wellness requests:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness requests", error));
      }
    }
  );

  /**
   * GET /api/wellness/my-responses
   * Get submission history for authenticated athlete
   * Access: Authenticated user (athlete)
   */
  app.get(
    "/api/wellness/my-responses",
    highVolumeLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;

        // Parse pagination parameters
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const offset = (page - 1) * limit;

        // Get all responses by this user
        const allResponses = await storage.getWellnessResponsesByAthlete(userId);

        // Sort by submission date (most recent first)
        allResponses.sort((a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
        );

        // Apply pagination
        const totalCount = allResponses.length;
        const paginatedResponses = allResponses.slice(offset, offset + limit);

        res.json({
          responses: paginatedResponses,
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasMore: offset + limit < totalCount,
          },
        });
      } catch (error: any) {
        console.error("Failed to fetch athlete wellness responses:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness responses", error));
      }
    }
  );

  /**
   * GET /api/wellness/my-status
   * Get computed wellness status for authenticated athlete's dashboard
   * Access: Authenticated user (athlete)
   * Returns: { lastSubmissionDate, flaggedConcerns, overallStatus }
   */
  app.get(
    "/api/wellness/my-status",
    highVolumeLimiter,
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;

        // Get the latest response for this athlete
        const allResponses = await storage.getWellnessResponsesByAthlete(userId);

        if (!allResponses || allResponses.length === 0) {
          return res.json(null);
        }

        // Sort by submission date and get the most recent
        allResponses.sort((a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
        );
        const latestResponse = allResponses[0];

        // Get the template for this response
        const template = await storage.getWellnessTemplate(latestResponse.templateId);
        if (!template) {
          // Template was deleted, return null
          return res.json(null);
        }

        // Validate template config using type guard
        const validatedTemplate = validateTemplate(template);
        if (!validatedTemplate) {
          console.error(`Invalid template config for wellness status, template ${template.id}`);
          return res.json(null);
        }

        // Calculate status using shared utility
        // Type assertion: Database schema type is compatible with WellnessResponse interface
        // Both define the same structure for responses field (Record<string, { value: any }>)
        const { status } = calculateAthleteStatus(
          latestResponse as unknown as WellnessResponse,
          validatedTemplate
        );

        // Build flagged concerns from low scores and injuries
        const flaggedConcerns: { question: string; answer: string }[] = [];
        const responses = latestResponse.responses as Record<string, { value: any }>;

        // Check scale questions for concerning values
        for (const question of validatedTemplate.config.questions) {
          const answer = responses[question.id];
          if (!answer) continue;

          if (question.type === 'scale' && typeof answer.value === 'number') {
            // Get scale range
            const scaleMin = question.scaleMin;
            const scaleMax = question.scaleMax;
            const range = scaleMax - scaleMin;

            // Check orientation
            const orientation = validatedTemplate.config.statusConfig?.scaleOrientation || 'higher_is_better';

            if (orientation === 'higher_is_better') {
              // Low values are concerning
              if (answer.value <= scaleMin + Math.round(range * 0.3)) {
                flaggedConcerns.push({
                  question: question.label,
                  answer: `${answer.value}/${scaleMax}`,
                });
              }
            } else {
              // High values are concerning (lower_is_better)
              if (answer.value >= scaleMax - Math.round(range * 0.3)) {
                flaggedConcerns.push({
                  question: question.label,
                  answer: `${answer.value}/${scaleMax}`,
                });
              }
            }
          }

          // Check body_map for injuries
          if (question.type === 'body_map' && Array.isArray(answer.value) && answer.value.length > 0) {
            flaggedConcerns.push({
              question: question.label,
              answer: `${answer.value.length} area(s) marked`,
            });
          }
        }

        res.json({
          lastSubmissionDate: latestResponse.submittedAt,
          flaggedConcerns,
          overallStatus: status,
        });
      } catch (error: any) {
        console.error("Failed to fetch athlete wellness status:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness status", error));
      }
    }
  );

  /**
   * GET /api/organizations/:organizationId/wellness/responses
   * Get all wellness responses for an organization with filtering
   * Access: Coach, Org Admin
   */
  app.get(
    "/api/organizations/:organizationId/wellness/responses",
    highVolumeLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const { startDate, endDate, teamIds, athleteIds } = req.query;

        // Validate required parameters
        if (!startDate || !endDate) {
          return res.status(400).json({
            message: "startDate and endDate query parameters are required"
          });
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate as string) || !dateRegex.test(endDate as string)) {
          return res.status(400).json({
            message: "Dates must be in YYYY-MM-DD format"
          });
        }

        // Get all responses for the organization within date range
        let responses = await storage.getWellnessResponsesByOrganization(organizationId, {
          startDate: startDate as string,
          endDate: endDate as string,
        });

        // UUID validation regex (RFC 4122)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        // Filter by athleteIds if provided
        if (athleteIds && typeof athleteIds === 'string') {
          const athleteIdArray = athleteIds.split(',').map(id => id.trim()).filter(id => uuidRegex.test(id));
          if (athleteIdArray.length > 0) {
            responses = responses.filter(r => athleteIdArray.includes(r.userId));
          }
        }

        // Filter by teamIds if provided
        if (teamIds && typeof teamIds === 'string') {
          const teamIdArray = teamIds.split(',').map(id => id.trim()).filter(id => uuidRegex.test(id));
          if (teamIdArray.length > 0) {
            responses = responses.filter(r => r.teamId && teamIdArray.includes(r.teamId));
          }
        }

        // Sort by submission date (most recent first)
        responses.sort((a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
        );

        res.json(responses);
      } catch (error: any) {
        console.error("Failed to fetch organization wellness responses:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness responses", error));
      }
    }
  );

  /**
   * GET /api/wellness/requests/:requestId/check-submission
   * Check if the current user has already submitted a response for this request
   * Access: Public (supports both authenticated and magic link access)
   */
  app.get(
    "/api/wellness/requests/:requestId/check-submission",
    highVolumeLimiter,
    requireWellnessAccess(false),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { requestId } = req.params;
        const userId = req.user!.id;

        // Get all responses for this user
        const userResponses = await storage.getWellnessResponsesByAthlete(userId);

        // Check if any response matches this request
        const existingResponse = userResponses.find(
          response => response.requestId === requestId
        );

        if (existingResponse) {
          return res.json({
            hasSubmitted: true,
            submittedAt: existingResponse.submittedAt,
            responseId: existingResponse.id,
          });
        }

        res.json({
          hasSubmitted: false,
        });
      } catch (error: any) {
        console.error("Failed to check submission status:", error);
        res.status(500).json(createErrorResponse("Failed to check submission status", error));
      }
    }
  );

  // =============================================================================
  // ANALYTICS ENDPOINTS
  // =============================================================================

  /**
   * GET /api/organizations/:organizationId/wellness/analytics/team
   * Get team wellness summary
   * Access: Coach, Org Admin
   */
  app.get(
    "/api/organizations/:organizationId/wellness/analytics/team",
    analyticsLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { teamId, startDate, endDate } = req.query;

        if (!teamId || !startDate || !endDate) {
          return res.status(400).json({
            message: "teamId, startDate, and endDate are required",
          });
        }

        const summary = await storage.getTeamWellnessSummary(teamId as string, {
          startDate: startDate as string,
          endDate: endDate as string,
        });

        res.json(summary);
      } catch (error: any) {
        console.error("Failed to fetch team wellness summary:", error);
        res.status(500).json(createErrorResponse("Failed to fetch team wellness summary", error));
      }
    }
  );

  /**
   * GET /api/organizations/:organizationId/wellness/analytics/athlete/:athleteId
   * Get athlete wellness summary
   * Access: Coach, Org Admin, Athlete (own data)
   */
  app.get(
    "/api/organizations/:organizationId/wellness/analytics/athlete/:athleteId",
    analyticsLimiter,
    requireAuth,
    requireOrganizationAccess(),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { athleteId } = req.params;
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
          return res.status(400).json({
            message: "startDate and endDate are required",
          });
        }

        // Check authorization - athletes can only view their own data
        if (req.user!.role === 'athlete' && req.user!.id !== athleteId) {
          return res.status(403).json({ message: "Access denied" });
        }

        const summary = await storage.getAthleteWellnessSummary(athleteId, {
          startDate: startDate as string,
          endDate: endDate as string,
        });

        res.json(summary);
      } catch (error: any) {
        console.error("Failed to fetch athlete wellness summary:", error);
        res.status(500).json(createErrorResponse("Failed to fetch athlete wellness summary", error));
      }
    }
  );

  /**
   * GET /api/organizations/:organizationId/wellness/analytics/trends
   * Get wellness trends for organization
   * Access: Coach, Org Admin
   */
  app.get(
    "/api/organizations/:organizationId/wellness/analytics/trends",
    analyticsLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const { startDate, endDate, questionIds } = req.query;

        if (!startDate || !endDate) {
          return res.status(400).json({
            message: "startDate and endDate are required",
          });
        }

        // Validate dates
        const validatedStartDate = validateDateString(startDate as string, 'startDate');
        const validatedEndDate = validateDateString(endDate as string, 'endDate');

        // Validate date range (max 365 days)
        validateDateRange(validatedStartDate, validatedEndDate, 365);

        // Validate and sanitize question IDs (prevents SQL injection)
        const questionIdArray = validateQuestionIds(questionIds as string | undefined, 50);

        const trends = await storage.getWellnessTrends(organizationId, {
          startDate: validatedStartDate,
          endDate: validatedEndDate,
          questionIds: questionIdArray,
        });

        res.json(trends);
      } catch (error: any) {
        console.error("Failed to fetch wellness trends:", error);
        res.status(500).json(createErrorResponse("Failed to fetch wellness trends", error));
      }
    }
  );

  /**
   * GET /api/organizations/:organizationId/wellness/dashboard
   * Get team wellness dashboard data with status calculations
   * Access: Coach, Org Admin
   */
  app.get(
    "/api/organizations/:organizationId/wellness/dashboard",
    highVolumeLimiter,
    requireAuth,
    requireOrganizationAccess("coach"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;

        // Validate date parameter
        const date = validateDateString(req.query.date as string | undefined, 'date');

        const teamIdsParam = req.query.teamIds as string | undefined;
        const teamIds = teamIdsParam ? teamIdsParam.split(',').map(id => id.trim()) : undefined;

        // Fetch teams
        let teams = await storage.getTeams(organizationId);
        if (teamIds && teamIds.length > 0) {
          teams = teams.filter(t => teamIds.includes(t.id));
        }

        // PERFORMANCE OPTIMIZATION: Batch fetch all data upfront (reduces N+1 queries)
        // Before: 5-15 queries per team (40-60+ total for 5 teams)
        // After: 4 queries total for all teams

        // Query 1: Batch fetch all team rosters for the organization
        const allRosters = await storage.getTeamRostersBatch(organizationId);
        const rostersByTeam = new Map<string, typeof allRosters>();
        for (const roster of allRosters) {
          if (!rostersByTeam.has(roster.teamId)) {
            rostersByTeam.set(roster.teamId, []);
          }
          rostersByTeam.get(roster.teamId)!.push(roster);
        }

        // Query 2: Batch fetch responses for both current and previous dates
        const previousDate = new Date(date);
        previousDate.setDate(previousDate.getDate() - 1);
        const previousDateStr = previousDate.toISOString().split('T')[0];

        const allResponses = await storage.getWellnessResponsesByOrganization(organizationId, {
          startDate: previousDateStr,
          endDate: date,
        });

        // Group responses by date for easy filtering
        const currentDateResponses = allResponses.filter(r => r.date === date);
        const previousDateResponses = allResponses.filter(r => r.date === previousDateStr);

        // Query 3: Batch fetch all unique templates
        const uniqueTemplateIds = [...new Set(allResponses.map(r => r.templateId))];
        const templates = await storage.getWellnessTemplatesBatch(uniqueTemplateIds);
        const templateMap = new Map(templates.map(t => [t.id, t]));

        // Log warning if any templates are missing
        const missingTemplates = uniqueTemplateIds.filter(id => !templateMap.has(id));
        if (missingTemplates.length > 0) {
          console.warn(`Dashboard: Missing templates [${missingTemplates.join(', ')}] - filtering out responses`);
        }

        // Now process each team using in-memory data (fast)
        const dashboardData = [];

        for (const team of teams) {
          // Get team roster from batched data
          const teamRoster = rostersByTeam.get(team.id) || [];
          let athleteIds = teamRoster.map(r => r.userId);

          if (athleteIds.length === 0) {
            // Skip teams with no athletes
            continue;
          }

          // Limit athlete count to prevent memory exhaustion (Issue #4)
          if (athleteIds.length > WELLNESS_CONSTANTS.MAX_ATHLETES_PER_TEAM) {
            console.warn(`Team ${team.id} has ${athleteIds.length} athletes, limiting to ${WELLNESS_CONSTANTS.MAX_ATHLETES_PER_TEAM}`);
            athleteIds = limitArraySize(athleteIds, WELLNESS_CONSTANTS.MAX_ATHLETES_PER_TEAM, `Team ${team.id} athletes`);
          }

          // Filter responses for this team's athletes (in-memory operation)
          const teamResponses = currentDateResponses.filter(r => athleteIds.includes(r.userId));

          // Calculate athlete statuses
          const athleteStatuses = athleteIds.map(athleteId => {
            const athleteResponse = teamResponses.find(r => r.userId === athleteId);
            if (!athleteResponse) {
              return null;
            }

            const template = templateMap.get(athleteResponse.templateId);
            if (!template) {
              return null;
            }

            // Validate template config using type guard (replaces unsafe any cast)
            const validatedTemplate = validateTemplate(template);
            if (!validatedTemplate) {
              console.error(`Invalid template config for athlete ${athleteId}, template ${template.id}`);
              return null;
            }

            // Cast response to expected type
            const typedResponse = athleteResponse as WellnessResponse;
            const status = calculateAthleteStatus(typedResponse, validatedTemplate);
            return {
              id: athleteId,
              name: athleteResponse.userFullName,
              status: status.status,
              score: status.score,
              injuries: status.injuries,
              lastSubmission: athleteResponse.submittedAt,
            };
          }).filter((a): a is NonNullable<typeof a> => a !== null);

          // Count by status
          const redCount = athleteStatuses.filter(a => a.status === 'red').length;
          const yellowCount = athleteStatuses.filter(a => a.status === 'yellow').length;
          const greenCount = athleteStatuses.filter(a => a.status === 'green').length;

          // Calculate team status based on average of athlete scores
          let teamStatus: 'red' | 'yellow' | 'green' = 'green';
          let teamAverageScore: number | null = null;
          let scaleMax = 10; // Default scale max

          const athleteScores = athleteStatuses
            .map(a => a.score)
            .filter((s): s is number => s !== null);

          if (athleteScores.length > 0) {
            teamAverageScore = athleteScores.reduce((sum, score) => sum + score, 0) / athleteScores.length;

            // Get first template's status config to determine team status
            const firstTemplate = templateMap.values().next().value;
            const validatedFirstTemplate = firstTemplate ? validateTemplate(firstTemplate) : null;
            if (validatedFirstTemplate && hasValidStatusConfig(validatedFirstTemplate)) {
              const config = getStatusConfig(validatedFirstTemplate);

              if (config) {
                // Extract scaleMax from template's scale questions
                const scaleQuestions = validatedFirstTemplate.config.questions.filter(q => q.type === 'scale');
                if (scaleQuestions.length > 0) {
                  const firstScale = scaleQuestions[0];
                  if ('scaleMax' in firstScale) {
                    const calculationMethod = config.calculationMethod || 'average';
                    if (calculationMethod === 'sum') {
                      // For sum method, max is scaleMax * number of questions
                      scaleMax = firstScale.scaleMax * scaleQuestions.length;
                    } else {
                      // For average method, use single question's scaleMax
                      scaleMax = firstScale.scaleMax;
                    }
                  }
                }
              }

              if (config) {
                const scaleOrientation = config.scaleOrientation;

                if (scaleOrientation === 'higher_is_better') {
                  // Higher scores are better
                  if (teamAverageScore <= config.redThreshold) {
                    teamStatus = 'red';
                  } else if (teamAverageScore <= config.yellowThreshold) {
                    teamStatus = 'yellow';
                  } else {
                    teamStatus = 'green';
                  }
                } else {
                  // Lower scores are better
                  if (teamAverageScore >= config.redThreshold) {
                    teamStatus = 'red';
                  } else if (teamAverageScore >= config.yellowThreshold) {
                    teamStatus = 'yellow';
                  } else {
                    teamStatus = 'green';
                  }
                }
              }
            }
          }

          // Calculate completion rate
          const completionRate = athleteIds.length > 0
            ? Math.round((athleteStatuses.length / athleteIds.length) * 100)
            : 0;

          // Get common injuries
          const commonInjuries = getCommonInjuries(athleteStatuses);

          // Calculate trend (compare to previous day) - using batched data
          const teamPreviousResponses = previousDateResponses.filter(r => athleteIds.includes(r.userId));

          const currentScores = athleteStatuses
            .map(a => a.score)
            .filter((s): s is number => s !== null);

          const previousScores = teamPreviousResponses.map(r => {
            const template = templateMap.get(r.templateId);
            if (!template) return null;

            // Validate template using type guard (replaces unsafe any cast)
            const validatedTemplate = validateTemplate(template);
            if (!validatedTemplate) {
              return null;
            }

            const typedResponse = r as WellnessResponse;
            const status = calculateAthleteStatus(typedResponse, validatedTemplate);
            return status.score;
          }).filter((s): s is number => s !== null);

          const trend = calculateTrend(currentScores, previousScores);

          // Calculate template aggregates (per-template wellness averages)
          // Group current responses by templateId
          const responsesByTemplate = new Map<string, typeof teamResponses>();
          for (const response of teamResponses) {
            if (!responsesByTemplate.has(response.templateId)) {
              responsesByTemplate.set(response.templateId, []);
            }
            responsesByTemplate.get(response.templateId)!.push(response);
          }

          // Group previous responses by templateId for trend calculation
          const previousResponsesByTemplate = new Map<string, typeof teamPreviousResponses>();
          for (const response of teamPreviousResponses) {
            if (!previousResponsesByTemplate.has(response.templateId)) {
              previousResponsesByTemplate.set(response.templateId, []);
            }
            previousResponsesByTemplate.get(response.templateId)!.push(response);
          }

          // Build template aggregates
          const templateAggregates: {
            templateId: string;
            templateName: string;
            averageScore: number | null;
            scaleMax: number;
            responseCount: number;
            trend: 'up' | 'down' | 'stable';
            status: 'red' | 'yellow' | 'green';
          }[] = [];

          for (const [templateId, responses] of responsesByTemplate.entries()) {
            const template = templateMap.get(templateId);
            if (!template) continue;

            const validatedTemplate = validateTemplate(template);
            if (!validatedTemplate) continue;

            // Calculate average score for this template
            const scores = responses.map(r => {
              const typedResponse = r as WellnessResponse;
              const status = calculateAthleteStatus(typedResponse, validatedTemplate);
              return status.score;
            }).filter((s): s is number => s !== null);

            const averageScore = scores.length > 0
              ? scores.reduce((sum, score) => sum + score, 0) / scores.length
              : null;

            // Determine scaleMax from template config
            let templateScaleMax = 10; // Default
            if (hasValidStatusConfig(validatedTemplate)) {
              const config = getStatusConfig(validatedTemplate);
              if (config) {
                const scaleQuestions = validatedTemplate.config.questions.filter(q => q.type === 'scale');
                if (scaleQuestions.length > 0) {
                  const firstScale = scaleQuestions[0];
                  if ('scaleMax' in firstScale) {
                    const calculationMethod = config.calculationMethod || 'average';
                    if (calculationMethod === 'sum') {
                      // For sum method, max is scaleMax * number of questions
                      templateScaleMax = firstScale.scaleMax * scaleQuestions.length;
                    } else {
                      // For average method, use single question's scaleMax
                      templateScaleMax = firstScale.scaleMax;
                    }
                  }
                }
              }
            }

            // Calculate trend for this template
            const previousTemplateResponses = previousResponsesByTemplate.get(templateId) || [];
            const previousTemplateScores = previousTemplateResponses.map(r => {
              const template = templateMap.get(r.templateId);
              if (!template) return null;
              const validatedTemplate = validateTemplate(template);
              if (!validatedTemplate) return null;
              const typedResponse = r as WellnessResponse;
              const status = calculateAthleteStatus(typedResponse, validatedTemplate);
              return status.score;
            }).filter((s): s is number => s !== null);

            let templateTrend = calculateTrend(scores, previousTemplateScores);

            // Invert trend for lower_is_better scales (increase in score = worse performance = 'down' trend)
            if (hasValidStatusConfig(validatedTemplate)) {
              const config = getStatusConfig(validatedTemplate);
              if (config && config.scaleOrientation === 'lower_is_better') {
                if (templateTrend === 'up') templateTrend = 'down';
                else if (templateTrend === 'down') templateTrend = 'up';
                // 'stable' remains 'stable'
              }
            }

            // Calculate status based on template thresholds
            let templateStatus: 'red' | 'yellow' | 'green' = 'green';
            if (averageScore !== null && hasValidStatusConfig(validatedTemplate)) {
              const config = getStatusConfig(validatedTemplate);
              if (config) {
                const scaleOrientation = config.scaleOrientation;
                if (scaleOrientation === 'higher_is_better') {
                  // Higher scores are better
                  if (averageScore <= config.redThreshold) {
                    templateStatus = 'red';
                  } else if (averageScore <= config.yellowThreshold) {
                    templateStatus = 'yellow';
                  } else {
                    templateStatus = 'green';
                  }
                } else {
                  // Lower scores are better (e.g., fatigue/stress scales)
                  if (averageScore >= config.redThreshold) {
                    templateStatus = 'red';
                  } else if (averageScore >= config.yellowThreshold) {
                    templateStatus = 'yellow';
                  } else {
                    templateStatus = 'green';
                  }
                }
              }
            }

            templateAggregates.push({
              templateId,
              templateName: template.name,
              averageScore,
              scaleMax: templateScaleMax,
              responseCount: responses.length,
              trend: templateTrend,
              status: templateStatus,
            });
          }

          dashboardData.push({
            teamId: team.id,
            teamName: team.name,
            teamStatus,
            teamAverageScore,
            scaleMax,
            redCount,
            yellowCount,
            greenCount,
            totalAthletes: athleteIds.length,
            completionRate,
            trend,
            commonInjuries,
            athletes: athleteStatuses,
            templateAggregates,
          });
        }

        res.json(dashboardData);
      } catch (error: any) {
        console.error("Dashboard API error:", error);
        res.status(500).json(createErrorResponse("Failed to fetch dashboard data", error));
      }
    }
  );
}
