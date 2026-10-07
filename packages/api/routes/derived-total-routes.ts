/**
 * Derived total repair route (issue #526).
 *
 * POST /api/derived-totals/reconcile finds derived totals (e.g. MQI_TOTAL) that are
 * missing or out of step with their source scores, typically because the post-commit
 * recalculation failed, and repairs them. Site admin only.
 *
 * Follow-up (out of scope): run this on a schedule.
 */
import type { Express } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { reconcileDerivedTotals } from "../services/derived-total-reconciliation";

const reconcileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many reconcile requests, please try again later." },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, "general"),
});

const reconcileBodySchema = z
  .object({
    organizationId: z.string().min(1).optional(),
    metricCode: z.string().min(1).optional(),
    dryRun: z.boolean().optional(),
    limit: z.number().int().positive().max(5000).optional(),
  })
  .strict();

export function registerDerivedTotalRoutes(app: Express) {
  app.post(
    "/api/derived-totals/reconcile",
    requireAuth,
    requireSiteAdmin,
    // After auth so unauthenticated requests do not consume the bucket
    reconcileLimiter,
    async (req, res) => {
      const parsed = reconcileBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request data", errors: parsed.error.errors });
      }

      try {
        const user = req.session.user!;
        const result = await reconcileDerivedTotals(db, { ...parsed.data, triggeredBy: user.id });

        if (!result.dryRun) {
          // audit_logs.action is a closed CHECK list (a new action needs a migration);
          // until then the run is recorded in the structured server log.
          console.info("Derived totals reconcile run", {
            userId: user.id,
            options: parsed.data,
            drifted: result.drifted,
            repaired: result.repaired,
            unchanged: result.unchanged,
            failed: result.failed,
            truncated: result.truncated,
          });
        }

        return res.json(result);
      } catch (error) {
        console.error("Derived totals reconcile error:", error);
        return res.status(500).json({ message: "Failed to reconcile derived totals" });
      }
    }
  );
}
