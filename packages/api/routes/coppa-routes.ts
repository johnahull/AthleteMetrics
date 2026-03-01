/**
 * COPPA compliance routes
 *
 * Endpoints for the verifiable parental consent (VPC) flow.
 * Public endpoints (parent email link) use separate rate limiting.
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { coppaService } from "../services/coppa-service";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/schema/tables/core";
import { eq, and, inArray } from "drizzle-orm";
import { isUnder13, COPPA_ACTIONS } from "@shared/coppa-utils";

// Rate limiter for consent mutation endpoints (strict — prevents email flooding)
const consentMutateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  message: { message: "Too many consent requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'auth'),
});

// Rate limiter for consent read endpoints (more permissive)
const consentReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'auth'),
});

const verifyTokenSchema = z.object({
  granted: z.boolean(),
  aiConsentGranted: z.boolean(),
});

export function registerCoppaRoutes(app: Express) {
  /**
   * POST /api/coppa/consent/initiate
   * Initiate VPC flow for an under-13 athlete (re-send or first-time).
   * Used when: athlete is already in pending_consent state and wants to resend.
   */
  app.post("/api/coppa/consent/initiate", requireAuth, consentMutateLimiter, async (req, res) => {
    try {
      const athleteUserId = req.session.user?.id;
      if (!athleteUserId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUser(athleteUserId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!['pending_consent', 'needs_parent_email'].includes(user.coppaStatus)) {
        return res.status(400).json({ message: "COPPA consent initiation not applicable for this account." });
      }

      const { parentEmail } = req.body;
      if (!parentEmail || typeof parentEmail !== 'string') {
        return res.status(400).json({ message: "parentEmail is required" });
      }

      if (parentEmail.toLowerCase() === (user.emails?.[0] || '').toLowerCase()) {
        return res.status(400).json({
          code: 'parent_email_must_differ',
          message: "Parent email must be different from the athlete's email address.",
        });
      }

      const result = await coppaService.initiateConsent({
        athleteUserId,
        parentEmail,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
        return res.status(500).json({ message: result.error || "Failed to initiate consent" });
      }

      res.json({ success: true, message: "Consent email sent to parent." });
    } catch (error) {
      console.error("[COPPA] POST /consent/initiate error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * GET /api/coppa/consent/verify/:token
   * Public endpoint — parent follows email link.
   * Returns consent info needed to render the consent page (no PII beyond athleteName/org).
   */
  app.get("/api/coppa/consent/verify/:token", consentReadLimiter, async (req, res) => {
    try {
      const { token } = req.params;

      if (!token || typeof token !== 'string' || token.length > 128) {
        return res.status(400).json({ message: "Invalid token format" });
      }

      const result = await coppaService.verifyConsentToken(token);

      if (!result.valid) {
        return res.status(result.statusCode || 400).json({ message: result.error });
      }

      const consent = result.consent!;
      const athlete = await storage.getUser(consent.athleteUserId);

      // Return minimal PII — just what the consent page needs to render
      res.json({
        valid: true,
        consentId: consent.id,
        athleteName: athlete ? `${athlete.firstName} ${athlete.lastName}` : 'an athlete',
        expiresAt: consent.expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("[COPPA] GET /consent/verify/:token error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * POST /api/coppa/consent/verify/:token
   * Public endpoint — parent submits consent decision.
   * Body: { granted: boolean, aiConsentGranted: boolean }
   */
  app.post("/api/coppa/consent/verify/:token", consentMutateLimiter, async (req, res) => {
    try {
      const { token } = req.params;

      if (!token || typeof token !== 'string' || token.length > 128) {
        return res.status(400).json({ message: "Invalid token format" });
      }

      // First verify the token is still valid
      const verifyResult = await coppaService.verifyConsentToken(token);
      if (!verifyResult.valid) {
        return res.status(verifyResult.statusCode || 400).json({ message: verifyResult.error });
      }

      const bodyResult = verifyTokenSchema.safeParse(req.body);
      if (!bodyResult.success) {
        return res.status(400).json({ message: "Invalid request body", errors: bodyResult.error.errors });
      }

      const { granted, aiConsentGranted } = bodyResult.data;
      const consentId = verifyResult.consent!.id;
      const ip = req.ip;
      const userAgent = req.get('User-Agent');

      if (granted) {
        const result = await coppaService.confirmConsent({
          consentId,
          aiConsentGranted,
          ip,
          userAgent,
        });

        if (!result.success) {
          return res.status(400).json({ message: result.error });
        }

        res.json({ success: true, granted: true, message: "Consent confirmed. The athlete's account is now active." });
      } else {
        const result = await coppaService.denyConsent(consentId, ip, userAgent);

        if (!result.success) {
          return res.status(400).json({ message: result.error });
        }

        res.json({ success: true, granted: false, message: "Consent denied. The athlete's account will not be activated." });
      }
    } catch (error) {
      console.error("[COPPA] POST /consent/verify/:token error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * POST /api/coppa/consent/revoke
   * Revoke consent for an athlete. Org admin or site admin only.
   * Body: { athleteUserId: string, revokeAiOnly?: boolean }
   */
  app.post("/api/coppa/consent/revoke", requireAuth, consentMutateLimiter, async (req, res) => {
    try {
      const actor = req.session.user!;
      const { athleteUserId, revokeAiOnly = false } = req.body;

      if (!athleteUserId || typeof athleteUserId !== 'string') {
        return res.status(400).json({ message: "athleteUserId is required" });
      }

      // Verify actor has authority: must be site admin OR org admin for same org as athlete
      if (!actor.isSiteAdmin) {
        const actorOrgs = await storage.getUserOrganizations(actor.id);
        const athleteOrgs = await storage.getUserOrganizations(athleteUserId);
        const sharedOrg = actorOrgs.some(ao =>
          athleteOrgs.some(eo => eo.organizationId === ao.organizationId)
        );
        if (!sharedOrg) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }
      }

      const result = await coppaService.revokeConsent(athleteUserId, revokeAiOnly, actor.id, req.ip);

      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[COPPA] POST /consent/revoke error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * GET /api/coppa/status/:athleteUserId
   * Get COPPA consent status for an athlete. Org admin or site admin only.
   */
  app.get("/api/coppa/status/:athleteUserId", requireAuth, consentReadLimiter, async (req, res) => {
    try {
      const actor = req.session.user!;
      const { athleteUserId } = req.params;

      // Authorization: site admin OR org admin sharing an org with the athlete
      if (!actor.isSiteAdmin) {
        const actorOrgs = await storage.getUserOrganizations(actor.id);
        const athleteOrgs = await storage.getUserOrganizations(athleteUserId);
        const sharedOrg = actorOrgs.some(ao =>
          athleteOrgs.some(eo => eo.organizationId === ao.organizationId)
        );
        if (!sharedOrg) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }
      }

      const status = await coppaService.getConsentStatus(athleteUserId);
      if (!status) {
        return res.status(404).json({ message: "Athlete not found" });
      }

      res.json(status);
    } catch (error) {
      console.error("[COPPA] GET /status/:athleteUserId error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * POST /api/admin/coppa/retroactive
   * Site admin only. Scans DB for under-13 athletes and initiates VPC flow.
   * Idempotent — skips athletes already in coppa flow or already consented.
   * Body: { scanAll?: boolean, organizationId?: string }
   */
  app.post("/api/admin/coppa/retroactive", requireAuth, requireSiteAdmin, async (req, res) => {
    try {
      const { scanAll = false, organizationId } = req.body;

      // Find users who are under 13 but not yet in the COPPA flow
      const allUsers = await db.select({
        id: users.id,
        birthDate: users.birthDate,
        coppaStatus: users.coppaStatus,
        parentEmail: users.parentEmail,
        emails: users.emails,
      })
      .from(users)
      .where(eq(users.coppaStatus, 'not_applicable'));

      const minors = allUsers.filter(u => {
        if (!u.birthDate) return false;
        try {
          return isUnder13(u.birthDate);
        } catch {
          return false;
        }
      });

      let initiated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const minor of minors) {
        // Only process if they have a parentEmail on file
        if (!minor.parentEmail) {
          // Flag as needs_parent_email instead
          await db.update(users)
            .set({ coppaStatus: 'needs_parent_email', isMinor: true })
            .where(eq(users.id, minor.id));
          skipped++;
          continue;
        }

        try {
          const result = await coppaService.initiateConsent({
            athleteUserId: minor.id,
            parentEmail: minor.parentEmail,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
          });

          if (result.success) {
            initiated++;
          } else {
            errors.push(`${minor.id}: ${result.error}`);
          }
        } catch (e) {
          errors.push(`${minor.id}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }

      // Write audit log for the scan itself
      await coppaService.writeCoppaAudit({
        action: COPPA_ACTIONS.RETROACTIVE_SCAN,
        actorUserId: req.session.user?.id,
        ip: req.ip,
        details: {
          scanned: minors.length,
          initiated,
          skipped,
          errorCount: errors.length,
        },
      });

      res.json({
        success: true,
        scanned: minors.length,
        initiated,
        skipped,
        errors: errors.slice(0, 10), // Return first 10 errors max
      });
    } catch (error) {
      console.error("[COPPA] POST /admin/coppa/retroactive error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
