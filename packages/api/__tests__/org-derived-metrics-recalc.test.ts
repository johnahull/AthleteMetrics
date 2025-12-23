/**
 * Tests for Organization-Scoped Derived Metrics Recalculation
 *
 * Tests the org-scoped recalculation functionality that allows org admins
 * to recalculate derived metrics for their organization's athletes only.
 *
 * Following TDD approach: Tests written first, then implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../db';
import { measurements, users, siteMetrics, organizations, userOrganizations } from '@shared/schema';
import { DerivedMetricCalculator } from '../services/derived-metric-calculator';
import { eq, and } from 'drizzle-orm';

// Test data IDs
let testOrg1: typeof organizations.$inferSelect;
let testOrg2: typeof organizations.$inferSelect;
let orgAdmin1User: typeof users.$inferSelect;
let orgAdmin2User: typeof users.$inferSelect;
let athlete1Org1: typeof users.$inferSelect;
let athlete2Org1: typeof users.$inferSelect;
let athlete1Org2: typeof users.$inferSelect;
let derivedMetric: typeof siteMetrics.$inferSelect;
let sourceMetric: typeof siteMetrics.$inferSelect;
let calculator: DerivedMetricCalculator;

describe('Organization-Scoped Derived Metrics Recalculation', () => {
  beforeEach(async () => {
    calculator = new DerivedMetricCalculator(db);

    // Create two test organizations
    const [org1] = await db
      .insert(organizations)
      .values({
        name: `Test Org 1 ${Date.now()}`,
        description: 'First test organization',
        orgType: 'club',
      })
      .returning();
    testOrg1 = org1;

    const [org2] = await db
      .insert(organizations)
      .values({
        name: `Test Org 2 ${Date.now()}`,
        description: 'Second test organization',
        orgType: 'club',
      })
      .returning();
    testOrg2 = org2;

    // Create org admin for org1
    const [orgAdmin1] = await db
      .insert(users)
      .values({
        username: `orgadmin1_${Date.now()}`,
        emails: ['orgadmin1@test.com'],
        password: 'hashedpassword',
        firstName: 'OrgAdmin',
        lastName: 'One',
        fullName: 'OrgAdmin One',
        isSiteAdmin: false,
        isActive: true,
      })
      .returning();
    orgAdmin1User = orgAdmin1;

    await db.insert(userOrganizations).values({
      userId: orgAdmin1User.id,
      organizationId: testOrg1.id,
      role: 'org_admin',
    });

    // Create org admin for org2
    const [orgAdmin2] = await db
      .insert(users)
      .values({
        username: `orgadmin2_${Date.now()}`,
        emails: ['orgadmin2@test.com'],
        password: 'hashedpassword',
        firstName: 'OrgAdmin',
        lastName: 'Two',
        fullName: 'OrgAdmin Two',
        isSiteAdmin: false,
        isActive: true,
      })
      .returning();
    orgAdmin2User = orgAdmin2;

    await db.insert(userOrganizations).values({
      userId: orgAdmin2User.id,
      organizationId: testOrg2.id,
      role: 'org_admin',
    });

    // Create athletes for org1
    const [ath1Org1] = await db
      .insert(users)
      .values({
        username: `athlete1_org1_${Date.now()}`,
        emails: ['athlete1org1@test.com'],
        password: 'hashedpassword',
        firstName: 'Athlete1',
        lastName: 'Org1',
        fullName: 'Athlete1 Org1',
        birthDate: '2000-01-01',
        birthYear: 2000,
        isSiteAdmin: false,
        isActive: true,
      })
      .returning();
    athlete1Org1 = ath1Org1;

    await db.insert(userOrganizations).values({
      userId: athlete1Org1.id,
      organizationId: testOrg1.id,
      role: 'athlete',
    });

    const [ath2Org1] = await db
      .insert(users)
      .values({
        username: `athlete2_org1_${Date.now()}`,
        emails: ['athlete2org1@test.com'],
        password: 'hashedpassword',
        firstName: 'Athlete2',
        lastName: 'Org1',
        fullName: 'Athlete2 Org1',
        birthDate: '2001-01-01',
        birthYear: 2001,
        isSiteAdmin: false,
        isActive: true,
      })
      .returning();
    athlete2Org1 = ath2Org1;

    await db.insert(userOrganizations).values({
      userId: athlete2Org1.id,
      organizationId: testOrg1.id,
      role: 'athlete',
    });

    // Create athlete for org2
    const [ath1Org2] = await db
      .insert(users)
      .values({
        username: `athlete1_org2_${Date.now()}`,
        emails: ['athlete1org2@test.com'],
        password: 'hashedpassword',
        firstName: 'Athlete1',
        lastName: 'Org2',
        fullName: 'Athlete1 Org2',
        birthDate: '2002-01-01',
        birthYear: 2002,
        isSiteAdmin: false,
        isActive: true,
      })
      .returning();
    athlete1Org2 = ath1Org2;

    await db.insert(userOrganizations).values({
      userId: athlete1Org2.id,
      organizationId: testOrg2.id,
      role: 'athlete',
    });

    // Create or get source metric (FLY10_TIME)
    let [source] = await db
      .select()
      .from(siteMetrics)
      .where(eq(siteMetrics.code, 'FLY10_TIME'));

    if (!source) {
      [source] = await db
        .insert(siteMetrics)
        .values({
          code: 'FLY10_TIME',
          label: '10-Yard Fly Time',
          category: 'speed',
          unit: 's',
          metricType: 'lower_is_better',
          isSystemDefault: true,
          isActive: true,
          isDerived: false,
        })
        .returning();
    }
    sourceMetric = source;

    // Create or get derived metric (TOP_SPEED_CALC)
    let [derived] = await db
      .select()
      .from(siteMetrics)
      .where(eq(siteMetrics.code, 'TOP_SPEED_CALC'));

    if (!derived) {
      [derived] = await db
        .insert(siteMetrics)
        .values({
          code: 'TOP_SPEED_CALC',
          label: 'Top Speed (Calculated)',
          category: 'speed',
          unit: 'mph',
          metricType: 'higher_is_better',
          isSystemDefault: false,
          isActive: true,
          isDerived: true,
          formula: '10 / fly10_time * 2.04545',
          dependentMetrics: ['FLY10_TIME'],
          calculationConfig: {
            dateMatchStrategy: 'same_date',
            missingSourceBehavior: 'skip',
          },
        })
        .returning();
    } else {
      // Update to ensure it's a derived metric with correct config
      [derived] = await db
        .update(siteMetrics)
        .set({
          isDerived: true,
          formula: '10 / fly10_time * 2.04545',
          dependentMetrics: ['FLY10_TIME'],
          calculationConfig: {
            dateMatchStrategy: 'same_date',
            missingSourceBehavior: 'skip',
          },
        })
        .where(eq(siteMetrics.code, 'TOP_SPEED_CALC'))
        .returning();
    }
    derivedMetric = derived;

    // Create measurements for testing
    // Org1 athletes - source measurements
    await db.insert(measurements).values({
      userId: athlete1Org1.id,
      submittedBy: orgAdmin1User.id,
      date: '2024-01-01',
      metric: sourceMetric.code,
      value: '1.200',
      units: 's',
      age: 24,
      isVerified: true,
      organizationId: testOrg1.id,
      isCalculated: false,
    });

    await db.insert(measurements).values({
      userId: athlete2Org1.id,
      submittedBy: orgAdmin1User.id,
      date: '2024-01-01',
      metric: sourceMetric.code,
      value: '1.100',
      units: 's',
      age: 23,
      isVerified: true,
      organizationId: testOrg1.id,
      isCalculated: false,
    });

    // Org2 athlete - source measurement
    await db.insert(measurements).values({
      userId: athlete1Org2.id,
      submittedBy: orgAdmin2User.id,
      date: '2024-01-01',
      metric: sourceMetric.code,
      value: '1.150',
      units: 's',
      age: 22,
      isVerified: true,
      organizationId: testOrg2.id,
      isCalculated: false,
    });

    // Create derived measurements (with intentionally wrong values to test recalculation)
    await db.insert(measurements).values({
      userId: athlete1Org1.id,
      submittedBy: orgAdmin1User.id,
      date: '2024-01-01',
      metric: derivedMetric.code,
      value: '0.000',
      units: 'mph',
      age: 24,
      isVerified: true,
      organizationId: testOrg1.id,
      isCalculated: true,
      calculatedFromMeasurementIds: [],
    });

    await db.insert(measurements).values({
      userId: athlete2Org1.id,
      submittedBy: orgAdmin1User.id,
      date: '2024-01-01',
      metric: derivedMetric.code,
      value: '0.000',
      units: 'mph',
      age: 23,
      isVerified: true,
      organizationId: testOrg1.id,
      isCalculated: true,
      calculatedFromMeasurementIds: [],
    });

    await db.insert(measurements).values({
      userId: athlete1Org2.id,
      submittedBy: orgAdmin2User.id,
      date: '2024-01-01',
      metric: derivedMetric.code,
      value: '0.000',
      units: 'mph',
      age: 22,
      isVerified: true,
      organizationId: testOrg2.id,
      isCalculated: true,
      calculatedFromMeasurementIds: [],
    });
  });

  afterEach(async () => {
    // Clean up test data in reverse order of dependencies
    if (athlete1Org1?.id) {
      await db.delete(measurements).where(eq(measurements.userId, athlete1Org1.id));
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, athlete1Org1.id));
      await db.delete(users).where(eq(users.id, athlete1Org1.id));
    }
    if (athlete2Org1?.id) {
      await db.delete(measurements).where(eq(measurements.userId, athlete2Org1.id));
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, athlete2Org1.id));
      await db.delete(users).where(eq(users.id, athlete2Org1.id));
    }
    if (athlete1Org2?.id) {
      await db.delete(measurements).where(eq(measurements.userId, athlete1Org2.id));
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, athlete1Org2.id));
      await db.delete(users).where(eq(users.id, athlete1Org2.id));
    }
    if (orgAdmin1User?.id) {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, orgAdmin1User.id));
      await db.delete(users).where(eq(users.id, orgAdmin1User.id));
    }
    if (orgAdmin2User?.id) {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, orgAdmin2User.id));
      await db.delete(users).where(eq(users.id, orgAdmin2User.id));
    }
    if (testOrg1?.id) {
      await db.delete(organizations).where(eq(organizations.id, testOrg1.id));
    }
    if (testOrg2?.id) {
      await db.delete(organizations).where(eq(organizations.id, testOrg2.id));
    }
  });

  it('should recalculate all derived metrics for a specific organization', async () => {
    // Use the calculator service directly with organizationId filter
    const result = await calculator.recalculateAllDerivedMetrics({
      organizationId: testOrg1.id,
    });

    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('recalculated');
    expect(result).toHaveProperty('skipped');
    expect(result).toHaveProperty('errors');
    expect(result.total).toBeGreaterThan(0);
    expect(result.recalculated).toBe(2); // 2 athletes in Org1
  });

  it('should only recalculate measurements for the specified organization', async () => {
    // Get Org2's derived measurement before recalculation
    const [org2MeasurementBefore] = await db
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.userId, athlete1Org2.id),
          eq(measurements.metric, derivedMetric.code),
          eq(measurements.isCalculated, true)
        )
      );

    expect(org2MeasurementBefore.value).toBe('0.000'); // Still has wrong value

    // Recalculate for Org1 only
    const result = await calculator.recalculateAllDerivedMetrics({
      organizationId: testOrg1.id,
    });

    expect(result.recalculated).toBe(2); // Only 2 athletes in Org1

    // Verify Org1 measurements were updated
    const org1Measurements = await db
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.organizationId, testOrg1.id),
          eq(measurements.metric, derivedMetric.code),
          eq(measurements.isCalculated, true)
        )
      );

    // All Org1 derived measurements should have non-zero values now
    for (const measurement of org1Measurements) {
      expect(parseFloat(measurement.value)).toBeGreaterThan(0);
    }

    // Verify Org2 measurement was NOT updated
    const [org2MeasurementAfter] = await db
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.userId, athlete1Org2.id),
          eq(measurements.metric, derivedMetric.code),
          eq(measurements.isCalculated, true)
        )
      );

    expect(org2MeasurementAfter.value).toBe('0.000'); // Still has old value (not recalculated)
  });

  it('should verify organizationId filtering actually works at DB level', async () => {
    // This test verifies the service respects organizationId filtering
    // which is crucial for authorization (org admins should only affect their org)

    // Recalculate for Org2 only
    const result = await calculator.recalculateAllDerivedMetrics({
      organizationId: testOrg2.id,
    });

    expect(result.recalculated).toBe(1); // Only 1 athlete in Org2

    // Verify Org2 measurement was updated
    const [org2Measurement] = await db
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.userId, athlete1Org2.id),
          eq(measurements.metric, derivedMetric.code),
          eq(measurements.isCalculated, true)
        )
      );

    expect(parseFloat(org2Measurement.value)).toBeGreaterThan(0);

    // Verify Org1 measurements were NOT affected (still have wrong values)
    const org1Measurements = await db
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.organizationId, testOrg1.id),
          eq(measurements.metric, derivedMetric.code),
          eq(measurements.isCalculated, true)
        )
      );

    for (const measurement of org1Measurements) {
      expect(measurement.value).toBe('0.000'); // Still has wrong value
    }
  });

  it('should only recalculate specific metric when metricCode provided', async () => {
    // Reset all derived measurements to 0
    await db
      .update(measurements)
      .set({ value: '0.000' })
      .where(
        and(
          eq(measurements.organizationId, testOrg1.id),
          eq(measurements.metric, derivedMetric.code),
          eq(measurements.isCalculated, true)
        )
      );

    // Recalculate only the TOP_SPEED_CALC metric for Org1
    const result = await calculator.recalculateAllDerivedMetrics({
      organizationId: testOrg1.id,
      metricCode: 'TOP_SPEED_CALC',
    });

    // Should have recalculated measurements
    expect(result.recalculated).toBeGreaterThan(0);

    // Verify Org1 measurements for TOP_SPEED_CALC were updated
    const updatedMeasurements = await db
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.organizationId, testOrg1.id),
          eq(measurements.metric, 'TOP_SPEED_CALC'),
          eq(measurements.isCalculated, true)
        )
      );

    for (const measurement of updatedMeasurements) {
      expect(parseFloat(measurement.value)).toBeGreaterThan(0);
    }
  });
});
