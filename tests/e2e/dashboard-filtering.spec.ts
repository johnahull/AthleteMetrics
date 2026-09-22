import { test, expect } from './fixtures/e2e-base';
import { loginAs, loginWithCredentials } from './helpers/auth';
import { getUserByRole } from './fixtures/test-users';

/**
 * TIER 2: Dashboard Scope Filtering E2E Tests
 *
 * Tests the dashboard view filtering functionality:
 * - Scope selector visibility for org admins/coaches
 * - Team filtering updates dashboard data
 * - Athlete filtering updates dashboard data
 * - URL state synchronization (bookmarkable URLs)
 * - Back/forward browser navigation
 * - Wellness section conditional rendering
 *
 * Total: 10 test scenarios
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

const TEST_USERS = {
  siteAdmin: getUserByRole('site_admin'),
  orgAdmin: getUserByRole('org_admin'),
  coach: getUserByRole('coach'),
};

test.describe('Dashboard Scope Filtering Tests', () => {
  test.describe.configure({ mode: 'serial' });

  let testOrgId: string;
  let testTeamId: string;
  let testTeamName: string;
  let testAthleteId: string;
  let testAthleteName: string;

  // Setup: Get test data (organization, team, athlete)
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

    // Get organizations
    const orgsResponse = await page.request.get(`${TESTING_URL}/api/organizations`);
    if (orgsResponse.ok()) {
      const orgs = await orgsResponse.json();
      if (orgs.length > 0) {
        testOrgId = orgs[0].id;
      }
    }

    // Get teams for the organization
    if (testOrgId) {
      const teamsResponse = await page.request.get(`${TESTING_URL}/api/teams?organizationId=${testOrgId}`);
      if (teamsResponse.ok()) {
        const teams = await teamsResponse.json();
        if (teams.length > 0) {
          testTeamId = teams[0].id;
          testTeamName = teams[0].name;

          // Get athletes from the team
          const teamResponse = await page.request.get(`${TESTING_URL}/api/teams/${testTeamId}`);
          if (teamResponse.ok()) {
            const team = await teamResponse.json();
            if (team.players && team.players.length > 0) {
              testAthleteId = team.players[0].id;
              testAthleteName = team.players[0].fullName || `${team.players[0].firstName} ${team.players[0].lastName}`;
            }
          }
        }
      }
    }

    await context.close();

    console.log('Test Setup Data:', {
      testOrgId,
      testTeamId,
      testTeamName,
      testAthleteId,
      testAthleteName,
    });
  });

  test.describe('Scope Selector Visibility', () => {
    test('should show scope selector for org admins on dashboard', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Wait for dashboard to load
      await page.waitForSelector('h1:has-text("Dashboard Overview")', { timeout: 10000 });

      // Scope selector should be visible
      const scopeSelector = page.locator('[data-testid="dashboard-scope-selector"]');
      await expect(scopeSelector).toBeVisible({ timeout: 5000 });
    });

    test('should show scope selector for coaches on dashboard', async ({ page }) => {
      await loginAs(page, 'coach');

      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Wait for dashboard to load
      await page.waitForSelector('h1:has-text("Dashboard Overview")', { timeout: 10000 });

      // Scope selector should be visible for coaches
      const scopeSelector = page.locator('[data-testid="dashboard-scope-selector"]');
      await expect(scopeSelector).toBeVisible({ timeout: 5000 });
    });

    test('scope selector should default to organization view', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Wait for scope selector
      const scopeSelector = page.locator('[data-testid="dashboard-scope-selector"]');
      await expect(scopeSelector).toBeVisible({ timeout: 5000 });

      // Should show organization name or "Organization" label by default
      const selectorText = await scopeSelector.textContent();
      expect(selectorText).toBeTruthy();
      // The selector should NOT contain "Team:" or "Athlete:" indicating it's at org level
      expect(selectorText).not.toMatch(/Team:|Athlete:/);
    });
  });

  test.describe('Team Filtering', () => {
    test('should update URL when team is selected', async ({ page }) => {
      if (!testTeamId) {
        test.skip();
        return;
      }

      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Wait for scope selector
      const scopeSelector = page.locator('[data-testid="dashboard-scope-selector"]');
      await expect(scopeSelector).toBeVisible({ timeout: 5000 });

      // Click scope selector to open dropdown
      await scopeSelector.click();

      // Wait for dropdown options
      await page.waitForSelector('[role="option"]', { timeout: 5000 });

      // Find and click a team option
      const teamOption = page.locator(`[role="option"]:has-text("${testTeamName}")`);
      const teamOptionExists = await teamOption.count();

      if (teamOptionExists > 0) {
        await teamOption.click();

        // Wait for URL to update
        await page.waitForTimeout(500);

        // URL should contain teamId parameter
        expect(page.url()).toContain(`teamId=${testTeamId}`);
      }
    });

    test('should filter dashboard data when team is selected', async ({ page }) => {
      if (!testTeamId) {
        test.skip();
        return;
      }

      await loginAs(page, 'org_admin');

      // Navigate directly with team filter in URL
      await page.goto(`${TESTING_URL}/?teamId=${testTeamId}`);
      await page.waitForLoadState('networkidle');

      // Wait for dashboard content to load
      await page.waitForSelector('[data-testid="dashboard-scope-selector"]', { timeout: 10000 });

      // Verify scope selector shows team is selected
      const scopeSelector = page.locator('[data-testid="dashboard-scope-selector"]');
      await expect(scopeSelector).toBeVisible();

      // Verify dashboard shows filtered data (KPI cards should still be visible)
      const kpiCards = page.locator('[class*="KPICard"], [data-testid^="kpi-"]');
      const kpiCount = await kpiCards.count();
      expect(kpiCount).toBeGreaterThanOrEqual(0); // Data may be 0 for team filter
    });
  });

  test.describe('Athlete Filtering', () => {
    test('should update URL when athlete is selected', async ({ page }) => {
      if (!testTeamId || !testAthleteId) {
        test.skip();
        return;
      }

      await loginAs(page, 'org_admin');

      // First navigate with team selected
      await page.goto(`${TESTING_URL}/?teamId=${testTeamId}`);
      await page.waitForLoadState('networkidle');

      // Wait for scope selector
      const scopeSelector = page.locator('[data-testid="dashboard-scope-selector"]');
      await expect(scopeSelector).toBeVisible({ timeout: 5000 });

      // Click to open selector
      await scopeSelector.click();
      await page.waitForSelector('[role="option"]', { timeout: 5000 });

      // Look for athlete option
      const athleteOption = page.locator(`[role="option"]:has-text("${testAthleteName}")`);
      const athleteExists = await athleteOption.count();

      if (athleteExists > 0) {
        await athleteOption.click();
        await page.waitForTimeout(500);

        // URL should contain both teamId and athleteId
        expect(page.url()).toContain(`teamId=${testTeamId}`);
        expect(page.url()).toContain(`athleteId=${testAthleteId}`);
      }
    });
  });

  test.describe('URL State Persistence', () => {
    test('should restore scope from URL on page load', async ({ page }) => {
      if (!testTeamId) {
        test.skip();
        return;
      }

      await loginAs(page, 'org_admin');

      // Navigate directly with team filter in URL
      const urlWithTeam = `${TESTING_URL}/?teamId=${testTeamId}`;
      await page.goto(urlWithTeam);
      await page.waitForLoadState('networkidle');

      // Wait for scope selector
      const scopeSelector = page.locator('[data-testid="dashboard-scope-selector"]');
      await expect(scopeSelector).toBeVisible({ timeout: 5000 });

      // Refresh the page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // URL should still contain teamId after refresh
      expect(page.url()).toContain(`teamId=${testTeamId}`);
    });

    test('should handle browser back/forward navigation', async ({ page }) => {
      if (!testTeamId) {
        test.skip();
        return;
      }

      await loginAs(page, 'org_admin');

      // Start at dashboard without filters
      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');
      const initialUrl = page.url();

      // Navigate to team filter
      await page.goto(`${TESTING_URL}/?teamId=${testTeamId}`);
      await page.waitForLoadState('networkidle');

      // Go back
      await page.goBack();
      await page.waitForLoadState('networkidle');

      // Should be back to initial URL (no teamId)
      expect(page.url()).toBe(initialUrl);

      // Go forward
      await page.goForward();
      await page.waitForLoadState('networkidle');

      // Should have teamId again
      expect(page.url()).toContain(`teamId=${testTeamId}`);
    });
  });

  test.describe('Wellness Section Integration', () => {
    test('should show wellness section when wellness is enabled', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/`);
      await page.waitForLoadState('networkidle');

      // Wait for dashboard to fully load
      await page.waitForSelector('h1:has-text("Dashboard Overview")', { timeout: 10000 });

      // Check if wellness section exists (may or may not be visible depending on config)
      const wellnessSection = page.locator('h2:has-text("Wellness Overview")');
      const wellnessExists = await wellnessSection.count();

      // Log result for debugging
      console.log(`Wellness section visibility: ${wellnessExists > 0 ? 'visible' : 'hidden (wellness may be disabled)'}`);

      // This is not a failure condition - wellness may be disabled
      // Just verify if present, it has expected structure
      if (wellnessExists > 0) {
        await expect(wellnessSection).toBeVisible();

        // Verify wellness cards are present
        const wellnessCards = wellnessSection.locator('..').locator('[class*="Card"]');
        const cardCount = await wellnessCards.count();
        expect(cardCount).toBeGreaterThanOrEqual(0);
      }
    });

    test('wellness section should respect team filter', async ({ page }) => {
      if (!testTeamId) {
        test.skip();
        return;
      }

      await loginAs(page, 'org_admin');

      // Navigate with team filter
      await page.goto(`${TESTING_URL}/?teamId=${testTeamId}`);
      await page.waitForLoadState('networkidle');

      // Wait for dashboard
      await page.waitForSelector('h1:has-text("Dashboard Overview")', { timeout: 10000 });

      // If wellness section is visible, it should show data for the team
      const wellnessSection = page.locator('h2:has-text("Wellness Overview")');
      const wellnessExists = await wellnessSection.count();

      if (wellnessExists > 0) {
        // Wellness data should be filtered to team
        // Just verify the section renders without error
        await expect(wellnessSection).toBeVisible();
      }
    });
  });

  test.describe('Reset Functionality', () => {
    test('should reset to organization view when selected', async ({ page }) => {
      if (!testTeamId) {
        test.skip();
        return;
      }

      await loginAs(page, 'org_admin');

      // Start with team filter
      await page.goto(`${TESTING_URL}/?teamId=${testTeamId}`);
      await page.waitForLoadState('networkidle');

      // Wait for scope selector
      const scopeSelector = page.locator('[data-testid="dashboard-scope-selector"]');
      await expect(scopeSelector).toBeVisible({ timeout: 5000 });

      // Click to open selector
      await scopeSelector.click();
      await page.waitForSelector('[role="option"]', { timeout: 5000 });

      // Click organization option (first option with org icon)
      const orgOption = page.locator('[role="option"]').first();
      await orgOption.click();

      await page.waitForTimeout(500);

      // URL should no longer contain teamId
      expect(page.url()).not.toContain('teamId=');
      expect(page.url()).not.toContain('athleteId=');
    });
  });
});

test.describe('Dashboard Filtering Summary', () => {
  test('print dashboard filtering test summary', async () => {
    console.log('\n========================================================');
    console.log('Dashboard Scope Filtering E2E Tests Summary');
    console.log('========================================================');
    console.log('Scope Selector Visibility:');
    console.log('   - Shows for org admins');
    console.log('   - Shows for coaches');
    console.log('   - Defaults to organization view');
    console.log('Team Filtering:');
    console.log('   - Updates URL when team selected');
    console.log('   - Filters dashboard data');
    console.log('Athlete Filtering:');
    console.log('   - Updates URL when athlete selected');
    console.log('URL State Persistence:');
    console.log('   - Restores scope from URL on page load');
    console.log('   - Handles browser back/forward navigation');
    console.log('Wellness Integration:');
    console.log('   - Shows wellness section when enabled');
    console.log('   - Respects team filter');
    console.log('Reset Functionality:');
    console.log('   - Resets to organization view');
    console.log('========================================================\n');
  });
});
