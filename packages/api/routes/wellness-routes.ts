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
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import {
  requireAuth,
  requireOrganizationAccess,
  requireWellnessAccess,
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
import { z } from "zod";
import crypto from "crypto";
import { emailService } from "../services/email-service";
import { WellnessAccessService } from "../auth/wellness-access";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";

// Helper function to check if rate limiting should be bypassed
const shouldBypassRateLimit = (): boolean => {
  // Bypass rate limiting in non-production environments by default
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
};

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
        res.status(500).json({
          message: "Failed to create wellness template",
          error: error.message,
        });
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
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { organizationId } = req.params;
        const activeOnly = req.query.activeOnly === 'true';

        const templates = await storage.getWellnessTemplates(organizationId, { activeOnly });

        res.json(templates);
      } catch (error: any) {
        console.error("Failed to fetch wellness templates:", error);
        res.status(500).json({
          message: "Failed to fetch wellness templates",
          error: error.message,
        });
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
        res.status(500).json({
          message: "Failed to fetch wellness template",
          error: error.message,
        });
      }
    }
  );

  /**
   * GET /api/wellness/templates/:id
   * Get wellness template by ID (for public wellness submissions)
   * Access: Public (no authentication required)
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
        res.status(500).json({
          message: "Failed to fetch wellness template",
          error: error.message,
        });
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

        const updated = await storage.updateWellnessTemplate(id, validation.data);

        res.json(updated);
      } catch (error: any) {
        console.error("Failed to update wellness template:", error);
        res.status(500).json({
          message: "Failed to update wellness template",
          error: error.message,
        });
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

        await storage.deleteWellnessTemplate(id);

        res.status(204).send();
      } catch (error: any) {
        console.error("Failed to delete wellness template:", error);
        res.status(500).json({
          message: "Failed to delete wellness template",
          error: error.message,
        });
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
        const MINUTES_PER_QUESTION = 0.5; // 30 seconds per question on average
        const DEFAULT_QUESTION_COUNT = 5;

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

            // Send email to each targeted athlete
            for (const [athleteId, magicLink] of magicLinks.entries()) {
              const athlete = await storage.getUser(athleteId);
              if (athlete && athlete.emails && athlete.emails.length > 0) {
                try {
                  await emailService.sendWellnessRequest(athlete.emails[0], {
                    athleteName: athlete.fullName,
                    coachName: coach!.fullName,
                    organizationName: organization!.name,
                    magicLink,
                    expiryDays,
                    templateName: template!.name,
                    estimatedMinutes: (template!.config.questions?.length || DEFAULT_QUESTION_COUNT) * MINUTES_PER_QUESTION,
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
        res.status(500).json({
          message: "Failed to create wellness request",
          error: error.message,
        });
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
        res.status(500).json({
          message: "Failed to fetch wellness requests",
          error: error.message,
        });
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
        res.status(500).json({
          message: "Failed to fetch wellness request",
          error: error.message,
        });
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
        res.status(500).json({
          message: "Failed to fetch wellness request",
          error: error.message,
        });
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
        res.status(500).json({
          message: "Failed to cancel wellness request",
          error: error.message,
        });
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
   */
  app.post(
    "/api/wellness/responses",
    highVolumeLimiter,
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

          // For magic link access, verify user is targeted by this request
          if ((req.user as any).accessMethod === 'magic_link') {
            const isTargeted =
              (request.targetAthleteIds && request.targetAthleteIds.includes(req.user!.id)) ||
              (request.targetTeamIds && request.targetTeamIds.length > 0);

            if (!isTargeted) {
              return res.status(403).json({
                message: "You are not authorized to respond to this request"
              });
            }
          }
        }

        // Validate responses match template questions
        try {
          const responseSchema = generateResponseValidationSchema(template.config as any);
          responseSchema.parse(data.responses);
        } catch (validationError: any) {
          return res.status(400).json({
            message: "Response validation failed",
            errors: validationError.errors,
          });
        }

        // Get user details
        const user = await storage.getUser(req.user!.id);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        // Get team details if user belongs to teams
        const userTeams = await storage.getUserTeams(req.user!.id);
        const primaryTeam = userTeams.length > 0 ? userTeams[0].team : null;

        // Create response
        const response = await storage.createWellnessResponse({
          requestId: data.requestId,
          organizationId: template.organizationId,
          templateId: data.templateId,
          userId: user.id,
          userFullName: user.fullName,
          teamId: primaryTeam?.id,
          teamNameSnapshot: primaryTeam?.name,
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
        res.status(500).json({
          message: "Failed to submit wellness response",
          error: error.message,
        });
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
        res.status(500).json({
          message: "Failed to fetch wellness response",
          error: error.message,
        });
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

        // Get all active requests for user's organizations
        const allRequests: any[] = [];
        for (const orgId of orgIds) {
          const orgRequests = await storage.getWellnessRequests(orgId, { status: 'active' });
          allRequests.push(...orgRequests);
        }

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
        res.status(500).json({
          message: "Failed to fetch wellness requests",
          error: error.message,
        });
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
        res.status(500).json({
          message: "Failed to fetch wellness responses",
          error: error.message,
        });
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
        res.status(500).json({
          message: "Failed to check submission status",
          error: error.message,
        });
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
    highVolumeLimiter,
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
        res.status(500).json({
          message: "Failed to fetch team wellness summary",
          error: error.message,
        });
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
    highVolumeLimiter,
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
        res.status(500).json({
          message: "Failed to fetch athlete wellness summary",
          error: error.message,
        });
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
    highVolumeLimiter,
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

        const questionIdArray = questionIds
          ? (questionIds as string).split(',').map(id => id.trim())
          : undefined;

        const trends = await storage.getWellnessTrends(organizationId, {
          startDate: startDate as string,
          endDate: endDate as string,
          questionIds: questionIdArray,
        });

        res.json(trends);
      } catch (error: any) {
        console.error("Failed to fetch wellness trends:", error);
        res.status(500).json({
          message: "Failed to fetch wellness trends",
          error: error.message,
        });
      }
    }
  );

  console.log("✅ Wellness routes registered successfully");
}
