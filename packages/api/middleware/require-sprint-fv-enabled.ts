/**
 * Middleware to check if Sprint F-V profiling is enabled
 * Checks both site-level and organization-level feature flags
 * Follows the same pattern as require-wellness-enabled.ts
 */

import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware";
import { db } from "../db";
import { siteSettings, organizations, userOrganizations } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Middleware that checks if Sprint F-V profiling is enabled:
 * 1. Site-level: sprint_fv_enabled in site_settings
 * 2. Org-level: sprint_fv_enabled in organizations (only checked if site-level enabled)
 *
 * Usage: app.get('/api/sprint-fv-profiles/...', requireAuth, requireSprintFvEnabled, handler)
 */
export async function requireSprintFvEnabled(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Step 1: Check site-level setting
    const siteSettingsResult = await db.select().from(siteSettings).limit(1);

    if (siteSettingsResult.length > 0) {
      const settings = siteSettingsResult[0];

      if (!settings.sprintFvEnabled) {
        return res.status(403).json({
          message: "Sprint F-V profiling is disabled by site administrator",
          featureDisabled: true,
          disabledBy: 'site_admin'
        });
      }
    } else {
      // No site settings record — sprint F-V defaults to false, so block access
      return res.status(403).json({
        message: "Sprint F-V profiling is not enabled",
        featureDisabled: true,
        disabledBy: 'site_admin'
      });
    }

    // Step 2: Check organization-level setting
    let organizationId: string | undefined;

    organizationId = req.params.organizationId || req.params.orgId;

    if (!organizationId && req.user) {
      // Prefer primaryOrganizationId (user's chosen "home" org), then fall back
      // to first-joined org — matches how other org-scoped middleware resolves context.
      if (req.user.primaryOrganizationId) {
        organizationId = req.user.primaryOrganizationId;
      } else {
        const userOrgs = await db
          .select()
          .from(userOrganizations)
          .where(eq(userOrganizations.userId, req.user.id))
          .orderBy(userOrganizations.createdAt)
          .limit(1);

        if (userOrgs.length > 0) {
          organizationId = userOrgs[0].organizationId;
        }
      }
    }

    // If no organizationId is resolved (user has no org membership), the org-level
    // check is skipped. This is intentional: site-level enablement alone gates access
    // for independent athletes, matching the wellness middleware pattern.
    if (organizationId) {
      const org = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (org.length === 0) {
        return res.status(404).json({
          message: "Organization not found",
        });
      }

      if (!org[0].sprintFvEnabled) {
        return res.status(403).json({
          message: "Sprint F-V profiling is disabled for this organization",
          featureDisabled: true,
          disabledBy: 'org_admin'
        });
      }
    }

    next();
  } catch (error) {
    console.error("Error checking Sprint F-V feature flags:", error);
    // Fail closed: if we can't verify the feature flag state, deny access
    res.status(503).json({
      message: "Unable to verify Sprint F-V feature access. Please try again later."
    });
  }
}

/**
 * Utility function to check Sprint F-V enabled status without middleware
 */
export async function checkSprintFvEnabled(organizationId: string): Promise<{
  enabled: boolean;
  disabledBy?: 'site_admin' | 'org_admin';
  message?: string;
}> {
  try {
    const siteSettingsResult = await db.select().from(siteSettings).limit(1);

    if (siteSettingsResult.length === 0 || !siteSettingsResult[0].sprintFvEnabled) {
      return {
        enabled: false,
        disabledBy: 'site_admin',
        message: 'Sprint F-V profiling is disabled by site administrator'
      };
    }

    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (org.length > 0 && !org[0].sprintFvEnabled) {
      return {
        enabled: false,
        disabledBy: 'org_admin',
        message: 'Sprint F-V profiling is disabled for this organization'
      };
    }

    return { enabled: true };
  } catch (error) {
    console.error("Error checking Sprint F-V enabled status:", error);
    return { enabled: false, message: 'Error checking Sprint F-V status' };
  }
}
