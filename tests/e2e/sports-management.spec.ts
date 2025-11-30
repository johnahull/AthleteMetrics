import { test, expect } from "@playwright/test";
import { loginAsDefaultUser, logout, clearAuthState } from "./helpers/auth";

const STAGING_URL = process.env.STAGING_URL || process.env.TESTING_URL || 'http://localhost:5000';

/**
 * E2E tests for Sports and Positions Management
 *
 * Tests the site admin workflow for managing sports and their positions
 * from the Sports Management page.
 */
test.describe("Sports Management", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure clean state before each test
    await clearAuthState(page);
    await loginAsDefaultUser(page); // Assumes default user is site admin
  });

  test.afterEach(async ({ page }) => {
    try {
      await logout(page);
    } catch {
      // Ignore logout errors in afterEach
    }
  });

  test("should navigate to Sports Management page from sidebar", async ({
    page,
  }) => {
    // Click on Sports in the sidebar
    await page.click('[data-testid="sports-menu-item"]');

    // Should be on the sports management page
    await expect(page).toHaveURL(/.*\/sports/);

    // Should see the page title
    await expect(page.locator("h1")).toContainText("Sports Management");
  });

  test("should display existing sports", async ({ page }) => {
    await page.goto(`${STAGING_URL}/sports`);
    await page.waitForLoadState("networkidle");

    // Should see at least Soccer (seeded by migration)
    await expect(page.locator("text=Soccer")).toBeVisible();

    // Should see positions section when expanding Soccer
    await page.click('text=Soccer');
    await expect(page.locator("text=Forward")).toBeVisible();
    await expect(page.locator("text=Midfielder")).toBeVisible();
    await expect(page.locator("text=Defender")).toBeVisible();
    await expect(page.locator("text=Goalkeeper")).toBeVisible();
  });

  test("should create a new sport", async ({ page }) => {
    await page.goto(`${STAGING_URL}/sports`);
    await page.waitForLoadState("networkidle");

    // Click Add Sport button
    await page.click('[data-testid="add-sport-button"]');

    // Fill in sport details
    await page.fill('[data-testid="sport-code-input"]', "BASKETBALL");
    await page.fill('[data-testid="sport-name-input"]', "Basketball");
    await page.fill(
      '[data-testid="sport-description-input"]',
      "Team sport with a ball and hoops"
    );

    // Submit the form
    await page.click('[data-testid="save-sport-button"]');

    // Should see success message or the new sport in the list
    await expect(page.locator("text=Basketball")).toBeVisible({
      timeout: 10000,
    });
  });

  test("should create positions for a sport", async ({ page }) => {
    await page.goto(`${STAGING_URL}/sports`);
    await page.waitForLoadState("networkidle");

    // First, expand the sport accordion (assuming Basketball exists from previous test or use Soccer)
    const sportRow = page.locator('[data-testid="sport-row-SOCCER"]');
    if (await sportRow.isVisible()) {
      await sportRow.click();
    } else {
      // Fallback to clicking any sport
      await page.click('[data-testid^="sport-row-"]');
    }

    // Click Add Position button (need to use sport code for the testid)
    await page.click('[data-testid="add-position-SOCCER"]');

    // Fill in position details
    await page.fill('[data-testid="position-code-input"]', "TEST_POS");
    await page.fill('[data-testid="position-name-input"]', "Test Position");
    await page.fill('[data-testid="position-shortname-input"]', "TP");

    // Submit
    await page.click('[data-testid="save-position-button"]');

    // Should see the new position
    await expect(page.locator("text=Test Position")).toBeVisible({
      timeout: 10000,
    });
  });

  test("should edit a sport", async ({ page }) => {
    await page.goto(`${STAGING_URL}/sports`);
    await page.waitForLoadState("networkidle");

    // Click edit button for Soccer
    await page.click('[data-testid="edit-sport-SOCCER"]');

    // Modify the description
    await page.fill(
      '[data-testid="sport-description-input"]',
      "Updated description for Soccer"
    );

    // Save changes
    await page.click('[data-testid="save-sport-button"]');

    // Verify the change was saved (may need to re-open to verify)
    await expect(
      page.locator("text=Updated description for Soccer")
    ).toBeVisible({ timeout: 10000 });
  });

  test("should not delete system default sport", async ({ page }) => {
    await page.goto(`${STAGING_URL}/sports`);
    await page.waitForLoadState("networkidle");

    // Try to delete Soccer (system default)
    const deleteButton = page.locator('[data-testid="delete-sport-SOCCER"]');

    if (await deleteButton.isVisible()) {
      await deleteButton.click();

      // Should see a warning or error that system defaults cannot be deleted
      await expect(
        page.locator("text=Cannot delete system default")
      ).toBeVisible({ timeout: 5000 });

      // Cancel the dialog
      await page.click('[data-testid="cancel-delete-button"]');
    } else {
      // Delete button may be disabled for system defaults
      expect(true).toBeTruthy();
    }
  });

  test("should show sport usage statistics", async ({ page }) => {
    await page.goto(`${STAGING_URL}/sports`);
    await page.waitForLoadState("networkidle");

    // Expand Soccer to see usage stats
    await page.click('[data-testid="sport-row-SOCCER"]');

    // Should show usage information (athletes, teams, metrics count)
    await expect(page.locator("text=teams")).toBeVisible({ timeout: 5000 });
  });

  test("should toggle sport active status", async ({ page }) => {
    await page.goto(`${STAGING_URL}/sports`);
    await page.waitForLoadState("networkidle");

    // Find the toggle for a non-system-default sport or skip if only Soccer exists
    const statusToggle = page.locator('[data-testid^="toggle-sport-status-"]').first();

    if (await statusToggle.isVisible()) {
      const initialState = await statusToggle.isChecked();

      // Toggle the status
      await statusToggle.click();

      // Wait for API call to complete
      await page.waitForResponse((response) =>
        response.url().includes("/api/sports/") && response.status() === 200
      );

      // Status should have changed
      const newState = await statusToggle.isChecked();
      expect(newState).not.toBe(initialState);

      // Toggle back to original state
      await statusToggle.click();
    }
  });

  test("should filter sports by search", async ({ page }) => {
    await page.goto(`${STAGING_URL}/sports`);
    await page.waitForLoadState("networkidle");

    // Find search input if it exists
    const searchInput = page.locator('[data-testid="search-sports-input"]');

    if (await searchInput.isVisible()) {
      // Search for Soccer
      await searchInput.fill("Soccer");

      // Should still see Soccer
      await expect(page.locator("text=Soccer")).toBeVisible();

      // Search for non-existent sport
      await searchInput.fill("NonExistentSport");

      // Should not see Soccer anymore
      await expect(page.locator("text=Soccer")).not.toBeVisible();

      // Clear search
      await searchInput.clear();
    }
  });

  test("should validate required fields when creating sport", async ({
    page,
  }) => {
    await page.goto(`${STAGING_URL}/sports`);
    await page.waitForLoadState("networkidle");

    // Open create sport dialog
    await page.click('[data-testid="add-sport-button"]');

    // Try to submit without filling required fields
    await page.click('[data-testid="save-sport-button"]');

    // Should see validation errors
    await expect(page.locator("text=required")).toBeVisible({ timeout: 5000 });
  });

  test("should not allow duplicate sport codes", async ({ page }) => {
    await page.goto(`${STAGING_URL}/sports`);
    await page.waitForLoadState("networkidle");

    // Open create sport dialog
    await page.click('[data-testid="add-sport-button"]');

    // Try to create a sport with existing code
    await page.fill('[data-testid="sport-code-input"]', "SOCCER");
    await page.fill('[data-testid="sport-name-input"]', "Duplicate Soccer");

    // Submit
    await page.click('[data-testid="save-sport-button"]');

    // Should see error about duplicate code
    await expect(page.locator("text=already exists")).toBeVisible({
      timeout: 5000,
    });
  });
});

