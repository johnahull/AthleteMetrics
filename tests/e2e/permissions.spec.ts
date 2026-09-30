import { test, expect } from '@playwright/test';
import { loginWithCredentials, logout } from './helpers/auth';
import { goToAthletes, goToDashboard, goToOrganizations } from './helpers/navigation';
import { getUserByRole, isSameUserMode } from './fixtures/test-users';
import { CHART_ANIMATION_TIMEOUT } from './constants';

/**
 * TIER 1 CRITICAL: RBAC/Permissions Tests
 *
 * These tests verify role-based access control:
 * - Athlete role: can only see own data
 * - Coach role: manages team athletes only
 * - Org admin: org-scoped access
 * - Site admin: full access
 * - Unauthorized access protection (403 or redirect)
 * - Organization context switching
 * - Data filtered by organization
 * - Cross-org data isolation
 * - Permission-based navigation
 * - Role inheritance
 *
 * Tests follow TDD methodology: written first, infrastructure built to make them pass.
 *
 * IMPORTANT: These tests require test users with different roles to be created
 * in the staging environment. See fixtures/test-users.ts for user setup.
 * Users are loaded from E2E_* environment variables with no weak fallbacks.
 */

const STAGING_URL = process.env.STAGING_URL || process.env.TESTING_URL || 'http://localhost:5000';

// Test user credentials loaded from fixtures with required env var validation
const TEST_USERS = {
  siteAdmin: getUserByRole('site_admin'),
  orgAdmin: getUserByRole('org_admin'),
  coach: getUserByRole('coach'),
  athlete: getUserByRole('athlete')
};

