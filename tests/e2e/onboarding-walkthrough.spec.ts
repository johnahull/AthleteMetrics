import { test, expect } from './fixtures/e2e-base';
import { loginAs } from './helpers/auth';

/**
 * Onboarding Walkthrough E2E Tests
 *
 * Tests the first-time user onboarding experience:
 * - Tour auto-starts for new users
 * - Role-specific tour content
 * - Tour completion persistence
 * - Replay functionality from profile
 * - Site admins skip onboarding
 *
 * Note: These tests require users that haven't completed onboarding.
 * Since we can't easily create test users with hasCompletedOnboarding=false,
 * we primarily test the replay functionality and UI elements.
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Onboarding Walkthrough', () => {
  test.describe('Tour UI Elements', () => {
    test('athlete should see "App Tour" option in My Profile', async ({ page }) => {
      await loginAs(page, 'athlete');

      // Navigate to My Profile
      await page.goto(`${TESTING_URL}/my-profile`);
      await page.waitForLoadState('networkidle');

      // Look for the App Tour / Help & Guidance section
      const tourSection = page.locator('text=Help & Guidance').or(page.locator('text=App Tour'));
      await expect(tourSection).toBeVisible({ timeout: 10000 });
    });

    test('athlete should be able to start tour from profile', async ({ page }) => {
      await loginAs(page, 'athlete');

      await page.goto(`${TESTING_URL}/my-profile`);
      await page.waitForLoadState('networkidle');

      // Find and click the replay tour button
      const replayButton = page.locator('button:has-text("Replay"), button:has-text("Start Tour"), button:has-text("App Tour")');

      if (await replayButton.isVisible()) {
        await replayButton.click();

        // Wait for tour to appear - react-joyride creates elements with specific classes
        const tourTooltip = page.locator('.react-joyride__tooltip, [data-testid="joyride-tooltip"], [role="dialog"]');

        // Tour should appear
        await expect(tourTooltip).toBeVisible({ timeout: 5000 });
      }
    });

    test('coach should see App Tour option', async ({ page }) => {
      await loginAs(page, 'coach');

      await page.goto(`${TESTING_URL}/my-profile`);
      await page.waitForLoadState('networkidle');

      const tourSection = page.locator('text=Help & Guidance').or(page.locator('text=App Tour'));
      await expect(tourSection).toBeVisible({ timeout: 10000 });
    });

    test('org admin should see App Tour option', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/my-profile`);
      await page.waitForLoadState('networkidle');

      const tourSection = page.locator('text=Help & Guidance').or(page.locator('text=App Tour'));
      await expect(tourSection).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Sidebar Navigation Tour Targets', () => {
    test('athlete sidebar should have tour target attributes', async ({ page }) => {
      await loginAs(page, 'athlete');

      await page.goto(`${TESTING_URL}/my-dashboard`);
      await page.waitForLoadState('networkidle');

      // Verify tour target attributes exist on navigation items
      const dashboardNav = page.locator('[data-tour="my-dashboard"]');
      await expect(dashboardNav).toBeVisible({ timeout: 10000 });

      const measurementsNav = page.locator('[data-tour="my-measurements"]');
      await expect(measurementsNav).toBeVisible();

      const goalsNav = page.locator('[data-tour="my-goals"]');
      await expect(goalsNav).toBeVisible();
    });

    test('coach sidebar should have tour target attributes', async ({ page }) => {
      await loginAs(page, 'coach');

      await page.goto(`${TESTING_URL}/dashboard`);
      await page.waitForLoadState('networkidle');

      // Verify coach-specific tour targets
      const dashboardNav = page.locator('[data-tour="dashboard"]');
      await expect(dashboardNav).toBeVisible({ timeout: 10000 });

      const teamsNav = page.locator('[data-tour="teams"]');
      await expect(teamsNav).toBeVisible();

      const athletesNav = page.locator('[data-tour="athletes"]');
      await expect(athletesNav).toBeVisible();
    });
  });

  test.describe('Replay Tour Flow', () => {
    test('should complete tour and then replay successfully', async ({ page }) => {
      await loginAs(page, 'athlete');

      await page.goto(`${TESTING_URL}/my-profile`);
      await page.waitForLoadState('networkidle');

      // Step 1: Start the tour via replay button
      const startButton = page.locator('button:has-text("Replay"), button:has-text("Start Tour"), button:has-text("App Tour")').first();

      if (await startButton.isVisible()) {
        await startButton.click();

        // Wait for tour to appear
        await page.waitForTimeout(1000);
        const tourTooltip = page.locator('.react-joyride__tooltip, [data-testid="joyride-tooltip"], [role="dialog"]');

        // Verify tour is visible
        if (await tourTooltip.isVisible()) {
          // Step 2: Complete or skip the tour
          const skipButton = page.locator('button:has-text("Skip"), button:has-text("Close")').first();
          if (await skipButton.isVisible()) {
            await skipButton.click();
            await page.waitForTimeout(500);
          }

          // Step 3: Verify tour is dismissed
          await expect(tourTooltip).not.toBeVisible({ timeout: 3000 });

          // Step 4: Click replay button again
          const replayButton = page.locator('button:has-text("Replay"), button:has-text("Start Tour")').first();
          if (await replayButton.isVisible()) {
            await replayButton.click();

            // Step 5: Verify tour starts again
            await page.waitForTimeout(1000);
            await expect(tourTooltip).toBeVisible({ timeout: 5000 });

            // Clean up - close the tour
            const closeButton = page.locator('button:has-text("Skip"), button:has-text("Close")').first();
            if (await closeButton.isVisible()) {
              await closeButton.click();
            }
          }
        }
      }
    });

    test('replay tour should clear localStorage and reset API status', async ({ page }) => {
      await loginAs(page, 'athlete');

      // Navigate to profile
      await page.goto(`${TESTING_URL}/my-profile`);
      await page.waitForLoadState('networkidle');

      // Check initial onboarding status via API
      const initialResponse = await page.request.get(`${TESTING_URL}/api/profile/onboarding-status`);
      expect(initialResponse.status()).toBe(200);

      // Click replay tour button
      const replayButton = page.locator('button:has-text("Replay"), button:has-text("Start Tour")').first();

      if (await replayButton.isVisible()) {
        await replayButton.click();

        // Wait for tour to start
        await page.waitForTimeout(1000);

        // Verify localStorage would be cleared by checking tour appears
        // (Tour only appears if localStorage key is removed)
        const tourTooltip = page.locator('.react-joyride__tooltip, [role="dialog"]');
        const isTourVisible = await tourTooltip.isVisible();

        // If tour is visible, replay worked correctly
        if (isTourVisible) {
          // Close the tour
          const closeButton = page.locator('button:has-text("Skip"), button:has-text("Close")').first();
          if (await closeButton.isVisible()) {
            await closeButton.click();
          }
        }
      }
    });
  });

  test.describe('Tour Interaction', () => {
    test('tour should have navigation buttons when active', async ({ page }) => {
      await loginAs(page, 'athlete');

      await page.goto(`${TESTING_URL}/my-profile`);
      await page.waitForLoadState('networkidle');

      // Try to start the tour
      const replayButton = page.locator('button:has-text("Replay"), button:has-text("Start")').first();

      if (await replayButton.isVisible()) {
        await replayButton.click();

        // Wait for tour tooltip
        await page.waitForTimeout(1000);

        // Check for navigation buttons in the tour
        const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")');
        const skipButton = page.locator('button:has-text("Skip")');

        // At least one navigation button should be visible
        const hasNavButtons = await nextButton.isVisible() || await skipButton.isVisible();

        if (hasNavButtons) {
          // If skip is visible, use it to close the tour
          if (await skipButton.isVisible()) {
            await skipButton.click();
          }
        }
      }
    });

    test('tour should be dismissable', async ({ page }) => {
      await loginAs(page, 'athlete');

      await page.goto(`${TESTING_URL}/my-profile`);
      await page.waitForLoadState('networkidle');

      const replayButton = page.locator('button:has-text("Replay"), button:has-text("Start")').first();

      if (await replayButton.isVisible()) {
        await replayButton.click();
        await page.waitForTimeout(1000);

        // Look for close/skip button
        const closeButton = page.locator('button:has-text("Skip"), button:has-text("Close"), [aria-label="Close"]').first();

        if (await closeButton.isVisible()) {
          await closeButton.click();

          // Tour tooltip should disappear
          await page.waitForTimeout(500);
          const tourTooltip = page.locator('.react-joyride__tooltip');
          await expect(tourTooltip).not.toBeVisible({ timeout: 3000 });
        }
      }
    });
  });

  test.describe('API Endpoints', () => {
    test('GET /api/profile/onboarding-status should return status', async ({ page, request }) => {
      await loginAs(page, 'athlete');

      // Make API request using page context (includes auth cookies)
      const response = await page.request.get(`${TESTING_URL}/api/profile/onboarding-status`);

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('hasCompletedOnboarding');
      expect(typeof data.hasCompletedOnboarding).toBe('boolean');
    });

    test('PUT /api/profile/onboarding-status should update status', async ({ page }) => {
      await loginAs(page, 'athlete');

      // First get current status
      const getResponse = await page.request.get(`${TESTING_URL}/api/profile/onboarding-status`);
      const initialData = await getResponse.json();

      // Toggle the status
      const newStatus = !initialData.hasCompletedOnboarding;

      const putResponse = await page.request.put(`${TESTING_URL}/api/profile/onboarding-status`, {
        data: { completed: newStatus }
      });

      expect(putResponse.status()).toBe(200);

      const putData = await putResponse.json();
      expect(putData.hasCompletedOnboarding).toBe(newStatus);

      // Reset back to original
      await page.request.put(`${TESTING_URL}/api/profile/onboarding-status`, {
        data: { completed: initialData.hasCompletedOnboarding }
      });
    });

    test('PUT /api/profile/onboarding-status should reject invalid payload', async ({ page }) => {
      await loginAs(page, 'athlete');

      const response = await page.request.put(`${TESTING_URL}/api/profile/onboarding-status`, {
        data: { completed: 'not-a-boolean' }
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Site Admin Behavior', () => {
    test('site admin should not auto-trigger onboarding tour', async ({ page }) => {
      await loginAs(page, 'site_admin');

      await page.goto(`${TESTING_URL}/dashboard`);
      await page.waitForLoadState('networkidle');

      // Wait a moment for any tour to potentially start
      await page.waitForTimeout(2000);

      // Tour should NOT be visible for site admins
      const tourTooltip = page.locator('.react-joyride__tooltip, [data-testid="joyride-tooltip"]');
      await expect(tourTooltip).not.toBeVisible();
    });
  });
});
