/**
 * Middleware to check if wellness module is enabled
 * Checks both site-level and organization-level feature flags
 */

import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware";
import { db } from "../db";
import { siteSettings, organizations, userOrganizations } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Middleware that checks if wellness module is enabled:
 * 1. Site-level: wellness_module_enabled in site_settings
 * 2. Org-level: wellness_enabled in organizations (only checked if site-level enabled)
 *
 * Usage: app.get('/api/wellness/...', requireAuth, requireWellnessEnabled, handler)
 */
export async function requireWellnessEnabled(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Step 1: Check site-level wellness setting
    const siteSettingsResult = await db.select().from(siteSettings).limit(1);

    if (siteSettingsResult.length === 0) {
      // No site settings record - create default one with wellness enabled
      await db.insert(siteSettings).values({
        aiModel: 'gpt-5-nano',
        wellnessModuleEnabled: true,
      });
    } else {
      const settings = siteSettingsResult[0];

      // If site admin has disabled wellness globally, block access
      if (!settings.wellnessModuleEnabled) {
        return res.status(403).json({
          message: "Wellness module is disabled by site administrator",
          featureDisabled: true,
          disabledBy: 'site_admin'
        });
      }
    }

    // Step 2: Check organization-level wellness setting
    // Extract organization ID from various possible sources
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

    // If we have an organization ID, check org-level wellness setting
    if (organizationId) {
      const org = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (org.length > 0 && !org[0].wellnessEnabled) {
        return res.status(403).json({
          message: "Wellness module is disabled for this organization",
          featureDisabled: true,
          disabledBy: 'org_admin'
        });
      }
    }

    // Wellness is enabled at both levels - proceed
    next();
  } catch (error) {
    console.error("Error checking wellness feature flags:", error);

    // SECURITY: Only fail open for site admins on specific database connection errors
    // All other errors (application logic, network issues, etc.) should fail closed
    const isConnectionError = (error as any).code === 'ECONNREFUSED' ||
                             (error as any).code === 'ETIMEDOUT' ||
                             (error as any).message?.includes('connection');

    if (req.user?.isSiteAdmin && isConnectionError) {
      console.error('CRITICAL: Wellness check failed due to DB connection error but allowing site admin access', error);
      return next();
    }

    // Fail closed for all other cases (including non-admins and non-connection errors)
    res.status(500).json({
      message: "Failed to check wellness feature access"
    });
  }
}

/**
 * Utility function to check wellness enabled status without middleware
 * Useful for conditional feature display in API responses
 */
export async function checkWellnessEnabled(organizationId: string): Promise<{
  enabled: boolean;
  disabledBy?: 'site_admin' | 'org_admin';
  message?: string;
}> {
  try {
    // Check site-level setting
    const siteSettingsResult = await db.select().from(siteSettings).limit(1);

    if (siteSettingsResult.length > 0 && !siteSettingsResult[0].wellnessModuleEnabled) {
      return {
        enabled: false,
        disabledBy: 'site_admin',
        message: 'Wellness module is disabled by site administrator'
      };
    }

    // Check org-level setting
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (org.length > 0 && !org[0].wellnessEnabled) {
      return {
        enabled: false,
        disabledBy: 'org_admin',
        message: 'Wellness module is disabled for this organization'
      };
    }

    return { enabled: true };
  } catch (error) {
    console.error("Error checking wellness enabled status:", error);
    return { enabled: false, message: 'Error checking wellness status' };
  }
}
