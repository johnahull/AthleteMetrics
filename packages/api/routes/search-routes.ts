/**
 * Global search routes for command palette functionality
 * Provides unified search across athletes, teams, and measurements
 */

import type { Express } from "express";
import { GlobalSearchService } from "../services/global-search-service";
import { requireAuth } from "../middleware";
import { z } from "zod";

// Validation schema for search query parameters
const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : 20),
  includeAthletes: z.string().optional().transform((val) => val !== 'false'),
  includeTeams: z.string().optional().transform((val) => val !== 'false'),
  includeMeasurements: z.string().optional().transform((val) => val !== 'false'),
});

export function registerSearchRoutes(app: Express) {
  const globalSearchService = new GlobalSearchService();

  /**
   * Global search endpoint for command palette
   * GET /api/search/global?q=<query>&limit=20
   */
  app.get("/api/search/global", requireAuth, async (req, res) => {
    try {
      const user = req.session.user;
      if (!user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate query parameters
      const validation = searchQuerySchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid search parameters",
          errors: validation.error.errors,
        });
      }

      const { q, limit, includeAthletes, includeTeams, includeMeasurements } = validation.data;

      // Get user's organization context
      // For now, use the first organization the user belongs to
      // TODO: Add organization context to request (e.g., from URL param or session)
      const userOrganizations = await globalSearchService.getUserOrganizations(user.id);

      if (userOrganizations.length === 0 && !user.isSiteAdmin) {
        return res.status(403).json({
          message: "User does not belong to any organization",
        });
      }

      // Site admins can search across all orgs, but for now we'll use the first org
      // In the future, we might add org switching or multi-org search
      const organizationId = userOrganizations[0]?.organizationId || '';

      // Perform global search
      const results = await globalSearchService.globalSearch(
        q,
        user.id,
        organizationId,
        {
          limit,
          includeAthletes,
          includeTeams,
          includeMeasurements,
        }
      );

      return res.json(results);
    } catch (error) {
      console.error("Global search error:", error);
      return res.status(500).json({
        message: "Search failed. Please try again.",
      });
    }
  });

  /**
   * Get suggested actions based on query
   * GET /api/search/actions?q=<query>
   */
  app.get("/api/search/actions", requireAuth, async (req, res) => {
    try {
      const query = req.query.q as string;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }

      const actions = await globalSearchService.getSuggestedActions(query);

      return res.json({ actions });
    } catch (error) {
      console.error("Action search error:", error);
      return res.status(500).json({
        message: "Action search failed. Please try again.",
      });
    }
  });
}
