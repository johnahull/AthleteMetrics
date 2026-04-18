/**
 * Admin Metric Explanation Routes
 *
 * Site admin endpoints for customizing built-in metric explanation prose.
 * Overrides are stored in site_metric_explanations; null fields fall through to built-in defaults.
 */

import type { Express, Request, Response } from "express";
import { db } from "../db";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { siteMetricExplanations } from "@shared/schema";
import {
  BUILT_IN_METRIC_EXPLANATIONS,
  BUILT_IN_METRIC_CODES,
} from "@shared/metric-explanations";
import { eq } from "drizzle-orm";
import { z } from "zod";

const OVERRIDABLE_FIELDS = ['title', 'shortDescription', 'whatItMeasures', 'whyItMatters'] as const;

const MAX_FIELD_LENGTH = 5000;

const upsertSchema = z.object({
  title: z.string().max(MAX_FIELD_LENGTH).nullable().optional(),
  shortDescription: z.string().max(MAX_FIELD_LENGTH).nullable().optional(),
  whatItMeasures: z.string().max(MAX_FIELD_LENGTH).nullable().optional(),
  whyItMatters: z.string().max(MAX_FIELD_LENGTH).nullable().optional(),
}).refine(
  (data) => OVERRIDABLE_FIELDS.some((f) => data[f] !== undefined),
  { message: 'At least one field must be provided' },
);

export function registerAdminMetricExplanationRoutes(app: Express) {
  /**
   * GET /api/admin/metric-explanations
   * Returns all built-in metrics merged with any site-admin overrides.
   */
  app.get(
    "/api/admin/metric-explanations",
    requireAuth,
    requireSiteAdmin,
    async (_req: Request, res: Response) => {
      try {
        const overrides = await db.select().from(siteMetricExplanations);
        const overridesByCode = new Map(overrides.map((o) => [o.metricCode, o]));

        const metrics = BUILT_IN_METRIC_CODES.map((code) => {
          const builtIn = BUILT_IN_METRIC_EXPLANATIONS[code];
          const override = overridesByCode.get(code);

          const overrideFields: string[] = [];
          if (override) {
            for (const field of OVERRIDABLE_FIELDS) {
              if (override[field] != null) overrideFields.push(field);
            }
          }

          return {
            code,
            title: override?.title ?? builtIn.title,
            shortDescription: override?.shortDescription ?? builtIn.shortDescription,
            whatItMeasures: override?.whatItMeasures ?? builtIn.whatItMeasures,
            whyItMatters: override?.whyItMatters ?? builtIn.whyItMatters,
            unitNote: builtIn.unitNote,
            directionOfBetter: builtIn.directionOfBetter,
            hasOverride: overrideFields.length > 0,
            overrideFields,
          };
        });

        res.json({ metrics });
      } catch (error: any) {
        console.error("Failed to fetch metric explanations:", error);
        res.status(500).json({
          message: "Failed to fetch metric explanations",
          error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
      }
    },
  );

  /**
   * PUT /api/admin/metric-explanations/:code
   * Upsert an override for a metric code. Null values clear that field's override.
   */
  app.put(
    "/api/admin/metric-explanations/:code",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { code } = req.params;

        if (!BUILT_IN_METRIC_CODES.includes(code as any)) {
          return res.status(400).json({ message: 'Unknown metric code' });
        }

        const parsed = upsertSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            message: "Validation failed",
            errors: parsed.error.flatten().fieldErrors,
          });
        }

        const data = parsed.data;
        const userId = (req as any).user?.id ?? null;

        // Build the conflict-update set from only the provided fields
        const conflictSet: Record<string, any> = {
          updatedBy: userId,
          updatedAt: new Date(),
        };
        if (data.title !== undefined) conflictSet.title = data.title ?? null;
        if (data.shortDescription !== undefined) conflictSet.shortDescription = data.shortDescription ?? null;
        if (data.whatItMeasures !== undefined) conflictSet.whatItMeasures = data.whatItMeasures ?? null;
        if (data.whyItMatters !== undefined) conflictSet.whyItMatters = data.whyItMatters ?? null;

        const [updated] = await db
          .insert(siteMetricExplanations)
          .values({
            metricCode: code,
            title: data.title ?? null,
            shortDescription: data.shortDescription ?? null,
            whatItMeasures: data.whatItMeasures ?? null,
            whyItMatters: data.whyItMatters ?? null,
            updatedBy: userId,
          })
          .onConflictDoUpdate({
            target: siteMetricExplanations.metricCode,
            set: conflictSet,
          })
          .returning();

        if (!updated) {
          return res.status(500).json({ message: 'Row not found after upsert' });
        }

        const builtIn = BUILT_IN_METRIC_EXPLANATIONS[code];
        const overrideFields: string[] = [];
        for (const field of OVERRIDABLE_FIELDS) {
          if (updated[field] != null) overrideFields.push(field);
        }

        res.json({
          code,
          title: updated.title ?? builtIn?.title ?? code,
          shortDescription: updated.shortDescription ?? builtIn?.shortDescription ?? '',
          whatItMeasures: updated.whatItMeasures ?? builtIn?.whatItMeasures ?? '',
          whyItMatters: updated.whyItMatters ?? builtIn?.whyItMatters ?? '',
          unitNote: builtIn?.unitNote ?? '',
          directionOfBetter: builtIn?.directionOfBetter ?? 'higher',
          hasOverride: overrideFields.length > 0,
          overrideFields,
        });
      } catch (error: any) {
        console.error("Failed to upsert metric explanation:", error);
        res.status(500).json({
          message: "Failed to upsert metric explanation",
          error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
      }
    },
  );

  /**
   * DELETE /api/admin/metric-explanations/:code
   * Reset to default — removes the override row entirely.
   */
  app.delete(
    "/api/admin/metric-explanations/:code",
    requireAuth,
    requireSiteAdmin,
    async (req: Request, res: Response) => {
      try {
        const { code } = req.params;

        if (!BUILT_IN_METRIC_CODES.includes(code as any)) {
          return res.status(400).json({ message: 'Unknown metric code' });
        }

        await db
          .delete(siteMetricExplanations)
          .where(eq(siteMetricExplanations.metricCode, code));

        // Idempotent: success whether or not an override existed
        res.json({ message: "Reset to default", code });
      } catch (error: any) {
        console.error("Failed to delete metric explanation override:", error);
        res.status(500).json({
          message: "Failed to delete metric explanation override",
          error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
      }
    },
  );
}
