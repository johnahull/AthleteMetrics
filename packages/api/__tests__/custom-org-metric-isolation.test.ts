/**
 * Custom Org Metrics - Multi-Tenant Isolation Tests
 *
 * Critical security tests to ensure users from one organization
 * cannot access custom metrics from another organization.
 *
 * Test Pattern:
 * 1. Setup two organizations (Org A and Org B)
 * 2. Create custom metrics in each organization
 * 3. Attempt cross-organization access (IDOR attacks)
 * 4. Verify access is denied (403 Forbidden)
 *
 * IDOR Protection:
 * - Admin A should NOT be able to read Org B's custom metrics
 * - Admin A should NOT be able to create metrics in Org B
 * - Admin A should NOT be able to update Org B's custom metrics
 * - Admin A should NOT be able to archive Org B's custom metrics
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db';
import { storage } from '../storage';
import { users, organizations, customOrgMetrics, userOrganizations } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import type { User, Organization, CustomOrgMetric } from '@shared/schema';
import bcrypt from 'bcrypt';
import { CustomOrgMetricService } from '../services/custom-org-metric-service';

describe('Custom Org Metrics - Multi-Tenant Isolation', () => {
  let orgA: Organization;
  let orgB: Organization;
  let adminA: User; // Org admin for Organization A
  let adminB: User; // Org admin for Organization B
  let metricA: CustomOrgMetric; // Custom metric in Org A
  let metricB: CustomOrgMetric; // Custom metric in Org B
  let customOrgMetricService: CustomOrgMetricService;

  beforeAll(async () => {
    customOrgMetricService = new CustomOrgMetricService();
    const timestamp = Date.now();

    // Create two separate organizations
    orgA = await storage.createOrganization({
      name: `Org A Test ${timestamp}`,
      isActive: true,
    });

    orgB = await storage.createOrganization({
      name: `Org B Test ${timestamp}`,
      isActive: true,
    });

    // Create org admins for each organization
    const hashedPassword = await bcrypt.hash('password123', 10);

    [adminA] = await db.insert(users).values({
      username: `admin_a_test_${timestamp}`,
      password: hashedPassword,
      role: 'org_admin',
      isSiteAdmin: false,
      isActive: true,
      firstName: 'Admin',
      lastName: 'A',
      fullName: 'Admin A',
    }).returning();

    [adminB] = await db.insert(users).values({
      username: `admin_b_test_${timestamp}`,
      password: hashedPassword,
      role: 'org_admin',
      isSiteAdmin: false,
      isActive: true,
      firstName: 'Admin',
      lastName: 'B',
      fullName: 'Admin B',
    }).returning();

    // Assign admins to their respective organizations
    await storage.addUserToOrganization(adminA.id, orgA.id, 'org_admin');
    await storage.addUserToOrganization(adminB.id, orgB.id, 'org_admin');

    // Create custom metrics in each organization
    metricA = await customOrgMetricService.create({
      organizationId: orgA.id,
      label: 'Custom Sprint A',
      unit: 's',
      metricType: 'lower_is_better',
      category: 'speed',
      description: 'Org A custom sprint test',
      validationMin: 0,
      validationMax: 10,
      decimalPrecision: 3,
      isDerived: false,
    }, adminA.id);

    metricB = await customOrgMetricService.create({
      organizationId: orgB.id,
      label: 'Custom Sprint B',
      unit: 's',
      metricType: 'lower_is_better',
      category: 'speed',
      description: 'Org B custom sprint test',
      validationMin: 0,
      validationMax: 10,
      decimalPrecision: 3,
      isDerived: false,
    }, adminB.id);
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(customOrgMetrics).where(
      and(
        eq(customOrgMetrics.organizationId, orgA.id)
      )
    );
    await db.delete(customOrgMetrics).where(
      and(
        eq(customOrgMetrics.organizationId, orgB.id)
      )
    );
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, adminA.id));
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, adminB.id));
    await db.delete(users).where(eq(users.id, adminA.id));
    await db.delete(users).where(eq(users.id, adminB.id));
    await db.delete(organizations).where(eq(organizations.id, orgA.id));
    await db.delete(organizations).where(eq(organizations.id, orgB.id));
  });

  describe('IDOR Prevention: Reading Custom Metrics', () => {
    it('should prevent Admin A from reading Org B metrics via getById', async () => {
      // Admin A attempts to read Org B's custom metric
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);

      // Admin A should NOT have access to Org B
      expect(hasAccessToOrgB).toBe(false);

      // Attempting to get Org B's metric should fail
      await expect(
        customOrgMetricService.getById(metricB.id, adminA.id)
      ).rejects.toThrow(); // Should throw authorization error
    });

    it('should prevent Admin A from listing Org B metrics', async () => {
      // Admin A attempts to list Org B's custom metrics
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);

      expect(hasAccessToOrgB).toBe(false);

      // Attempting to list Org B's metrics should fail
      await expect(
        customOrgMetricService.list(orgB.id, adminA.id)
      ).rejects.toThrow(); // Should throw authorization error
    });

    it('should allow Admin A to read Org A metrics', async () => {
      // Admin A should be able to read their own org's metrics
      const metric = await customOrgMetricService.getById(metricA.id, adminA.id);
      expect(metric).toBeDefined();
      expect(metric.organizationId).toBe(orgA.id);
    });

    it('should allow Admin A to list Org A metrics', async () => {
      // Admin A should be able to list their own org's metrics
      const metrics = await customOrgMetricService.list(orgA.id, adminA.id);
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics.every(m => m.organizationId === orgA.id)).toBe(true);
    });
  });

  describe('IDOR Prevention: Creating Custom Metrics', () => {
    it('should prevent Admin A from creating metrics in Org B', async () => {
      // Admin A attempts to create a metric in Org B
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);

      expect(hasAccessToOrgB).toBe(false);

      // Attempting to create a metric in Org B should fail
      await expect(
        customOrgMetricService.create({
          organizationId: orgB.id, // Attempting to create in Org B
          label: 'Malicious Metric',
          unit: 's',
          metricType: 'lower_is_better',
          category: 'speed',
          isDerived: false,
        }, adminA.id)
      ).rejects.toThrow(); // Should throw authorization error
    });

    it('should allow Admin A to create metrics in Org A', async () => {
      // Admin A should be able to create metrics in their own org
      const metric = await customOrgMetricService.create({
        organizationId: orgA.id,
        label: 'Valid Metric A',
        unit: 's',
        metricType: 'lower_is_better',
        category: 'speed',
        isDerived: false,
      }, adminA.id);

      expect(metric).toBeDefined();
      expect(metric.organizationId).toBe(orgA.id);

      // Cleanup
      await db.delete(customOrgMetrics).where(eq(customOrgMetrics.id, metric.id));
    });
  });

  describe('IDOR Prevention: Updating Custom Metrics', () => {
    it('should prevent Admin A from updating Org B metrics', async () => {
      // Admin A attempts to update Org B's metric
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);

      expect(hasAccessToOrgB).toBe(false);

      // Attempting to update Org B's metric should fail
      await expect(
        customOrgMetricService.update(
          metricB.id,
          {
            label: 'Hacked Metric',
            description: 'This should not work',
          },
          adminA.id
        )
      ).rejects.toThrow(); // Should throw authorization error
    });

    it('should allow Admin A to update Org A metrics', async () => {
      // Admin A should be able to update their own org's metrics
      const updated = await customOrgMetricService.update(
        metricA.id,
        {
          description: 'Updated description',
        },
        adminA.id
      );

      expect(updated).toBeDefined();
      expect(updated.description).toBe('Updated description');
      expect(updated.organizationId).toBe(orgA.id);
    });
  });

  describe('IDOR Prevention: Archiving Custom Metrics', () => {
    it('should prevent Admin A from archiving Org B metrics', async () => {
      // Admin A attempts to archive Org B's metric
      const userOrgs = await storage.getUserOrganizations(adminA.id);
      const hasAccessToOrgB = userOrgs.some(org => org.organizationId === orgB.id);

      expect(hasAccessToOrgB).toBe(false);

      // Attempting to archive Org B's metric should fail
      await expect(
        customOrgMetricService.archive(metricB.id, adminA.id)
      ).rejects.toThrow(); // Should throw authorization error
    });

    it('should allow Admin A to archive and restore Org A metrics', async () => {
      // Create a temporary metric for testing archive/restore
      const tempMetric = await customOrgMetricService.create({
        organizationId: orgA.id,
        label: 'Temp Metric for Archive',
        unit: 's',
        metricType: 'lower_is_better',
        category: 'speed',
        isDerived: false,
      }, adminA.id);

      // Admin A should be able to archive their own org's metrics
      const archived = await customOrgMetricService.archive(tempMetric.id, adminA.id);
      expect(archived.isActive).toBe(false);
      expect(archived.archivedAt).toBeDefined();

      // Admin A should be able to restore their own org's metrics
      const restored = await customOrgMetricService.restore(tempMetric.id, adminA.id);
      expect(restored.isActive).toBe(true);
      expect(restored.archivedAt).toBeNull();

      // Cleanup
      await db.delete(customOrgMetrics).where(eq(customOrgMetrics.id, tempMetric.id));
    });
  });

  describe('Code Namespacing Validation', () => {
    it('should generate org-scoped codes with ORG_{orgId}_ prefix', () => {
      // Verify that metrics have org-scoped codes
      expect(metricA.code).toMatch(new RegExp(`^ORG_${orgA.id}_`));
      expect(metricB.code).toMatch(new RegExp(`^ORG_${orgB.id}_`));

      // Codes should be different between orgs even with same label
      expect(metricA.code).not.toBe(metricB.code);
    });

    it('should prevent code collisions across organizations', async () => {
      // Both orgs create metrics with the same label
      const metricA2 = await customOrgMetricService.create({
        organizationId: orgA.id,
        label: 'Duplicate Label Test',
        unit: 's',
        metricType: 'lower_is_better',
        category: 'speed',
        isDerived: false,
      }, adminA.id);

      const metricB2 = await customOrgMetricService.create({
        organizationId: orgB.id,
        label: 'Duplicate Label Test', // Same label as Org A
        unit: 's',
        metricType: 'lower_is_better',
        category: 'speed',
        isDerived: false,
      }, adminB.id);

      // Codes should be different (org-scoped)
      expect(metricA2.code).not.toBe(metricB2.code);
      expect(metricA2.code).toContain(orgA.id);
      expect(metricB2.code).toContain(orgB.id);

      // Cleanup
      await db.delete(customOrgMetrics).where(eq(customOrgMetrics.id, metricA2.id));
      await db.delete(customOrgMetrics).where(eq(customOrgMetrics.id, metricB2.id));
    });
  });
});
