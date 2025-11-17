/**
 * Organization Type API Routes
 * 
 * @fileoverview Optimized API endpoints for organization type operations including:
 * - Metrics filtering by organization type
 * - Benchmarks filtering by organization type  
 * - Organization type statistics and management
 * - Performance monitoring and caching
 * 
 * @author AthleteMetrics System
 * @version 1.0.0
 * @since 2025-11-09
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { OrganizationTypeService } from "../services/organization-type-service";
import { requireAuth, requireSiteAdmin } from "../middleware";
import {
  validateOrgTypeParam,
  validateOrgTypeQuery,
  validateOrgTypeArray,
  authorizeOrganizationTypeAccess,
  verifyOrganizationTypeAccess,
  handleOrganizationTypeError,
  logOrganizationTypeAccess,
  getOrganizationTypeFromRequest,
} from "../middleware/organization-type-middleware";
import {
  getOrganizationTypeOptions,
  ORGANIZATION_TYPE_LABELS,
  OrganizationTypeConstants,
  type OrganizationType,
} from "@shared/organization-type-utils";
import { storage } from "../storage";

const organizationTypeService = new OrganizationTypeService();

/**
 * Rate limiting configuration for organization type endpoints
 * More generous limits for read operations, stricter for write operations
 */
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per window (generous for read operations)
  message: { message: "Too many requests for organization type data, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Always enforce in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes  
  limit: 20, // 20 requests per window (stricter for write operations)
  message: { message: "Too many organization type modification requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) return false; // Always enforce in production
    return process.env.BYPASS_GENERAL_RATE_LIMIT === 'true';
  },
});

/**
 * Sanitize error messages for production to prevent information leakage
 */
function sanitizeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  
  // Safe error patterns that can be exposed
  const safePatterns = [
    /organization type/i,
    /invalid/i,
    /not found/i,
    /unauthorized/i,
    /access denied/i,
    /validation/i,
    /required/i,
  ];

  if (isProduction) {
    const isSafeError = safePatterns.some(pattern => pattern.test(error.message));
    return isSafeError ? error.message : fallback;
  }

  return error.message;
}

/**
 * Register organization type routes
 * 
 * @param app - Express application instance
 */