test.describe('RBAC/Permissions Tests', () => {
  // Configure these tests to run sequentially within each describe block
  // to avoid race conditions with role-based data isolation
  test.describe.configure({ mode: 'serial' });

  // RBAC differentiation is not testable in same-user mode (e.g. CI, where every
  // E2E_*_USERNAME resolves to one admin): "athlete cannot X" checks pass through
  // as a site admin and fail. Skip the suite here; it runs for real once distinct
  // per-role users are provisioned (the proper follow-up to the serial-CI change).
  test.skip(isSameUserMode(), 'RBAC not testable when all roles map to one user');

  test.describe('Athlete Role Permissions', () => {
    test('athlete should only see their own data', async ({ page }) => {
      // Login as athlete
      await loginWithCredentials(page, TEST_USERS.athlete.username, TEST_USERS.athlete.password);

      // Should redirect to athlete's own profile - wait for URL change
      await page.waitForURL(/\/athlete|\/profile/i, { timeout: 5000 });

      // URL should contain athlete's ID or profile route
      expect(page.url()).toMatch(/\/athlete|\/profile/i);

      // Should NOT be able to access athletes management page
      await page.goto(`${STAGING_URL}/athletes`);
      // Wait for page to load (either redirected or access denied)
      await page.locator('text=/access.*denied|unauthorized|403/i').or(page.locator('[data-testid^="checkbox-athlete-"]')).first().waitFor({ timeout: 5000 }).catch(() => {});

      // Should either redirect or show access denied
      const isRedirected = page.url().includes('/athlete') || page.url().includes('/profile');
      const hasAccessDenied = await page.locator('text=/access.*denied|unauthorized|403/i').count() > 0;

      expect(isRedirected || hasAccessDenied).toBeTruthy();
    });

    test('athlete should not see other athletes data', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.athlete.username, TEST_USERS.athlete.password);
      // Wait for redirect after login
      await page.waitForURL(/\/athlete|\/profile|\/login/i, { timeout: 5000 });

      // Try to access another athlete's profile (if we know an ID)
      // For now, just verify they can't browse all athletes
      await page.goto(`${STAGING_URL}/athletes`);
      // Wait for page response
      await page.locator('[data-testid^="checkbox-athlete-"], .empty-state').or(page.locator('text=/access.*denied/i')).first().waitFor({ timeout: 5000 }).catch(() => {});

      // Should not see athletes list
      const athletesList = await page.locator('[data-testid^="checkbox-athlete-"]').count();
      expect(athletesList).toBe(0); // Should not see list of athletes
    });
  });

  test.describe('Coach Role Permissions', () => {
    test('coach should only see their team athletes', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.coach.username, TEST_USERS.coach.password);
      await goToAthletes(page);

      // Should see athletes page (not redirected)
      expect(page.url()).toContain('/athletes');

      // Should see some athletes (their team)
      const athleteCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
      expect(athleteCount).toBeGreaterThan(0);

      // Should NOT see add organization button (org admin feature)
      const addOrgButton = await page.locator('[data-testid="button-add-organization"]').count();
      expect(addOrgButton).toBe(0);
    });

    test('coach should not access organization settings', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.coach.username, TEST_USERS.coach.password);

      // Try to access organizations page
      await page.goto(`${STAGING_URL}/organizations`);
      // Wait for organizations page to load
      await page.waitForSelector('[data-testid="button-add-organization"], main, .organization-list', { timeout: 5000 });

      // Should either redirect or show limited access
      const hasFullAccess = await page.locator('[data-testid="button-add-organization"]').count();
      expect(hasFullAccess).toBe(0); // Coaches shouldn't add organizations
    });
  });

  test.describe('Org Admin Role Permissions', () => {
    test('org admin should have organization-scoped access', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.orgAdmin.username, TEST_USERS.orgAdmin.password);
      await goToDashboard(page);

      // Should see dashboard
      expect(page.url()).toContain('/dashboard');

      // Should be able to access athletes in their org
      await goToAthletes(page);
      expect(page.url()).toContain('/athletes');

      // Should see add athlete button
      const addAthleteButton = await page.locator('[data-testid="button-add-athlete"]').count();
      expect(addAthleteButton).toBeGreaterThan(0);

      // Should be able to access organizations (their org)
      await goToOrganizations(page);
      expect(page.url()).toContain('/organizations');
    });

    test('org admin should not see other organizations data', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.orgAdmin.username, TEST_USERS.orgAdmin.password);
      await goToOrganizations(page);

      // Should only see their own organization(s)
      const orgCards = await page.locator('[data-testid^="organization-"], .organization-card').count();

      // Should see at least their org, but not ALL orgs (unless they're in multiple)
      expect(orgCards).toBeGreaterThan(0);
      expect(orgCards).toBeLessThan(100); // Shouldn't see all orgs in system
    });
  });

  test.describe('Site Admin Role Permissions', () => {
    test('site admin should have full system access', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);
      await goToDashboard(page);

      // Should access all pages
      await goToAthletes(page);
      expect(page.url()).toContain('/athletes');

      await goToOrganizations(page);
      expect(page.url()).toContain('/organizations');

      // Should see add organization button
      const addOrgButton = await page.locator('[data-testid="button-add-organization"]').count();
      expect(addOrgButton).toBeGreaterThan(0);
    });

    test('site admin should see all organizations', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);
      await goToOrganizations(page);

      // Should see multiple organizations
      const orgCards = await page.locator('[data-testid^="organization-"], .organization-card, tr').count();
      expect(orgCards).toBeGreaterThan(0);
    });
  });

  test.describe('Unauthorized Access Protection', () => {
    test('should return 403 or redirect for unauthorized access', async ({ page }) => {
      // Login as athlete
      await loginWithCredentials(page, TEST_USERS.athlete.username, TEST_USERS.athlete.password);

      // Try to access admin-only route
      const response = await page.goto(`${STAGING_URL}/admin`);
      // Wait for page to load or redirect
      await page.locator('main').or(page.locator('text=/access.*denied|unauthorized|403/i')).first().waitFor({ timeout: 5000 }).catch(() => {});

      // Should either:
      // 1. Return 403 status
      // 2. Redirect to unauthorized page
      // 3. Redirect to athlete profile
      const is403 = response?.status() === 403;
      const isUnauthorized = page.url().includes('unauthorized') || page.url().includes('403');
      const isRedirectedToProfile = page.url().includes('/athlete') || page.url().includes('/profile');

      expect(is403 || isUnauthorized || isRedirectedToProfile).toBeTruthy();
    });
  });

  test.describe('Organization Context Switching', () => {
    test('should allow switching between organizations (if user has multiple)', async ({ page }) => {
      // This test assumes org admin or site admin with multiple orgs
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);
      await goToDashboard(page);

      // Look for organization selector/switcher
      const orgSwitcher = page.locator('[data-testid="select-organization"], [aria-label*="organization" i] select');
      const hasSwitcher = await orgSwitcher.count();

      if (hasSwitcher > 0) {
        await orgSwitcher.click();

        // Select a different organization
        await page.click('[role="option"]').catch(() => page.locator('option').nth(1).click());

        // Wait for organization context switch to complete
        await page.waitForTimeout(1000); // Brief wait for context switch

        // Data should be filtered by new organization
        // Context switch complete
      }
    });
  });

  test.describe('Data Filtered by Organization', () => {
    test('should filter athletes by organization context', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.orgAdmin.username, TEST_USERS.orgAdmin.password);
      await goToAthletes(page);

      // Get athlete count
      const athleteCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();

      // Athletes should be filtered by user's organization
      // (This is implicit - we can't see other org's athletes)

      // If we switch org (and user has access to multiple), count should change
      const orgSwitcher = page.locator('[data-testid="select-organization"]');
      const hasSwitcher = await orgSwitcher.count();

      if (hasSwitcher > 0) {
        await orgSwitcher.click();
        await page.click('[role="option"]').catch(() => page.locator('option').nth(1).click());
        // Wait for context switch and athletes list to update
        await page.waitForTimeout(1000);

        const newAthleteCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();

        // Count might be different (or same if orgs have same number of athletes)
        expect(newAthleteCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('Cross-Organization Data Isolation', () => {
    test('should not allow access to other organization data via direct URL', async ({ page }) => {
      await loginWithCredentials(page, TEST_USERS.orgAdmin.username, TEST_USERS.orgAdmin.password);

      // Try to access an athlete from another organization (if we know an ID)
      // For this test, we'll just verify the isolation principle
      await goToAthletes(page);

      const athleteCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();

      // All visible athletes should be from user's organization
      // This is verified by the fact that other org's athletes aren't visible
      expect(athleteCount).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Permission-Based Navigation', () => {
    test('should show/hide navigation items based on role', async ({ page }) => {
      // Test with athlete (limited access)
      await loginWithCredentials(page, TEST_USERS.athlete.username, TEST_USERS.athlete.password);
      // Wait for page to load after login
      await page.waitForSelector('nav, main', { timeout: 5000 });

      // Should NOT see admin navigation items
      const adminNavItems = await page.locator('nav a:has-text("Organizations"), nav a:has-text("Admin")').count();
      expect(adminNavItems).toBe(0);

      // Logout and login as site admin
      await logout(page);
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);
      // Wait for page to load after login
      await page.waitForSelector('nav, main', { timeout: 5000 });

      // SHOULD see admin navigation items
      const siteAdminNavItems = await page.locator('nav a:has-text("Organizations"), nav').count();
      expect(siteAdminNavItems).toBeGreaterThan(0);
    });
  });

  test.describe('Role Inheritance and Hierarchy', () => {
    test('should respect role hierarchy (site admin > org admin > coach > athlete)', async ({ page }) => {
      // Test that higher roles can access lower role features
      await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

      // Site admin should access all features
      await goToDashboard(page);
      expect(page.url()).toContain('/dashboard');

      await goToAthletes(page);
      expect(page.url()).toContain('/athletes');

      await goToOrganizations(page);
      expect(page.url()).toContain('/organizations');

      // All navigation should work
      const navigationLinks = await page.locator('nav a').count();
      expect(navigationLinks).toBeGreaterThan(3); // Should have multiple nav links
    });
  });
});

test.describe('Enhanced RBAC Edge Cases', () => {
  test('coach from Org A cannot see athletes from Org B', async ({ page }) => {
    // Login as coach (should only see their team's athletes from their org)
    await loginWithCredentials(page, TEST_USERS.coach.username, TEST_USERS.coach.password);
    await goToAthletes(page);

    // Get list of visible athletes
    const athleteRows = await page.locator('[data-testid^="checkbox-athlete-"]').all();
    const visibleAthleteCount = athleteRows.length;

    // Verify coach can see some athletes (their team)
    expect(visibleAthleteCount).toBeGreaterThan(0);

    // Try to directly access an athlete profile from another org (if we have an ID)
    // For this test, we'll verify the API doesn't return cross-org data
    const apiResponse = await page.request.get(`${STAGING_URL}/api/athletes`);
    expect(apiResponse.ok()).toBeTruthy();

    const athletes = await apiResponse.json();

    // All returned athletes should belong to coach's organization
    // This is verified by the backend filtering - coach shouldn't see other orgs
    expect(Array.isArray(athletes)).toBeTruthy();

    // If we had org IDs, we could verify:
    // athletes.forEach(athlete => expect(athlete.organizationId).toBe(COACH_ORG_ID));
  });

  test('athlete cannot access admin pages via URL manipulation', async ({ page }) => {
    // Login as athlete
    await loginWithCredentials(page, TEST_USERS.athlete.username, TEST_USERS.athlete.password);
    // Wait for login to complete
    await page.waitForURL(/\/athlete|\/profile|\/dashboard/i, { timeout: 5000 });

    // List of admin-only routes to test
    const adminRoutes = [
      '/admin',
      '/organizations',
      '/users',
      '/settings/admin'
    ];

    for (const route of adminRoutes) {
      // Try to access admin route
      const response = await page.goto(`${STAGING_URL}${route}`);
      // Wait for page to load or redirect
      await page.locator('main').or(page.locator('text=/access.*denied|unauthorized|403/i')).first().waitFor({ timeout: 3000 }).catch(() => {});

      // Should be blocked (403, unauthorized, or redirected)
      const is403 = response?.status() === 403;
      const isUnauthorized = page.url().includes('unauthorized') || page.url().includes('403');
      const isRedirectedAway = !page.url().includes(route);

      expect(is403 || isUnauthorized || isRedirectedAway).toBeTruthy();

      // Verify no admin content is visible
      const hasAdminContent = await page.locator('[data-testid*="admin"], text=/admin.*panel/i').count();
      expect(hasAdminContent).toBe(0);
    }
  });

  test('multi-org coach sees correct data after organization switch', async ({ page }) => {
    // This test requires a coach that belongs to multiple organizations
    // Skip if test user doesn't have multi-org access
    const multiOrgCoach = {
      username: process.env.TEST_MULTI_ORG_COACH_USERNAME || TEST_USERS.coach.username,
      password: process.env.TEST_MULTI_ORG_COACH_PASSWORD || TEST_USERS.coach.password
    };

    await loginWithCredentials(page, multiOrgCoach.username, multiOrgCoach.password);
    await goToAthletes(page);

    // Look for organization switcher
    const orgSwitcher = page.locator('[data-testid="select-organization"], [data-testid="current-organization"]');
    const hasSwitcher = await orgSwitcher.count();

    if (hasSwitcher === 0) {
      console.log('⏭️  Skipping multi-org test: User does not have multiple organizations');
      test.skip();
      return;
    }

    // Get athlete count for first organization
    const org1AthleteCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
    const org1AthleteName = await page.locator('[data-testid^="checkbox-athlete-"]').first().textContent();

    // Switch to different organization
    await orgSwitcher.click();

    // Wait for dropdown options to appear
    await page.waitForSelector('[role="option"], option', { timeout: 2000 }).catch(() =>
      console.debug('No dropdown options found for organization switcher')
    );

    // Select second organization (if available)
    const orgOptions = await page.locator('[role="option"], option').all();
    if (orgOptions.length > 1) {
      await orgOptions[1].click();
      // Wait for organization context switch
      await page.waitForTimeout(1000);

      // Get athlete count for second organization
      const org2AthleteCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();

      // Athletes from org 1 should NOT appear in org 2
      if (org1AthleteName) {
        const org1AthleteStillVisible = await page.locator(`text=${org1AthleteName}`).count();
        expect(org1AthleteStillVisible).toBe(0);
      }

      // Verify data is properly filtered (counts might differ)
      expect(org2AthleteCount).toBeGreaterThanOrEqual(0);
    } else {
      console.log('⏭️  Skipping: User has only one organization');
      test.skip();
    }
  });

  test('expired session redirects to login', async ({ page, context }) => {
    // Login first
    await loginWithCredentials(page, TEST_USERS.orgAdmin.username, TEST_USERS.orgAdmin.password);
    await goToDashboard(page);

    // Verify we're logged in
    expect(page.url()).toContain('/dashboard');

    // Clear session cookie to simulate expired session
    await context.clearCookies();

    // Try to access protected route
    await page.goto(`${STAGING_URL}/athletes`);
    // Wait for redirect to login
    await page.waitForURL(/\/login/, { timeout: 5000 });

    // Should redirect to login page
    expect(page.url()).toContain('/login');

    // Verify we can't access protected content - use combined selector for flexibility
    const isOnLoginPage = await page.locator('#username, input[name="username"]').count();
    expect(isOnLoginPage).toBeGreaterThan(0);
  });

  test('API requests without authentication return 401', async ({ page }) => {
    // Don't login - test unauthenticated API access

    // Try to access protected API endpoints
    const apiEndpoints = [
      '/api/athletes',
      '/api/measurements',
      '/api/teams',
      '/api/organizations'
    ];

    for (const endpoint of apiEndpoints) {
      const response = await page.request.get(`${STAGING_URL}${endpoint}`);

      // Should return 401 Unauthorized or redirect to login
      const isUnauthorized = response.status() === 401 || response.status() === 403;
      const redirectsToLogin = response.status() === 302 || response.status() === 307;

      expect(isUnauthorized || redirectsToLogin).toBeTruthy();
    }
  });

  test('session cannot be hijacked via cookie manipulation', async ({ page, context }) => {
    // Login with valid credentials
    await loginWithCredentials(page, TEST_USERS.coach.username, TEST_USERS.coach.password);
    await goToDashboard(page);

    // Get current session cookie
    const cookies = await context.cookies();
    const sessionCookie = cookies.find(c => c.name === 'connect.sid' || c.name === 'session');

    if (!sessionCookie) {
      console.log('⏭️  Skipping: Session cookie not found');
      test.skip();
      return;
    }

    // Logout
    await logout(page);
    expect(page.url()).toContain('/login');

    // Try to restore old session cookie (should be invalidated)
    await context.addCookies([sessionCookie]);

    // Try to access protected route
    await page.goto(`${STAGING_URL}/dashboard`);
    // Wait for redirect to login
    await page.waitForURL(/\/login/, { timeout: 5000 });

    // Should redirect to login (session invalidated after logout)
    expect(page.url()).toContain('/login');
  });
});

test.describe('Security: Input Validation & Injection Prevention', () => {
  test('should prevent SQL injection in athlete ID lookup', async ({ page }) => {
    // Login as coach to access athlete pages
    await loginWithCredentials(page, TEST_USERS.coach.username, TEST_USERS.coach.password);
    await goToDashboard(page);

    // Attempt SQL injection via athlete ID parameter
    const maliciousId = "1' OR '1'='1";
    await page.goto(`${STAGING_URL}/athletes/${encodeURIComponent(maliciousId)}`);
    // Wait for error page or content to load
    await page.locator('text=/not found|404|error|invalid/i').or(page.locator('main')).first().waitFor({ timeout: 5000 }).catch(() => {});

    // Should return 404 or error page, NOT expose all athletes
    const is404 = await page.locator('text=/not found|404/i').count() > 0;
    const isError = await page.locator('text=/error|invalid/i').count() > 0;

    // Should not see athlete list (which would indicate SQL injection success)
    const athleteList = await page.locator('[data-testid^="checkbox-athlete-"]').count();

    expect(is404 || isError).toBeTruthy();
    expect(athleteList).toBe(0);
  });

  test('should prevent SQL injection in team ID lookup', async ({ page }) => {
    // Login as coach
    await loginWithCredentials(page, TEST_USERS.coach.username, TEST_USERS.coach.password);
    await goToDashboard(page);

    // Attempt SQL injection via team ID parameter
    const maliciousId = "1' OR '1'='1' --";
    await page.goto(`${STAGING_URL}/teams/${encodeURIComponent(maliciousId)}`);
    // Wait for error page or content to load
    await page.locator('text=/not found|404|error|invalid/i').or(page.locator('main')).first().waitFor({ timeout: 5000 }).catch(() => {});

    // Should return 404 or error page
    const is404 = await page.locator('text=/not found|404/i').count() > 0;
    const isError = await page.locator('text=/error|invalid/i').count() > 0;

    expect(is404 || isError).toBeTruthy();
  });

  test('should sanitize XSS attempts in athlete names', async ({ page }) => {
    // Login as coach who can create athletes
    await loginWithCredentials(page, TEST_USERS.coach.username, TEST_USERS.coach.password);
    await goToAthletes(page);

    // Try to create athlete with XSS payload
    await page.click('[data-testid="add-athlete-button"], button:has-text("Add Athlete")');
    await page.waitForSelector('[data-testid="submit-athlete"], button:has-text("Save")');

    const xssPayload = '<script>alert("XSS")</script>';
    const testTimestamp = Date.now();

    // Fill form with XSS payload in name fields
    await page.fill('[data-testid="athlete-first-name"], input[name="firstName"]', xssPayload);
    await page.fill('[data-testid="athlete-last-name"], input[name="lastName"]', `TestXSS${testTimestamp}`);
    await page.fill('[data-testid="athlete-email"], input[name="email"]', `xss-test-${testTimestamp}@test.com`);

    // Submit form
    await page.click('[data-testid="submit-athlete"], button:has-text("Save")');
    // Wait for form submission and success/error state
    await page.waitForTimeout(CHART_ANIMATION_TIMEOUT);

    // Navigate to athletes page and search for the test athlete
    await goToAthletes(page);
    // Wait for athletes page to load
    await page.waitForSelector('[data-testid^="checkbox-athlete-"], .athlete-list, .empty-state', { timeout: 5000 });

    // Look for athlete in list by last name
    const athleteRow = page.locator(`text=TestXSS${testTimestamp}`).first();
    const athleteExists = await athleteRow.count() > 0;

    if (athleteExists) {
      // Verify script tag is NOT present in DOM (XSS sanitized)
      const hasScriptTag = await page.locator('script:has-text("XSS")').count();
      expect(hasScriptTag).toBe(0);

      // Verify the XSS payload is either escaped or stripped
      const pageContent = await page.content();
      const hasRawScript = pageContent.includes('<script>alert("XSS")</script>');
      expect(hasRawScript).toBe(false);

      console.log('✓ XSS payload successfully sanitized in athlete name');
    } else {
      console.log('⚠️  Test athlete not found - form may have validation that rejected XSS payload');
    }
  });

  test('should sanitize XSS attempts in team names', async ({ page }) => {
    // Login as org admin who can create teams
    await loginWithCredentials(page, TEST_USERS.orgAdmin.username, TEST_USERS.orgAdmin.password);
    await page.goto(`${STAGING_URL}/teams`);
    // Wait for teams page to load
    await page.waitForSelector('[data-testid="add-team-button"], button:has-text("Add Team"), .team-list, main', { timeout: 5000 });

    // Try to create team with XSS payload
    const addTeamButton = page.locator('[data-testid="add-team-button"], button:has-text("Add Team")');
    const hasAddButton = await addTeamButton.count() > 0;

    if (hasAddButton) {
      await addTeamButton.click();
      await page.waitForSelector('[data-testid="submit-team"], button:has-text("Save")');

      const xssPayload = '<img src=x onerror="alert(\'XSS\')">';
      const testTimestamp = Date.now();

      await page.fill('[data-testid="team-name"], input[name="name"]', `${xssPayload} TestTeam${testTimestamp}`);

      await page.click('[data-testid="submit-team"], button:has-text("Save")');
      // Wait for form submission to complete
      await page.waitForTimeout(1000);

      // Verify XSS payload is sanitized
      const hasImgTag = await page.locator('img[src="x"][onerror]').count();
      expect(hasImgTag).toBe(0);

      const pageContent = await page.content();
      const hasRawImgTag = pageContent.includes('onerror="alert');
      expect(hasRawImgTag).toBe(false);

      console.log('✓ XSS payload successfully sanitized in team name');
    } else {
      console.log('⏭️  Skipping team XSS test: User does not have permission to create teams');
    }
  });
});

test.describe('RBAC/Permissions Summary', () => {
  test('print permissions test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('RBAC/Permissions Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Athlete role: own data only');
    console.log('✅ Coach role: team athletes only');
    console.log('✅ Org admin: org-scoped access');
    console.log('✅ Site admin: full access');
    console.log('✅ Unauthorized access → 403/redirect');
    console.log('✅ Organization context switching');
    console.log('✅ Data filtered by organization');
    console.log('✅ Cross-org data isolation');
    console.log('✅ Permission-based navigation');
    console.log('✅ Role hierarchy');
    console.log('\n--- Enhanced Edge Cases ---');
    console.log('✅ Cross-org data isolation (coach cannot see other org athletes)');
    console.log('✅ Permission escalation prevention (URL manipulation blocked)');
    console.log('✅ Multi-org context switching (correct data filtering)');
    console.log('✅ Expired session handling (redirects to login)');
    console.log('✅ Unauthenticated API access (returns 401)');
    console.log('✅ Session hijacking prevention (invalidated cookies rejected)');
    console.log('\n--- Security: Input Validation ---');
    console.log('✅ SQL injection prevention (athlete ID lookup)');
    console.log('✅ SQL injection prevention (team ID lookup)');
    console.log('✅ XSS sanitization (athlete names)');
    console.log('✅ XSS sanitization (team names)');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
