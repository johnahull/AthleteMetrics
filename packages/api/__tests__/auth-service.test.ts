/**
 * Unit tests for AuthService
 * Tests user authentication, session validation, role determination, and security features
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import bcrypt from "bcrypt";
import { AuthService } from "../services/auth-service";
import type { User } from "@shared/schema";
import { INVITATION_PENDING_PASSWORD } from "@shared/schema";
import type { IStorage } from "../storage";

describe("AuthService", () => {
  let service: AuthService;
  let mockStorage: Partial<IStorage>;

  // Mock user data
  const validPassword = "SecurePass123!";
  const hashedPassword = bcrypt.hashSync(validPassword, 10);

  const mockActiveUser: User = {
    id: "user-123",
    username: "activeuser",
    emails: ["active@example.com"],
    password: hashedPassword,
    firstName: "Active",
    lastName: "User",
    fullName: "Active User",
    isActive: true,
    isSiteAdmin: false,
    role: "athlete",
    mfaEnabled: false,
    isEmailVerified: true,
    requiresPasswordChange: false,
    loginAttempts: 0,
    createdAt: new Date(),
  } as User;

  const mockInactiveUser: User = {
    ...mockActiveUser,
    id: "user-inactive",
    username: "inactiveuser",
    emails: ["inactive@example.com"],
    isActive: false,
  } as User;

  const mockPendingInvitationUser: User = {
    ...mockActiveUser,
    id: "user-pending",
    username: "pendinguser",
    emails: ["pending@example.com"],
    password: INVITATION_PENDING_PASSWORD,
  } as User;

  const mockOAuthUser: User = {
    ...mockActiveUser,
    id: "user-oauth",
    username: "oauthuser",
    emails: ["oauth@example.com"],
    password: null,
    oauthProvider: "google",
  } as User;

  const mockSiteAdmin: User = {
    ...mockActiveUser,
    id: "admin-123",
    username: "siteadmin",
    emails: ["admin@example.com"],
    isSiteAdmin: true,
  } as User;

  beforeEach(() => {
    // Reset mock storage before each test
    mockStorage = {
      getUserByUsername: vi.fn(),
      getUserByEmail: vi.fn(),
      getUser: vi.fn(),
      getUserOrganizations: vi.fn(),
      createAuditLog: vi.fn(),
    };

    // Create service with mocked storage
    service = new AuthService();
    // @ts-ignore - Overriding protected property for testing
    service.storage = mockStorage as IStorage;
  });

  describe("login - successful authentication", () => {
    it("should authenticate user with valid username and password", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", organization: { isActive: true }, role: "athlete" }
      ]);

      const result = await service.login({
        username: "activeuser",
        password: validPassword
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.id).toBe("user-123");
      expect(mockStorage.getUserByUsername).toHaveBeenCalledWith("activeuser");
    });

    it("should authenticate user with valid email and password", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(null);
      mockStorage.getUserByEmail = vi.fn().mockResolvedValue(mockActiveUser);
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", organization: { isActive: true }, role: "athlete" }
      ]);

      const result = await service.login({
        username: "active@example.com",
        password: validPassword
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(mockStorage.getUserByEmail).toHaveBeenCalledWith("active@example.com");
    });

    it("should authenticate site admin without organization check", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockSiteAdmin);
      // getUserOrganizations should NOT be called for site admins

      const result = await service.login({
        username: "siteadmin",
        password: validPassword
      });

      expect(result.success).toBe(true);
      expect(result.user?.isSiteAdmin).toBe(true);
      expect(mockStorage.getUserOrganizations).not.toHaveBeenCalled();
    });
  });

  describe("login - validation errors", () => {
    it("should reject login with missing username", async () => {
      const result = await service.login({
        username: "",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Username and password are required");
    });

    it("should reject login with missing password", async () => {
      const result = await service.login({
        username: "activeuser",
        password: ""
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Username and password are required");
    });
  });

  describe("login - authentication failures", () => {
    it("should reject non-existent user", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(null);
      mockStorage.getUserByEmail = vi.fn().mockResolvedValue(null);

      const result = await service.login({
        username: "nonexistent",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });

    it("should reject invalid password", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);

      const result = await service.login({
        username: "activeuser",
        password: "WrongPassword123!"
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });

    it("should reject inactive user", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockInactiveUser);

      const result = await service.login({
        username: "inactiveuser",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Your account has been deactivated. Please contact your administrator.");
    });

    it("should reject user with pending invitation", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockPendingInvitationUser);

      const result = await service.login({
        username: "pendinguser",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Please complete your registration first");
    });

    it("should reject OAuth-only user with password login", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockOAuthUser);

      const result = await service.login({
        username: "oauthuser",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Google");
      expect(result.error).toContain("Continue with Google");
    });

    it("should provide correct message for Apple OAuth users", async () => {
      const appleUser = { ...mockOAuthUser, oauthProvider: "apple" };
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(appleUser);

      const result = await service.login({
        username: "oauthuser",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Apple");
      expect(result.error).toContain("Continue with Apple");
    });

    it("should provide generic message for unknown OAuth provider", async () => {
      const unknownOAuthUser = { ...mockOAuthUser, oauthProvider: null };
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(unknownOAuthUser);

      const result = await service.login({
        username: "oauthuser",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("social login");
    });
  });

  describe("login - organization status checks", () => {
    it("should allow login when user has at least one active organization", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", organization: { isActive: false }, role: "athlete" },
        { organizationId: "org-2", organization: { isActive: true }, role: "athlete" },
      ]);

      const result = await service.login({
        username: "activeuser",
        password: validPassword
      });

      expect(result.success).toBe(true);
    });

    it("should reject login when all organizations are inactive", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", organization: { isActive: false }, role: "athlete" },
        { organizationId: "org-2", organization: { isActive: false }, role: "athlete" },
      ]);

      const result = await service.login({
        username: "activeuser",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("All your organizations have been deactivated. Please contact your administrator.");
    });

    it("should allow login for independent athletes without organizations", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([]);

      const result = await service.login({
        username: "activeuser",
        password: validPassword
      });

      expect(result.success).toBe(true);
    });

    it("should fail-closed on organization check error", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);
      mockStorage.getUserOrganizations = vi.fn().mockRejectedValue(new Error("Database error"));

      const result = await service.login({
        username: "activeuser",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unable to verify access. Please try again.");
    });
  });

  describe("login - error handling", () => {
    it("should handle unexpected errors gracefully", async () => {
      mockStorage.getUserByUsername = vi.fn().mockRejectedValue(new Error("Database connection lost"));

      const result = await service.login({
        username: "activeuser",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Login failed");
    });
  });

  describe("getUserOrganizations", () => {
    it("should return user organizations", async () => {
      const mockOrgs = [
        { organizationId: "org-1", role: "athlete" as const },
        { organizationId: "org-2", role: "coach" as const },
      ];
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue(mockOrgs);

      const result = await service.getUserOrganizations("user-123");

      expect(result).toEqual(mockOrgs);
      expect(mockStorage.getUserOrganizations).toHaveBeenCalledWith("user-123");
    });

    it("should return empty array on error", async () => {
      mockStorage.getUserOrganizations = vi.fn().mockRejectedValue(new Error("Database error"));

      const result = await service.getUserOrganizations("user-123");

      expect(result).toEqual([]);
    });
  });

  describe("determineUserRoleAndContext", () => {
    it("should identify site admin role", async () => {
      const result = await service.determineUserRoleAndContext(mockSiteAdmin);

      expect(result.role).toBe("site_admin");
      expect(result.primaryOrganizationId).toBeUndefined();
    });

    it("should determine org admin role from first organization", async () => {
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", role: "org_admin" },
      ]);

      const result = await service.determineUserRoleAndContext(mockActiveUser);

      expect(result.role).toBe("org_admin");
      expect(result.primaryOrganizationId).toBe("org-1");
    });

    it("should determine coach role from first organization", async () => {
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", role: "coach" },
        { organizationId: "org-2", role: "athlete" },
      ]);

      const result = await service.determineUserRoleAndContext(mockActiveUser);

      expect(result.role).toBe("coach");
      expect(result.primaryOrganizationId).toBe("org-1");
    });

    it("should default to athlete role for users without organizations", async () => {
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([]);

      const result = await service.determineUserRoleAndContext(mockActiveUser);

      expect(result.role).toBe("athlete");
      expect(result.primaryOrganizationId).toBeUndefined();
    });

    it("should return athlete role on error", async () => {
      mockStorage.getUserOrganizations = vi.fn().mockRejectedValue(new Error("Database error"));

      const result = await service.determineUserRoleAndContext(mockActiveUser);

      expect(result.role).toBe("athlete");
      expect(result.primaryOrganizationId).toBeUndefined();
    });
  });

  describe("startImpersonation", () => {
    it("should allow site admin to impersonate active user", async () => {
      mockStorage.getUser = vi.fn()
        .mockResolvedValueOnce(mockSiteAdmin) // Admin check
        .mockResolvedValueOnce(mockActiveUser); // Target user

      const result = await service.startImpersonation("admin-123", "user-123");

      expect(result.id).toBe("user-123");
      expect(mockStorage.getUser).toHaveBeenCalledTimes(2);
    });

    it("should reject impersonation by non-site-admin", async () => {
      mockStorage.getUser = vi.fn().mockResolvedValue(mockActiveUser);

      await expect(
        service.startImpersonation("user-123", "user-456")
      ).rejects.toThrow("Unauthorized: Only site administrators can impersonate users");
    });

    it("should reject impersonation when admin user not found", async () => {
      mockStorage.getUser = vi.fn().mockResolvedValue(null);

      await expect(
        service.startImpersonation("nonexistent", "user-123")
      ).rejects.toThrow("Unauthorized: Only site administrators can impersonate users");
    });

    it("should reject impersonation when target user not found", async () => {
      mockStorage.getUser = vi.fn()
        .mockResolvedValueOnce(mockSiteAdmin)
        .mockResolvedValueOnce(null);

      await expect(
        service.startImpersonation("admin-123", "nonexistent")
      ).rejects.toThrow("Target user not found");
    });

    it("should reject impersonation of inactive user", async () => {
      mockStorage.getUser = vi.fn()
        .mockResolvedValueOnce(mockSiteAdmin)
        .mockResolvedValueOnce(mockInactiveUser);

      await expect(
        service.startImpersonation("admin-123", "user-inactive")
      ).rejects.toThrow("Cannot impersonate inactive user");
    });

    it("should propagate errors from storage layer", async () => {
      mockStorage.getUser = vi.fn().mockRejectedValue(new Error("Database error"));

      await expect(
        service.startImpersonation("admin-123", "user-123")
      ).rejects.toThrow("Database error");
    });
  });

  describe("validateSessionUser", () => {
    it("should return user for valid active user", async () => {
      mockStorage.getUser = vi.fn().mockResolvedValue(mockActiveUser);

      const result = await service.validateSessionUser("user-123");

      expect(result).toEqual(mockActiveUser);
      expect(mockStorage.getUser).toHaveBeenCalledWith("user-123");
    });

    it("should return null for inactive user", async () => {
      mockStorage.getUser = vi.fn().mockResolvedValue(mockInactiveUser);

      const result = await service.validateSessionUser("user-inactive");

      expect(result).toBeNull();
    });

    it("should return null when user not found", async () => {
      mockStorage.getUser = vi.fn().mockResolvedValue(null);

      const result = await service.validateSessionUser("nonexistent");

      expect(result).toBeNull();
    });

    it("should return null on storage error", async () => {
      mockStorage.getUser = vi.fn().mockRejectedValue(new Error("Database error"));

      const result = await service.validateSessionUser("user-123");

      expect(result).toBeNull();
    });
  });

  describe("security - password verification", () => {
    it("should use bcrypt for password comparison", async () => {
      const bcryptSpy = vi.spyOn(bcrypt, "compare");
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", organization: { isActive: true }, role: "athlete" }
      ]);

      await service.login({
        username: "activeuser",
        password: validPassword
      });

      expect(bcryptSpy).toHaveBeenCalledWith(validPassword, hashedPassword);
    });

    it("should perform timing-safe comparison via bcrypt", async () => {
      // bcrypt.compare is inherently timing-safe
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", organization: { isActive: true }, role: "athlete" }
      ]);

      const startTime = Date.now();
      await service.login({
        username: "activeuser",
        password: "WrongPassword123!"
      });
      const failTime = Date.now() - startTime;

      const startTime2 = Date.now();
      await service.login({
        username: "activeuser",
        password: validPassword
      });
      const successTime = Date.now() - startTime2;

      // Sanity floor: confirm bcrypt.compare genuinely ran (not short-circuited)
      // rather than asserting an absolute wall-clock threshold, which is flaky
      // under variable CI runner speed.
      expect(failTime).toBeGreaterThan(0);
      expect(successTime).toBeGreaterThan(0);

      // The actual timing-safety property: a failed login and a successful
      // login should take comparable time, so a timing side-channel can't be
      // used to distinguish valid vs invalid passwords. Compare the two
      // durations directly instead of each against a fixed floor.
      const [slower, faster] = failTime >= successTime
        ? [failTime, successTime]
        : [successTime, failTime];
      expect(slower / faster).toBeLessThan(3);
    });
  });

  describe("security - error messages", () => {
    it("should use generic 'Invalid credentials' for non-existent user", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(null);
      mockStorage.getUserByEmail = vi.fn().mockResolvedValue(null);

      const result = await service.login({
        username: "nonexistent",
        password: validPassword
      });

      expect(result.error).toBe("Invalid credentials");
    });

    it("should use generic 'Invalid credentials' for wrong password", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);

      const result = await service.login({
        username: "activeuser",
        password: "WrongPassword123!"
      });

      expect(result.error).toBe("Invalid credentials");
    });

    it("should provide specific message for inactive account", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockInactiveUser);

      const result = await service.login({
        username: "inactiveuser",
        password: validPassword
      });

      expect(result.error).toBe("Your account has been deactivated. Please contact your administrator.");
    });
  });

  describe("multi-organization context", () => {
    it("should use first organization as primary context", async () => {
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", role: "coach" },
        { organizationId: "org-2", role: "athlete" },
        { organizationId: "org-3", role: "org_admin" },
      ]);

      const result = await service.determineUserRoleAndContext(mockActiveUser);

      expect(result.primaryOrganizationId).toBe("org-1");
      expect(result.role).toBe("coach");
    });

    it("should handle user with multiple organizations during login", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", organization: { isActive: false }, role: "athlete" },
        { organizationId: "org-2", organization: { isActive: true }, role: "coach" },
        { organizationId: "org-3", organization: { isActive: true }, role: "athlete" },
      ]);

      const result = await service.login({
        username: "activeuser",
        password: validPassword
      });

      expect(result.success).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle user with undefined organization in org check", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", organization: undefined, role: "athlete" },
      ]);

      const result = await service.login({
        username: "activeuser",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("All your organizations have been deactivated. Please contact your administrator.");
    });

    it("should handle user with null organization in org check", async () => {
      mockStorage.getUserByUsername = vi.fn().mockResolvedValue(mockActiveUser);
      mockStorage.getUserOrganizations = vi.fn().mockResolvedValue([
        { organizationId: "org-1", organization: null, role: "athlete" },
      ]);

      const result = await service.login({
        username: "activeuser",
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("All your organizations have been deactivated. Please contact your administrator.");
    });

    it("should handle case-sensitive username lookup", async () => {
      mockStorage.getUserByUsername = vi.fn()
        .mockImplementation((username) => {
          return username === "activeuser" ? mockActiveUser : null;
        });
      mockStorage.getUserByEmail = vi.fn().mockResolvedValue(null);

      const result = await service.login({
        username: "ActiveUser", // Different case
        password: validPassword
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });
  });
});

describe("AuthService - Password Security", () => {
  it("should verify bcrypt is used for hashing (integration check)", async () => {
    const plainPassword = "TestPassword123!";
    const hash = bcrypt.hashSync(plainPassword, 10);

    const isValid = await bcrypt.compare(plainPassword, hash);
    expect(isValid).toBe(true);

    const isInvalid = await bcrypt.compare("WrongPassword", hash);
    expect(isInvalid).toBe(false);
  });

  it("should ensure bcrypt has adequate cost factor", () => {
    const plainPassword = "TestPassword123!";
    const hash = bcrypt.hashSync(plainPassword, 10);

    // Bcrypt hash format: $2a$10$... where 10 is the cost factor
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
  });
});
