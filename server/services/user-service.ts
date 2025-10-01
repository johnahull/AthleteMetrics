/**
 * User management service handling CRUD operations and user administration
 */

import bcrypt from "bcrypt";
import { BaseService } from "./base-service";
import { insertUserSchema, updateProfileSchema, changePasswordSchema, createSiteAdminSchema } from "@shared/schema";
import type { User, InsertUser } from "@shared/schema";
import { z } from "zod";
import { AuthenticationError, AuthorizationError, NotFoundError, ValidationError, ConflictError } from "../utils/errors";

export interface UserFilters {
  organizationId?: string;
  role?: string;
  isActive?: string;
  search?: string;
}

export interface ProfileUpdateData {
  firstName?: string;
  lastName?: string;
  emails?: string[];
  phoneNumbers?: string[];
  school?: string;
  graduationYear?: number;
  birthDate?: string;
  gender?: string;
  height?: number;
  weight?: number;
  sports?: string[];
  soccerPosition?: string;
}

export type SanitizedUser = Omit<User, 'password' | 'mfaSecret' | 'backupCodes'>;

export class UserService extends BaseService {
  /**
   * Create a new user
   */
  async createUser(userData: InsertUser, createdBy: string): Promise<SanitizedUser> {
    try {
      // Validate input
      const validatedData = insertUserSchema.parse(userData);

      this.logger.info('Creating new user', {
        userId: createdBy,
        username: validatedData.username,
        role: validatedData.role,
      });

      // Hash password if provided
      if (validatedData.password && validatedData.password !== "INVITATION_PENDING") {
        validatedData.password = await bcrypt.hash(validatedData.password, 10);
      }

      const user = await this.executeQuery(
        'createUser',
        () => this.storage.createUser(validatedData),
        { createdBy, username: validatedData.username }
      );

      this.logger.audit('User created', {
        userId: createdBy,
        targetUserId: user.id,
        username: user.username,
      });

      return this.sanitizeUser(user);
    } catch (error) {
      this.handleError(error, 'createUser', createdBy);
    }
  }

  /**
   * Get users with filtering
   */
  async getUsers(filters: UserFilters = {}): Promise<SanitizedUser[]> {
    try {
      const allUsers = await this.executeQuery(
        'getUsers',
        () => this.storage.getUsers(),
        filters
      );

      return this.sanitizeUsers(allUsers);
    } catch (error) {
      this.logger.error('Failed to get users', filters, error as Error);
      return [];
    }
  }

  /**
   * Get user by ID with organization access validation
   */
  async getUserById(userId: string, requestingUserId: string): Promise<SanitizedUser | null> {
    try {
      const user = await this.getOneOrFail(
        () => this.storage.getUser(userId),
        'User',
        userId
      );

      // Site admins can access any user
      if (await this.isSiteAdmin(requestingUserId)) {
        return this.sanitizeUser(user);
      }

      // Users can access their own profile
      if (userId === requestingUserId) {
        return this.sanitizeUser(user);
      }

      // Check if users share an organization
      const requestingUserOrgs = await this.getUserOrganizations(requestingUserId);
      const targetUserOrgs = await this.getUserOrganizations(userId);

      const sharedOrg = requestingUserOrgs.some(reqOrg =>
        targetUserOrgs.some(targetOrg => targetOrg.organizationId === reqOrg.organizationId)
      );

      if (!sharedOrg) {
        this.logger.security('Unauthorized user access attempt', {
          userId: requestingUserId,
          targetUserId: userId,
        });
        throw new AuthorizationError('Access denied to this user');
      }

      return this.sanitizeUser(user);
    } catch (error) {
      this.handleError(error, 'getUserById', requestingUserId);
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, profileData: ProfileUpdateData): Promise<SanitizedUser> {
    try {
      const validatedData = updateProfileSchema.parse(profileData);

      this.logger.info('Updating user profile', { userId });

      const user = await this.executeQuery(
        'updateUserProfile',
        () => this.storage.updateUser(userId, validatedData),
        { userId }
      );

      this.logger.audit('User profile updated', { userId });

      return this.sanitizeUser(user);
    } catch (error) {
      this.handleError(error, 'updateProfile', userId);
    }
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      // Validate new password
      changePasswordSchema.parse({ currentPassword, newPassword, confirmPassword: newPassword });

      // Get current user
      const user = await this.getOneOrFail(
        () => this.storage.getUser(userId),
        'User',
        userId
      );

      // Verify current password (skip for invitation pending)
      if (user.password !== "INVITATION_PENDING") {
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
          throw new AuthenticationError("Current password is incorrect");
        }
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await this.executeQuery(
        'updateUserPassword',
        () => this.storage.updateUserPassword(userId, hashedPassword),
        { userId }
      );

      this.logger.audit('User password changed', { userId });
    } catch (error) {
      this.handleError(error, 'changePassword', userId);
    }
  }

