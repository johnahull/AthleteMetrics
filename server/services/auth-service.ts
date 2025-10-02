/**
 * Authentication service handling login, logout, and user session management
 */

import bcrypt from "bcrypt";
import { z } from "zod";
import { BaseService } from "./base-service";
import type { User } from "@shared/schema";
import { AuthenticationError, AuthorizationError, NotFoundError } from "../utils/errors";
import { sanitizeUser } from "../utils/transformers";

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

      this.logger.info('Login attempt', { username });

      if (!username || !password) {
        this.logger.security('Login failed - missing credentials', { username });
        return { success: false, error: "Username and password are required" };
      }

      // Get user by username or email
      let user = await this.storage.getUserByUsername(username);
      if (!user) {
        user = await this.storage.getUserByEmail(username);
      }

      if (!user) {
        this.logger.security('Login failed - user not found', { username });
        return { success: false, error: "Invalid credentials" };
      }

      // Check if user is active
      if (user.isActive === false) {
        this.logger.security('Login failed - account deactivated', {
          username,
          userId: user.id,
        });
        return { success: false, error: "Account is deactivated" };
      }

      // Handle invitation pending state
      if (user.password === "INVITATION_PENDING") {
        this.logger.security('Login failed - invitation pending', {
          username,
          userId: user.id,
        });
        return { success: false, error: "Please complete your registration first" };
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        this.logger.security('Login failed - invalid password', {
          username,
          userId: user.id,
        });
        return { success: false, error: "Invalid credentials" };
      }

      this.logger.audit('Login successful', {
        userId: user.id,
        username: user.username,
        isSiteAdmin: user.isSiteAdmin,
      });

      return { success: true, user };
    } catch (error) {
      this.logger.error('Login error', { username: credentials.username }, error as Error);
      return { success: false, error: "Login failed" };
    }
  }

  /**
   * Get user organizations for session context
   */
  async getUserOrganizations(userId: string) {
    try {
      return await this.executeQuery(
        'getUserOrganizations',
        () => this.storage.getUserOrganizations(userId),
        { userId }
      );
    } catch (error) {
      this.logger.error('Failed to get user organizations', { userId }, error as Error);
      return [];
    }
  }

  /**
   * Determine user's primary role and organization context
   */
  async determineUserRoleAndContext(user: any) {
    try {
      this.logger.info('Determining user role and context', { userId: user.id });

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
      this.logger.error('Failed to determine user role and context', { userId: user.id }, error as Error);
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
      this.logger.info('Starting impersonation', {
        adminUserId,
        targetUserId,
      });

      // Verify admin has site admin privileges
      const adminUser = await this.getOneOrFail(
        () => this.storage.getUser(adminUserId),
        'Admin user'
      );

      if (adminUser.isSiteAdmin !== true) {
        this.logger.security('Impersonation denied - not site admin', {
          adminUserId,
          targetUserId,
        });
        throw new AuthorizationError("Only site administrators can impersonate users");
      }

      // Get target user
      const targetUser = await this.getOneOrFail(
        () => this.storage.getUser(targetUserId),
        'Target user'
      );

      if (targetUser.isActive === false) {
        throw new AuthenticationError("Cannot impersonate inactive user");
      }

      this.logger.audit('Impersonation started', {
        adminUserId,
        targetUserId,
        targetUsername: targetUser.username,
      });

      return targetUser;
    } catch (error) {
      this.handleError(error, 'startImpersonation');
    }
  }

  /**
   * Validate session user exists and is active
   */
  async validateSessionUser(userId: string): Promise<User | null> {
    try {
      const user = await this.storage.getUser(userId);
      if (!user) {
        this.logger.security('Session validation failed - user not found', { userId });
        return null;
      }

      if (user.isActive === false) {
        this.logger.security('Session validation failed - user inactive', {
          userId,
          username: user.username,
        });
        return null;
      }

      return user;
    } catch (error) {
      this.logger.error('Session validation error', { userId }, error as Error);
      return null;
    }
  }
}