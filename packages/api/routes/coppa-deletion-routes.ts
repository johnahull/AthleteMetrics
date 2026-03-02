/**
 * COPPA Data Deletion Routes
 *
 * Three endpoints for the COPPA Section 312.6 right-to-delete:
 *
 *   POST /api/coppa/data-deletion/request
 *     - Public (token-gated via consent token) OR requireAuth (site_admin / org_admin)
 *     - Initiates a deletion request; sends confirmation email
 *
 *   GET  /api/coppa/data-deletion/:requestId
 *     - requireAuth + requireSiteAdmin
 *     - View request details before processing
 *
 *   POST /api/coppa/data-deletion/:requestId/process
 *     - requireAuth + requireSiteAdmin
 *     - Execute the cascade deletion
 *
 * Rate limiting follows the same pattern as coppa-routes.ts.
 */

import type { Express } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { coppaDeletionService } from "../services/coppa-deletion-service";
import { coppaService } from "../services/coppa-service";
import { storage } from "../storage";
import { db } from "../db";
import { parentalConsents } from "@shared/schema/tables/coppa";

// ============================================================================
// Rate limiters
// ============================================================================

const deletionMutateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  message: { message: "Too many deletion requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'auth'),
});

const deletionReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'auth'),
});

// ============================================================================
// Zod schemas
// ============================================================================

const initiateRequestSchema = z.object({
  athleteUserId: z.string().min(1, 'athleteUserId is required'),
  requestedByEmail: z.string().email('requestedByEmail must be a valid email'),
  consentToken: z.string().max(128).optional(),
  notes: z.string().max(1000).optional(),
});

const processRequestSchema = z.object({
  notes: z.string().max(1000).optional(),
});

// ============================================================================
// Route registration
// ============================================================================

export function registerCoppaDeletionRoutes(app: Express) {
  /**
   * POST /api/coppa/data-deletion/request
   *
   * Public (token-gated) or authenticated (site_admin / org_admin).
   *
   * Public path: parent follows an email link containing a consent token.
   *   - The consent token must match an existing confirmed consent record for the athlete.
   *   - This proves the requester is the verified parent.
   *
   * Authenticated path: site_admin may initiate for any athlete.
   *   - org_admin may initiate only for athletes in their org.
   */
  app.post(
    "/api/coppa/data-deletion/request",
    deletionMutateLimiter,
    async (req, res) => {
      try {
        const bodyResult = initiateRequestSchema.safeParse(req.body);
        if (!bodyResult.success) {
          return res.status(400).json({
            message: "Invalid request body",
            errors: bodyResult.error.errors,
          });
        }

        const { athleteUserId, requestedByEmail, consentToken, notes } = bodyResult.data;
        const actor = req.session?.user ?? null;
        let actorUserId: string | undefined;

        if (actor) {
          // Authenticated path
          actorUserId = actor.id;

          if (!actor.isSiteAdmin) {
            // org_admin: must share an org with the athlete
            const actorOrgs = await storage.getUserOrganizations(actor.id);
            const athleteOrgs = await storage.getUserOrganizations(athleteUserId);
            const authorized = actorOrgs.some(ao =>
              ao.role === 'org_admin' &&
              athleteOrgs.some(eo => eo.organizationId === ao.organizationId)
            );
            if (!authorized) {
              return res.status(403).json({ message: "Insufficient permissions" });
            }
          }
        } else if (consentToken) {
          // Public token-gated path: verify the consent token proves parent identity
          if (typeof consentToken !== 'string' || consentToken.length > 128) {
            return res.status(400).json({ message: "Invalid consent token format" });
          }

          const verifyResult = await coppaService.verifyConsentToken(consentToken);

          // Allow verified confirmed tokens (re-verify returns 400 for "already used"
          // which is actually what we expect for a confirmed consent — parent is authenticated)
          if (!verifyResult.valid) {
            // A confirmed consent shows as "already used" (400) — that's fine for deletion
            // A truly invalid/expired/not-found token is not acceptable
            if (verifyResult.statusCode === 400 && verifyResult.error?.includes('already been used')) {
              // This is a confirmed consent token — parent is authenticated. Proceed.
              // But we must also verify the token belongs to the athleteUserId in the body.
              const tokenHash = crypto.createHash('sha256').update(consentToken).digest('hex');
              const [consentRecord] = await db.select({
                id: parentalConsents.id,
                athleteUserId: parentalConsents.athleteUserId,
                status: parentalConsents.status,
              })
              .from(parentalConsents)
              .where(eq(parentalConsents.tokenHash, tokenHash))
              .limit(1);

              if (!consentRecord || consentRecord.athleteUserId !== athleteUserId) {
                return res.status(401).json({ message: "Consent token does not match athlete" });
              }
            } else {
              // Truly invalid, expired, or not found
              return res.status(401).json({ message: "Invalid or expired consent token" });
            }
          } else {
            // Token is still in pending state — also valid, just confirm athleteUserId matches
            if (verifyResult.consent?.athleteUserId !== athleteUserId) {
              return res.status(401).json({ message: "Consent token does not match athlete" });
            }
          }
        } else {
          // Neither authenticated nor token-gated
          return res.status(401).json({ message: "Authentication or consent token required" });
        }

        const result = await coppaDeletionService.initiateDeletionRequest({
          athleteUserId,
          requestedByEmail,
          notes,
          actorUserId,
          ip: req.ip,
        });

        if (!result.success) {
          return res.status(result.statusCode ?? 400).json({ message: result.error });
        }

        res.status(201).json({ success: true, requestId: result.requestId });
      } catch (error) {
        console.error("[COPPA Deletion] POST /data-deletion/request error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  /**
   * GET /api/coppa/data-deletion/:requestId
   * Site admin only — view deletion request details.
   */
  app.get(
    "/api/coppa/data-deletion/:requestId",
    requireAuth,
    requireSiteAdmin,
    deletionReadLimiter,
    async (req, res) => {
      try {
        const { requestId } = req.params;

        if (!requestId || typeof requestId !== 'string' || requestId.length > 64) {
          return res.status(400).json({ message: "Invalid requestId" });
        }

        const request = await coppaDeletionService.getDeletionRequest(requestId);

        if (!request) {
          return res.status(404).json({ message: "Deletion request not found" });
        }

        res.json(request);
      } catch (error) {
        console.error("[COPPA Deletion] GET /data-deletion/:requestId error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );

  /**
   * POST /api/coppa/data-deletion/:requestId/process
   * Site admin only — execute the cascade deletion.
   */
  app.post(
    "/api/coppa/data-deletion/:requestId/process",
    requireAuth,
    requireSiteAdmin,
    deletionMutateLimiter,
    async (req, res) => {
      try {
        const { requestId } = req.params;

        if (!requestId || typeof requestId !== 'string' || requestId.length > 64) {
          return res.status(400).json({ message: "Invalid requestId" });
        }

        const bodyResult = processRequestSchema.safeParse(req.body ?? {});
        if (!bodyResult.success) {
          return res.status(400).json({
            message: "Invalid request body",
            errors: bodyResult.error.errors,
          });
        }

        const { notes } = bodyResult.data;
        const actorId = req.session.user!.id;

        const result = await coppaDeletionService.processDeletion(
          requestId,
          actorId,
          notes,
          req.ip,
        );

        if (!result.success) {
          return res.status(result.statusCode ?? 400).json({ message: result.error });
        }

        res.json({
          success: true,
          deletedCategories: result.deletedCategories,
        });
      } catch (error) {
        console.error("[COPPA Deletion] POST /data-deletion/:requestId/process error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    }
  );
}
