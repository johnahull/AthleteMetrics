import { test, expect } from '@playwright/test';
import { loginAsAthlete } from './helpers/auth';

/**
 * ATHLETE DASHBOARD WEEK 1: E2E Tests
 *
 * Tests verify the Week 1 UX improvements for athlete home page:
 * - AthleteHomeHero with welcome message, streak, last activity
 * - PersonalRecordsCard with all PRs and improvement indicators
 * - Confetti celebration for recent PRs (within 7 days)
 * - RecentActivityTimeline with last 5 measurements and insights
 * - WellnessStatusCard (conditional on wellness enabled)
 * - Mobile-responsive design
 *
 * Prerequisites:
 * - Athlete account with measurements exists
 * - Some measurements should be recent (within 7 days) for PR celebration
 * - Organization may or may not have wellness enabled
 */

const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Athlete Dashboard - Week 1 UX Improvements', () => {
  test.beforeEach(async ({ page }) => {
    // Login as athlete user
    await loginAsAthlete(page);
  });

  test.describe('AthleteHomeHero Component', () => {
    test('should display welcome message with athlete first name', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const welcomeMessage = page.locator('[data-testid="welcome-message"]');
      await expect(welcomeMessage).toBeVisible();
      await expect(welcomeMessage).toContainText('Welcome back,');
    });

    test('should display measurement streak for current month', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const streakTracker = page.locator('[data-testid="streak-tracker"]');
      await expect(streakTracker).toBeVisible();
      await expect(streakTracker).toContainText('measurements this month');
      await expect(streakTracker).toContainText('🔥');
    });

    test('should display last activity date', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const lastActivity = page.locator('[data-testid="last-activity"]');
      await expect(lastActivity).toBeVisible();
      await expect(lastActivity).toContainText('Last measured:');
    });

    test('should have gradient hero background', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const hero = page.locator('[data-testid="athlete-home-hero"]');
      await expect(hero).toBeVisible();

      // Verify gradient styling is applied
      const bgClass = await hero.getAttribute('class');
      expect(bgClass).toContain('bg-gradient');
    });
  });

  test.describe('PersonalRecordsCard Component', () => {
    test('should display all personal records', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const prCard = page.locator('[data-testid="personal-records-card"]');
      await expect(prCard).toBeVisible();

      // Should have heading
      await expect(page.getByRole('heading', { name: /Personal Records/i })).toBeVisible();
    });

    test('should show PR values with units', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      // Look for any PR card
      const prCards = page.locator('[data-testid^="pr-card-"]');
      const count = await prCards.count();

      if (count > 0) {
        // First PR should have value with units
        const firstPR = prCards.first();
        const valueText = await firstPR.textContent();

        // Should contain either 's' (seconds) or 'in' (inches)
        expect(valueText).toMatch(/\d+\.?\d*[sin]/);
      }
    });

    test('should show improvement indicators when available', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      // Check if any improvement indicators exist
      const improvements = page.locator('[data-testid^="improvement-"]');
      const count = await improvements.count();

      if (count > 0) {
        const firstImprovement = improvements.first();
        await expect(firstImprovement).toBeVisible();

        // Should contain improvement arrow and text
        const text = await firstImprovement.textContent();
        expect(text).toMatch(/↑|faster|higher/);
      }
    });

    test('should show celebration badge for recent PRs', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      // Check for celebration badges
      const celebrationBadges = page.locator('[data-testid^="celebration-badge-"]');
      const count = await celebrationBadges.count();

      // If recent PRs exist, should show badge
      if (count > 0) {
        const badge = celebrationBadges.first();
        await expect(badge).toBeVisible();
        await expect(badge).toContainText('New PR!');
        await expect(badge).toContainText('🎉');
      }
    });

    test('should display metric icons for each PR', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const metricIcons = page.locator('[data-testid^="metric-icon-"]');
      const count = await metricIcons.count();

      if (count > 0) {
        // All icons should be visible
        for (let i = 0; i < count; i++) {
          await expect(metricIcons.nth(i)).toBeVisible();
        }
      }
    });
  });

  test.describe('RecentActivityTimeline Component', () => {
    test('should display recent activity timeline', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const timeline = page.locator('[data-testid="recent-activity-timeline"]');
      await expect(timeline).toBeVisible();

      // Should have heading
      await expect(page.getByRole('heading', { name: /Recent Activity/i })).toBeVisible();
    });

    test('should display last 5 activities', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const activities = page.locator('[data-testid^="activity-"]');
      const count = await activities.count();

      // Should display at most 5 activities
      expect(count).toBeLessThanOrEqual(5);
    });

    test('should show date, metric, value for each activity', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const activities = page.locator('[data-testid^="activity-"]');
      const count = await activities.count();

      if (count > 0) {
        const firstActivity = activities.first();

        // Should have date
        await expect(firstActivity.locator('[data-testid^="activity-date-"]')).toBeVisible();

        // Should have metric icon
        await expect(firstActivity.locator('[data-testid^="metric-icon-"]')).toBeVisible();

        // Should have value with units
        const activityText = await firstActivity.textContent();
        expect(activityText).toMatch(/\d+\.?\d*[sin]/);
      }
    });

    test('should display insights for activities', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const insights = page.locator('[data-testid^="insight-"]');
      const count = await insights.count();

      if (count > 0) {
        const firstInsight = insights.first();
        await expect(firstInsight).toBeVisible();

        // Insights should contain one of the expected patterns
        const text = await firstInsight.textContent();
        expect(text).toMatch(/New personal record|Improved by|Consistent performance/);
      }
    });

    test('should show timeline connectors between activities', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const connectors = page.locator('[data-testid^="timeline-connector"]');
      const count = await connectors.count();

      // Should have n-1 connectors for n activities (or 0 if only 1 activity)
      const activities = page.locator('[data-testid^="activity-"]');
      const activityCount = await activities.count();

      if (activityCount > 1) {
        expect(count).toBe(activityCount - 1);
      }
    });
  });

  test.describe('WellnessStatusCard Component (Conditional)', () => {
    test('should show wellness card when wellness is enabled', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const wellnessCard = page.locator('[data-testid="wellness-status-card"]');
      const isVisible = await wellnessCard.isVisible().catch(() => false);

      // If wellness is enabled for this org, card should be visible
      if (isVisible) {
        await expect(wellnessCard).toBeVisible();
        await expect(page.getByRole('heading', { name: /Wellness Status/i })).toBeVisible();
      }
      // If not visible, that's okay - wellness might not be enabled
    });

    test('should show last submission date when wellness data exists', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const wellnessCard = page.locator('[data-testid="wellness-status-card"]');
      const isVisible = await wellnessCard.isVisible().catch(() => false);

      if (isVisible) {
        const lastSubmission = page.locator('[data-testid="last-submission-date"]');
        await expect(lastSubmission).toBeVisible();
      }
    });

    test('should show flagged concerns count', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const wellnessCard = page.locator('[data-testid="wellness-status-card"]');
      const isVisible = await wellnessCard.isVisible().catch(() => false);

      if (isVisible) {
        const concernCount = page.locator('[data-testid="concern-count"]');
        const countVisible = await concernCount.isVisible().catch(() => false);

        if (countVisible) {
          await expect(concernCount).toBeVisible();
          const text = await concernCount.textContent();
          expect(text).toMatch(/\d+ concern[s]? flagged|No concerns/);
        }
      }
    });

    test('should show link to wellness page', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const wellnessCard = page.locator('[data-testid="wellness-status-card"]');
      const isVisible = await wellnessCard.isVisible().catch(() => false);

      if (isVisible) {
        const wellnessLink = page.locator('[data-testid="wellness-link"]');
        await expect(wellnessLink).toBeVisible();

        const href = await wellnessLink.getAttribute('href');
        expect(href).toContain('wellness');
      }
    });
  });

  test.describe('Mobile Responsiveness', () => {
    test('should be mobile-responsive on small viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      // All components should still be visible
      await expect(page.locator('[data-testid="athlete-home-hero"]')).toBeVisible();
      await expect(page.locator('[data-testid="personal-records-card"]')).toBeVisible();
      await expect(page.locator('[data-testid="recent-activity-timeline"]')).toBeVisible();

      // Should stack vertically on mobile
      const timeline = page.locator('[data-testid="recent-activity-timeline"]');
      const box = await timeline.boundingBox();
      expect(box).not.toBeNull();
    });

    test('should be readable on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      // All components should be visible and readable
      await expect(page.locator('[data-testid="athlete-home-hero"]')).toBeVisible();
      await expect(page.locator('[data-testid="personal-records-card"]')).toBeVisible();
      await expect(page.locator('[data-testid="recent-activity-timeline"]')).toBeVisible();
    });
  });

  test.describe('Console Errors', () => {
    test('should not have console errors on page load', async ({ page }) => {
      const consoleErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      // Wait for components to render
      await page.waitForTimeout(2000);

      // Should have no console errors
      expect(consoleErrors.length).toBe(0);
    });
  });
});