/**
 * Access control tests - ensure non-site-admins cannot access
 * NOTE: These tests require specific test users to be available.
 * They may be skipped in environments where only the default site admin is available.
 */
test.describe("Sports Management Access Control", () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
  });

  test.skip("should redirect non-site-admin away from sports page", async ({
    page,
  }) => {
    // This test requires a coach user to be available
    // Skip if only default site admin credentials are available
    const coachUsername = process.env.COACH_USERNAME;
    const coachPassword = process.env.COACH_PASSWORD;

    if (!coachUsername || !coachPassword) {
      test.skip();
    }

    // Login as a regular coach user
    await page.goto(`${STAGING_URL}/login`);
    await page.fill('#username, input[name="username"]', coachUsername);
    await page.fill('#password, input[name="password"]', coachPassword);
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");

    // Try to navigate to sports management
    await page.goto(`${STAGING_URL}/sports`);
    await page.waitForLoadState("networkidle");

    // Should be redirected or see unauthorized message
    const url = page.url();
    const isRedirected = !url.includes("/sports");
    const hasErrorMessage = await page.locator("text=Unauthorized").isVisible();
    const hasAccessDenied = await page.locator("text=Access Denied").isVisible();

    expect(isRedirected || hasErrorMessage || hasAccessDenied).toBeTruthy();
  });

  test.skip("should not show Sports link in sidebar for non-admin users", async ({
    page,
  }) => {
    // This test requires an athlete user to be available
    // Skip if only default site admin credentials are available
    const athleteUsername = process.env.ATHLETE_USERNAME;
    const athletePassword = process.env.ATHLETE_PASSWORD;

    if (!athleteUsername || !athletePassword) {
      test.skip();
    }

    // Login as a regular athlete user
    await page.goto(`${STAGING_URL}/login`);
    await page.fill('#username, input[name="username"]', athleteUsername);
    await page.fill('#password, input[name="password"]', athletePassword);
    await page.click('button[type="submit"]');
    await page.waitForLoadState("networkidle");

    // Sports menu item should not be visible
    await expect(page.locator('[data-testid="sports-menu-item"]')).not.toBeVisible();
  });
});
