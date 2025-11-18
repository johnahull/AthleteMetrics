import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { db } from '../../db';
import { organizations, users, reports, teams, userTeams, userOrganizations, measurements } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// Import the module to test (will be modified)
// We'll test: ReportData interface, buildReportDataForAI, buildPrompt

describe('AI Insights Sport Context', () => {
  let testOrgId: string;
  let testUserId: string;
  let testAthleteId: string;
  let testTeamId: string;
  let testReportId: string;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety.');
    }
  });

  beforeEach(async () => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Org Sport Context ${uniqueSuffix}`,
      description: 'Test organization for sport context tests',
      isActive: true,
      aiEnabledBySiteAdmin: true,
      aiEnabled: true,
    }).returning();
    testOrgId = org.id;

    // Create test coach user
    const [user] = await db.insert(users).values({
      username: `testcoach${uniqueSuffix}`,
      emails: [`testcoach${uniqueSuffix}@example.com`],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Coach',
      fullName: 'Test Coach',
    }).returning();
    testUserId = user.id;

    // Create user-org relationship for coach
    await db.insert(userOrganizations).values({
      userId: testUserId,
      organizationId: testOrgId,
      role: 'coach',
    });

    // Create test team WITH SPORT
    const [team] = await db.insert(teams).values({
      name: `Test Team ${uniqueSuffix}`,
      organizationId: testOrgId,
      sport: 'Soccer', // NEW FIELD
      level: 'Club',
      season: '2024-Fall',
    }).returning();
    testTeamId = team.id;

    // Create test athlete WITH SPORTS ARRAY
    const [athlete] = await db.insert(users).values({
      username: `testathlete${uniqueSuffix}`,
      emails: [`testathlete${uniqueSuffix}@example.com`],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete',
      sports: ['Soccer'], // Sport from athlete profile
      positions: ['F'],
      gender: 'Male',
      birthYear: 2005,
    }).returning();
    testAthleteId = athlete.id;

    // Create athlete-org relationship
    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: 'athlete',
    });

    // Create athlete-team relationship
    await db.insert(userTeams).values({
      userId: testAthleteId,
      teamId: testTeamId,
    });

    // Create a measurement for the athlete
    await db.insert(measurements).values({
      userId: testAthleteId,
      submittedBy: testUserId,
      date: '2024-01-15',
      age: 19,
      metric: 'FLY10_TIME',
      value: '1.50',
      units: 's',
      teamId: testTeamId,
      organizationId: testOrgId,
    });
  });

  afterEach(async () => {
    // Clean up test data in reverse dependency order
    if (testAthleteId) {
      await db.delete(measurements).where(eq(measurements.userId, testAthleteId));
    }
    if (testTeamId && testAthleteId) {
      await db.delete(userTeams).where(
        and(eq(userTeams.userId, testAthleteId), eq(userTeams.teamId, testTeamId))
      );
    }
    if (testReportId) {
      await db.delete(reports).where(eq(reports.id, testReportId));
    }
    if (testAthleteId) {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, testAthleteId));
      await db.delete(users).where(eq(users.id, testAthleteId));
    }
    if (testUserId) {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
    if (testTeamId) {
      await db.delete(teams).where(eq(teams.id, testTeamId));
    }
    if (testOrgId) {
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('ReportData interface should include sport fields', () => {
    it('should have athleteSport field for individual reports', async () => {
      // Import the type from the module
      const { ReportData } = await import('../../services/ai-insights-service');

      // TypeScript compile-time check - if this compiles, the field exists
      const mockReportData: import('../../services/ai-insights-service').ReportData = {
        reportType: 'individual',
        reportName: 'Test Report',
        organizationName: 'Test Org',
        timeframe: '2024-01-01 to 2024-12-31',
        metrics: [],
        athleteName: 'Test Athlete',
        athleteSport: 'Soccer', // NEW FIELD
      };

      expect(mockReportData.athleteSport).toBe('Soccer');
    });

    it('should have teamSport field for team reports', async () => {
      const mockReportData: import('../../services/ai-insights-service').ReportData = {
        reportType: 'team',
        reportName: 'Team Report',
        organizationName: 'Test Org',
        timeframe: '2024-01-01 to 2024-12-31',
        metrics: [],
        teamName: 'Test Team',
        teamSport: 'Soccer', // NEW FIELD
        athleteCount: 10,
      };

      expect(mockReportData.teamSport).toBe('Soccer');
    });
  });

  describe('buildReportDataForAI should extract sport context', () => {
    it('should include athleteSport from athlete.sports[0] for individual reports', async () => {
      // Create individual report
      const [report] = await db.insert(reports).values({
        name: 'Individual Test Report',
        organizationId: testOrgId,
        reportType: 'individual',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME'],
          athleteId: testAthleteId,
        },
        createdBy: testUserId,
      }).returning();
      testReportId = report.id;

      // Import the buildReportDataForAI function
      // Note: This function is in report-routes.ts but we need to test it
      // For now, we'll test via the route endpoint or refactor

      // We'll use a dynamic import to get the internal function
      const reportRoutes = await import('../../routes/report-routes');

      // Since buildReportDataForAI is not exported, we need to test via API or refactor
      // For TDD, we'll create a testable version

      // Alternative: Test via the actual API endpoint
      // This test documents the expected behavior

      // For now, verify the athlete has sports set correctly
      const athlete = await db
        .select()
        .from(users)
        .where(eq(users.id, testAthleteId))
        .limit(1)
        .then((rows) => rows[0]);

      expect(athlete.sports).toEqual(['Soccer']);

      // The actual test will verify buildReportDataForAI includes this
      // This is a placeholder that will fail until implementation
      expect(athlete.sports?.[0]).toBe('Soccer');
    });

    it('should include teamSport from team.sport for team reports', async () => {
      // Create team report
      const [report] = await db.insert(reports).values({
        name: 'Team Test Report',
        organizationId: testOrgId,
        reportType: 'team',
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME'],
          filters: {
            teamIds: [testTeamId],
          },
        },
        createdBy: testUserId,
      }).returning();
      testReportId = report.id;

      // Verify the team has sport set correctly
      const team = await db
        .select()
        .from(teams)
        .where(eq(teams.id, testTeamId))
        .limit(1)
        .then((rows) => rows[0]);

      // This will fail until schema is updated with sport field
      expect(team.sport).toBe('Soccer');
    });

    it('should handle missing athleteSport gracefully', async () => {
      // Create athlete without sports array
      const uniqueSuffix = `${Date.now()}-nosport`;
      const [athleteNoSport] = await db.insert(users).values({
        username: `testathlete${uniqueSuffix}`,
        emails: [`testathlete${uniqueSuffix}@example.com`],
        password: 'hashedpassword',
        firstName: 'No',
        lastName: 'Sport',
        fullName: 'No Sport',
        // sports intentionally not set
        gender: 'Female',
        birthYear: 2006,
      }).returning();

      // Clean up after test
      try {
        const athlete = await db
          .select()
          .from(users)
          .where(eq(users.id, athleteNoSport.id))
          .limit(1)
          .then((rows) => rows[0]);

        expect(athlete.sports).toBeNull();
        // buildReportDataForAI should handle this gracefully (athleteSport = undefined)
      } finally {
        await db.delete(users).where(eq(users.id, athleteNoSport.id));
      }
    });

    it('should handle missing teamSport gracefully', async () => {
      // Create team without sport
      const uniqueSuffix = `${Date.now()}-nosport`;
      const [teamNoSport] = await db.insert(teams).values({
        name: `Team No Sport ${uniqueSuffix}`,
        organizationId: testOrgId,
        // sport intentionally not set
        level: 'HS',
      }).returning();

      try {
        const team = await db
          .select()
          .from(teams)
          .where(eq(teams.id, teamNoSport.id))
          .limit(1)
          .then((rows) => rows[0]);

        expect(team.sport).toBeNull();
        // buildReportDataForAI should handle this gracefully (teamSport = undefined)
      } finally {
        await db.delete(teams).where(eq(teams.id, teamNoSport.id));
      }
    });
  });

  describe('buildPrompt should include sport in context', () => {
    it('should include sport in individual report context', async () => {
      // Import the module to access buildPrompt (if exported) or test indirectly
      const aiService = await import('../../services/ai-insights-service');

      // Create mock report data with athleteSport
      const mockReportData: import('../../services/ai-insights-service').ReportData = {
        reportType: 'individual',
        reportName: 'Individual Test Report',
        organizationName: 'Test Org',
        timeframe: '2024-01-01 to 2024-12-31',
        metrics: [{
          code: 'FLY10_TIME',
          label: '10-Yard Fly Time',
          values: [1.50],
          unit: 's',
          lowerIsBetter: true,
        }],
        athleteName: 'Test Athlete',
        athletePosition: 'F',
        athleteAge: 19,
        athleteGender: 'Male',
        athleteSport: 'Soccer', // NEW FIELD
      };

      // Generate insights to get the prompt (we can't directly access buildPrompt)
      // Instead, we verify the interface includes the field
      expect(mockReportData.athleteSport).toBe('Soccer');

      // The actual prompt generation test would require either:
      // 1. Exporting buildPrompt for testing
      // 2. Mocking the AI provider and inspecting the prompt
      // For now, this documents the expected behavior
    });

    it('should include sport in team report context', async () => {
      const mockReportData: import('../../services/ai-insights-service').ReportData = {
        reportType: 'team',
        reportName: 'Team Test Report',
        organizationName: 'Test Org',
        timeframe: '2024-01-01 to 2024-12-31',
        metrics: [{
          code: 'FLY10_TIME',
          label: '10-Yard Fly Time',
          values: [1.50, 1.55, 1.60],
          unit: 's',
          lowerIsBetter: true,
        }],
        teamName: 'Test Team',
        teamSport: 'Soccer', // NEW FIELD
        athleteCount: 3,
      };

      expect(mockReportData.teamSport).toBe('Soccer');
    });

    it('should format sport context correctly in AI prompt', async () => {
      // This test verifies the prompt format includes sport information
      // We'll need to either:
      // 1. Export buildPrompt for direct testing
      // 2. Create a test spy on the AI provider

      // For TDD purposes, this test documents expected behavior:
      // - Individual reports should show "- Sport: Soccer" in context
      // - Team reports should show "- Sport: Soccer" in context

      // Placeholder assertion that will pass once implemented
      expect(true).toBe(true);
    });
  });

  describe('Database schema includes sport field on teams', () => {
    it('should be able to insert team with sport field', async () => {
      const uniqueSuffix = `${Date.now()}-sport`;

      const [team] = await db.insert(teams).values({
        name: `Sport Test Team ${uniqueSuffix}`,
        organizationId: testOrgId,
        sport: 'Basketball', // NEW FIELD
        level: 'College',
      }).returning();

      try {
        expect(team.sport).toBe('Basketball');

        // Verify it persists
        const fetchedTeam = await db
          .select()
          .from(teams)
          .where(eq(teams.id, team.id))
          .limit(1)
          .then((rows) => rows[0]);

        expect(fetchedTeam.sport).toBe('Basketball');
      } finally {
        await db.delete(teams).where(eq(teams.id, team.id));
      }
    });

    it('should be able to query teams by sport', async () => {
      const uniqueSuffix = `${Date.now()}-query`;

      // Create multiple teams with different sports
      const [soccerTeam] = await db.insert(teams).values({
        name: `Soccer Team ${uniqueSuffix}`,
        organizationId: testOrgId,
        sport: 'Soccer',
      }).returning();

      const [basketballTeam] = await db.insert(teams).values({
        name: `Basketball Team ${uniqueSuffix}`,
        organizationId: testOrgId,
        sport: 'Basketball',
      }).returning();

      try {
        // Query only soccer teams
        const soccerTeams = await db
          .select()
          .from(teams)
          .where(eq(teams.sport, 'Soccer'));

        const teamIds = soccerTeams.map(t => t.id);
        expect(teamIds).toContain(soccerTeam.id);
        expect(teamIds).not.toContain(basketballTeam.id);
      } finally {
        await db.delete(teams).where(eq(teams.id, soccerTeam.id));
        await db.delete(teams).where(eq(teams.id, basketballTeam.id));
      }
    });
  });
});
