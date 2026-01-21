/**
 * Integration tests for Event Reports
 * Tests event-specific report generation with event percentiles
 *
 * RED Phase: These tests will fail until event report functionality is implemented
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "../db";
import {
  organizations,
  users,
  userOrganizations,
  events,
  eventRegistrations,
  measurements,
  reports,
  siteMetrics,
  organizationMetrics,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { ReportService } from "../services/report-service";

describe("Event Reports", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_event_reports_test_${timestamp}`;

  let testOrgId: string;
  let testCoachId: string;
  let testEventId: string;
  let testAthlete1Id: string;
  let testAthlete2Id: string;
  let testAthlete3Id: string;
  let reportService: ReportService;

  const TEST_ORG_NAME = `Event Reports Test Org${testSuffix}`;

  beforeAll(async () => {
    reportService = new ReportService();

    // Create test organization with events enabled
    const [org] = await db.insert(organizations).values({
      name: TEST_ORG_NAME,
      orgType: "club",
      description: "Test organization for event reports testing",
      isActive: true,
      eventsEnabled: true,
    }).returning();
    testOrgId = org.id;

    // Create coach
    const [coach] = await db.insert(users).values({
      emails: [`eventreportscoach${testSuffix}@example.com`],
      username: `eventreportscoach${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Event",
      lastName: "Coach",
      fullName: "Event Coach",
      role: "coach",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: "coach",
    });

    // Create 3 test athletes
    const [athlete1] = await db.insert(users).values({
      emails: [`eventathlete1${testSuffix}@example.com`],
      username: `eventathlete1${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Fast",
      lastName: "Runner",
      fullName: "Fast Runner",
      role: "athlete",
      isActive: true,
      birthYear: 2005,
      gender: "Male",
    }).returning();
    testAthlete1Id = athlete1.id;

    const [athlete2] = await db.insert(users).values({
      emails: [`eventathlete2${testSuffix}@example.com`],
      username: `eventathlete2${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Average",
      lastName: "Runner",
      fullName: "Average Runner",
      role: "athlete",
      isActive: true,
      birthYear: 2005,
      gender: "Male",
    }).returning();
    testAthlete2Id = athlete2.id;

    const [athlete3] = await db.insert(users).values({
      emails: [`eventathlete3${testSuffix}@example.com`],
      username: `eventathlete3${testSuffix}`,
      password: "hashedpassword123",
      firstName: "Slow",
      lastName: "Runner",
      fullName: "Slow Runner",
      role: "athlete",
      isActive: true,
      birthYear: 2005,
      gender: "Male",
    }).returning();
    testAthlete3Id = athlete3.id;

    // Add athletes to organization
    await db.insert(userOrganizations).values([
      { userId: testAthlete1Id, organizationId: testOrgId, role: "athlete" },
      { userId: testAthlete2Id, organizationId: testOrgId, role: "athlete" },
      { userId: testAthlete3Id, organizationId: testOrgId, role: "athlete" },
    ]);

    // Create test event
    const [event] = await db.insert(events).values({
      organizationId: testOrgId,
      name: "Spring Combine 2025",
      description: "Annual spring testing event",
      location: "Main Gymnasium",
      eventType: "combine",
      startDate: new Date("2025-03-15T09:00:00Z"),
      timezone: "America/New_York",
      visibility: "org_private",
      registrationMode: "open",
      status: "active",
      eventCode: `SPR${timestamp.slice(-5)}`,
      createdBy: testCoachId,
    }).returning();
    testEventId = event.id;

    // Register all athletes for the event
    await db.insert(eventRegistrations).values([
      {
        eventId: testEventId,
        userId: testAthlete1Id,
        userFullNameSnapshot: "Fast Runner",
        organizationIdSnapshot: testOrgId,
        organizationNameSnapshot: TEST_ORG_NAME,
        status: "approved",
        discoveryMethod: "org_roster",
      },
      {
        eventId: testEventId,
        userId: testAthlete2Id,
        userFullNameSnapshot: "Average Runner",
        organizationIdSnapshot: testOrgId,
        organizationNameSnapshot: TEST_ORG_NAME,
        status: "approved",
        discoveryMethod: "org_roster",
      },
      {
        eventId: testEventId,
        userId: testAthlete3Id,
        userFullNameSnapshot: "Slow Runner",
        organizationIdSnapshot: testOrgId,
        organizationNameSnapshot: TEST_ORG_NAME,
        status: "approved",
        discoveryMethod: "org_roster",
      },
    ]);

    // Ensure FLY10_TIME metric exists
    const existingMetric = await db
      .select()
      .from(siteMetrics)
      .where(eq(siteMetrics.code, "FLY10_TIME"))
      .limit(1);

    if (existingMetric.length === 0) {
      await db.insert(siteMetrics).values({
        code: "FLY10_TIME",
        label: "10-Yard Fly Time",
        unit: "seconds",
        metricType: "lower_is_better",
        isActive: true,
      });
    }

    // Enable metric for organization
    const existingOrgMetric = await db
      .select()
      .from(organizationMetrics)
      .where(
        and(
          eq(organizationMetrics.organizationId, testOrgId),
          eq(organizationMetrics.metricCode, "FLY10_TIME")
        )
      )
      .limit(1);

    if (existingOrgMetric.length === 0) {
      await db.insert(organizationMetrics).values({
        organizationId: testOrgId,
        metricCode: "FLY10_TIME",
        isActive: true,
      });
    }

    // Create event measurements for all athletes
    // Athlete 1 (Fast): 1.20s (best)
    // Athlete 2 (Average): 1.35s (middle)
    // Athlete 3 (Slow): 1.50s (worst)
    // Age calculation: 2025 - 2005 = 20
    await db.insert(measurements).values([
      {
        organizationId: testOrgId,
        userId: testAthlete1Id,
        metric: "FLY10_TIME",
        value: "1.20",
        units: "seconds",
        date: "2025-03-15",
        age: 20,
        eventId: testEventId,
        eventNameSnapshot: "Spring Combine 2025",
        eventDateSnapshot: "2025-03-15",
        submittedBy: testCoachId,
      },
      {
        organizationId: testOrgId,
        userId: testAthlete2Id,
        metric: "FLY10_TIME",
        value: "1.35",
        units: "seconds",
        date: "2025-03-15",
        age: 20,
        eventId: testEventId,
        eventNameSnapshot: "Spring Combine 2025",
        eventDateSnapshot: "2025-03-15",
        submittedBy: testCoachId,
      },
      {
        organizationId: testOrgId,
        userId: testAthlete3Id,
        metric: "FLY10_TIME",
        value: "1.50",
        units: "seconds",
        date: "2025-03-15",
        age: 20,
        eventId: testEventId,
        eventNameSnapshot: "Spring Combine 2025",
        eventDateSnapshot: "2025-03-15",
        submittedBy: testCoachId,
      },
    ]);

    // Also create non-event measurements for comparison
    // These should NOT be included in event reports
    await db.insert(measurements).values([
      {
        organizationId: testOrgId,
        userId: testAthlete1Id,
        metric: "FLY10_TIME",
        value: "1.40",
        units: "seconds",
        date: "2025-02-01",
        age: 20,
        submittedBy: testCoachId,
      },
      {
        organizationId: testOrgId,
        userId: testAthlete2Id,
        metric: "FLY10_TIME",
        value: "1.45",
        units: "seconds",
        date: "2025-02-01",
        age: 20,
        submittedBy: testCoachId,
      },
    ]);
  });

  afterAll(async () => {
    // Clean up in reverse dependency order
    if (testEventId) {
      await db.delete(measurements).where(eq(measurements.eventId, testEventId));
      await db.delete(eventRegistrations).where(eq(eventRegistrations.eventId, testEventId));
      await db.delete(events).where(eq(events.id, testEventId));
    }

    // Clean up non-event measurements
    if (testOrgId) {
      await db.delete(measurements).where(
        and(
          eq(measurements.organizationId, testOrgId),
          eq(measurements.eventId, null as any)
        )
      );
    }

    if (testAthlete1Id) {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, testAthlete1Id));
      await db.delete(users).where(eq(users.id, testAthlete1Id));
    }
    if (testAthlete2Id) {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, testAthlete2Id));
      await db.delete(users).where(eq(users.id, testAthlete2Id));
    }
    if (testAthlete3Id) {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, testAthlete3Id));
      await db.delete(users).where(eq(users.id, testAthlete3Id));
    }

    if (testCoachId) {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, testCoachId));
      await db.delete(users).where(eq(users.id, testCoachId));
    }

    if (testOrgId) {
      await db.delete(organizationMetrics).where(eq(organizationMetrics.organizationId, testOrgId));
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe("Team Report with Event Filter", () => {
    it("should generate team report filtered by eventId", async () => {
      // Create report with eventId filter
      const [report] = await db.insert(reports).values({
        name: "Spring Combine Team Report",
        organizationId: testOrgId,
        reportType: "team",
        config: {
          eventId: testEventId,
          timeframe: { type: "preset", preset: "all_time" },
          metrics: ["FLY10_TIME"],
        },
        createdBy: testCoachId,
      }).returning();

      try {
        const reportData = await reportService.generateTeamReport(report.id, testCoachId);

        // Should only include 3 athletes (from event)
        expect(reportData.athleteCount).toBe(3);
        expect(reportData.athleteRankings).toHaveLength(3);

        // Should have event ID in metadata
        expect(reportData.teamIds).toEqual([]);

        // Team statistics should be based on event measurements only
        const fly10Stat = reportData.teamStatistics.find(s => s.metric === "FLY10_TIME");
        expect(fly10Stat).toBeDefined();
        expect(fly10Stat?.min).toBeCloseTo(1.20, 2);
        expect(fly10Stat?.max).toBeCloseTo(1.50, 2);
        expect(fly10Stat?.average).toBeCloseTo(1.35, 2);

        // Top performer should be Fast Runner (1.20s)
        expect(fly10Stat?.topPerformer?.userName).toBe("Fast Runner");
        expect(fly10Stat?.topPerformer?.value).toBeCloseTo(1.20, 2);
      } finally {
        await db.delete(reports).where(eq(reports.id, report.id));
      }
    });

    it("should exclude non-event measurements when eventId is specified", async () => {
      const [report] = await db.insert(reports).values({
        name: "Event Only Report",
        organizationId: testOrgId,
        reportType: "team",
        config: {
          eventId: testEventId,
          timeframe: { type: "preset", preset: "all_time" },
          metrics: ["FLY10_TIME"],
        },
        createdBy: testCoachId,
      }).returning();

      try {
        const reportData = await reportService.generateTeamReport(report.id, testCoachId);

        // Should ONLY have 3 athletes who participated in event
        // NOT the 2 athletes with non-event measurements
        expect(reportData.athleteCount).toBe(3);

        // Check that athlete1's best is from the event (1.20), not non-event (1.40)
        const athlete1 = reportData.athleteRankings.find(a => a.userId === testAthlete1Id);
        expect(athlete1).toBeDefined();
        expect(athlete1?.measurements.FLY10_TIME).toBeCloseTo(1.20, 2);

        // Athlete with only non-event measurement should not appear
        // (In this case, all test athletes have event measurements)
      } finally {
        await db.delete(reports).where(eq(reports.id, report.id));
      }
    });
  });

  describe("Individual Report with Event Filter", () => {
    it("should generate individual report filtered by eventId", async () => {
      const [report] = await db.insert(reports).values({
        name: "Fast Runner Event Report",
        organizationId: testOrgId,
        reportType: "individual",
        config: {
          eventId: testEventId,
          athleteId: testAthlete1Id,
          timeframe: { type: "preset", preset: "all_time" },
          metrics: ["FLY10_TIME"],
        },
        createdBy: testCoachId,
      }).returning();

      try {
        const reportData = await reportService.generateIndividualReport(
          report.id,
          testCoachId,
          testAthlete1Id
        );

        // Should have event measurement (1.20), not non-event (1.40)
        expect(reportData.athlete.measurements.FLY10_TIME).toBeCloseTo(1.20, 2);

        // Percentile should be based on event participants only
        // Fast Runner (1.20) is best of 3, so should be high percentile
        expect(reportData.athlete.percentiles.FLY10_TIME).toBeGreaterThan(60);
      } finally {
        await db.delete(reports).where(eq(reports.id, report.id));
      }
    });
  });

  describe("Event Percentiles", () => {
    it("should calculate event percentiles when includeEventPercentiles is true", async () => {
      const [report] = await db.insert(reports).values({
        name: "Event Percentile Report",
        organizationId: testOrgId,
        reportType: "team",
        config: {
          eventId: testEventId,
          includeEventPercentiles: true,
          timeframe: { type: "preset", preset: "all_time" },
          metrics: ["FLY10_TIME"],
        },
        createdBy: testCoachId,
      }).returning();

      try {
        const reportData = await reportService.generateTeamReport(report.id, testCoachId);

        // Should have event percentiles for each athlete
        const fastRunner = reportData.athleteRankings.find(a => a.userId === testAthlete1Id);
        const averageRunner = reportData.athleteRankings.find(a => a.userId === testAthlete2Id);
        const slowRunner = reportData.athleteRankings.find(a => a.userId === testAthlete3Id);

        expect(fastRunner).toBeDefined();
        expect(averageRunner).toBeDefined();
        expect(slowRunner).toBeDefined();

        // Event percentiles: Fast (1.20) should be top, Slow (1.50) should be bottom
        // For lower-is-better metrics, lower values get higher percentiles
        expect(fastRunner?.eventPercentiles?.FLY10_TIME).toBeGreaterThan(
          slowRunner?.eventPercentiles?.FLY10_TIME || 0
        );

        // Average should be in middle
        const avgPercentile = averageRunner?.eventPercentiles?.FLY10_TIME || 0;
        expect(avgPercentile).toBeGreaterThan(slowRunner?.eventPercentiles?.FLY10_TIME || 0);
        expect(avgPercentile).toBeLessThan(fastRunner?.eventPercentiles?.FLY10_TIME || 0);
      } finally {
        await db.delete(reports).where(eq(reports.id, report.id));
      }
    });

    it("should include both org percentiles and event percentiles when requested", async () => {
      const [report] = await db.insert(reports).values({
        name: "Dual Percentile Report",
        organizationId: testOrgId,
        reportType: "individual",
        config: {
          eventId: testEventId,
          includeEventPercentiles: true,
          athleteId: testAthlete1Id,
          timeframe: { type: "preset", preset: "all_time" },
          metrics: ["FLY10_TIME"],
        },
        createdBy: testCoachId,
      }).returning();

      try {
        const reportData = await reportService.generateIndividualReport(
          report.id,
          testCoachId,
          testAthlete1Id
        );

        // Should have both regular percentiles (org-wide) and event percentiles
        expect(reportData.athlete.percentiles).toBeDefined();
        expect(reportData.athlete.percentiles.FLY10_TIME).toBeDefined();

        expect(reportData.athlete.eventPercentiles).toBeDefined();
        expect(reportData.athlete.eventPercentiles.FLY10_TIME).toBeDefined();

        // Event percentile might differ from org percentile
        // (depends on event participant performance vs org-wide)
      } finally {
        await db.delete(reports).where(eq(reports.id, report.id));
      }
    });
  });

  describe("Event Context Metadata", () => {
    it("should include event context when eventId is specified", async () => {
      const [report] = await db.insert(reports).values({
        name: "Event Context Report",
        organizationId: testOrgId,
        reportType: "team",
        config: {
          eventId: testEventId,
          timeframe: { type: "preset", preset: "all_time" },
          metrics: ["FLY10_TIME"],
        },
        createdBy: testCoachId,
      }).returning();

      try {
        const reportData = await reportService.generateTeamReport(report.id, testCoachId);

        // Should include event context metadata
        expect(reportData.eventContext).toBeDefined();
        expect(reportData.eventContext?.eventId).toBe(testEventId);
        expect(reportData.eventContext?.eventName).toBe("Spring Combine 2025");
        expect(reportData.eventContext?.participantCount).toBe(3);
      } finally {
        await db.delete(reports).where(eq(reports.id, report.id));
      }
    });
  });
});
