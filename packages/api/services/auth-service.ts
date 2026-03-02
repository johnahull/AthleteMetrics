/**
 * Authentication service handling login, logout, and user session management
 */

import bcrypt from "bcrypt";
import { z } from "zod";
import { BaseService } from "./base-service";
import type { User } from "@shared/schema";
import { INVITATION_PENDING_PASSWORD } from "@shared/schema";
import { db } from "../db";
import { parentAthleteLinks } from "@shared/schema/tables/coppa";
import { eq, and } from "drizzle-orm";

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

export class AuthService extends BaseService {
  /**
   * Authenticate user with username/password
   */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      const { username, password } = credentials;

      if (!username || !password) {
        return { success: false, error: "Username and password are required" };
      }

      // Get user by username or email
      let user = await this.storage.getUserByUsername(username);
      if (!user) {
        user = await this.storage.getUserByEmail(username);
      }

      if (!user) {
        return { success: false, error: "Invalid credentials" };
      }

      // Check if user is active
      if (user.isActive === false) {
        return { success: false, error: "Your account has been deactivated. Please contact your administrator." };
      }

      // Handle invitation pending state
      if (user.password === INVITATION_PENDING_PASSWORD) {
        return { success: false, error: "Please complete your registration first" };
      }

      // Handle OAuth-only users (password is null)
      if (user.password === null) {
        const provider = user.oauthProvider || "social login";
        return {
          success: false,
          error: `This account was created with ${provider === "google" ? "Google" : provider === "apple" ? "Apple" : "social login"}. Please use the ${provider === "google" ? "Continue with Google" : provider === "apple" ? "Continue with Apple" : "social login"} button below.`
        };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return { success: false, error: "Invalid credentials" };
      }

      // Check organization status for non-site-admin users
      // Note: Organization check happens after password verification, which already
      // provides timing attack mitigation via bcrypt's constant-time comparison.
      // The org check timing difference is negligible compared to bcrypt (~100ms),
      // and fail-closed behavior prevents access even on error.
      if (user.isSiteAdmin !== true) {
        try {
          const userOrganizations = await this.storage.getUserOrganizations(user.id);

          // If user has organizations, check if at least one is active
          if (userOrganizations && userOrganizations.length > 0) {
            const hasActiveOrganization = userOrganizations.some(
              (uo) => uo.organization?.isActive === true
            );

            if (!hasActiveOrganization) {
              // Log security event
              console.warn(`Login denied: User ${user.id} has no active organizations`);

              return {
                success: false,
                error: "All your organizations have been deactivated. Please contact your administrator."
              };
            }
          }
        } catch (orgCheckError) {
          console.error("AuthService.login: Error checking org status:", orgCheckError);

          // Fail-closed for security: deny access on any org check error
          return {
            success: false,
            error: "Unable to verify access. Please try again."
          };
        }
      }

      return { success: true, user };
    } catch (error) {
      console.error("AuthService.login:", error);
      return { success: false, error: "Login failed" };
    }
  }

  /**
   * Get user organizations for session context
   */
  async getUserOrganizations(userId: string) {
    try {
      return await this.storage.getUserOrganizations(userId);
    } catch (error) {
      console.error("AuthService.getUserOrganizations:", error);
      return [];
    }
  }

  /**
   * Determine user's primary role and organization context
   */
  async determineUserRoleAndContext(user: any) {
    try {
      // Check if user is site admin first
      if (user.isSiteAdmin === true) {
        return {
          role: "site_admin",
          primaryOrganizationId: undefined
        };
      }

      // Get user's organization memberships
      const organizations = await this.getUserOrganizations(user.id);

      if (organizations.length === 0) {
        // Check if user is a parent (has parentAthleteLinks with parentUserId = user.id)
        const parentLinks = await db
          .select({ id: parentAthleteLinks.id })
          .from(parentAthleteLinks)
          .where(and(
            eq(parentAthleteLinks.parentUserId, user.id),
            eq(parentAthleteLinks.isActive, true),
          ))
          .limit(1);

        if (parentLinks.length > 0) {
          return {
            role: "parent",
            primaryOrganizationId: undefined,
          };
        }

        return {
          role: "athlete", // Default for users with no organization memberships
          primaryOrganizationId: undefined
        };
      }

      // Use the first organization as primary (could be enhanced to use a "primary" flag)
      const primaryOrg = organizations[0];
      
      return {
        role: primaryOrg.role, // This should be "coach", "org_admin", or "athlete"
        primaryOrganizationId: primaryOrg.organizationId
      };
    } catch (error) {
      console.error("AuthService.determineUserRoleAndContext:", error);
      return {
        role: "athlete", // Safe fallback
        primaryOrganizationId: undefined
      };
    }
  }

  /**
   * Start impersonation session for admins
   */
  async startImpersonation(adminUserId: string, targetUserId: string): Promise<User> {
    try {
      // Verify admin has site admin privileges
      const adminUser = await this.storage.getUser(adminUserId);
      if (!adminUser || adminUser.isSiteAdmin !== true) {
        throw new Error("Unauthorized: Only site administrators can impersonate users");
      }

      // Get target user
      const targetUser = await this.storage.getUser(targetUserId);
      if (!targetUser) {
        throw new Error("Target user not found");
      }

      if (targetUser.isActive === false) {
        throw new Error("Cannot impersonate inactive user");
      }

      return targetUser;
    } catch (error) {
      console.error("AuthService.startImpersonation:", error);
      throw error;
    }
  }

  /**
   * Validate session user exists and is active
   */
  async validateSessionUser(userId: string): Promise<User | null> {
    try {
      const user = await this.storage.getUser(userId);
      if (!user || user.isActive === false) {
        return null;
      }
      return user;
    } catch (error) {
      console.error("AuthService.validateSessionUser:", error);
      return null;
    }
  }
}