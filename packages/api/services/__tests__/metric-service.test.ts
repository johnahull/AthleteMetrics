import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { MetricService } from '../metric-service';
import { db } from '../../db';
import { siteMetrics, organizationMetrics, organizations, users, measurements, auditLogs } from '@shared/schema';
import { eq, and, or } from 'drizzle-orm';

describe('MetricService', () => {
  let metricService: MetricService;
  let testOrgId: string;
  let siteAdminUserId: string;
  let orgAdminUserId: string;
  let regularUserId: string;
  let testMetricCode: string;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety. Running tests against production is forbidden. Set ALLOW_TEST_DATABASE=true for known testing databases.');
    }
  });

  beforeEach(async () => {
    metricService = new MetricService();

    // Create unique suffix to avoid race conditions
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Org ${uniqueSuffix}`,
      description: 'Test organization for metric service tests',
    }).returning();
    testOrgId = org.id;

    // Create site admin user
    const [siteAdmin] = await db.insert(users).values({
      username: `siteadmin${uniqueSuffix}`,
      emails: ['siteadmin@example.com'],
      password: 'hashedpassword',
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
      isSiteAdmin: true,
    }).returning();
    siteAdminUserId = siteAdmin.id;

    // Create org admin user
    const [orgAdmin] = await db.insert(users).values({
      username: `orgadmin${uniqueSuffix}`,
      emails: ['orgadmin@example.com'],
      password: 'hashedpassword',
      firstName: 'Org',
      lastName: 'Admin',
      fullName: 'Org Admin',
      isSiteAdmin: false,
    }).returning();
    orgAdminUserId = orgAdmin.id;

    // Create regular user
    const [regularUser] = await db.insert(users).values({
      username: `regular${uniqueSuffix}`,
      emails: ['regular@example.com'],
      password: 'hashedpassword',
      firstName: 'Regular',
      lastName: 'User',
      fullName: 'Regular User',
      isSiteAdmin: false,
    }).returning();
    regularUserId = regularUser.id;

    // Create a test metric
    testMetricCode = `TEST_METRIC_${uniqueSuffix.replace(/-/g, '_').toUpperCase()}`;
    await db.insert(siteMetrics).values({
      code: testMetricCode,
      label: 'Test Metric',
      category: 'test',
      unit: 's',
      lowerIsBetter: true,
      isSystemDefault: false,
      isActive: true,
      displayOrder: 100,
      description: 'Test metric for unit tests',
      decimalPrecision: 3,
      createdBy: siteAdminUserId,
    });
  });

  afterEach(async () => {
    // Cleanup: delete test data in reverse dependency order
    try {
      if (testMetricCode) {
        // Delete measurements first
        await db.delete(measurements).where(eq(measurements.metric, testMetricCode));
        // Delete organization metrics
        await db.delete(organizationMetrics).where(eq(organizationMetrics.metricCode, testMetricCode));
        // Delete site metric
        await db.delete(siteMetrics).where(eq(siteMetrics.code, testMetricCode));
      }
      // Delete audit logs before deleting users (foreign key constraint)
      if (siteAdminUserId || orgAdminUserId || regularUserId) {
        await db.delete(auditLogs).where(
          or(
            siteAdminUserId ? eq(auditLogs.userId, siteAdminUserId) : undefined,
            orgAdminUserId ? eq(auditLogs.userId, orgAdminUserId) : undefined,
            regularUserId ? eq(auditLogs.userId, regularUserId) : undefined
          )
        );
      }
      if (siteAdminUserId) {
        await db.delete(users).where(eq(users.id, siteAdminUserId));
      }
      if (orgAdminUserId) {
        await db.delete(users).where(eq(users.id, orgAdminUserId));
      }
      if (regularUserId) {
        await db.delete(users).where(eq(users.id, regularUserId));
      }
      if (testOrgId) {
        await db.delete(organizations).where(eq(organizations.id, testOrgId));
      }
    } catch (error) {
      console.error('Test cleanup failed:', error);
      throw error;
    }
  });

  // ========================================================================
  // SITE METRICS TESTS (Site Admin Only)
  // ========================================================================

  describe('getSiteMetrics', () => {
    it('should return all active site metrics', async () => {
      const metrics = await metricService.getSiteMetrics(siteAdminUserId);

      expect(metrics).toBeDefined();
      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBeGreaterThan(0);

      // Should include our test metric
      const testMetric = metrics.find(m => m.code === testMetricCode);
      expect(testMetric).toBeDefined();
      expect(testMetric?.label).toBe('Test Metric');
    });

    it('should return only active metrics by default for non-admin users', async () => {
      // Create an inactive metric
      const inactiveCode = `INACTIVE_${testMetricCode}`;
      await db.insert(siteMetrics).values({
        code: inactiveCode,
        label: 'Inactive Metric',
        category: 'test',
        unit: 's',
        lowerIsBetter: true,
        isSystemDefault: false,
        isActive: false,
        displayOrder: 101,
        createdBy: siteAdminUserId,
      });

      const metrics = await metricService.getSiteMetrics(regularUserId);

      // Should not include inactive metric
      const inactiveMetric = metrics.find(m => m.code === inactiveCode);
      expect(inactiveMetric).toBeUndefined();

      // Cleanup
      await db.delete(siteMetrics).where(eq(siteMetrics.code, inactiveCode));
    });

    it('should include inactive metrics when requested by site admin', async () => {
      // Create an inactive metric
      const inactiveCode = `INACTIVE_${testMetricCode}`;
      await db.insert(siteMetrics).values({
        code: inactiveCode,
        label: 'Inactive Metric',
        category: 'test',
        unit: 's',
        lowerIsBetter: true,
        isSystemDefault: false,
        isActive: false,
        displayOrder: 101,
        createdBy: siteAdminUserId,
      });

      const metrics = await metricService.getSiteMetrics(siteAdminUserId, { includeInactive: true });

      // Should include inactive metric
      const inactiveMetric = metrics.find(m => m.code === inactiveCode);
      expect(inactiveMetric).toBeDefined();

      // Cleanup
      await db.delete(siteMetrics).where(eq(siteMetrics.code, inactiveCode));
    });
  });

  describe('getSiteMetric', () => {
    it('should return a specific site metric by code', async () => {
      const metric = await metricService.getSiteMetric(testMetricCode);

      expect(metric).toBeDefined();
      expect(metric?.code).toBe(testMetricCode);
      expect(metric?.label).toBe('Test Metric');
      expect(metric?.category).toBe('test');
    });

    it('should return undefined for non-existent metric', async () => {
      const metric = await metricService.getSiteMetric('NON_EXISTENT_METRIC');

      expect(metric).toBeUndefined();
    });
  });

  describe('createSiteMetric', () => {
    it('should create a new site metric as site admin', async () => {
      const newCode = `NEW_METRIC_${Date.now()}`;
      const newMetric = await metricService.createSiteMetric(
        {
          code: newCode,
          label: 'New Test Metric',
          category: 'speed',
          unit: 'm/s',
          lowerIsBetter: false,
          isActive: true,
          displayOrder: 200,
          description: 'A new metric for testing',
          decimalPrecision: 2,
        },
        siteAdminUserId
      );

      expect(newMetric).toBeDefined();
      expect(newMetric.code).toBe(newCode);
      expect(newMetric.label).toBe('New Test Metric');
      expect(newMetric.createdBy).toBe(siteAdminUserId);

      // Cleanup
      await db.delete(siteMetrics).where(eq(siteMetrics.code, newCode));
    });

    it('should reject metric creation by non-site-admin', async () => {
      await expect(
        metricService.createSiteMetric(
          {
            code: 'UNAUTHORIZED_METRIC',
            label: 'Unauthorized',
            lowerIsBetter: true,
            isActive: true,
            decimalPrecision: 3,
          },
          regularUserId
        )
      ).rejects.toThrow('Unauthorized: Only site administrators can create metrics');
    });

    it('should reject duplicate metric codes', async () => {
      await expect(
        metricService.createSiteMetric(
          {
            code: testMetricCode, // Duplicate code
            label: 'Duplicate Metric',
            lowerIsBetter: true,
            isActive: true,
            decimalPrecision: 3,
          },
          siteAdminUserId
        )
      ).rejects.toThrow(`Metric with code ${testMetricCode} already exists`);
    });

    it('should validate metric code format', async () => {
      await expect(
        metricService.createSiteMetric(
          {
            code: 'invalid-code', // Lowercase and hyphen not allowed
            label: 'Invalid Code',
            lowerIsBetter: true,
            isActive: true,
            decimalPrecision: 3,
          },
          siteAdminUserId
        )
      ).rejects.toThrow();
    });
  });

  describe('updateSiteMetric', () => {
    it('should update a site metric as site admin', async () => {
      const updated = await metricService.updateSiteMetric(
        testMetricCode,
        {
          label: 'Updated Test Metric',
          description: 'Updated description',
        },
        siteAdminUserId
      );

      expect(updated).toBeDefined();
      expect(updated.label).toBe('Updated Test Metric');
      expect(updated.description).toBe('Updated description');
      expect(updated.updatedAt).toBeDefined();
    });

    it('should reject update by non-site-admin', async () => {
      await expect(
        metricService.updateSiteMetric(
          testMetricCode,
          { label: 'Unauthorized Update' },
          regularUserId
        )
      ).rejects.toThrow('Unauthorized: Only site administrators can update metrics');
    });

    it('should reject update of non-existent metric', async () => {
      await expect(
        metricService.updateSiteMetric(
          'NON_EXISTENT',
          { label: 'Update' },
          siteAdminUserId
        )
      ).rejects.toThrow();
    });
  });

  describe('toggleSiteMetricStatus', () => {
    it('should toggle metric to inactive as site admin', async () => {
      const updated = await metricService.toggleSiteMetricStatus(
        testMetricCode,
        false,
        siteAdminUserId
      );

      expect(updated).toBeDefined();
      expect(updated.isActive).toBe(false);
    });

    it('should toggle metric to active as site admin', async () => {
      // First set to inactive
      await metricService.toggleSiteMetricStatus(testMetricCode, false, siteAdminUserId);

      // Then toggle back to active
      const updated = await metricService.toggleSiteMetricStatus(
        testMetricCode,
        true,
        siteAdminUserId
      );

      expect(updated).toBeDefined();
      expect(updated.isActive).toBe(true);
    });

    it('should reject toggle by non-site-admin', async () => {
      await expect(
        metricService.toggleSiteMetricStatus(testMetricCode, false, regularUserId)
      ).rejects.toThrow('Unauthorized: Only site administrators can toggle metric status');
    });

    it('should prevent disabling system default metrics', async () => {
      // FLY10_TIME is a system default from migration
      await expect(
        metricService.toggleSiteMetricStatus('FLY10_TIME', false, siteAdminUserId)
      ).rejects.toThrow('Cannot disable system default metric: FLY10_TIME');
    });
  });

  describe('deleteSiteMetric', () => {
    it('should delete a metric without measurements as site admin', async () => {
      const deleteCode = `DELETE_ME_${Date.now()}`;
      await db.insert(siteMetrics).values({
        code: deleteCode,
        label: 'Delete Me',
        category: 'test',
        lowerIsBetter: true,
        isSystemDefault: false,
        isActive: true,
        decimalPrecision: 3,
        createdBy: siteAdminUserId,
      });

      await metricService.deleteSiteMetric(deleteCode, siteAdminUserId);

      // Verify deletion
      const deleted = await db.select()
        .from(siteMetrics)
        .where(eq(siteMetrics.code, deleteCode))
        .limit(1);
      expect(deleted.length).toBe(0);
    });

    it('should reject deletion by non-site-admin', async () => {
      await expect(
        metricService.deleteSiteMetric(testMetricCode, regularUserId)
      ).rejects.toThrow('Unauthorized: Only site administrators can delete metrics');
    });

    it('should prevent deletion of system default metrics', async () => {
      await expect(
        metricService.deleteSiteMetric('FLY10_TIME', siteAdminUserId)
      ).rejects.toThrow('Cannot delete system default metric: FLY10_TIME');
    });

    it('should prevent deletion of metrics with measurement data', async () => {
      // Create a measurement with this metric
      await db.insert(measurements).values({
        userId: regularUserId,
        submittedBy: siteAdminUserId,
        date: '2025-01-01',
        age: 20,
        metric: testMetricCode,
        value: '10.5',
        units: 's',
      });

      await expect(
        metricService.deleteSiteMetric(testMetricCode, siteAdminUserId)
      ).rejects.toThrow(/Cannot delete metric .* measurement\(s\) exist/);

      // Cleanup measurement
      await db.delete(measurements).where(eq(measurements.metric, testMetricCode));
    });
  });

  // ========================================================================
  // ORGANIZATION METRICS TESTS
  // ========================================================================

  describe('getOrganizationMetrics', () => {
    beforeEach(async () => {
      // Enable test metric for test org
      await db.insert(organizationMetrics).values({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        isEnabled: true,
      });
    });

    it('should return all metrics for organization as site admin', async () => {
      const metrics = await metricService.getOrganizationMetrics(
        testOrgId,
        siteAdminUserId
      );

      expect(metrics).toBeDefined();
      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBeGreaterThan(0);

      // Check that siteMetric is included
      const testMetric = metrics.find(m => m.metricCode === testMetricCode);
      expect(testMetric).toBeDefined();
      expect(testMetric?.siteMetric).toBeDefined();
      expect(testMetric?.siteMetric.label).toBe('Test Metric');
    });

    it('should filter to enabled metrics only when requested', async () => {
      // Create a disabled metric
      const disabledCode = `DISABLED_${testMetricCode}`;
      await db.insert(siteMetrics).values({
        code: disabledCode,
        label: 'Disabled Metric',
        category: 'test',
        lowerIsBetter: true,
        isSystemDefault: false,
        isActive: true,
        decimalPrecision: 3,
        createdBy: siteAdminUserId,
      });
      await db.insert(organizationMetrics).values({
        organizationId: testOrgId,
        metricCode: disabledCode,
        isEnabled: false,
      });

      const metrics = await metricService.getOrganizationMetrics(
        testOrgId,
        siteAdminUserId,
        { enabledOnly: true }
      );

      const disabled = metrics.find(m => m.metricCode === disabledCode);
      expect(disabled).toBeUndefined();

      // Cleanup
      await db.delete(organizationMetrics).where(
        and(
          eq(organizationMetrics.organizationId, testOrgId),
          eq(organizationMetrics.metricCode, disabledCode)
        )
      );
      await db.delete(siteMetrics).where(eq(siteMetrics.code, disabledCode));
    });

    it('should reject access to organization metrics for unauthorized user', async () => {
      await expect(
        metricService.getOrganizationMetrics(testOrgId, regularUserId)
      ).rejects.toThrow(/Unauthorized: No access to organization/);
    });
  });

  describe('enableMetricForOrganization', () => {
    it('should enable a metric for organization as site admin', async () => {
      const newCode = `ENABLE_ME_${Date.now()}`;
      await db.insert(siteMetrics).values({
        code: newCode,
        label: 'Enable Me',
        category: 'test',
        lowerIsBetter: true,
        isSystemDefault: false,
        isActive: true,
        decimalPrecision: 3,
        createdBy: siteAdminUserId,
      });

      const result = await metricService.enableMetricForOrganization(
        testOrgId,
        newCode,
        siteAdminUserId
      );

      expect(result).toBeDefined();
      expect(result.organizationId).toBe(testOrgId);
      expect(result.metricCode).toBe(newCode);
      expect(result.isEnabled).toBe(true);

      // Cleanup
      await db.delete(organizationMetrics).where(
        and(
          eq(organizationMetrics.organizationId, testOrgId),
          eq(organizationMetrics.metricCode, newCode)
        )
      );
      await db.delete(siteMetrics).where(eq(siteMetrics.code, newCode));
    });

    it('should reject enabling non-existent metric', async () => {
      await expect(
        metricService.enableMetricForOrganization(
          testOrgId,
          'NON_EXISTENT',
          siteAdminUserId
        )
      ).rejects.toThrow('Metric with code NON_EXISTENT not found');
    });

    it('should reject enabling inactive metric', async () => {
      const inactiveCode = `INACTIVE_${Date.now()}`;
      await db.insert(siteMetrics).values({
        code: inactiveCode,
        label: 'Inactive',
        category: 'test',
        lowerIsBetter: true,
        isSystemDefault: false,
        isActive: false, // Inactive
        decimalPrecision: 3,
        createdBy: siteAdminUserId,
      });

      await expect(
        metricService.enableMetricForOrganization(
          testOrgId,
          inactiveCode,
          siteAdminUserId
        )
      ).rejects.toThrow(`Metric ${inactiveCode} is not active and cannot be enabled for organizations`);

      // Cleanup
      await db.delete(siteMetrics).where(eq(siteMetrics.code, inactiveCode));
    });
  });

  describe('disableMetricForOrganization', () => {
    beforeEach(async () => {
      // Ensure metric is enabled
      await db.insert(organizationMetrics).values({
        organizationId: testOrgId,
        metricCode: testMetricCode,
        isEnabled: true,
      }).onConflictDoUpdate({
        target: [organizationMetrics.organizationId, organizationMetrics.metricCode],
        set: { isEnabled: true },
      });
    });

    it('should disable a metric for organization as site admin', async () => {
      const result = await metricService.disableMetricForOrganization(
        testOrgId,
        testMetricCode,
        siteAdminUserId
      );

      expect(result).toBeDefined();
      expect(result.isEnabled).toBe(false);
    });
  });

  describe('bulkEnableMetricsForOrganization', () => {
    it('should enable multiple metrics at once as site admin', async () => {
      const code1 = `BULK_1_${Date.now()}`;
      const code2 = `BULK_2_${Date.now()}`;

      // Create two metrics
      await db.insert(siteMetrics).values([
        {
          code: code1,
          label: 'Bulk 1',
          category: 'test',
          lowerIsBetter: true,
          isSystemDefault: false,
          isActive: true,
          decimalPrecision: 3,
          createdBy: siteAdminUserId,
        },
        {
          code: code2,
          label: 'Bulk 2',
          category: 'test',
          lowerIsBetter: true,
          isSystemDefault: false,
          isActive: true,
          decimalPrecision: 3,
          createdBy: siteAdminUserId,
        },
      ]);

      const results = await metricService.bulkEnableMetricsForOrganization(
        testOrgId,
        [code1, code2],
        siteAdminUserId
      );

      expect(results).toBeDefined();
      expect(results.length).toBe(2);
      expect(results[0].metricCode).toBe(code1);
      expect(results[1].metricCode).toBe(code2);

      // Cleanup
      await db.delete(organizationMetrics).where(
        and(
          eq(organizationMetrics.organizationId, testOrgId),
          eq(organizationMetrics.metricCode, code1)
        )
      );
      await db.delete(organizationMetrics).where(
        and(
          eq(organizationMetrics.organizationId, testOrgId),
          eq(organizationMetrics.metricCode, code2)
        )
      );
      await db.delete(siteMetrics).where(eq(siteMetrics.code, code1));
      await db.delete(siteMetrics).where(eq(siteMetrics.code, code2));
    });

    it('should reject bulk enable if any metric is invalid', async () => {
      await expect(
        metricService.bulkEnableMetricsForOrganization(
          testOrgId,
          ['VALID_CODE', 'INVALID_CODE'],
          siteAdminUserId
        )
      ).rejects.toThrow();
    });
  });
});
