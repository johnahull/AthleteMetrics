/**
 * Integration tests for Events Feature Flag
 * Tests the eventsEnabled organization setting
 *
 * TDD Phase 0: RED - These tests define expected eventsEnabled behavior
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, userOrganizations } from "@shared/schema";
import { eq } from "drizzle-orm";

describe("Events Feature Flag", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_events_flag_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Events Flag Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create org admin
    const [admin] = await db.insert(users).values({
      emails: [`eventsadmin${testSuffix}@example.com`],
      username: `eventsadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Events",
      lastName: "Admin",
      fullName: "Events Admin",
      role: "org_admin",
      isActive: true,
    }).returning();
    testOrgAdminId = admin.id;

    await db.insert(userOrganizations).values({
      userId: testOrgAdminId,
      organizationId: testOrgId,
      role: "org_admin",
    });
  });

  afterAll(async () => {
    // Clean up in reverse dependency order
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe("Schema Defaults", () => {
    it("should have eventsEnabled default to false", async () => {
      const org = await storage.getOrganization(testOrgId);

      // Events should be disabled by default
      expect(org).toBeDefined();
      expect(org?.eventsEnabled).toBe(false);
    });

    it("should create new organization with eventsEnabled = false", async () => {
      const [newOrg] = await db.insert(organizations).values({
        name: `New Events Org${testSuffix}_2`,
        orgType: "high_school",
        isActive: true,
      }).returning();

      expect(newOrg.eventsEnabled).toBe(false);

      // Cleanup
      await db.delete(organizations).where(eq(organizations.id, newOrg.id));
    });
  });

  describe("Org Admin Settings Update", () => {
    it("should allow org admin to enable events", async () => {
      const updated = await storage.updateOrganization(testOrgId, {
        eventsEnabled: true
      });

      expect(updated.eventsEnabled).toBe(true);

      // Reset for other tests
      await storage.updateOrganization(testOrgId, { eventsEnabled: false });
    });

    it("should allow org admin to disable events", async () => {
      // First enable
      await storage.updateOrganization(testOrgId, { eventsEnabled: true });

      // Then disable
      const updated = await storage.updateOrganization(testOrgId, {
        eventsEnabled: false
      });

      expect(updated.eventsEnabled).toBe(false);
    });

    it("should persist eventsEnabled across queries", async () => {
      // Enable events
      await storage.updateOrganization(testOrgId, { eventsEnabled: true });

      // Query again
      const org = await storage.getOrganization(testOrgId);
      expect(org?.eventsEnabled).toBe(true);

      // Reset
      await storage.updateOrganization(testOrgId, { eventsEnabled: false });
    });
  });

  describe("Validation", () => {
    it("should reject null values for eventsEnabled", async () => {
      // NOT NULL constraint should prevent null values
      await expect(
        storage.updateOrganization(testOrgId, {
          eventsEnabled: null as any
        })
      ).rejects.toThrow();
    });
  });
});

describe("Events Feature Flag - API Route Protection", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_events_api_${timestamp}`;

  let testOrgId: string;
  let testOrgAdminId: string;

  beforeAll(async () => {
    // Create test organization with events disabled
    const [org] = await db.insert(organizations).values({
      name: `Events API Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
      // eventsEnabled defaults to false
    }).returning();
    testOrgId = org.id;

    // Create org admin
    const [admin] = await db.insert(users).values({
      emails: [`eventsapiadmin${testSuffix}@example.com`],
      username: `eventsapiadmin${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Events",
      lastName: "APIAdmin",
      fullName: "Events APIAdmin",
      role: "org_admin",
      isActive: true,
    }).returning();
    testOrgAdminId = admin.id;

    await db.insert(userOrganizations).values({
      userId: testOrgAdminId,
      organizationId: testOrgId,
      role: "org_admin",
    });
  });

  afterAll(async () => {
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe("eventsEnabled flag behavior", () => {
    it("should default to false for new organizations", async () => {
      const org = await storage.getOrganization(testOrgId);
      expect(org?.eventsEnabled).toBe(false);
    });

    it("should allow org admin to enable events via storage", async () => {
      // Enable events
      await storage.updateOrganization(testOrgId, { eventsEnabled: true });

      const org = await storage.getOrganization(testOrgId);
      expect(org?.eventsEnabled).toBe(true);

      // Reset
      await storage.updateOrganization(testOrgId, { eventsEnabled: false });
    });

    it("should allow org admin to disable events via storage", async () => {
      // First enable
      await storage.updateOrganization(testOrgId, { eventsEnabled: true });

      // Then disable
      await storage.updateOrganization(testOrgId, { eventsEnabled: false });

      const org = await storage.getOrganization(testOrgId);
      expect(org?.eventsEnabled).toBe(false);
    });
  });
});
