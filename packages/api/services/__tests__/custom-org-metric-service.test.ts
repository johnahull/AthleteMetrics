import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { CustomOrgMetricService } from '../custom-org-metric-service';
import { db } from '../../db';
import { customOrgMetrics, organizations, users, userOrganizations, siteMetrics, measurements } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

describe('CustomOrgMetricService', () => {
  let customMetricService: CustomOrgMetricService;
  let testOrgId: string;
  let testOrgId2: string;
  let orgAdminUserId: string;
  let orgMemberUserId: string;
  let otherOrgUserId: string;
  let siteAdminUserId: string;

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

    // Create unique suffix to avoid race conditions
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create test organizations with custom metrics enabled
    const [org1] = await db.insert(organizations).values({
      name: `Test Org 1 ${uniqueSuffix}`,
      description: 'Test organization for custom metric tests',
      customMetricsEnabled: true, // Enable custom metrics for testing
    }).returning();
    testOrgId = org1.id;

    const [org2] = await db.insert(organizations).values({
      name: `Test Org 2 ${uniqueSuffix}`,
      description: 'Second test organization',
      customMetricsEnabled: true, // Enable custom metrics for testing
    }).returning();
    testOrgId2 = org2.id;

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

    // Add org admin to org
    await db.insert(userOrganizations).values({
      userId: orgAdminUserId,
      organizationId: testOrgId,
      role: 'org_admin',
    });

    // Create org member (athlete)
    const [orgMember] = await db.insert(users).values({
      username: `orgmember${uniqueSuffix}`,
      emails: ['orgmember@example.com'],
      password: 'hashedpassword',
      firstName: 'Org',
      lastName: 'Member',
      fullName: 'Org Member',
      isSiteAdmin: false,
    }).returning();
    orgMemberUserId = orgMember.id;

    await db.insert(userOrganizations).values({
      userId: orgMemberUserId,
      organizationId: testOrgId,
      role: 'athlete',
    });

    // Create user in different org
    const [otherOrgUser] = await db.insert(users).values({
      username: `otherorg${uniqueSuffix}`,
      emails: ['otherorg@example.com'],
      password: 'hashedpassword',
      firstName: 'Other',
      lastName: 'Org',
      fullName: 'Other Org',
      isSiteAdmin: false,
    }).returning();
    otherOrgUserId = otherOrgUser.id;

    await db.insert(userOrganizations).values({
      userId: otherOrgUserId,
      organizationId: testOrgId2,
      role: 'org_admin',
    });
  });

  afterEach(async () => {
    // Cleanup in reverse dependency order
    try {
      // Delete custom org metrics first
      await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, testOrgId));
      await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, testOrgId2));

      // Delete user organizations
      await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
      await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId2));

      // Delete users
      await db.delete(users).where(eq(users.id, siteAdminUserId));
      await db.delete(users).where(eq(users.id, orgAdminUserId));
      await db.delete(users).where(eq(users.id, orgMemberUserId));
      await db.delete(users).where(eq(users.id, otherOrgUserId));

      // Delete organizations
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
      await db.delete(organizations).where(eq(organizations.id, testOrgId2));
    } catch (error) {
      console.error('Test cleanup failed:', error);
    }
  });

  // ========================================================================
  // CODE GENERATION TESTS
  // ========================================================================

  describe('generateMetricCode', () => {
    it('should generate code with org prefix and label', async () => {
      const code = await customMetricService.generateMetricCode(testOrgId, 'Sprint 15m');

      expect(code).toMatch(/^ORG_[A-Z0-9]+_SPRINT_15M$/);
      expect(code.length).toBeLessThanOrEqual(100);
    });

    it('should handle special characters in label', async () => {
      const code = await customMetricService.generateMetricCode(testOrgId, "Player's Speed (fast!)");

      expect(code).toMatch(/^ORG_[A-Z0-9]+_PLAYERS_SPEED_FAST$/);
    });

    it('should truncate long labels', async () => {
      const longLabel = 'This is a very long metric label that should be truncated';
      const code = await customMetricService.generateMetricCode(testOrgId, longLabel);

      expect(code.length).toBeLessThanOrEqual(100);
    });
  });

  // ========================================================================
  // CREATE TESTS
  // ========================================================================

  describe('createCustomOrgMetric', () => {
    it('should create a custom metric as org admin', async () => {
      const metric = await customMetricService.createCustomOrgMetric(
        testOrgId,
        {
          label: 'Sprint 15m',
          unit: 's',
          metricType: 'lower_is_better',
          description: 'Custom 15 meter sprint test',
          decimalPrecision: 2,
        },
        orgAdminUserId
      );

      expect(metric).toBeDefined();
      expect(metric.label).toBe('Sprint 15m');
      expect(metric.unit).toBe('s');
      expect(metric.metricType).toBe('lower_is_better');
      expect(metric.organizationId).toBe(testOrgId);
      expect(metric.code).toMatch(/^ORG_[A-Z0-9]+_SPRINT_15M$/);
      expect(metric.createdBy).toBe(orgAdminUserId);
      expect(metric.isActive).toBe(true);
    });

    it('should create a custom metric as site admin', async () => {
      const metric = await customMetricService.createCustomOrgMetric(
        testOrgId,
        {
          label: 'Jump Height',
          unit: 'cm',
          metricType: 'higher_is_better',
        },
        siteAdminUserId
      );

      expect(metric).toBeDefined();
      expect(metric.label).toBe('Jump Height');
    });

    it('should reject creation by non-admin org member', async () => {
      await expect(
        customMetricService.createCustomOrgMetric(
          testOrgId,
          { label: 'Unauthorized Metric', metricType: 'tracking' },
          orgMemberUserId
        )
      ).rejects.toThrow(/Unauthorized|permission/i);
    });

    it('should reject creation by user from different org', async () => {
      await expect(
        customMetricService.createCustomOrgMetric(
          testOrgId,
          { label: 'Cross Org Metric', metricType: 'tracking' },
          otherOrgUserId
        )
      ).rejects.toThrow(/Unauthorized|access/i);
    });

    it('should reject duplicate labels in same org', async () => {
      // Create first metric with a label
      await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'Duplicate Test', metricType: 'tracking' },
        orgAdminUserId
      );

      // Second metric with same label should be rejected
      await expect(
        customMetricService.createCustomOrgMetric(
          testOrgId,
          { label: 'Duplicate Test', metricType: 'tracking' },
          orgAdminUserId
        )
      ).rejects.toThrow(/already exists/i);
    });

    it('should allow same label in different orgs', async () => {
      await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'Common Metric', metricType: 'tracking' },
        orgAdminUserId
      );

      const metric2 = await customMetricService.createCustomOrgMetric(
        testOrgId2,
        { label: 'Common Metric', metricType: 'tracking' },
        otherOrgUserId
      );

      expect(metric2).toBeDefined();
      expect(metric2.organizationId).toBe(testOrgId2);
    });
  });

  // ========================================================================
  // READ TESTS
  // ========================================================================

  describe('getCustomOrgMetrics', () => {
    beforeEach(async () => {
      // Create some test metrics
      await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'Metric A', metricType: 'lower_is_better', category: 'speed' },
        orgAdminUserId
      );
      await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'Metric B', metricType: 'higher_is_better', category: 'power' },
        orgAdminUserId
      );
    });

    it('should return all active custom metrics for org', async () => {
      const metrics = await customMetricService.getCustomOrgMetrics(testOrgId, orgAdminUserId);

      expect(metrics).toBeDefined();
      expect(metrics.length).toBe(2);
      expect(metrics.map(m => m.label)).toContain('Metric A');
      expect(metrics.map(m => m.label)).toContain('Metric B');
    });

    it('should filter by category', async () => {
      const metrics = await customMetricService.getCustomOrgMetrics(
        testOrgId,
        orgAdminUserId,
        { category: 'speed' }
      );

      expect(metrics.length).toBe(1);
      expect(metrics[0].label).toBe('Metric A');
    });

    it('should exclude archived metrics by default', async () => {
      // Archive Metric A
      const metricA = await customMetricService.getCustomOrgMetricByLabel(testOrgId, 'Metric A');
      await customMetricService.archiveCustomOrgMetric(testOrgId, metricA!.code, orgAdminUserId);

      const metrics = await customMetricService.getCustomOrgMetrics(testOrgId, orgAdminUserId);

      expect(metrics.length).toBe(1);
      expect(metrics[0].label).toBe('Metric B');
    });

    it('should include archived metrics when requested', async () => {
      const metricA = await customMetricService.getCustomOrgMetricByLabel(testOrgId, 'Metric A');
      await customMetricService.archiveCustomOrgMetric(testOrgId, metricA!.code, orgAdminUserId);

      const metrics = await customMetricService.getCustomOrgMetrics(
        testOrgId,
        orgAdminUserId,
        { includeArchived: true }
      );

      expect(metrics.length).toBe(2);
    });

    it('should be accessible by org members (not just admins)', async () => {
      const metrics = await customMetricService.getCustomOrgMetrics(testOrgId, orgMemberUserId);

      expect(metrics.length).toBe(2);
    });

    it('should reject access from users not in org', async () => {
      await expect(
        customMetricService.getCustomOrgMetrics(testOrgId, otherOrgUserId)
      ).rejects.toThrow(/Unauthorized|access/i);
    });
  });

  describe('getCustomOrgMetric', () => {
    it('should return specific metric by code', async () => {
      const created = await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'Specific Metric', metricType: 'tracking' },
        orgAdminUserId
      );

      const metric = await customMetricService.getCustomOrgMetric(testOrgId, created.code, orgAdminUserId);

      expect(metric).toBeDefined();
      expect(metric?.code).toBe(created.code);
      expect(metric?.label).toBe('Specific Metric');
    });

    it('should return undefined for non-existent code', async () => {
      const metric = await customMetricService.getCustomOrgMetric(
        testOrgId,
        'NON_EXISTENT_CODE',
        orgAdminUserId
      );

      expect(metric).toBeUndefined();
    });
  });

  // ========================================================================
  // UPDATE TESTS
  // ========================================================================

  describe('updateCustomOrgMetric', () => {
    let testMetricCode: string;

    beforeEach(async () => {
      const metric = await customMetricService.createCustomOrgMetric(
        testOrgId,
        {
          label: 'Update Me',
          unit: 's',
          metricType: 'lower_is_better',
          description: 'Original description',
        },
        orgAdminUserId
      );
      testMetricCode = metric.code;
    });

    it('should update metric fields as org admin', async () => {
      const updated = await customMetricService.updateCustomOrgMetric(
        testOrgId,
        testMetricCode,
        {
          label: 'Updated Label',
          description: 'Updated description',
          category: 'agility',
        },
        orgAdminUserId
      );

      expect(updated.label).toBe('Updated Label');
      expect(updated.description).toBe('Updated description');
      expect(updated.category).toBe('agility');
      expect(updated.updatedAt).toBeDefined();
    });

    it('should not allow changing metricType if measurements exist', async () => {
      // First, create a measurement using this metric
      await db.insert(measurements).values({
        userId: orgMemberUserId,
        submittedBy: orgAdminUserId,
        date: '2025-01-01',
        age: 20,
        metric: testMetricCode,
        value: '10.5',
        units: 's',
        organizationId: testOrgId,
      });

      await expect(
        customMetricService.updateCustomOrgMetric(
          testOrgId,
          testMetricCode,
          { metricType: 'higher_is_better' },
          orgAdminUserId
        )
      ).rejects.toThrow(/measurements exist|cannot change/i);

      // Cleanup
      await db.delete(measurements).where(eq(measurements.metric, testMetricCode));
    });

    it('should reject update by non-admin', async () => {
      await expect(
        customMetricService.updateCustomOrgMetric(
          testOrgId,
          testMetricCode,
          { label: 'Unauthorized Update' },
          orgMemberUserId
        )
      ).rejects.toThrow(/Unauthorized|permission/i);
    });
  });

  // ========================================================================
  // ARCHIVE (SOFT DELETE) TESTS
  // ========================================================================

  describe('archiveCustomOrgMetric', () => {
    let testMetricCode: string;

    beforeEach(async () => {
      const metric = await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'Archive Me', metricType: 'tracking' },
        orgAdminUserId
      );
      testMetricCode = metric.code;
    });

    it('should soft delete (archive) a metric', async () => {
      await customMetricService.archiveCustomOrgMetric(testOrgId, testMetricCode, orgAdminUserId);

      const metric = await customMetricService.getCustomOrgMetric(
        testOrgId,
        testMetricCode,
        orgAdminUserId
      );

      expect(metric?.isActive).toBe(false);
      expect(metric?.archivedAt).toBeDefined();
    });

    it('should preserve measurements after archiving', async () => {
      // Create a measurement
      await db.insert(measurements).values({
        userId: orgMemberUserId,
        submittedBy: orgAdminUserId,
        date: '2025-01-01',
        age: 20,
        metric: testMetricCode,
        value: '10.5',
        units: 's',
        organizationId: testOrgId,
      });

      await customMetricService.archiveCustomOrgMetric(testOrgId, testMetricCode, orgAdminUserId);

      // Measurement should still exist
      const [measurement] = await db.select()
        .from(measurements)
        .where(eq(measurements.metric, testMetricCode));

      expect(measurement).toBeDefined();

      // Cleanup
      await db.delete(measurements).where(eq(measurements.metric, testMetricCode));
    });
  });

  describe('restoreCustomOrgMetric', () => {
    it('should restore an archived metric', async () => {
      const metric = await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'Restore Me', metricType: 'tracking' },
        orgAdminUserId
      );

      await customMetricService.archiveCustomOrgMetric(testOrgId, metric.code, orgAdminUserId);
      const restored = await customMetricService.restoreCustomOrgMetric(testOrgId, metric.code, orgAdminUserId);

      expect(restored.isActive).toBe(true);
      expect(restored.archivedAt).toBeNull();
    });
  });

  // ========================================================================
  // DERIVED METRICS TESTS
  // ========================================================================

  describe('derived metrics', () => {
    let sourceMetricCode: string;

    beforeEach(async () => {
      // Create a source metric
      const source = await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'Source Metric', unit: 's', metricType: 'lower_is_better' },
        orgAdminUserId
      );
      sourceMetricCode = source.code;
    });

    it('should create a derived metric with formula', async () => {
      const derived = await customMetricService.createCustomOrgMetric(
        testOrgId,
        {
          label: 'Speed Derived',
          unit: 'm/s',
          metricType: 'higher_is_better',
          isDerived: true,
          formula: `10 / ${sourceMetricCode}`,
          dependentMetrics: [sourceMetricCode],
          calculationConfig: {
            dateMatchStrategy: 'same_date',
            missingSourceBehavior: 'skip',
          },
        },
        orgAdminUserId
      );

      expect(derived.isDerived).toBe(true);
      expect(derived.formula).toBe(`10 / ${sourceMetricCode}`);
      expect(derived.dependentMetrics).toContain(sourceMetricCode);
    });

    it('should reject derived metric without formula', async () => {
      await expect(
        customMetricService.createCustomOrgMetric(
          testOrgId,
          {
            label: 'Invalid Derived',
            metricType: 'tracking',
            isDerived: true,
            // Missing formula
          },
          orgAdminUserId
        )
      ).rejects.toThrow(/formula.*required/i);
    });

    it('should allow derived metric to depend on site metrics', async () => {
      // First ensure FLY10_TIME exists
      const existingFly10 = await db.select().from(siteMetrics).where(eq(siteMetrics.code, 'FLY10_TIME')).limit(1);
      if (existingFly10.length === 0) {
        await db.insert(siteMetrics).values({
          code: 'FLY10_TIME',
          label: '10-Yard Fly Time',
          unit: 's',
          metricType: 'lower_is_better',
          isActive: true,
          isSystemDefault: true,
          decimalPrecision: 2,
        });
      }

      const derived = await customMetricService.createCustomOrgMetric(
        testOrgId,
        {
          label: 'Speed from Fly10',
          unit: 'm/s',
          metricType: 'higher_is_better',
          isDerived: true,
          formula: '10 / FLY10_TIME * 0.9144', // Convert yards to meters
          dependentMetrics: ['FLY10_TIME'],
          calculationConfig: {
            dateMatchStrategy: 'same_date',
            missingSourceBehavior: 'skip',
          },
        },
        orgAdminUserId
      );

      expect(derived.dependentMetrics).toContain('FLY10_TIME');
    });

    it('should reject dependency on metrics from other orgs', async () => {
      // Create a metric in org2
      const otherOrgMetric = await customMetricService.createCustomOrgMetric(
        testOrgId2,
        { label: 'Other Org Metric', metricType: 'tracking' },
        otherOrgUserId
      );

      await expect(
        customMetricService.createCustomOrgMetric(
          testOrgId,
          {
            label: 'Cross Org Derived',
            metricType: 'tracking',
            isDerived: true,
            formula: `${otherOrgMetric.code} * 2`,
            dependentMetrics: [otherOrgMetric.code],
            calculationConfig: {
              dateMatchStrategy: 'same_date',
              missingSourceBehavior: 'skip',
            },
          },
          orgAdminUserId
        )
      ).rejects.toThrow(/not available|not found|invalid dependency|unknown metric/i);
    });
  });

  // ========================================================================
  // MEASUREMENT COUNT TESTS
  // ========================================================================

  describe('getMeasurementCount', () => {
    it('should return count of measurements using the metric', async () => {
      const metric = await customMetricService.createCustomOrgMetric(
        testOrgId,
        { label: 'Count Test', metricType: 'tracking' },
        orgAdminUserId
      );

      // Create some measurements
      await db.insert(measurements).values([
        {
          userId: orgMemberUserId,
          submittedBy: orgAdminUserId,
          date: '2025-01-01',
          age: 20,
          metric: metric.code,
          value: '10',
          units: 'count',
          organizationId: testOrgId,
        },
        {
          userId: orgMemberUserId,
          submittedBy: orgAdminUserId,
          date: '2025-01-02',
          age: 20,
          metric: metric.code,
          value: '12',
          units: 'count',
          organizationId: testOrgId,
        },
      ]);

      const count = await customMetricService.getMeasurementCount(testOrgId, metric.code);

      expect(count).toBe(2);

      // Cleanup
      await db.delete(measurements).where(eq(measurements.metric, metric.code));
    });
  });
});
