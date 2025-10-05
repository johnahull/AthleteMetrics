/**
 * Admin routes for site administrator functions
 *
 * Includes user impersonation, role verification, and data cleanup utilities
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { isValidEmail } from "../utils/csv-utils";
import { db } from "../db";
import { userOrganizations } from "@shared/schema";
import { eq } from "drizzle-orm";

export function registerAdminRoutes(app: Express) {
  /**
   * Impersonate a user (Site Admin only)
   * POST /api/admin/impersonate/:userId
   */
  app.post("/api/admin/impersonate/:userId", requireSiteAdmin, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const currentUser = req.session.user;

      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Check if already impersonating
      if (req.session.isImpersonating) {
        return res.status(400).json({ message: "Already impersonating a user" });
      }

      // Get the target user
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Don't allow impersonating yourself
      if (targetUser.id === currentUser.id) {
        return res.status(400).json({ message: "Cannot impersonate yourself" });
      }

      // Don't allow impersonating other site admins
      if (targetUser.isSiteAdmin) {
        return res.status(400).json({ message: "Cannot impersonate other site administrators" });
      }

      // Determine the target user's role
      let targetRole: string;
      const userOrgs = await storage.getUserOrganizations(targetUser.id);

      if (targetUser.isSiteAdmin) {
        targetRole = "site_admin";
      } else {
        // For non-site admins, get their organization role
        if (userOrgs && userOrgs.length > 0) {
          // Use the first organization role (users should only have one role per org)
          targetRole = userOrgs[0].role;
        } else {
          return res.status(400).json({ message: "Target user has no valid role assignments" });
        }
      }

      // Store original user and set up impersonation
      req.session.originalUser = {
        ...currentUser,
        primaryOrganizationId: currentUser.primaryOrganizationId // Ensure primary org is saved
      };
      req.session.user = {
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.emails?.[0] || `${targetUser.username}@temp.local`, // Use first email for backward compatibility in session
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        role: targetRole,
        isSiteAdmin: targetUser.isSiteAdmin || false,
        athleteId: targetRole === "athlete" ? targetUser.id : undefined, // Use user ID as athlete ID for athletes
        primaryOrganizationId: userOrgs.length > 0 ? userOrgs[0].organizationId : undefined
      };
      req.session.isImpersonating = true;
      req.session.impersonationStartTime = new Date();

      res.setHeader('X-Route-Source', 'admin-routes');
      res.json({
        success: true,
        message: `Now impersonating ${targetUser.firstName} ${targetUser.lastName}`,
        user: req.session.user,
        impersonationStatus: {
          isImpersonating: true,
          originalUser: currentUser,
          targetUser: req.session.user,
          startTime: req.session.impersonationStartTime
        }
      });
    } catch (error) {
      console.error("Impersonation error:", error);
      res.status(500).json({ message: "Failed to start impersonation" });
    }
  });

  /**
   * Stop impersonating a user
   * POST /api/admin/stop-impersonation
   */
  app.post("/api/admin/stop-impersonation", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!req.session.isImpersonating || !req.session.originalUser) {
        return res.status(400).json({ message: "Not currently impersonating" });
      }

      const originalUser = req.session.originalUser;

      // Restore original user
      req.session.user = originalUser;
      req.session.originalUser = undefined;
      req.session.isImpersonating = false;
      req.session.impersonationStartTime = undefined;

      res.setHeader('X-Route-Source', 'admin-routes');
      res.json({
        success: true,
        message: "Stopped impersonation",
        user: req.session.user,
        impersonationStatus: {
          isImpersonating: false
        }
      });
    } catch (error) {
      console.error("Stop impersonation error:", error);
      res.status(500).json({ message: "Failed to stop impersonation" });
    }
  });

  /**
   * Get impersonation status
   * GET /api/admin/impersonation-status
   */
  app.get("/api/admin/impersonation-status", requireAuth, (req: Request, res: Response) => {
    try {
      if (req.session.isImpersonating && req.session.originalUser) {
        res.setHeader('X-Route-Source', 'admin-routes');
        res.json({
          isImpersonating: true,
          originalUser: req.session.originalUser,
          targetUser: req.session.user,
          startTime: req.session.impersonationStartTime
        });
      } else {
        res.setHeader('X-Route-Source', 'admin-routes');
        res.json({
          isImpersonating: false
        });
      }
    } catch (error) {
      console.error("Impersonation status error:", error);
      res.status(500).json({ message: "Failed to get impersonation status" });
    }
  });

  /**
   * Verify and fix user role constraints (Site Admin only)
   * GET /api/admin/verify-roles
   */
  app.get("/api/admin/verify-roles", requireSiteAdmin, async (req: Request, res: Response) => {
    try {
      const users = await storage.getUsers();
      const violations: any[] = [];
      const fixes: any[] = [];

      for (const user of users) {
        if (user.isSiteAdmin) continue; // Skip site admins

        const validation = await storage.validateUserRoleConstraint(user.id);
        if (!validation.valid) {
          violations.push({
            userId: user.id,
            userName: `${user.firstName} ${user.lastName}`,
            email: user.emails[0],
            violations: validation.violations
          });

          // Auto-fix by keeping only the first role per organization
          const userOrgRelations = await db.select()
            .from(userOrganizations)
            .where(eq(userOrganizations.userId, user.id));

          const orgRoleMap = new Map<string, string>();
          for (const relation of userOrgRelations) {
            if (!orgRoleMap.has(relation.organizationId)) {
              orgRoleMap.set(relation.organizationId, relation.role);
            }
          }

          // Remove all roles and re-add single role per org
          await db.delete(userOrganizations)
            .where(eq(userOrganizations.userId, user.id));

          for (const [orgId, role] of Array.from(orgRoleMap.entries())) {
            await db.insert(userOrganizations).values({
              userId: user.id,
              organizationId: orgId,
              role
            });
            fixes.push({
              userId: user.id,
              organizationId: orgId,
              keptRole: role
            });
          }
        }
      }

      res.setHeader('X-Route-Source', 'admin-routes');
      res.json({
        totalUsersChecked: users.length,
        violationsFound: violations.length,
        violations,
        fixesApplied: fixes.length,
        fixes,
        message: violations.length === 0 ? "All users have valid single roles per organization" : `Fixed ${fixes.length} role constraint violations`
      });
    } catch (error) {
      console.error("Error verifying roles:", error);
      res.status(500).json({ message: "Failed to verify role constraints" });
    }
  });

  /**
   * Fix contact data for all athletes (Site Admin only)
   * Moves misplaced emails from phone numbers to emails field
   * POST /api/admin/fix-contact-data
   */
  app.post("/api/admin/fix-contact-data", requireAuth, async (req: Request, res: Response) => {
    try {
      // Check if user is site admin
      if (req.session.user!.role !== 'site_admin') {
        return res.status(403).json({ message: "Only site administrators can perform this action" });
      }

      const results: any[] = [];
      const errors: any[] = [];

      // Get all users (athletes)
      const allUsers = await storage.getAthletes();

      for (const user of allUsers) {
        try {
          let hasChanges = false;
          const currentEmails = [...(user.emails || [])];
          const currentPhones = [...(user.phoneNumbers || [])];
          const newEmails: string[] = [];
          const newPhones: string[] = [];

          // Check phone numbers for emails
          currentPhones.forEach(phone => {
            if (isValidEmail(phone)) {
              // Found email in phone numbers
              if (!currentEmails.includes(phone) && !newEmails.includes(phone)) {
                newEmails.push(phone);
                hasChanges = true;
                results.push({
                  userId: user.id,
                  name: `${user.firstName} ${user.lastName}`,
                  action: `Moved email "${phone}" from phone numbers to emails`
                });
              }
            } else {
              // Keep as phone number
              newPhones.push(phone);
            }
          });

          // If we found emails in phone numbers, update the user
          if (hasChanges) {
            const updatedEmails = [...currentEmails, ...newEmails];
            await storage.updateUser(user.id, {
              emails: updatedEmails,
              phoneNumbers: newPhones
            });
          }
        } catch (error) {
          console.error(`Error processing user ${user.id}:`, error);
          errors.push({
            userId: user.id,
            name: `${user.firstName} ${user.lastName}`,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.setHeader('X-Route-Source', 'admin-routes');
      res.json({
        message: `Contact data cleanup completed. ${results.length} changes made, ${errors.length} errors.`,
        results,
        errors,
        totalUsers: allUsers.length
      });

    } catch (error) {
      console.error('Contact data cleanup error:', error);
      res.status(500).json({ message: "Contact data cleanup failed", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