  /**
   * Update user status (activate/deactivate)
   */
  async updateUserStatus(
    userId: string,
    isActive: boolean,
    requestingUserId: string
  ): Promise<SanitizedUser> {
    try {
      // Verify permissions
      await this.requireSiteAdmin(requestingUserId);

      // Prevent self-deactivation
      if (userId === requestingUserId && !isActive) {
        throw new ValidationError("Cannot deactivate your own account");
      }

      this.logger.info('Updating user status', {
        userId: requestingUserId,
        targetUserId: userId,
        isActive,
      });

      const user = await this.executeQuery(
        'updateUserStatus',
        () => this.storage.updateUser(userId, { isActive: isActive ? "true" : "false" }),
        { userId, isActive }
      );

      this.logger.audit('User status updated', {
        userId: requestingUserId,
        targetUserId: userId,
        isActive,
      });

      return this.sanitizeUser(user);
    } catch (error) {
      this.handleError(error, 'updateUserStatus', requestingUserId);
    }
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId: string, requestingUserId: string): Promise<void> {
    try {
      // Verify permissions
      await this.requireSiteAdmin(requestingUserId);

      // Prevent self-deletion
      if (userId === requestingUserId) {
        throw new ValidationError("Cannot delete your own account");
      }

      this.logger.warn('Deleting user', {
        userId: requestingUserId,
        targetUserId: userId,
      });

      await this.executeQuery(
        'deleteUser',
        () => this.storage.deleteUser(userId),
        { userId }
      );

      this.logger.audit('User deleted', {
        userId: requestingUserId,
        targetUserId: userId,
      });
    } catch (error) {
      this.handleError(error, 'deleteUser', requestingUserId);
    }
  }

  /**
   * Create site administrator
   */
  async createSiteAdmin(adminData: any, requestingUserId: string): Promise<SanitizedUser> {
    try {
      // Verify permissions
      await this.requireSiteAdmin(requestingUserId);

      // Validate input
      const validatedData = createSiteAdminSchema.parse(adminData);

      this.logger.info('Creating site admin', {
        userId: requestingUserId,
        username: validatedData.username,
      });

      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);

      const userData: InsertUser = {
        username: validatedData.username,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        emails: [`${validatedData.username}@admin.local`],
        password: hashedPassword,
        role: "site_admin",
        isSiteAdmin: "true",
        isActive: "true"
      };

      const user = await this.executeQuery(
        'createSiteAdmin',
        () => this.storage.createUser(userData),
        { createdBy: requestingUserId, username: userData.username }
      );

      this.logger.audit('Site admin created', {
        userId: requestingUserId,
        targetUserId: user.id,
        username: user.username,
      });

      return this.sanitizeUser(user);
    } catch (error) {
      this.handleError(error, 'createSiteAdmin', requestingUserId);
    }
  }

  /**
   * Check if username is available
   */
  async checkUsernameAvailability(username: string): Promise<boolean> {
    try {
      const existingUser = await this.storage.getUserByUsername(username);
      return !existingUser;
    } catch (error) {
      this.logger.error('Failed to check username availability', { username }, error as Error);
      return false;
    }
  }
}