/**
 * Feature Flag Tests: customMetricsEnabled
 *
 * Tests for the site admin toggle that controls whether an organization
 * can access custom metrics features. When disabled, custom metric
 * creation, update, and listing should be blocked.
 *
 * Following TDD - these tests are written BEFORE implementation (RED phase).
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { db } from '../db';
import { organizations, users, userOrganizations, customOrgMetrics } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { CustomOrgMetricService } from '../services/custom-org-metric-service';

describe('Custom Metrics Feature Flag (customMetricsEnabled)', () => {
  let customMetricService: CustomOrgMetricService;
  let testOrgId: string;
  let testOrgIdDisabled: string;
  let siteAdminUserId: string;
  let orgAdminUserId: string;
  let disabledOrgAdminUserId: string;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety. Set ALLOW_TEST_DATABASE=true for known testing databases.');
    }
  });

  beforeEach(async () => {
    customMetricService = new CustomOrgMetricService();
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create organization WITH custom metrics enabled
    const [orgEnabled] = await db.insert(organizations).values({
      name: `Enabled Org ${uniqueSuffix}`,
      description: 'Organization with custom metrics enabled',
      customMetricsEnabled: true,
    }).returning();
    testOrgId = orgEnabled.id;

    // Create organization WITHOUT custom metrics enabled
    const [orgDisabled] = await db.insert(organizations).values({
      name: `Disabled Org ${uniqueSuffix}`,
      description: 'Organization with custom metrics disabled',
      customMetricsEnabled: false,
    }).returning();
    testOrgIdDisabled = orgDisabled.id;

    // Create site admin user
    const [siteAdmin] = await db.insert(users).values({
      username: `siteadmin_ff_${uniqueSuffix}`,
      emails: ['siteadmin.ff@example.com'],
      password: 'hashedpassword',
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
      isSiteAdmin: true,
    }).returning();
    siteAdminUserId = siteAdmin.id;

    // Create org admin for enabled org
    const [orgAdmin] = await db.insert(users).values({
      username: `orgadmin_ff_${uniqueSuffix}`,
      emails: ['orgadmin.ff@example.com'],
      password: 'hashedpassword',
      firstName: 'Org',
      lastName: 'Admin',
      fullName: 'Org Admin',
      isSiteAdmin: false,
    }).returning();
    orgAdminUserId = orgAdmin.id;

    await db.insert(userOrganizations).values({
      userId: orgAdminUserId,
      organizationId: testOrgId,
      role: 'org_admin',
    });

    // Create org admin for disabled org
    const [orgAdminDisabled] = await db.insert(users).values({
      username: `orgadmin_disabled_${uniqueSuffix}`,
      emails: ['orgadmin.disabled@example.com'],
      password: 'hashedpassword',
      firstName: 'Disabled',
      lastName: 'OrgAdmin',
      fullName: 'Disabled OrgAdmin',
      isSiteAdmin: false,
    }).returning();
    disabledOrgAdminUserId = orgAdminDisabled.id;

    await db.insert(userOrganizations).values({
      userId: disabledOrgAdminUserId,
      organizationId: testOrgIdDisabled,
      role: 'org_admin',
    });
  });

  afterEach(async () => {
    // Cleanup in reverse dependency order
    try {
      await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, testOrgId));
      await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, testOrgIdDisabled));
      await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
      await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgIdDisabled));
      await db.delete(users).where(eq(users.id, siteAdminUserId));
      await db.delete(users).where(eq(users.id, orgAdminUserId));
      await db.delete(users).where(eq(users.id, disabledOrgAdminUserId));
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
      await db.delete(organizations).where(eq(organizations.id, testOrgIdDisabled));
    } catch (error) {
      console.error('Test cleanup failed:', error);
    }
  });

  // ========================================================================
  // SITE ADMIN TOGGLE TESTS
  // ========================================================================

  describe('Site Admin Toggle', () => {
    it('should allow site admin to enable custom metrics for an organization', async () => {
      // Disable first
      await db.update(organizations)
        .set({ customMetricsEnabled: false })
        .where(eq(organizations.id, testOrgId));

      // Enable via service (to be implemented)
      // For now, we test the database update directly as a placeholder
      await db.update(organizations)
        .set({ customMetricsEnabled: true })
        .where(eq(organizations.id, testOrgId));

      const [org] = await db.select()
        .from(organizations)
        .where(eq(organizations.id, testOrgId));

      expect(org.customMetricsEnabled).toBe(true);
    });

    it('should allow site admin to disable custom metrics for an organization', async () => {
      // Enable first
      await db.update(organizations)
        .set({ customMetricsEnabled: true })
        .where(eq(organizations.id, testOrgId));

      // Disable via service (to be implemented)
      await db.update(organizations)
        .set({ customMetricsEnabled: false })
        .where(eq(organizations.id, testOrgId));

      const [org] = await db.select()
        .from(organizations)
        .where(eq(organizations.id, testOrgId));

      expect(org.customMetricsEnabled).toBe(false);
    });

    it('should default customMetricsEnabled to false for new organizations', async () => {
      const uniqueSuffix = `${Date.now()}-default-test`;
      const [newOrg] = await db.insert(organizations).values({
        name: `Default Test Org ${uniqueSuffix}`,
        description: 'Testing default value',
        // customMetricsEnabled not specified - should default to false
      }).returning();

      try {
        expect(newOrg.customMetricsEnabled).toBe(false);
      } finally {
        // Cleanup
        await db.delete(organizations).where(eq(organizations.id, newOrg.id));
      }
    });
  });

  // ========================================================================
  // FEATURE FLAG ENFORCEMENT TESTS
  // ========================================================================

  describe('Feature Flag Enforcement', () => {
    it('should allow creating custom metrics when feature is enabled', async () => {
      const metric = await customMetricService.createCustomOrgMetric(
        testOrgId,
        {
          label: 'Enabled Org Metric',
          unit: 's',
          metricType: 'lower_is_better',
        },
        orgAdminUserId
      );

      expect(metric).toBeDefined();
      expect(metric.label).toBe('Enabled Org Metric');
    });

    it('should reject creating custom metrics when feature is disabled', async () => {
      await expect(
        customMetricService.createCustomOrgMetric(
          testOrgIdDisabled,
          {
            label: 'Disabled Org Metric',
            unit: 's',
            metricType: 'lower_is_better',
          },
          disabledOrgAdminUserId
        )
      ).rejects.toThrow(/custom metrics.*not enabled|feature.*disabled/i);
    });

    it('should allow listing custom metrics when feature is enabled', async () => {
      // Create a metric first
      await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'List Test Metric', metricType: 'tracking' },
        orgAdminUserId
      );

      const metrics = await customMetricService.getCustomOrgMetrics(testOrgId, orgAdminUserId);

      expect(metrics).toBeDefined();
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should reject listing custom metrics when feature is disabled', async () => {
      await expect(
        customMetricService.getCustomOrgMetrics(testOrgIdDisabled, disabledOrgAdminUserId)
      ).rejects.toThrow(/custom metrics.*not enabled|feature.*disabled/i);
    });

    it('should allow updating custom metrics when feature is enabled', async () => {
      const metric = await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'Update Test', metricType: 'tracking' },
        orgAdminUserId
      );

      const updated = await customMetricService.updateCustomOrgMetric(
        testOrgId,
        metric.code,
        { label: 'Updated Label' },
        orgAdminUserId
      );

      expect(updated.label).toBe('Updated Label');
    });

    it('should reject updating custom metrics when feature is disabled', async () => {
      // First enable, create metric, then disable
      await db.update(organizations)
        .set({ customMetricsEnabled: true })
        .where(eq(organizations.id, testOrgIdDisabled));

      const metric = await customMetricService.createCustomOrgMetric(
        testOrgIdDisabled,
        { label: 'Disable After Create', metricType: 'tracking' },
        disabledOrgAdminUserId
      );

      // Now disable the feature
      await db.update(organizations)
        .set({ customMetricsEnabled: false })
        .where(eq(organizations.id, testOrgIdDisabled));

      await expect(
        customMetricService.updateCustomOrgMetric(
          testOrgIdDisabled,
          metric.code,
          { label: 'Should Fail' },
          disabledOrgAdminUserId
        )
      ).rejects.toThrow(/custom metrics.*not enabled|feature.*disabled/i);
    });

    it('should allow archiving custom metrics when feature is enabled', async () => {
      const metric = await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'Archive Test', metricType: 'tracking' },
        orgAdminUserId
      );

      await customMetricService.archiveCustomOrgMetric(testOrgId, metric.code, orgAdminUserId);

      const archived = await customMetricService.getCustomOrgMetric(testOrgId, metric.code, orgAdminUserId);
      expect(archived?.isActive).toBe(false);
    });

    it('should reject archiving custom metrics when feature is disabled', async () => {
      // First enable, create metric, then disable
      await db.update(organizations)
        .set({ customMetricsEnabled: true })
        .where(eq(organizations.id, testOrgIdDisabled));

      const metric = await customMetricService.createCustomOrgMetric(
        testOrgIdDisabled,
        { label: 'Disable Before Archive', metricType: 'tracking' },
        disabledOrgAdminUserId
      );

      // Now disable the feature
      await db.update(organizations)
        .set({ customMetricsEnabled: false })
        .where(eq(organizations.id, testOrgIdDisabled));

      await expect(
        customMetricService.archiveCustomOrgMetric(testOrgIdDisabled, metric.code, disabledOrgAdminUserId)
      ).rejects.toThrow(/custom metrics.*not enabled|feature.*disabled/i);
    });
  });

  // ========================================================================
  // SITE ADMIN BYPASS TESTS
  // ========================================================================

  describe('Site Admin Bypass', () => {
    it('should allow site admin to view custom metrics even when feature is disabled', async () => {
      // First enable, create metric, then disable
      await db.update(organizations)
        .set({ customMetricsEnabled: true })
        .where(eq(organizations.id, testOrgIdDisabled));

      await customMetricService.createCustomOrgMetric(
        testOrgIdDisabled,
        { label: 'Site Admin View Test', metricType: 'tracking' },
        disabledOrgAdminUserId
      );

      // Now disable the feature
      await db.update(organizations)
        .set({ customMetricsEnabled: false })
        .where(eq(organizations.id, testOrgIdDisabled));

      // Site admin should still be able to view
      const metrics = await customMetricService.getCustomOrgMetrics(testOrgIdDisabled, siteAdminUserId);

      expect(metrics).toBeDefined();
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // EXISTING METRICS PRESERVATION TESTS
  // ========================================================================

  describe('Existing Metrics Preservation', () => {
    it('should preserve existing custom metrics when feature is disabled', async () => {
      // Create metric while enabled
      await db.update(organizations)
        .set({ customMetricsEnabled: true })
        .where(eq(organizations.id, testOrgIdDisabled));

      const metric = await customMetricService.createCustomOrgMetric(
        testOrgIdDisabled,
        { label: 'Preserved Metric', metricType: 'tracking' },
        disabledOrgAdminUserId
      );

      // Disable the feature
      await db.update(organizations)
        .set({ customMetricsEnabled: false })
        .where(eq(organizations.id, testOrgIdDisabled));

      // Directly query database to verify metric still exists
      const [dbMetric] = await db.select()
        .from(customOrgMetrics)
        .where(eq(customOrgMetrics.code, metric.code));

      expect(dbMetric).toBeDefined();
      expect(dbMetric.label).toBe('Preserved Metric');
    });
  });
});
