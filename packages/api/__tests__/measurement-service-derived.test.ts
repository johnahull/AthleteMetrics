/**
 * Integration tests for MeasurementService derived metric calculation hooks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MeasurementService } from '../services/measurement-service';
import { DerivedMetricCalculator } from '../services/derived-metric-calculator';
import { db } from '../db';
import { measurements, siteMetrics, teams, organizations, users, userTeams } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Mock the DerivedMetricCalculator
vi.mock('../services/derived-metric-calculator', () => {
  const mockProcessNewMeasurement = vi.fn().mockResolvedValue([]);
  const mockRecalculateForAthlete = vi.fn().mockResolvedValue(undefined);

  return {
    DerivedMetricCalculator: vi.fn(() => ({
      processNewMeasurement: mockProcessNewMeasurement,
      recalculateForAthlete: mockRecalculateForAthlete,
    })),
  };
});

describe('MeasurementService - Derived Metric Integration', () => {
  let measurementService: MeasurementService;
  let testOrgId: string;
  let testTeamId: string;
  let testUserId: string;
  let testSubmitterId: string;

  beforeEach(async () => {
    // Clear mocks
    vi.clearAllMocks();

    measurementService = new MeasurementService();

    // Create test organization
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const [org] = await db.insert(organizations).values({
      name: `Test Org ${uniqueSuffix}`,
      description: 'Test organization for derived metric tests',
    }).returning();
    testOrgId = org.id;

    // Create test team
    const [team] = await db.insert(teams).values({
      name: 'Test Team',
      organizationId: testOrgId,
      level: 'College',
    }).returning();
    testTeamId = team.id;

    // Create test athlete
    const [athlete] = await db.insert(users).values({
      username: `athlete${uniqueSuffix}`,
      emails: ['athlete@test.com'],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete',
      birthDate: new Date('2000-01-01').toISOString(),
      birthYear: 2000,
      sports: ['Soccer'],
    }).returning();
    testUserId = athlete.id;

    // Create test submitter (coach)
    const [submitter] = await db.insert(users).values({
      username: `coach${uniqueSuffix}`,
      emails: ['coach@test.com'],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Coach',
      fullName: 'Test Coach',
    }).returning();
    testSubmitterId = submitter.id;

    // Add athlete to team
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    await db.insert(userTeams).values({
      userId: testUserId,
      teamId: testTeamId,
      joinedAt: pastDate,
      isActive: true,
    });
  });

  afterEach(async () => {
    // Cleanup
    if (testOrgId) {
      await db.delete(measurements).where(eq(measurements.userId, testUserId));
      await db.delete(userTeams).where(eq(userTeams.userId, testUserId));
      await db.delete(teams).where(eq(teams.organizationId, testOrgId));
      await db.delete(users).where(eq(users.id, testUserId));
      await db.delete(users).where(eq(users.id, testSubmitterId));
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('createMeasurement', () => {
    it('should trigger processNewMeasurement after creating a measurement', async () => {
      // Create measurement
      const measurement = await measurementService.createMeasurement(
        {
          userId: testUserId,
          date: new Date('2024-01-15').toISOString(),
          metric: 'FLY10_TIME',
          value: 1.45,
        },
        testSubmitterId,
        'coach'
      );

      // Get the mock instance
      const MockedCalculator = vi.mocked(DerivedMetricCalculator);
      const calculatorInstance = MockedCalculator.mock.results[0]?.value;

      expect(MockedCalculator).toHaveBeenCalledWith(db);
      expect(calculatorInstance.processNewMeasurement).toHaveBeenCalledWith(
        measurement,
        expect.objectContaining({
          event: 'measurement_insert',
          userId: testSubmitterId,
          sourceMeasurementId: measurement.id,
        })
      );
    });
  });

  describe('updateMeasurement', () => {
    it('should trigger recalculate when value changes', async () => {
      // Create initial measurement
      const [initialMeasurement] = await db.insert(measurements).values({
        userId: testUserId,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
        organizationId: testOrgId,
        teamId: testTeamId,
      }).returning();

      // Update value
      await measurementService.updateMeasurement(initialMeasurement.id, {
        value: 1.50,
      });

      // Get the mock instance
      const MockedCalculator = vi.mocked(DerivedMetricCalculator);
      const calculatorInstance = MockedCalculator.mock.results[0]?.value;

      expect(MockedCalculator).toHaveBeenCalledWith(db);
      expect(calculatorInstance.recalculateForAthlete).toHaveBeenCalledWith(
        testUserId,
        'FLY10_TIME',
        initialMeasurement.date,
        expect.objectContaining({
          triggerContext: expect.objectContaining({
            event: 'measurement_update',
            sourceMeasurementId: initialMeasurement.id,
          }),
        })
      );
    });

    it('should trigger recalculate when date changes', async () => {
      // Create initial measurement
      const [initialMeasurement] = await db.insert(measurements).values({
        userId: testUserId,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
        organizationId: testOrgId,
        teamId: testTeamId,
      }).returning();

      const newDate = new Date('2024-01-20').toISOString();

      // Update date
      await measurementService.updateMeasurement(initialMeasurement.id, {
        date: newDate,
      });

      // Get the mock instance
      const MockedCalculator = vi.mocked(DerivedMetricCalculator);
      const calculatorInstance = MockedCalculator.mock.results[0]?.value;

      expect(MockedCalculator).toHaveBeenCalledWith(db);
      // Note: dates are stored as YYYY-MM-DD strings, not full ISO timestamps
      expect(calculatorInstance.recalculateForAthlete).toHaveBeenCalledWith(
        testUserId,
        'FLY10_TIME',
        '2024-01-20',
        expect.objectContaining({
          triggerContext: expect.objectContaining({
            event: 'measurement_update',
            sourceMeasurementId: initialMeasurement.id,
          }),
        })
      );
    });

    it('should NOT trigger recalculate when only notes change', async () => {
      // Create initial measurement
      const [initialMeasurement] = await db.insert(measurements).values({
        userId: testUserId,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
        organizationId: testOrgId,
        teamId: testTeamId,
      }).returning();

      // Clear mocks from setup
      vi.clearAllMocks();

      // Update only notes
      await measurementService.updateMeasurement(initialMeasurement.id, {
        notes: 'Updated notes',
      });

      // Get the mock
      const MockedCalculator = vi.mocked(DerivedMetricCalculator);

      // Should NOT create calculator instance when only notes change
      expect(MockedCalculator).not.toHaveBeenCalled();
    });
  });

  describe('deleteMeasurement', () => {
    it('should trigger recalculate after deleting a measurement', async () => {
      // Create measurement
      const [measurement] = await db.insert(measurements).values({
        userId: testUserId,
        submittedBy: testSubmitterId,
        date: new Date('2024-01-15').toISOString(),
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        age: 24,
        organizationId: testOrgId,
        teamId: testTeamId,
      }).returning();

      // Delete measurement
      await measurementService.deleteMeasurement(measurement.id);

      // Get the mock instance
      const MockedCalculator = vi.mocked(DerivedMetricCalculator);
      const calculatorInstance = MockedCalculator.mock.results[0]?.value;

      expect(MockedCalculator).toHaveBeenCalledWith(db);
      expect(calculatorInstance.recalculateForAthlete).toHaveBeenCalledWith(
        testUserId,
        'FLY10_TIME',
        measurement.date,
        expect.objectContaining({
          triggerContext: expect.objectContaining({
            event: 'measurement_delete',
            sourceMeasurementId: measurement.id,
          }),
        })
      );
    });
  });
});
