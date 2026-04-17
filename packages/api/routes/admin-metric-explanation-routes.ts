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
import type { MetricExplanation } from "@shared/metric-explanations";
import { eq } from "drizzle-orm";
import { z } from "zod";

const OVERRIDABLE_FIELDS = ['title', 'shortDescription', 'whatItMeasures', 'whyItMatters'] as const;

const upsertSchema = z.object({
  title: z.string().nullable().optional(),
  shortDescription: z.string().nullable().optional(),
  whatItMeasures: z.string().nullable().optional(),
  whyItMatters: z.string().nullable().optional(),
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
            hasOverride: !!override,
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
        const parsed = upsertSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            message: "Validation failed",
            errors: parsed.error.flatten().fieldErrors,
          });
        }

        const data = parsed.data;
        const userId = (req as any).user?.id ?? null;

        // Upsert: insert or update on conflict
        const existing = await db
          .select({ id: siteMetricExplanations.id })
          .from(siteMetricExplanations)
          .where(eq(siteMetricExplanations.metricCode, code))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(siteMetricExplanations)
            .set({
              ...(data.title !== undefined && { title: data.title ?? null }),
              ...(data.shortDescription !== undefined && { shortDescription: data.shortDescription ?? null }),
              ...(data.whatItMeasures !== undefined && { whatItMeasures: data.whatItMeasures ?? null }),
              ...(data.whyItMatters !== undefined && { whyItMatters: data.whyItMatters ?? null }),
              updatedBy: userId,
              updatedAt: new Date(),
            })
            .where(eq(siteMetricExplanations.metricCode, code));
        } else {
          await db.insert(siteMetricExplanations).values({
            metricCode: code,
            title: data.title ?? null,
            shortDescription: data.shortDescription ?? null,
            whatItMeasures: data.whatItMeasures ?? null,
            whyItMatters: data.whyItMatters ?? null,
            updatedBy: userId,
          });
        }

        // Return the merged result
        const builtIn = BUILT_IN_METRIC_EXPLANATIONS[code];
        const [updated] = await db
          .select()
          .from(siteMetricExplanations)
          .where(eq(siteMetricExplanations.metricCode, code));

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
          hasOverride: true,
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

        const deleted = await db
          .delete(siteMetricExplanations)
          .where(eq(siteMetricExplanations.metricCode, code))
          .returning({ id: siteMetricExplanations.id });

        if (deleted.length === 0) {
          return res.status(404).json({ message: "No override found for this metric code" });
        }

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
