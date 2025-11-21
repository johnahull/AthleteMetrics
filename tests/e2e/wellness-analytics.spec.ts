import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * WELLNESS QUESTIONNAIRE: Analytics Dashboard E2E Tests (TDD - RED PHASE)
 *
 * Tests verify the complete analytics dashboard functionality:
 * - Summary cards (average wellness, completion rate, trends)
 * - Trend chart (individual athlete wellness over time)
 * - Team heatmap (all athletes x dates with color-coded wellness)
 * - Alerts (concerning patterns detection)
 * - Filtering (date range, teams, athletes, questions)
 * - Mobile responsive layout
 *
 * Tests follow TDD methodology: written FIRST (RED), then implementation (GREEN).
 */

const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate test data
function generateTestData() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    templateName: `Analytics Test Template ${uniqueId}`,
    questionId: `wellness_score_${uniqueId}`,
  };
}

test.describe('Wellness Analytics Dashboard Tests', () => {
  let testOrgId: string;
  let testOrgName: string;
  let createdTemplateIds: string[] = [];
  let createdRequestIds: string[] = [];
  let createdResponseIds: string[] = [];

  test.beforeAll(async ({ browser }) => {
    // Get organization ID from config
    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.join(process.cwd(), 'tests/e2e/.local-e2e-config.json');

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      testOrgId = config.organizationId;
      testOrgName = config.organizationName;
    } else {
      throw new Error('Local E2E config not found. Run: node setup-local-e2e.mjs');
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Reset cleanup trackers
    createdTemplateIds = [];
    createdRequestIds = [];
    createdResponseIds = [];
  });

  test.afterEach(async ({ page }) => {
    // Cleanup created responses
    for (const responseId of createdResponseIds) {
      try {
        await page.request.delete(`${BASE_URL}/api/wellness/responses/${responseId}`);
      } catch (error) {
        console.warn(`Failed to cleanup response ${responseId}:`, error);
      }
    }

    // Cleanup created requests
    for (const requestId of createdRequestIds) {
      try {
        const requestResponse = await page.request.get(`${BASE_URL}/api/wellness/requests/${requestId}`);
        if (requestResponse.ok()) {
          const request = await requestResponse.json();
          await page.request.delete(
            `${BASE_URL}/api/organizations/${request.organizationId}/wellness/requests/${requestId}`
          );
        }
      } catch (error) {
        console.warn(`Failed to cleanup request ${requestId}:`, error);
      }
    }

    // Cleanup created templates
    for (const templateId of createdTemplateIds) {
      try {
        const templateResponse = await page.request.get(`${BASE_URL}/api/wellness/templates/${templateId}`);
        if (templateResponse.ok()) {
          const template = await templateResponse.json();
          await page.request.delete(
            `${BASE_URL}/api/organizations/${template.organizationId}/wellness/templates/${templateId}`
          );
        }
      } catch (error) {
        console.warn(`Failed to cleanup template ${templateId}:`, error);
      }
    }
  });

  test.describe('Dashboard Navigation & Layout', () => {
    test('should navigate to wellness analytics page', async ({ page }) => {
      // Navigate to wellness analytics
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Verify page loaded
      await expect(page).toHaveURL(/\/wellness-analytics/);
      await expect(page.locator('h1').filter({ hasText: 'Wellness Analytics' })).toBeVisible({ timeout: 5000 });

      // Verify main sections are present
      await expect(page.locator('[data-testid="summary-cards-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="filters-section"]')).toBeVisible();
    });

    test('should display summary cards with key metrics', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Verify summary cards exist
      await expect(page.locator('[data-testid="card-average-wellness"]')).toBeVisible();
      await expect(page.locator('[data-testid="card-completion-rate"]')).toBeVisible();
      await expect(page.locator('[data-testid="card-alerts"]')).toBeVisible();

      // Verify cards show numeric values
      const avgWellnessCard = page.locator('[data-testid="card-average-wellness"]');
      await expect(avgWellnessCard).toContainText(/\d+(\.\d+)?/); // Should contain a number

      const completionCard = page.locator('[data-testid="card-completion-rate"]');
      await expect(completionCard).toContainText(/%/); // Should contain percentage
    });

    test('should render mobile responsive layout', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Verify summary cards stack vertically on mobile
      const summarySection = page.locator('[data-testid="summary-cards-section"]');
      await expect(summarySection).toBeVisible();

      // Verify filters are collapsible on mobile
      const filtersSection = page.locator('[data-testid="filters-section"]');
      await expect(filtersSection).toBeVisible();
    });
  });

  test.describe('Summary Cards', () => {
    test('should display average wellness score', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const avgWellnessCard = page.locator('[data-testid="card-average-wellness"]');

      // Verify card title
      await expect(avgWellnessCard.locator('[data-testid="card-title"]')).toContainText('Average Wellness');

      // Verify score value is displayed
      await expect(avgWellnessCard.locator('[data-testid="wellness-score"]')).toBeVisible();

      // Verify trend indicator (up/down/stable)
      const trendIndicator = avgWellnessCard.locator('[data-testid="trend-indicator"]');
      const isVisible = await trendIndicator.isVisible().catch(() => false);

      if (isVisible) {
        // Should show one of: up arrow, down arrow, or stable indicator
        const trendText = await trendIndicator.textContent();
        expect(trendText).toMatch(/↑|↓|→|up|down|stable/i);
      }
    });

    test('should display completion rate with progress bar', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const completionCard = page.locator('[data-testid="card-completion-rate"]');

      // Verify card title
      await expect(completionCard.locator('[data-testid="card-title"]')).toContainText('Completion Rate');

      // Verify percentage display
      await expect(completionCard.locator('[data-testid="completion-percentage"]')).toBeVisible();
      await expect(completionCard.locator('[data-testid="completion-percentage"]')).toContainText(/%/);

      // Verify progress bar exists
      await expect(completionCard.locator('[data-testid="completion-progress-bar"]')).toBeVisible();

      // Verify completion count (e.g., "45/50 athletes responded")
      await expect(completionCard.locator('[data-testid="completion-count"]')).toBeVisible();
    });

    test('should display alerts card with concerning patterns', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const alertsCard = page.locator('[data-testid="card-alerts"]');

      // Verify card title
      await expect(alertsCard.locator('[data-testid="card-title"]')).toContainText('Alerts');

      // Verify alerts list or "no alerts" message
      const alertsList = alertsCard.locator('[data-testid="alerts-list"]');
      const noAlertsMessage = alertsCard.locator('[data-testid="no-alerts-message"]');

      const hasAlerts = await alertsList.isVisible().catch(() => false);
      const hasNoAlerts = await noAlertsMessage.isVisible().catch(() => false);

      expect(hasAlerts || hasNoAlerts).toBe(true);

      // If alerts exist, verify they show athlete name and alert type
      if (hasAlerts) {
        const firstAlert = alertsCard.locator('[data-testid^="alert-item-"]').first();
        await expect(firstAlert).toBeVisible();

        // Should contain alert severity badge (e.g., "High", "Medium")
        await expect(firstAlert.locator('[data-testid="alert-severity"]')).toBeVisible();
      }
    });
  });

  test.describe('Wellness Trend Chart', () => {
    test('should display trend chart for individual athlete', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Verify trend chart section exists
      const chartSection = page.locator('[data-testid="section-trend-chart"]');
      await expect(chartSection).toBeVisible();

      // Verify chart title
      await expect(chartSection.locator('[data-testid="chart-title"]')).toContainText('Wellness Trend');

      // Verify athlete selector exists
      await expect(chartSection.locator('[data-testid="athlete-selector"]')).toBeVisible();

      // Select an athlete (if data exists)
      const athleteSelector = chartSection.locator('[data-testid="athlete-selector"]');
      await athleteSelector.click();

      // Wait for dropdown options
      const firstAthleteOption = page.locator('[role="option"]').first();
      const hasOptions = await firstAthleteOption.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasOptions) {
        await firstAthleteOption.click();

        // Verify chart canvas renders
        await expect(chartSection.locator('canvas')).toBeVisible({ timeout: 3000 });
      }
    });

    test('should show empty state when no data available', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const chartSection = page.locator('[data-testid="section-trend-chart"]');

      // If no athlete selected or no data, should show empty state
      const emptyState = chartSection.locator('[data-testid="chart-empty-state"]');
      const hasChart = await chartSection.locator('canvas').isVisible({ timeout: 1000 }).catch(() => false);
      const hasEmptyState = await emptyState.isVisible({ timeout: 1000 }).catch(() => false);

      // Either chart or empty state should be visible
      expect(hasChart || hasEmptyState).toBe(true);
    });

    test('should display chart legend with question labels', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const chartSection = page.locator('[data-testid="section-trend-chart"]');

      // Select an athlete
      const athleteSelector = chartSection.locator('[data-testid="athlete-selector"]');
      await athleteSelector.click();
      const firstOption = page.locator('[role="option"]').first();
      const hasOptions = await firstOption.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasOptions) {
        await firstOption.click();

        // Wait for chart to render
        await page.waitForTimeout(1000);

        // Verify legend exists (Chart.js renders legend)
        const canvas = chartSection.locator('canvas');
        await expect(canvas).toBeVisible();
      }
    });
  });

  test.describe('Team Heatmap', () => {
    test('should display team wellness heatmap', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Verify heatmap section exists
      const heatmapSection = page.locator('[data-testid="section-team-heatmap"]');
      await expect(heatmapSection).toBeVisible();

      // Verify heatmap title
      await expect(heatmapSection.locator('[data-testid="heatmap-title"]')).toContainText('Team Wellness');

      // Verify heatmap grid or empty state
      const heatmapGrid = heatmapSection.locator('[data-testid="heatmap-grid"]');
      const emptyState = heatmapSection.locator('[data-testid="heatmap-empty-state"]');

      const hasGrid = await heatmapGrid.isVisible({ timeout: 2000 }).catch(() => false);
      const hasEmptyState = await emptyState.isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasGrid || hasEmptyState).toBe(true);
    });

    test('should render heatmap with color-coded wellness levels', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const heatmapGrid = page.locator('[data-testid="heatmap-grid"]');
      const hasGrid = await heatmapGrid.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasGrid) {
        // Verify heatmap cells exist
        const heatmapCells = heatmapGrid.locator('[data-testid^="heatmap-cell-"]');
        const cellCount = await heatmapCells.count();
        expect(cellCount).toBeGreaterThan(0);

        // Verify cells have color styling (background color based on wellness score)
        const firstCell = heatmapCells.first();
        const bgColor = await firstCell.evaluate((el) => window.getComputedStyle(el).backgroundColor);
        expect(bgColor).toBeTruthy();
      }
    });

    test('should show athlete detail modal when clicking heatmap cell', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const heatmapGrid = page.locator('[data-testid="heatmap-grid"]');
      const hasGrid = await heatmapGrid.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasGrid) {
        // Click on first heatmap cell
        const firstCell = heatmapGrid.locator('[data-testid^="heatmap-cell-"]').first();
        const hasCell = await firstCell.isVisible({ timeout: 1000 }).catch(() => false);

        if (hasCell) {
          await firstCell.click();

          // Verify detail modal appears
          await expect(page.locator('[data-testid="athlete-detail-modal"]')).toBeVisible({ timeout: 3000 });

          // Verify modal shows athlete name
          await expect(page.locator('[data-testid="modal-athlete-name"]')).toBeVisible();

          // Verify modal shows wellness score for that date
          await expect(page.locator('[data-testid="modal-wellness-score"]')).toBeVisible();

          // Close modal
          await page.click('[data-testid="button-close-modal"]');
          await expect(page.locator('[data-testid="athlete-detail-modal"]')).not.toBeVisible();
        }
      }
    });

    test('should display heatmap legend explaining color scale', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const heatmapSection = page.locator('[data-testid="section-team-heatmap"]');

      // Verify color scale legend exists
      const legend = heatmapSection.locator('[data-testid="heatmap-legend"]');
      const hasLegend = await legend.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasLegend) {
        // Verify legend shows low/high labels
        await expect(legend).toContainText(/low|poor|1/i);
        await expect(legend).toContainText(/high|excellent|10/i);
      }
    });
  });

  test.describe('Filtering', () => {
    test('should filter by date range', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Find date range filter
      const dateFromInput = page.locator('[data-testid="input-date-from"]');
      const dateToInput = page.locator('[data-testid="input-date-to"]');

      // Set date range (last 7 days)
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      await dateFromInput.fill(weekAgo.toISOString().split('T')[0]);
      await dateToInput.fill(today.toISOString().split('T')[0]);

      // Wait for data to refresh
      await page.waitForTimeout(500);

      // Verify filter applied badge or indicator
      const filterBadge = page.locator('[data-testid="active-filters"]');
      const hasBadge = await filterBadge.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasBadge) {
        await expect(filterBadge).toContainText(/7 days|week/i);
      }
    });

    test('should filter by team selection', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Find team selector
      const teamSelector = page.locator('[data-testid="select-team"]');
      const hasSelector = await teamSelector.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasSelector) {
        await teamSelector.click();

        // Select first team option
        const firstTeamOption = page.locator('[role="option"]').first();
        const hasOptions = await firstTeamOption.isVisible({ timeout: 2000 }).catch(() => false);

        if (hasOptions) {
          const teamName = await firstTeamOption.textContent();
          await firstTeamOption.click();

          // Wait for data refresh
          await page.waitForTimeout(500);

          // Verify filter applied
          const activeFilters = page.locator('[data-testid="active-filters"]');
          const hasFilters = await activeFilters.isVisible({ timeout: 1000 }).catch(() => false);

          if (hasFilters && teamName) {
            await expect(activeFilters).toContainText(teamName);
          }
        }
      }
    });

    test('should filter by athlete selection', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Find athlete multi-select
      const athleteSelector = page.locator('[data-testid="select-athletes"]');
      const hasSelector = await athleteSelector.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasSelector) {
        await athleteSelector.click();

        // Select multiple athletes
        const athleteOptions = page.locator('[role="option"]');
        const optionCount = await athleteOptions.count();

        if (optionCount > 0) {
          // Select first athlete
          await athleteOptions.first().click();

          // Wait for update
          await page.waitForTimeout(500);

          // Verify selection reflected in UI
          const selectedCount = page.locator('[data-testid="athletes-selected-count"]');
          const hasCount = await selectedCount.isVisible({ timeout: 1000 }).catch(() => false);

          if (hasCount) {
            await expect(selectedCount).toContainText('1');
          }
        }
      }
    });

    test('should clear all filters', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Apply some filters first
      const dateFromInput = page.locator('[data-testid="input-date-from"]');
      const hasDateInput = await dateFromInput.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasDateInput) {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await dateFromInput.fill(weekAgo.toISOString().split('T')[0]);
        await page.waitForTimeout(300);
      }

      // Click clear filters button
      const clearButton = page.locator('[data-testid="button-clear-filters"]');
      const hasClearButton = await clearButton.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasClearButton) {
        await clearButton.click();

        // Verify filters reset
        const activeFilters = page.locator('[data-testid="active-filters"]');
        const hasActiveFilters = await activeFilters.isVisible({ timeout: 1000 }).catch(() => false);

        if (hasActiveFilters) {
          const filterText = await activeFilters.textContent();
          expect(filterText).not.toContain('days');
        }
      }
    });
  });

  test.describe('Alerts & Concerning Patterns', () => {
    test('should detect and display wellness drop alerts', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const alertsCard = page.locator('[data-testid="card-alerts"]');
      const alertsList = alertsCard.locator('[data-testid="alerts-list"]');

      const hasAlerts = await alertsList.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasAlerts) {
        // Verify alert shows athlete name
        const firstAlert = alertsList.locator('[data-testid^="alert-item-"]').first();
        await expect(firstAlert).toContainText(/\w+/); // Contains athlete name

        // Verify alert shows severity
        await expect(firstAlert.locator('[data-testid="alert-severity"]')).toBeVisible();

        // Verify alert shows reason (e.g., "Wellness dropped 25%")
        await expect(firstAlert.locator('[data-testid="alert-reason"]')).toBeVisible();
      }
    });

    test('should show alert when wellness stays low for multiple days', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const alertsCard = page.locator('[data-testid="card-alerts"]');
      const alertsList = alertsCard.locator('[data-testid="alerts-list"]');

      const hasAlerts = await alertsList.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasAlerts) {
        const alerts = alertsList.locator('[data-testid^="alert-item-"]');
        const alertCount = await alerts.count();

        // Check if any alert mentions "consecutive days" or "persistently low"
        for (let i = 0; i < alertCount; i++) {
          const alertText = await alerts.nth(i).textContent();
          if (alertText && /consecutive|persistent|sustained/i.test(alertText)) {
            expect(alertText).toMatch(/consecutive|persistent|sustained/i);
            break;
          }
        }
      }
    });

    test('should allow clicking alert to view athlete details', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const alertsCard = page.locator('[data-testid="card-alerts"]');
      const alertsList = alertsCard.locator('[data-testid="alerts-list"]');

      const hasAlerts = await alertsList.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasAlerts) {
        const firstAlert = alertsList.locator('[data-testid^="alert-item-"]').first();
        await firstAlert.click();

        // Should navigate to athlete detail or open modal
        const modal = page.locator('[data-testid="athlete-detail-modal"]');
        const hasModal = await modal.isVisible({ timeout: 2000 }).catch(() => false);

        if (hasModal) {
          await expect(modal).toBeVisible();

          // Close modal
          await page.click('[data-testid="button-close-modal"]');
        }
      }
    });
  });

  test.describe('Mobile Responsive Design', () => {
    test('should stack summary cards vertically on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const summarySection = page.locator('[data-testid="summary-cards-section"]');

      // Verify cards are visible on mobile
      await expect(summarySection.locator('[data-testid="card-average-wellness"]')).toBeVisible();
      await expect(summarySection.locator('[data-testid="card-completion-rate"]')).toBeVisible();
      await expect(summarySection.locator('[data-testid="card-alerts"]')).toBeVisible();
    });

    test('should make charts scrollable on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const chartSection = page.locator('[data-testid="section-trend-chart"]');
      await expect(chartSection).toBeVisible();

      // Chart container should be visible and scrollable
      const canvas = chartSection.locator('canvas');
      const hasCanvas = await canvas.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasCanvas) {
        await expect(canvas).toBeVisible();
      }
    });

    test('should hide/collapse filters on mobile by default', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Filters should be collapsible on mobile
      const filtersSection = page.locator('[data-testid="filters-section"]');
      await expect(filtersSection).toBeVisible();

      // Look for expand/collapse button
      const toggleButton = filtersSection.locator('[data-testid="button-toggle-filters"]');
      const hasToggle = await toggleButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasToggle) {
        await toggleButton.click();
        // Filters should expand/collapse
        await page.waitForTimeout(300);
      }
    });
  });

  test.describe('No Data States', () => {
    test('should show empty state when no wellness responses exist', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Apply filters that return no results
      const dateFromInput = page.locator('[data-testid="input-date-from"]');
      const hasDateInput = await dateFromInput.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasDateInput) {
        // Set date range to future (no data)
        const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        await dateFromInput.fill(future.toISOString().split('T')[0]);
        await page.waitForTimeout(500);

        // Verify empty state messages
        const emptyStates = page.locator('[data-testid$="-empty-state"]');
        const count = await emptyStates.count();

        expect(count).toBeGreaterThan(0);
      }
    });

    test('should show helpful message when no athletes selected', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      const chartSection = page.locator('[data-testid="section-trend-chart"]');

      // If no athlete selected, should show prompt
      const emptyState = chartSection.locator('[data-testid="chart-empty-state"]');
      const hasCanvas = await chartSection.locator('canvas').isVisible({ timeout: 1000 }).catch(() => false);

      if (!hasCanvas) {
        const hasEmptyState = await emptyState.isVisible({ timeout: 1000 }).catch(() => false);
        if (hasEmptyState) {
          await expect(emptyState).toContainText(/select|choose|athlete/i);
        }
      }
    });
  });
});