export function registerOrganizationTypeRoutes(app: Express) {
  /**
   * GET /api/organization-types
   * Get list of available organization types with labels and descriptions
   */
  app.get("/api/organization-types", readLimiter, requireAuth, async (req, res) => {
    try {
      const includeDescriptions = req.query.includeDescriptions === 'true';
      const options = getOrganizationTypeOptions();

      const response = {
        organizationTypes: options.map(option => ({
          value: option.value,
          label: option.label,
          ...(includeDescriptions && { description: option.description }),
        })),
        constants: {
          labels: ORGANIZATION_TYPE_LABELS,
          ...(includeDescriptions && { 
            descriptions: OrganizationTypeConstants.DESCRIPTIONS,
            colors: OrganizationTypeConstants.COLORS,
          }),
        },
      };

      // Cache for 1 hour since organization types rarely change
      // Use 'private' cache for authenticated endpoints to prevent CDN/proxy caching
      res.set('Cache-Control', 'private, max-age=3600');
      res.json(response);
    } catch (error) {
      console.error("Get organization types error:", error);
      res.status(500).json({ 
        message: sanitizeError(error, "Failed to fetch organization types") 
      });
    }
  });

  /**
   * GET /api/organization-types/:orgType/metrics
   * Get metrics available for specific organization type
   */
  app.get(
    "/api/organization-types/:orgType/metrics",
    readLimiter,
    requireAuth,
    validateOrgTypeParam('orgType', true),
    verifyOrganizationTypeAccess(storage),
    logOrganizationTypeAccess('organization_type_metrics_accessed'),
    async (req, res) => {
      try {
        const orgType = getOrganizationTypeFromRequest(req);
        if (!orgType) {
          return res.status(400).json({ message: "Invalid organization type" });
        }

        const useCache = req.query.fresh !== 'true';
        const metrics = await organizationTypeService.getMetricsForOrganizationType(
          orgType,
          req.session.user!.id,
          useCache
        );

        // Set cache headers based on whether we used cache
        // Use 'private' cache for authenticated endpoints to prevent CDN/proxy caching
        if (useCache) {
          res.set('Cache-Control', 'private, max-age=300'); // 5 minutes
        } else {
          res.set('Cache-Control', 'no-cache');
        }

        res.json({
          organizationType: orgType,
          organizationTypeLabel: ORGANIZATION_TYPE_LABELS[orgType as keyof typeof ORGANIZATION_TYPE_LABELS],
          metrics,
          count: metrics.length,
          cached: useCache,
        });
      } catch (error) {
        console.error("Get metrics for organization type error:", error);
        res.status(500).json({ 
          message: sanitizeError(error, "Failed to fetch metrics for organization type") 
        });
      }
    }
  );

  /**
   * GET /api/organization-types/:orgType/benchmarks
   * Get benchmarks available for specific organization type
   */
  app.get(
    "/api/organization-types/:orgType/benchmarks",
    readLimiter,
    requireAuth,
    validateOrgTypeParam('orgType', true),
    verifyOrganizationTypeAccess(storage),
    logOrganizationTypeAccess('organization_type_benchmarks_accessed'),
    async (req, res) => {
      try {
        const orgType = getOrganizationTypeFromRequest(req);
        if (!orgType) {
          return res.status(400).json({ message: "Invalid organization type" });
        }

        const useCache = req.query.fresh !== 'true';
        const benchmarks = await organizationTypeService.getBenchmarksForOrganizationType(
          orgType,
          req.session.user!.id,
          useCache
        );

        // Set cache headers
        // Use 'private' cache for authenticated endpoints to prevent CDN/proxy caching
        if (useCache) {
          res.set('Cache-Control', 'private, max-age=300'); // 5 minutes
        } else {
          res.set('Cache-Control', 'no-cache');
        }

        res.json({
          organizationType: orgType,
          organizationTypeLabel: ORGANIZATION_TYPE_LABELS[orgType as keyof typeof ORGANIZATION_TYPE_LABELS],
          benchmarks,
          count: benchmarks.length,
          cached: useCache,
        });
      } catch (error) {
        console.error("Get benchmarks for organization type error:", error);
        res.status(500).json({ 
          message: sanitizeError(error, "Failed to fetch benchmarks for organization type") 
        });
      }
    }
  );

  /**
   * GET /api/organization-types/:orgType/organizations
   * Get organizations of specific type
   */
  app.get(
    "/api/organization-types/:orgType/organizations",
    readLimiter,
    requireAuth,
    validateOrgTypeParam('orgType', true),
    verifyOrganizationTypeAccess(storage),
    authorizeOrganizationTypeAccess(['site_admin', 'org_admin']),
    logOrganizationTypeAccess('organization_type_organizations_accessed'),
    async (req, res) => {
      try {
        const orgType = getOrganizationTypeFromRequest(req);
        if (!orgType) {
          return res.status(400).json({ message: "Invalid organization type" });
        }

        const includeInactive = req.query.includeInactive === 'true';
        const organizations = await organizationTypeService.getOrganizationsByType(
          orgType,
          req.session.user!.id,
          includeInactive
        );

        res.json({
          organizationType: orgType,
          organizationTypeLabel: ORGANIZATION_TYPE_LABELS[orgType as keyof typeof ORGANIZATION_TYPE_LABELS],
          organizations,
          count: organizations.length,
          includeInactive,
        });
      } catch (error) {
        console.error("Get organizations by type error:", error);
        const message = sanitizeError(error, "Failed to fetch organizations");
        const statusCode = message.includes("Only site administrators") ? 403 : 500;
        res.status(statusCode).json({ message });
      }
    }
  );

  /**
   * POST /api/organization-types/filter-metrics
   * Bulk filter metrics by multiple organization types
   */
  app.post(
    "/api/organization-types/filter-metrics",
    readLimiter,
    requireAuth,
    validateOrgTypeArray('organizationTypes', true, 6), // Max 6 org types
    async (req, res) => {
      try {
        const { organizationTypes } = req.body;
        const userId = req.session.user!.id;

        // Fetch metrics for each organization type in parallel
        const metricsPromises = organizationTypes.map((orgType: any) =>
          organizationTypeService.getMetricsForOrganizationType(orgType as OrganizationType, userId, true)
        );
        
        const metricsResults = await Promise.all(metricsPromises);

        // Combine and deduplicate metrics
        const allMetrics = new Map();
        const resultsByOrgType: Record<string, any[]> = {};

        organizationTypes.forEach((orgType: string, index: number) => {
          const metrics = metricsResults[index];
          resultsByOrgType[orgType] = metrics;
          
          metrics.forEach((metric: any) => {
            if (!allMetrics.has(metric.code)) {
              allMetrics.set(metric.code, metric);
            }
          });
        });

        res.json({
          organizationTypes,
          resultsByOrgType,
          combinedMetrics: Array.from(allMetrics.values()),
          totalUniqueMetrics: allMetrics.size,
        });
      } catch (error) {
        console.error("Filter metrics by organization types error:", error);
        res.status(500).json({ 
          message: sanitizeError(error, "Failed to filter metrics by organization types") 
        });
      }
    }
  );

  /**
   * GET /api/organization-types/statistics
   * Get organization type statistics (site admin only)
   */
  app.get(
    "/api/organization-types/statistics",
    readLimiter,
    requireSiteAdmin,
    logOrganizationTypeAccess('organization_type_statistics_accessed'),
    async (req, res) => {
      try {
        const statistics = await organizationTypeService.getOrganizationTypeStatistics(
          req.session.user!.id
        );

        // Calculate percentages
        const total = statistics.total;
        const statisticsWithPercentages = Object.entries(statistics)
          .filter(([key]) => key !== 'total')
          .map(([orgType, count]) => ({
            organizationType: orgType,
            organizationTypeLabel: ORGANIZATION_TYPE_LABELS[orgType as keyof typeof ORGANIZATION_TYPE_LABELS],
            count: count as number,
            percentage: total > 0 ? Math.round(((count as number) / total) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count);

        res.json({
          total,
          breakdown: statisticsWithPercentages,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Get organization type statistics error:", error);
        const message = sanitizeError(error, "Failed to fetch organization type statistics");
        const statusCode = message.includes("Only site administrators") ? 403 : 500;
        res.status(statusCode).json({ message });
      }
    }
  );

  /**
   * POST /api/organization-types/validate
   * Validate organization type values (utility endpoint)
   */
  app.post(
    "/api/organization-types/validate",
    writeLimiter,
    requireAuth,
    async (req, res) => {
      try {
        const { values, field = 'orgType' } = req.body;

        if (!Array.isArray(values)) {
          return res.status(400).json({ message: "Values must be an array" });
        }

        if (values.length > 50) {
          return res.status(400).json({ message: "Cannot validate more than 50 values at once" });
        }

        const results = values.map((value, index) => {
          try {
            const validatedData = organizationTypeService.validateOrganizationTypesBulk(
              [{ [field]: value }],
              field
            );
            return {
              index,
              original: value,
              valid: true,
              normalized: validatedData[0][field],
            };
          } catch (error) {
            return {
              index,
              original: value,
              valid: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        });

        const validCount = results.filter(r => r.valid).length;
        const invalidCount = results.length - validCount;

        res.json({
          results,
          summary: {
            total: values.length,
            valid: validCount,
            invalid: invalidCount,
            validationRate: Math.round((validCount / values.length) * 100),
          },
        });
      } catch (error) {
        console.error("Validate organization types error:", error);
        res.status(500).json({ 
          message: sanitizeError(error, "Failed to validate organization types") 
        });
      }
    }
  );

  /**
   * POST /api/organization-types/cache/invalidate
   * Invalidate organization type caches (site admin only)
   */
  app.post(
    "/api/organization-types/cache/invalidate",
    writeLimiter,
    requireSiteAdmin,
    async (req, res) => {
      try {
        const { pattern } = req.body;

        organizationTypeService.invalidateCache(pattern);

        res.json({
          message: "Cache invalidated successfully",
          pattern: pattern || "all",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Invalidate organization type cache error:", error);
        res.status(500).json({ 
          message: sanitizeError(error, "Failed to invalidate cache") 
        });
      }
    }
  );

  /**
   * GET /api/organization-types/performance
   * Get performance metrics for organization type service (site admin only)
   */
  app.get(
    "/api/organization-types/performance",
    readLimiter,
    requireSiteAdmin,
    async (req, res) => {
      try {
        const metrics = organizationTypeService.getPerformanceMetrics();
        const healthStatus = await organizationTypeService.healthCheck();

        res.json({
          performance: metrics,
          health: healthStatus,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Get organization type performance error:", error);
        res.status(500).json({ 
          message: sanitizeError(error, "Failed to fetch performance metrics") 
        });
      }
    }
  );

  /**
   * POST /api/organization-types/performance/reset
   * Reset performance metrics (site admin only)
   */
  app.post(
    "/api/organization-types/performance/reset",
    writeLimiter,
    requireSiteAdmin,
    async (req, res) => {
      try {
        organizationTypeService.resetPerformanceMetrics();

        res.json({
          message: "Performance metrics reset successfully",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Reset organization type performance error:", error);
        res.status(500).json({ 
          message: sanitizeError(error, "Failed to reset performance metrics") 
        });
      }
    }
  );

  // Register organization type error handler
  app.use(handleOrganizationTypeError);
}

/**
 * Health check endpoint for organization type routes
 * Can be called independently to verify route health
 */
export async function healthCheckOrganizationTypeRoutes(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  routes: number;
  lastCheck: string;
}> {
  try {
    const serviceHealth = await organizationTypeService.healthCheck();
    
    return {
      status: serviceHealth.status,
      routes: 9, // Number of routes registered
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      routes: 9,
      lastCheck: new Date().toISOString(),
    };
  }
}