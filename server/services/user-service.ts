/**
 * User management service handling CRUD operations and user administration
 */

import bcrypt from "bcrypt";
import { BaseService } from "./base-service";
import { insertUserSchema, updateProfileSchema, changePasswordSchema, createSiteAdminSchema } from "@shared/schema";
import type { User, InsertUser } from "@shared/schema";
import { z } from "zod";

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

export class UserService extends BaseService {
  /**
   * Create a new user
   */
  async createUser(userData: InsertUser, createdBy: string): Promise<User> {
    try {
      // Validate input
      const validatedData = insertUserSchema.parse(userData);

      // Hash password if provided
      if (validatedData.password && validatedData.password !== "INVITATION_PENDING") {
        validatedData.password = await bcrypt.hash(validatedData.password, 10);
      }

      const user = await this.storage.createUser(validatedData);
      return user;
    } catch (error) {
      console.error("UserService.createUser:", error);
      throw error;
    }
  }

  /**
   * Get users with filtering
   */
  async getUsers(filters: UserFilters = {}): Promise<User[]> {
    try {
      // Since storage.getUsers() doesn't accept filters, we get all users
      // and filter in memory. For production, this should be moved to storage layer.
      const allUsers = await this.storage.getUsers();
      return allUsers; // TODO: Implement filtering logic if needed
    } catch (error) {
      console.error("UserService.getUsers:", error);
      return [];
    }
  }

  /**
   * Get user by ID with organization access validation
   */
  async getUserById(userId: string, requestingUserId: string): Promise<User | null> {
    try {
      const user = await this.storage.getUser(userId);
      if (!user) return null;

      // Site admins can access any user
      const requestingUser = await this.storage.getUser(requestingUserId);
      if (requestingUser?.isSiteAdmin === true) {
        return user;
      }

      // Users can access their own profile
      if (userId === requestingUserId) {
        return user;
      }

      // Check if users share an organization
      const requestingUserOrgs = await this.getUserOrganizations(requestingUserId);
      const targetUserOrgs = await this.getUserOrganizations(userId);
      
      const sharedOrg = requestingUserOrgs.some(reqOrg => 
        targetUserOrgs.some(targetOrg => targetOrg.organizationId === reqOrg.organizationId)
      );

      return sharedOrg ? user : null;
    } catch (error) {
      console.error("UserService.getUserById:", error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, profileData: ProfileUpdateData): Promise<User> {
    try {
      const validatedData = updateProfileSchema.parse(profileData);
      return await this.storage.updateUser(userId, validatedData);
    } catch (error) {
      console.error("UserService.updateProfile:", error);
      throw error;
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
      changePasswordSchema.parse({ currentPassword, newPassword });

      // Get current user
      const user = await this.storage.getUser(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Verify current password (skip for invitation pending)
      if (user.password !== "INVITATION_PENDING") {
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
          throw new Error("Current password is incorrect");
        }
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      await this.storage.updateUserPassword(userId, hashedPassword);
    } catch (error) {
      console.error("UserService.changePassword:", error);
      throw error;
    }
  }

  /**
   * Update user role (admin only)
   */
  async updateUserRole(
    userId: string, 
    newRole: string, 
    requestingUserId: string
  ): Promise<User> {
    try {
      // Verify requesting user is admin
      const requestingUser = await this.storage.getUser(requestingUserId);
      if (!requestingUser?.isSiteAdmin) {
        throw new Error("Unauthorized: Only site administrators can update user roles");
      }

      // Update user role in organization context instead of user table
      // Since roles are organization-specific, this should be handled by OrganizationService
      throw new Error("Role updates should be handled through organization role management");
    } catch (error) {
      console.error("UserService.updateUserRole:", error);
      throw error;
    }
  }

  /**
   * Update user status (activate/deactivate)
   */
  async updateUserStatus(
    userId: string, 
    isActive: boolean, 
    requestingUserId: string
  ): Promise<User> {
    try {
      // Verify permissions
      const requestingUser = await this.storage.getUser(requestingUserId);
      if (!requestingUser?.isSiteAdmin) {
        throw new Error("Unauthorized: Only site administrators can update user status");
      }

      // Prevent self-deactivation
      if (userId === requestingUserId && !isActive) {
        throw new Error("Cannot deactivate your own account");
      }

      return await this.storage.updateUser(userId, { isActive: isActive ? "true" : "false" });
    } catch (error) {
      console.error("UserService.updateUserStatus:", error);
      throw error;
    }
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId: string, requestingUserId: string): Promise<void> {
    try {
      // Verify permissions
      const requestingUser = await this.storage.getUser(requestingUserId);
      if (!requestingUser?.isSiteAdmin) {
        throw new Error("Unauthorized: Only site administrators can delete users");
      }

      // Prevent self-deletion
      if (userId === requestingUserId) {
        throw new Error("Cannot delete your own account");
      }

      await this.storage.deleteUser(userId);
    } catch (error) {
      console.error("UserService.deleteUser:", error);
      throw error;
    }
  }

  /**
   * Get all site administrators
   */
  async getSiteAdmins(): Promise<User[]> {
    try {
      const allUsers = await this.storage.getUsers();
      return allUsers.filter(user => user.isSiteAdmin === true);
    } catch (error) {
      console.error("UserService.getSiteAdmins:", error);
      return [];
    }
  }

  /**
   * Create site administrator
   */
  async createSiteAdmin(adminData: any, requestingUserId: string): Promise<User> {
    try {
      // Verify permissions
      const requestingUser = await this.storage.getUser(requestingUserId);
      if (!requestingUser?.isSiteAdmin) {
        throw new Error("Unauthorized: Only site administrators can create site admins");
      }

      // Validate input
      const validatedData = createSiteAdminSchema.parse(adminData);

      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);

      const userData: InsertUser = {
        username: validatedData.username,
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        emails: [`${validatedData.username}@admin.local`], // Temporary email based on username
        password: hashedPassword,
        isSiteAdmin: true,
        isActive: "true"
      };

      return await this.storage.createUser(userData);
    } catch (error) {
      console.error("UserService.createSiteAdmin:", error);
      throw error;
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
      console.error("UserService.checkUsernameAvailability:", error);
      return false;
    }
  }

  /**
   * Get users by organization
   */
  async getUsersByOrganization(organizationId: string, requestingUserId: string): Promise<any[]> {
    try {
      // Verify requesting user has access to this organization
      const requestingUser = await this.storage.getUser(requestingUserId);

      // Site admins can access any organization
      if (requestingUser?.isSiteAdmin === true) {
        return await this.storage.getUsersByOrganization(organizationId);
      }

      // Check if user has access to this organization
      const userOrgs = await this.getUserOrganizations(requestingUserId);
      const hasAccess = userOrgs.some(org => org.organizationId === organizationId);

      if (!hasAccess) {
        throw new Error("Unauthorized: Access denied to this organization");
      }

      return await this.storage.getUsersByOrganization(organizationId);
    } catch (error) {
      console.error("UserService.getUsersByOrganization:", error);
      throw error;
    }
  }
}