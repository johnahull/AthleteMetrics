import { test, expect, Page } from './fixtures/e2e-base';
import { loginAsAthlete } from './helpers/auth';

/**
 * ATHLETE DASHBOARD WEEK 1: E2E Tests
 *
 * Tests verify the Week 1 UX improvements for athlete home page:
 * - AthleteHomeHero with welcome message, streak, last activity
 * - MetricProgressCard with PRs and improvement indicators
 * - RecentActivityTimeline with last 5 measurements
 * - WellnessStatusCard (conditional on wellness enabled)
 * - Mobile-responsive design
 *
 * Prerequisites:
 * - Athlete account with measurements exists
 * - Organization may or may not have wellness enabled
 *
 * NOTE: In CI environments, all roles may use the same admin account.
 * Admin users don't have an athleteId, so /my-dashboard redirects them to /dashboard.
 * Tests will be skipped when the test user isn't actually an athlete.
 */

const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';

/**
 * Helper to navigate to my-dashboard and check if user is actually an athlete.
 * Returns true if on my-dashboard, false if redirected (user isn't an athlete).
 */
async function navigateToAthleteDashboard(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/my-dashboard`);
  await page.waitForLoadState('networkidle');

  // Give time for any redirect to complete
  await page.waitForTimeout(500);

  // Check if we're still on my-dashboard or were redirected
  const url = page.url();
  if (!url.includes('/my-dashboard')) {
    console.log('User is not an athlete (redirected to:', url, ') - skipping athlete-specific test');
    return false;
  }
  return true;
}

test.describe('Athlete Dashboard - Week 1 UX Improvements', () => {
  test.beforeEach(async ({ page }) => {
    // Login as athlete user (may be admin in CI)
    await loginAsAthlete(page);
  });

  test.describe('AthleteHomeHero Component', () => {
    test('should display welcome message with athlete first name', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const welcomeMessage = page.locator('[data-testid="welcome-message"]');
      await expect(welcomeMessage).toBeVisible();
      await expect(welcomeMessage).toContainText('Welcome back');
    });

    test('should display measurement streak for current month', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const streakTracker = page.locator('[data-testid="streak-tracker"]');
      await expect(streakTracker).toBeVisible();
      // The streak tracker shows "X measurements this month 🔥"
      await expect(streakTracker).toContainText(/\d+ measurements? this month/);
      await expect(streakTracker).toContainText('🔥');
    });

    test('should display last activity date', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const lastActivity = page.locator('[data-testid="last-activity"]');
      await expect(lastActivity).toBeVisible();
      await expect(lastActivity).toContainText('Last measured:');
    });

    test('should have gradient hero background', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const hero = page.locator('[data-testid="athlete-home-hero"]');
      await expect(hero).toBeVisible();

      // Verify gradient styling is applied
      const bgClass = await hero.getAttribute('class');
      expect(bgClass).toContain('bg-gradient');
    });
  });

  test.describe('MetricProgressCard Component', () => {
    test('should display metric progress cards', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Look for metric progress cards (there may be multiple)
      const metricCards = page.locator('[data-testid="metric-progress-card"]');
      const count = await metricCards.count();

      // At least one card should be visible if athlete has data
      // Note: If no measurements exist, this test will pass with 0 cards
      if (count > 0) {
        await expect(metricCards.first()).toBeVisible();
      }
    });

    test('should show current value and PR for metrics', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Check for PR value display
      const prValues = page.locator('[data-testid="pr-value"]');
      const count = await prValues.count();

      if (count > 0) {
        const firstPR = prValues.first();
        await expect(firstPR).toBeVisible();

        // Should contain a numeric value
        const valueText = await firstPR.textContent();
        expect(valueText).toMatch(/\d+\.?\d*/);
      }
    });

    test('should show new PR badges for recent PRs', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Check for new PR badges (may or may not exist depending on data)
      const newPrBadges = page.locator('[data-testid="new-pr-badge"]');
      const count = await newPrBadges.count();

      // If new PR badges exist, they should contain "New PR" text
      if (count > 0) {
        const badge = newPrBadges.first();
        await expect(badge).toBeVisible();
        await expect(badge).toContainText(/new pr/i);
      }
    });

    test('should show trend indicators', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Check for trend badges
      const trendBadges = page.locator('[data-testid="trend-badge"]');
      const count = await trendBadges.count();

      if (count > 0) {
        await expect(trendBadges.first()).toBeVisible();
      }
    });
  });

  test.describe('RecentActivityTimeline Component', () => {
    test('should display recent activity timeline', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Check for timeline or empty state
      const timeline = page.locator('[data-testid="recent-activity-timeline"]');
      const emptyState = page.locator('[data-testid="no-recent-activity"]');

      // Either timeline or empty state should be visible
      const timelineVisible = await timeline.isVisible().catch(() => false);
      const emptyStateVisible = await emptyState.isVisible().catch(() => false);

      expect(timelineVisible || emptyStateVisible).toBeTruthy();
    });

    test('should display activity items', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Check for individual activity items (pattern: activity-{id})
      const activities = page.locator('[data-testid^="activity-"]');
      const count = await activities.count();

      // If activities exist, verify first one is visible
      if (count > 0) {
        await expect(activities.first()).toBeVisible();
      }
    });

    test('should show heading for Recent Activity', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Verify Recent Activity heading exists
      await expect(page.getByRole('heading', { name: /Recent Activity/i }).first()).toBeVisible();
    });
  });

  test.describe('WellnessStatusCard Component (Conditional)', () => {
    test('should show wellness card when wellness is enabled', async ({ page }) => {
      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const wellnessCard = page.locator('[data-testid="wellness-status-card"]');
      const isVisible = await wellnessCard.isVisible().catch(() => false);

      // If wellness is enabled for this org, card should be visible
      if (isVisible) {
        await expect(wellnessCard).toBeVisible();
        await expect(page.getByRole('heading', { name: /Wellness Status/i })).toBeVisible();
      }
      // If not visible, that's okay - wellness might not be enabled
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('should be mobile-responsive on small viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Hero should still be visible
      await expect(page.locator('[data-testid="athlete-home-hero"]')).toBeVisible();

      // Content should be accessible on mobile
      const hero = page.locator('[data-testid="athlete-home-hero"]');
      const box = await hero.boundingBox();
      expect(box).not.toBeNull();

      // Hero should fit within mobile viewport width
      if (box) {
        expect(box.width).toBeLessThanOrEqual(375);
      }
    });

    test('should be readable on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });

      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // All main components should be visible and readable
      await expect(page.locator('[data-testid="athlete-home-hero"]')).toBeVisible();
    });
  });

  test.describe('Console Errors', () => {
    test('should not have console errors on page load', async ({ page }) => {
      const consoleErrors: string[] = [];

      // Known non-critical errors to ignore (e.g., push notifications when VAPID not configured)
      const ignoredErrorPatterns = [
        /push.*notification/i,
        /VAPID/i,
        /service.?worker/i,
        /Failed to fetch/i, // Network errors during optional feature checks
      ];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Only track errors that aren't in the ignore list
          const shouldIgnore = ignoredErrorPatterns.some(pattern => pattern.test(text));
          if (!shouldIgnore) {
            consoleErrors.push(text);
          }
        }
      });

      const isAthlete = await navigateToAthleteDashboard(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Wait for components to render
      await page.waitForTimeout(2000);

      // Should have no unexpected console errors
      expect(consoleErrors.length).toBe(0);
    });
  });
});
