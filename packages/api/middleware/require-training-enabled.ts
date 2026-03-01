/**
 * Middleware to check if training module is enabled
 * Checks both site-level and organization-level feature flags.
 *
 * Mirrors require-wellness-enabled.ts exactly, substituting training flags.
 */

import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware";
import { db } from "../db";
import { siteSettings, organizations, userOrganizations } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Middleware that checks if training module is enabled:
 * 1. Site-level: training_module_enabled in site_settings
 * 2. Org-level: training_enabled in organizations (only checked if site-level enabled)
 *
 * Usage: app.get('/api/training/...', requireAuth, requireTrainingEnabled, handler)
 */
export async function requireTrainingEnabled(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Step 1: Check site-level training setting
    const siteSettingsResult = await db.select().from(siteSettings).limit(1);

    if (siteSettingsResult.length > 0) {
      const settings = siteSettingsResult[0];

      if (!settings.trainingModuleEnabled) {
        return res.status(403).json({
          message: "Training module is disabled by site administrator",
          featureDisabled: true,
          disabledBy: 'site_admin'
        });
      }
    }
    // If no site_settings row exists yet, treat as disabled (training defaults to false)
    else {
      return res.status(403).json({
        message: "Training module is disabled by site administrator",
        featureDisabled: true,
        disabledBy: 'site_admin'
      });
    }

    // Step 2: Check organization-level training setting
    let organizationId: string | undefined;

    // Try to get from route params first
    organizationId = req.params.organizationId;

    // If not in params, try to get from user's organization membership
    if (!organizationId && req.user) {
      const userOrgs = await db
        .select()
        .from(userOrganizations)
        .where(eq(userOrganizations.userId, req.user.id))
        .limit(1);

      if (userOrgs.length > 0) {
        organizationId = userOrgs[0].organizationId;
      }
    }

    // If we have an organization ID, check org-level training setting
    if (organizationId) {
      const org = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (org.length > 0 && !org[0].trainingEnabled) {
        return res.status(403).json({
          message: "Training module is disabled for this organization",
          featureDisabled: true,
          disabledBy: 'org_admin'
        });
      }
    }

    // Training is enabled at both levels - proceed
    next();
  } catch (error) {
    console.error("Error checking training feature flags:", error);

    // SECURITY: Only fail open for site admins on specific database connection errors
    const isConnectionError = (error as any).code === 'ECONNREFUSED' ||
                             (error as any).code === 'ETIMEDOUT' ||
                             (error as any).message?.includes('connection');

    if (req.user?.isSiteAdmin && isConnectionError) {
      console.error('CRITICAL: Training check failed due to DB connection error but allowing site admin access', error);
      return next();
    }

    res.status(500).json({
      message: "Failed to check training feature access"
    });
  }
}

/**
 * Utility function to check training enabled status without middleware.
 * Useful for conditional feature display in API responses.
 */
export async function checkTrainingEnabled(organizationId: string): Promise<{
  enabled: boolean;
  disabledBy?: 'site_admin' | 'org_admin';
  message?: string;
}> {
  try {
    // Check site-level setting
    const siteSettingsResult = await db.select().from(siteSettings).limit(1);

    if (siteSettingsResult.length === 0 || !siteSettingsResult[0].trainingModuleEnabled) {
      return {
        enabled: false,
        disabledBy: 'site_admin',
        message: 'Training module is disabled by site administrator'
      };
    }

    // Check org-level setting
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (org.length > 0 && !org[0].trainingEnabled) {
      return {
        enabled: false,
        disabledBy: 'org_admin',
        message: 'Training module is disabled for this organization'
      };
    }

    return { enabled: true };
  } catch (error) {
    console.error("Error checking training enabled status:", error);
    return { enabled: false, message: 'Error checking training status' };
  }
}
