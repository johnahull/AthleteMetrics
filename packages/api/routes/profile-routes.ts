/**
 * Profile and user management routes
 * Extracted from routes.ts for better maintainability
 */

import type { Express } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { eq, and, or, isNull, ne, sql } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { isSiteAdmin } from "@shared/auth-utils";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { updateProfileSchema, changePasswordSchema, completeProfileSchema, userOrganizations, users, sessions } from "@shared/schema";
import { parentAthleteLinks } from "@shared/schema/tables/coppa";
import { isUnder13, isMinorAge, isTeenMinor } from "@shared/coppa-utils";
import { isPlaceholderEmail } from "@shared/email-utils";
import { getMissingProfileFields } from "../services/profile-completion";
import { coppaService } from "../services/coppa-service";
import { emailService } from "../services/email-service";
import { availabilityCheckLimiter } from "./registration-routes";
import type { OnboardingStatusResponse } from "@shared/schema/types";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import { handleParentEmailUpdate } from "../services/parent-link-helper";

// Rate limiting for username check endpoint to prevent enumeration attacks
const usernameCheckLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.USERNAME_CHECK,
  message: { message: "Too many username checks, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

export function registerProfileRoutes(app: Express) {
  /**
   * Get user profile information
   */
  app.get("/api/users/:id/profile", requireAuth, async (req, res) => {
    try {
      const { id: userId } = req.params;
      const currentUser = req.session.user;

      // Check if user has access (site admin, org admin, or viewing own profile)
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin && currentUser?.id !== userId) {
        // Check if current user is an org admin in any shared organization
        const userOrgs = await storage.getUserOrganizations(userId);
        const currentUserOrgs = await storage.getUserOrganizations(currentUser?.id || "");

        const hasSharedOrg = userOrgs.some(userOrg =>
          currentUserOrgs.some(currentUserOrg =>
            currentUserOrg.organizationId === userOrg.organizationId &&
            currentUserOrg.role === "org_admin"
          )
        );

        if (!hasSharedOrg) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // Get user information
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get user's organizations and roles
      const userOrgs = await storage.getUserOrganizations(userId);
      const organizations = await Promise.all(
        userOrgs.map(async (userOrg) => {
          const org = await storage.getOrganization(userOrg.organizationId);
          return {
            id: org?.id,
            name: org?.name,
            role: userOrg.role
          };
        })
      );

      // Determine user role
      let userRole = "athlete";
      if (user.isSiteAdmin === true) {
        userRole = "site_admin";
      } else if (userOrgs && userOrgs.length > 0) {
        // Use the first organization role (users should only have one role per org)
        userRole = userOrgs[0].role;
      }

      const userProfile = {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        emails: user.emails,
        role: userRole,
        organizations: organizations.filter(org => org.id && org.name)
      };

      res.json(userProfile);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Get all site admins
   */
  app.get("/api/site-admins", requireSiteAdmin, async (req, res) => {
    try {
      const siteAdmins = await storage.getSiteAdminUsers();
      res.json(siteAdmins);
    } catch (error) {
      console.error("Error fetching site admins:", error);
      res.status(500).json({ message: "Failed to fetch site admins" });
    }
  });

  /**
   * Toggle user active/inactive status (site admin only)
   */
  app.put("/api/users/:id/status", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const currentUser = req.session.user;

      // Only site admins can activate/deactivate users
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      if (!userIsSiteAdmin) {
        return res.status(403).json({ message: "Access denied. Only site administrators can activate/deactivate users." });
      }

      // Cannot deactivate self
      if (currentUser?.id === id) {
        return res.status(400).json({ message: "You cannot deactivate your own account." });
      }

      // Update user status
      const user = await storage.updateUser(id, { isActive: isActive ? true : false });

      res.json({
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        user
      });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  /**
   * Check if username is available
   * Rate limited to prevent username enumeration attacks
   */
  app.get("/api/users/check-username", usernameCheckLimiter, async (req, res) => {
    try {
      const { username } = req.query;

      if (!username || typeof username !== 'string') {
        return res.status(400).json({ message: "Username is required" });
      }

      const existingUser = await storage.getUserByUsername(username);

      res.json({
        available: !existingUser,
        username: username
      });
    } catch (error) {
      console.error("Error checking username:", error);
      res.status(500).json({ message: "Failed to check username availability" });
    }
  });

  /**
   * Interface for role violation reporting
   */
  interface RoleViolation {
    userId: string;
    userName: string;
    email: string;
    violations: string[];
  }

  /**
   * Interface for role fix reporting
   */
  interface RoleFix {
    userId: string;
    organizationId: string;
    keptRole: string;
    removedRoles: string[];
  }

  /**
   * Verify single role constraint (Site Admin only)
   */
  app.get("/api/admin/verify-roles", requireSiteAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      const violations: RoleViolation[] = [];
      const fixes: RoleFix[] = [];

      for (const user of users) {
        if (user.isSiteAdmin === true) continue; // Skip site admins

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
            // Find any removed roles for this org (duplicates that were deleted)
            const removedRoles = userOrgRelations
              .filter(r => r.organizationId === orgId && r.role !== role)
              .map(r => r.role);
            fixes.push({
              userId: user.id,
              organizationId: orgId,
              keptRole: role,
              removedRoles
            });
          }
        }
      }

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
   * Delete user
   * Only site admins can delete users (except themselves)
   */
  app.delete("/api/users/:id", requireSiteAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.session.user;

      // Prevent site admins from deleting themselves
      if (currentUser?.id === id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      await storage.deleteUser(id);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  /**
   * Update current user profile
   */
  app.put("/api/profile", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      // Handle old admin system
      if (req.session.admin && !currentUser) {
        return res.status(400).json({ message: "Profile updates not available for legacy admin account. Please use the new user system." });
      }

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const profileData = updateProfileSchema.parse(req.body);
      const updatedUser = await storage.updateUser(currentUser.id, profileData);

      // Handle parentEmail: create parentAthleteLinks row for minor athletes
      if (profileData.parentEmail !== undefined) {
        const athleteOrgs = await storage.getUserOrganizations(currentUser.id);
        const orgId = athleteOrgs[0]?.organizationId ?? null;
        await handleParentEmailUpdate(
          currentUser.id,
          profileData.parentEmail,
          updatedUser,
          orgId,
        );
      }

      // Update session with new data
      if (req.session.user) {
        req.session.user = {
          ...req.session.user,
          email: updatedUser.emails?.[0] || `${updatedUser.username}@temp.local`,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
        };
      }

      res.json({
        id: updatedUser.id,
        email: updatedUser.emails?.[0] || `${updatedUser.username}@temp.local`,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error updating profile:", error);
        res.status(500).json({ message: "Failed to update profile" });
      }
    }
  });

  /**
   * Get onboarding status for current user
   */
  app.get("/api/profile/onboarding-status", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const dbUser = await storage.getUser(currentUser.id);
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Note: Role information is not included in this response because
      // the frontend already has user.role from the auth session context.
      // This endpoint only provides onboarding-specific flags.
      const response: OnboardingStatusResponse = {
        hasCompletedOnboarding: dbUser.hasCompletedOnboarding ?? false,
        isSiteAdmin: dbUser.isSiteAdmin ?? false,
      };
      res.json(response);
    } catch (error) {
      console.error("Error fetching onboarding status:", error);
      res.status(500).json({ message: "Failed to fetch onboarding status" });
    }
  });

  /**
   * Update onboarding status for current user
   */
  app.put("/api/profile/onboarding-status", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Validate request body with Zod
      const onboardingStatusSchema = z.object({
        completed: z.boolean()
      });

      const parseResult = onboardingStatusSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: "Invalid request body",
          errors: parseResult.error.errors
        });
      }

      const { completed } = parseResult.data;

      await storage.updateUser(currentUser.id, {
        hasCompletedOnboarding: completed,
      });

      res.json({
        hasCompletedOnboarding: completed,
        message: completed ? "Onboarding marked as completed" : "Onboarding status reset",
      });
    } catch (error) {
      console.error("Error updating onboarding status:", error);
      res.status(500).json({ message: "Failed to update onboarding status" });
    }
  });

  /**
   * Change password for current user
   */
  app.put("/api/profile/password", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;

      // Handle old admin system
      if (req.session.admin && !currentUser) {
        return res.status(400).json({ message: "Password changes not available for legacy admin account. Please use the new user system." });
      }

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const passwordData = changePasswordSchema.parse(req.body);

      // Get current user from database to check password
      const dbUser = await storage.getUser(currentUser.id);
      if (!dbUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password (OAuth users may not have password set)
      if (!dbUser.password) {
        return res.status(400).json({ message: "Cannot change password for OAuth-only accounts. Please set a password first." });
      }
      const isCurrentPasswordValid = await bcrypt.compare(passwordData.currentPassword, dbUser.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Update password
      await storage.updateUser(currentUser.id, { password: passwordData.newPassword });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Error changing password:", error);
        res.status(500).json({ message: "Failed to change password" });
      }
    }
  });

  /**
   * Complete the profile of an athlete who is missing a birthdate and/or a real email.
   * Status is always re-read from the DB (never the session cache). Fields that are not
   * missing are ignored. Under-13 athletes go to pending_consent and lose every session.
   */
  app.post("/api/profile/complete", availabilityCheckLimiter, requireAuth, async (req, res) => {
    const userId = req.session.user!.id;
    const parsed = completeProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
    }
    const body = parsed.data;
    const fail = (status: number, message: string, field?: string) =>
      ({ status, body: { message, ...(field ? { errors: [{ field, message }] } : {}) } });

    try {
      const outcome = await db.transaction(async (tx) => {
        // Row lock serialises parallel submits for the same user.
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
        if (!user) return fail(404, "User not found");
        const orgs = await tx.select({ role: userOrganizations.role, organizationId: userOrganizations.organizationId })
          .from(userOrganizations).where(eq(userOrganizations.userId, userId));
        const [link] = await tx.select({ id: parentAthleteLinks.id }).from(parentAthleteLinks)
          .where(and(eq(parentAthleteLinks.parentUserId, userId), eq(parentAthleteLinks.isActive, true))).limit(1);
        const missing = getMissingProfileFields(user, orgs, !!link);
        if (missing.length === 0) return fail(409, "Profile is already complete");

        const needDob = missing.includes("birthDate");
        const needEmail = missing.includes("email");
        const updates: Partial<typeof users.$inferInsert> = {};
        let under13 = false;
        let teen = false;
        let parentEmail: string | undefined;

        if (needEmail) {
          if (!body.email || isPlaceholderEmail(body.email)) return fail(400, "A valid email is required.", "email");
          const [taken] = await tx.select({ id: users.id }).from(users)
            .where(and(sql`${body.email} = ANY(${users.emails})`, ne(users.id, userId), isNull(users.deletedAt))).limit(1);
          if (taken) return fail(409, "That email is already in use.", "email");
          updates.emails = [body.email];
          updates.isEmailVerified = false;
        }

        if (needDob) {
          const dob = body.birthDate;
          if (!dob) return fail(400, "Birthdate is required.", "birthDate");
          const [y, m, d] = dob.split("-").map(Number);
          const probe = new Date(Date.UTC(y, m - 1, d));
          let minor = false;
          try {
            if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) throw new Error("not a calendar date");
            under13 = isUnder13(dob);
            minor = isMinorAge(dob);
            teen = isTeenMinor(dob);
          } catch {
            return fail(400, "Invalid date format or future date.", "birthDate");
          }
          const athleteEmail = updates.emails?.[0] ?? user.emails?.find((e) => !isPlaceholderEmail(e));
          parentEmail = body.parentEmail;
          if (under13 && !parentEmail) return fail(400, "Parent or guardian email is required for athletes under 13.", "parentEmail");
          if (parentEmail && parentEmail === athleteEmail) return fail(400, "Parent email must differ from the athlete's email.", "parentEmail");
          updates.birthDate = dob;
          updates.birthYear = y;
          updates.isMinor = minor;
          if (minor && parentEmail) updates.parentEmail = parentEmail;
          if (under13) updates.coppaStatus = "pending_consent";
        }

        // Conditional write: a concurrent session cannot overwrite a stored birthdate.
        const where = needDob ? and(eq(users.id, userId), isNull(users.birthDate)) : eq(users.id, userId);
        const written = await tx.update(users).set(updates).where(where).returning({ id: users.id });
        if (written.length === 0) return fail(409, "Profile is already complete");

        const athleteOrgId = orgs.find((o) => o.role === "athlete")?.organizationId ?? null;
        return { ok: true as const, user, updates, under13, teen, parentEmail, athleteOrgId, needEmail };
      });

      if (!("ok" in outcome)) return res.status(outcome.status).json(outcome.body);
      const { user, updates, under13, teen, parentEmail, athleteOrgId, needEmail } = outcome;

      await storage.createAuditLog({
        userId,
        action: "profile_completed",
        resourceType: "user",
        resourceId: userId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details: JSON.stringify({ birthDateSet: !!updates.birthDate, emailSet: needEmail, under13 }),
      });

      if (under13 && parentEmail) {
        const consent = await coppaService.initiateConsent({
          athleteUserId: userId,
          parentEmail,
          organizationId: athleteOrgId ?? undefined,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
        // Every session of this user ends, including the current one. sessions.user_id is only synced
        // on a session's first request after login, so also match on the stored session payload.
        await db.delete(sessions).where(or(eq(sessions.userId, userId), sql`${sessions.sess}->'user'->>'id' = ${userId}`));
        await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
        return res.status(200).json({
          success: true,
          requiresParentalConsent: true,
          message: consent.emailSent === false
            ? "Thanks. We could not send the consent email to your parent. Please ask them to visit the consent page directly, or try again later."
            : "Thanks. A consent email has been sent to your parent or guardian. You will be able to log in once they approve your account.",
        });
      }

      if (teen && parentEmail) {
        await handleParentEmailUpdate(userId, parentEmail, { firstName: user.firstName, birthDate: updates.birthDate as string }, athleteOrgId);
      }

      if (needEmail && updates.emails) {
        const newEmail = updates.emails[0];
        const { token } = await storage.createEmailVerificationToken(userId, newEmail);
        emailService.sendEmailVerification(newEmail, {
          userName: user.firstName,
          verificationLink: `${process.env.APP_URL}/verify-email?token=${token}`,
        }).catch((err: unknown) => console.error("[ProfileComplete] verification email failed:", err));
        req.session.user = { ...req.session.user!, email: newEmail, emailVerified: false };
      }
      req.session.profileCheck = { userId, missing: [] };

      return res.json({ success: true });
    } catch (error) {
      console.error("Error completing profile:", error);
      return res.status(500).json({ message: "Failed to complete profile" });
    }
  });

  console.log("✅ Profile routes registered");
}
