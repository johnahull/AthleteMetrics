/**
 * Authentication service handling login, logout, and user session management
 */

import bcrypt from "bcrypt";
import { z } from "zod";
import { BaseService } from "./base-service";
import type { User } from "@shared/schema";

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
        return { success: false, error: "Account is deactivated" };
      }

      // Handle invitation pending state
      if (user.password === "INVITATION_PENDING") {
        return { success: false, error: "Please complete your registration first" };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return { success: false, error: "Invalid credentials" };
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