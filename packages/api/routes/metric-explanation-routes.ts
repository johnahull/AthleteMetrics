/**
 * Metric Explanation Routes (athlete-readable)
 *
 * Returns the merged metric-explanation map for a list of metric codes.
 * All authenticated users (including athletes) can read; explanation prose
 * is reference content, not private data. Optional `organizationId` scopes
 * the response to include that org's custom metric labels/descriptions.
 */

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware';
import { getCachedUserOrganizations } from '../helpers/cached-org-access';
import { isSiteAdmin } from '@shared/auth-utils';
import { getMetricExplanationsMap } from '../services/metric-explanation-service';

const MAX_CODES_PER_REQUEST = 100;

const querySchema = z.object({
  codes: z
    .string()
    .min(1)
    .transform((v) => v.split(',').map((c) => c.trim()).filter(Boolean)),
  organizationId: z.string().uuid().optional(),
});

export function registerMetricExplanationRoutes(app: Express) {
  app.get(
    '/api/metric-explanations',
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const parsed = querySchema.safeParse({
          codes: req.query.codes,
          organizationId: req.query.organizationId,
        });

        if (!parsed.success) {
          return res.status(400).json({
            message: 'Invalid query parameters',
            errors: parsed.error.flatten().fieldErrors,
          });
        }

        const { codes, organizationId } = parsed.data;

        if (codes.length === 0) {
          return res.json({ explanations: {} });
        }

        if (codes.length > MAX_CODES_PER_REQUEST) {
          return res.status(400).json({
            message: `Too many codes requested (max ${MAX_CODES_PER_REQUEST})`,
          });
        }

        // If caller supplied an org, verify they can access it (or are site admin)
        // so custom-org-metric prose doesn't leak across tenants.
        if (organizationId) {
          const user = req.user!;
          if (!isSiteAdmin(user)) {
            const userOrgs = await getCachedUserOrganizations(req, user.id);
            const hasAccess = userOrgs.some((o) => o.organizationId === organizationId);
            if (!hasAccess) {
              return res.status(403).json({ message: 'Access denied to this organization' });
            }
          }
        }

        const explanations = await getMetricExplanationsMap(codes, organizationId);
        res.json({ explanations });
      } catch (error: any) {
        console.error('Failed to fetch metric explanations:', error);
        res.status(500).json({
          message: 'Failed to fetch metric explanations',
          error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
      }
    },
  );
}
