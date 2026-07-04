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
import { consumeParentEmailToken } from "../services/coppa-email-token-store";
import { generateRegistrationToken } from "../services/registration-token-store";
import { users } from "@shared/schema/tables/core";
import { eq, and, inArray } from "drizzle-orm";
import { isUnder13, wasUnder13At, COPPA_ACTIONS } from "@shared/coppa-utils";

// Small delay between consent emails to avoid rate-limit bursts
const RETROACTIVE_EMAIL_DELAY_MS = 100;

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

      const { parentEmail: rawParentEmail } = req.body;
      if (!rawParentEmail || typeof rawParentEmail !== 'string') {
        return res.status(400).json({ message: "parentEmail is required" });
      }

      const parentEmail = rawParentEmail.toLowerCase().trim();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(parentEmail)) {
        return res.status(400).json({ message: "parentEmail must be a valid email address" });
      }

      if (parentEmail === (user.emails?.[0] || '').toLowerCase()) {
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

      // Audit log for resent consent email (fire-and-forget)
      coppaService.writeCoppaAudit({
        action: COPPA_ACTIONS.CONSENT_EMAIL_RESENT,
        athleteUserId,
        actorUserId: athleteUserId,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        details: { parentEmail },
      }).catch((err) => {
        console.error('[COPPA] Failed to write consent email resent audit log:', err);
      });

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
    // The token lives in the URL path, so it can end up in access logs,
    // browser history, and Referer headers on any outbound link from this
    // page. Stop it from also being cached or forwarded onward.
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
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

      // Return minimal PII — mask the parent email to prevent full address
      // exposure to anyone who obtains the token (e.g. from server logs).
      const maskedEmail = (() => {
        const [local, domain] = consent.parentEmail.split('@');
        if (!domain) return '***';
        return `${local[0]}${'*'.repeat(Math.min(local.length - 1, 5))}@${domain}`;
      })();

      res.json({
        valid: true,
        consentId: consent.id,
        athleteName: athlete ? `${athlete.firstName} ${athlete.lastName}` : 'an athlete',
        expiresAt: consent.expiresAt.toISOString(),
        parentEmail: maskedEmail,
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

        // Opaque, single-use token so the client's "Create Parent Account" link
        // can carry the parent's email + consentId without putting either in
        // the /register URL (browser history, referrer headers, access logs).
        const registrationToken = generateRegistrationToken(consentId, verifyResult.consent!.parentEmail);

        res.json({
          success: true,
          granted: true,
          message: "Consent confirmed. The athlete's account is now active.",
          registrationToken,
        });
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

      // Verify actor has authority: site admin OR org_admin sharing an org with the athlete
      if (!actor.isSiteAdmin) {
        const actorOrgs = await storage.getUserOrganizations(actor.id);
        const athleteOrgs = await storage.getUserOrganizations(athleteUserId);
        const authorizedOrg = actorOrgs.some(ao =>
          ao.role === 'org_admin' &&
          athleteOrgs.some(eo => eo.organizationId === ao.organizationId)
        );
        if (!authorizedOrg) {
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

      // Authorization: site admin OR org_admin sharing an org with the athlete
      if (!actor.isSiteAdmin) {
        const actorOrgs = await storage.getUserOrganizations(actor.id);
        const athleteOrgs = await storage.getUserOrganizations(athleteUserId);
        const authorizedOrg = actorOrgs.some(ao =>
          ao.role === 'org_admin' &&
          athleteOrgs.some(eo => eo.organizationId === ao.organizationId)
        );
        if (!authorizedOrg) {
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
   * Body: { limit?: number, offset?: number }
   */
  app.post("/api/admin/coppa/retroactive", requireAuth, requireSiteAdmin, async (req, res) => {
    try {
      // Pagination params — default to a safe batch size to prevent OOM on large DBs
      const limit = Math.min(Number(req.body.limit) || 50, 200);
      const offset = Math.max(Number(req.body.offset) || 0, 0);

      // Find users who are not yet in the COPPA flow — paginated to avoid full-table load
      // Use age-at-registration (createdAt), not current age — COPPA obligations
      // attach at the time of data collection, not today.
      const pageUsers = await db.select({
        id: users.id,
        birthDate: users.birthDate,
        coppaStatus: users.coppaStatus,
        parentEmail: users.parentEmail,
        emails: users.emails,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.coppaStatus, 'not_applicable'))
      .limit(limit)
      .offset(offset);

      let initiated = 0;
      let skipped = 0;
      const errors: string[] = [];

      const minors = pageUsers.filter(u => {
        if (!u.birthDate) return false;
        if (!u.createdAt) {
          // Cannot determine age at registration — skip and log for manual review
          console.warn(`[COPPA] Skipping user ${u.id} in retroactive scan: createdAt is null`);
          errors.push(`${u.id}: skipped — createdAt is null, cannot determine age at registration`);
          return false;
        }
        try {
          // Was the user under 13 when they registered?
          // Use age-at-collection (createdAt), not current age —
          // COPPA obligations attach at the time of data collection.
          return wasUnder13At(u.birthDate, new Date(u.createdAt));
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          console.error(`[COPPA] Failed to check age for user ${u.id}:`, msg);
          errors.push(`${u.id}: age check failed — ${msg}`);
          return false;
        }
      });

      // Respond immediately — email-sending loop runs asynchronously to avoid
      // blocking the HTTP thread for up to 200 × 100ms = 20 seconds.
      const actorUserId = req.session.user?.id;
      const scanIp = req.ip;

      res.json({
        success: true,
        scanned: minors.length,
        processing: true,
        message: `Found ${minors.length} minor(s) to process. Emails are being sent asynchronously.`,
        errors: errors.slice(0, 10),
        pagination: {
          offset,
          limit,
          nextOffset: pageUsers.length === limit ? offset + limit : null,
        },
      });

      // Fire-and-forget: process emails after response is sent
      setImmediate(async () => {
        for (const minor of minors) {
          // Only process if they have a parentEmail on file
          if (!minor.parentEmail) {
            // Flag as needs_parent_email instead
            try {
              await db.update(users)
                .set({ coppaStatus: 'needs_parent_email', isMinor: true })
                .where(eq(users.id, minor.id));
              skipped++;
            } catch (e) {
              console.error(`[COPPA] Failed to update user ${minor.id} to needs_parent_email:`, e);
            }
            continue;
          }

          try {
            const result = await coppaService.initiateConsent({
              athleteUserId: minor.id,
              parentEmail: minor.parentEmail,
              ip: scanIp,
              userAgent: undefined,
            });

            if (result.success) {
              initiated++;
              // Small delay between email sends to avoid rate-limit bursts
              await new Promise(resolve => setTimeout(resolve, RETROACTIVE_EMAIL_DELAY_MS));
            } else {
              errors.push(`${minor.id}: ${result.error}`);
            }
          } catch (e) {
            errors.push(`${minor.id}: ${e instanceof Error ? e.message : 'Unknown error'}`);
          }
        }

        // Write audit log after processing completes
        coppaService.writeCoppaAudit({
          action: COPPA_ACTIONS.RETROACTIVE_SCAN,
          actorUserId,
          ip: scanIp,
          details: {
            scanned: minors.length,
            initiated,
            skipped,
            errorCount: errors.length,
            offset,
            limit,
          },
        }).catch((err) => {
          console.error('[COPPA] Failed to write retroactive scan audit log:', err);
        });
      });
    } catch (error) {
      console.error("[COPPA] POST /admin/coppa/retroactive error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * POST /api/admin/coppa/re-initiate/:athleteId
   * Org admin or site admin endpoint — re-initiates consent for a consent_revoked athlete.
   * Used in D5: Consent Denial Recovery.
   * Body: { parentEmail: string }
   */
  app.post("/api/admin/coppa/re-initiate/:athleteId", requireAuth, consentMutateLimiter, async (req, res) => {
    try {
      const actorUser = req.session.user;
      if (!actorUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { athleteId } = req.params;
      const { parentEmail: rawParentEmail } = req.body;

      if (!rawParentEmail || typeof rawParentEmail !== 'string') {
        return res.status(400).json({ message: "parentEmail is required" });
      }

      const parentEmail = rawParentEmail.toLowerCase().trim();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(parentEmail)) {
        return res.status(400).json({ message: "parentEmail must be a valid email address" });
      }

      // Load the athlete user to check their COPPA status
      const athlete = await storage.getUser(athleteId);
      if (!athlete) {
        return res.status(404).json({ message: "Athlete not found" });
      }

      if (!['consent_revoked', 'pending_consent'].includes(athlete.coppaStatus)) {
        return res.status(400).json({
          message: "Consent re-initiation is only available for athletes with consent_revoked or pending_consent status.",
        });
      }

      // Verify actor has access: must be site admin OR org admin of the athlete's org
      if (!actorUser.isSiteAdmin) {
        const actorOrgs = await storage.getUserOrganizations(actorUser.id);
        const athleteOrgs = await storage.getUserOrganizations(athleteId);
        const sharedOrg = actorOrgs.find(ao =>
          ao.role === 'org_admin' &&
          athleteOrgs.some(eo => eo.organizationId === ao.organizationId)
        );
        if (!sharedOrg) {
          return res.status(403).json({ message: "You do not have permission to manage this athlete's consent." });
        }
      }

      const result = await coppaService.initiateConsent({
        athleteUserId: athleteId,
        parentEmail,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
        return res.status(500).json({ message: result.error || "Failed to re-initiate consent" });
      }

      coppaService.writeCoppaAudit({
        action: COPPA_ACTIONS.CONSENT_INITIATED,
        athleteUserId: athleteId,
        actorUserId: actorUser.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        details: { parentEmail, source: 'admin_re_initiate' },
      }).catch((err) => {
        console.error('[COPPA] Failed to write admin re-initiate audit log:', err);
      });

      res.json({ success: true, message: "Consent email re-sent to parent." });
    } catch (error) {
      console.error("[COPPA] POST /admin/coppa/re-initiate/:athleteId error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * POST /api/coppa/consent/update-parent-email
   * Public endpoint — for users with coppaStatus='needs_parent_email'.
   * Allows providing a parent email without being logged in.
   * Rate limited to prevent enumeration/abuse.
   *
   * Uses an opaque single-use token (generated at login-block time) instead of
   * a username to prevent minor status enumeration via URL/request inspection.
   *
   * Body: { token: string, parentEmail: string }
   */
  app.post("/api/coppa/consent/update-parent-email", consentMutateLimiter, async (req, res) => {
    try {
      const { token, parentEmail } = req.body;
      const ANTI_ENUM = { success: true, message: "If the account exists, a consent email has been sent." };

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: "token is required" });
      }
      if (!parentEmail || typeof parentEmail !== 'string') {
        return res.status(400).json({ message: "parentEmail is required" });
      }

      // Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(parentEmail)) {
        return res.status(400).json({ message: "parentEmail must be a valid email address" });
      }

      // Consume the single-use token to get the userId
      const userId = consumeParentEmailToken(token);
      if (!userId) {
        // Invalid/expired/already-used token — return anti-enumeration response
        return res.json(ANTI_ENUM);
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.json(ANTI_ENUM);
      }

      // Handle both needs_parent_email (no email on file yet) and pending_consent
      // (email on file, parent hasn't responded). Both statuses need the ability
      // to provide/resend to a parent email without being logged in, since
      // pending_consent and needs_parent_email users are blocked from login.
      if (!['needs_parent_email', 'pending_consent'].includes(user.coppaStatus)) {
        // Return same response as user-not-found to prevent enumeration
        return res.json({ success: true, message: "If the account exists, a consent email has been sent." });
      }

      // Prevent parent email being same as athlete email
      if (parentEmail.toLowerCase() === (user.emails?.[0] || '').toLowerCase()) {
        // Return same response as user-not-found to prevent enumeration
        return res.json({ success: true, message: "If the account exists, a consent email has been sent." });
      }

      // If parentEmail is already set on the account, only allow resending to the
      // same address — not redirecting to an attacker-controlled address.
      // An attacker who knows an athlete's username could otherwise send a consent
      // link to themselves and grant/deny consent on behalf of the real parent.
      if (user.parentEmail && user.parentEmail.toLowerCase() !== parentEmail.toLowerCase()) {
        // Different email from what's on file — silently succeed (anti-enum, don't update)
        return res.json({ success: true, message: "If the account exists, a consent email has been sent." });
      }

      const result = await coppaService.initiateConsent({
        athleteUserId: user.id,
        parentEmail: parentEmail.toLowerCase(),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      if (!result.success) {
        // Log the failure server-side but return the same anti-enumeration response
        // to avoid leaking that this username exists and passed all checks
        console.error(`[COPPA] initiateConsent failed for user ${user.id}:`, result.error);
        return res.json({ success: true, message: "If the account exists, a consent email has been sent." });
      }

      // Audit log — use normalized parentEmail, not raw input
      coppaService.writeCoppaAudit({
        action: COPPA_ACTIONS.CONSENT_INITIATED,
        athleteUserId: user.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        details: { parentEmail: parentEmail.toLowerCase(), source: 'update_parent_email_endpoint' },
      }).catch((err) => {
        console.error('[COPPA] Failed to write update-parent-email audit log:', err);
      });

      res.json({ success: true, message: "Consent email sent to parent." });
    } catch (error) {
      console.error("[COPPA] POST /consent/update-parent-email error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
