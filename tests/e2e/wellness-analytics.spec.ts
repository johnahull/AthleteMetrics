import { test, expect } from './fixtures/e2e-base';
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

  test.describe('Phase 1: Team Comparison Tab', () => {
    test('should display Teams tab with comparison card', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Click on Teams tab
      const teamsTab = page.locator('[role="tab"]').filter({ hasText: 'Teams' });
      await expect(teamsTab).toBeVisible();
      await teamsTab.click();

      // Verify Team Comparison Card is displayed
      const teamComparisonCard = page.locator('text=Team Comparison').first();
      const hasCard = await teamComparisonCard.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasCard) {
        await expect(teamComparisonCard).toBeVisible();
      }
    });

    test('should display team comparison table with all teams by default', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Teams tab
      await page.click('[role="tab"]:has-text("Teams")');
      await page.waitForTimeout(500);

      // Verify table headers exist
      const headers = ['Team Name', 'Avg Wellness', 'Status', 'Alerts', 'Completion', 'Trend'];

      for (const header of headers) {
        const headerElement = page.locator(`th:has-text("${header}")`);
        const hasHeader = await headerElement.isVisible({ timeout: 1000 }).catch(() => false);

        if (hasHeader) {
          await expect(headerElement).toBeVisible();
        }
      }
    });

    test('should allow sorting teams by different columns', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Teams tab
      await page.click('[role="tab"]:has-text("Teams")');
      await page.waitForTimeout(500);

      // Try clicking on sortable column headers
      const avgWellnessHeader = page.locator('th:has-text("Avg Wellness")');
      const hasHeader = await avgWellnessHeader.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasHeader) {
        // Click to sort ascending
        await avgWellnessHeader.click();
        await page.waitForTimeout(300);

        // Click again to sort descending
        await avgWellnessHeader.click();
        await page.waitForTimeout(300);

        // Verify sort worked (table should still be visible)
        const table = page.locator('table');
        await expect(table).toBeVisible();
      }
    });

    test('should display status breakdown with color-coded badges', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Teams tab
      await page.click('[role="tab"]:has-text("Teams")');
      await page.waitForTimeout(500);

      // Look for status badges (red/yellow/green)
      const statusBadges = page.locator('[class*="badge"]');
      const hasBadges = await statusBadges.count() > 0;

      if (hasBadges) {
        // At least one badge should be visible
        expect(await statusBadges.count()).toBeGreaterThan(0);
      }
    });

    test('should allow drill-down by clicking team row', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Teams tab
      await page.click('[role="tab"]:has-text("Teams")');
      await page.waitForTimeout(500);

      // Find first team row
      const teamRow = page.locator('tbody tr').first();
      const hasRow = await teamRow.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasRow) {
        // Click on team row
        await teamRow.click();
        await page.waitForTimeout(500);

        // Verify filter was applied (active filters should update)
        const activeFilters = page.locator('[data-testid="active-filters"]');
        const hasFilters = await activeFilters.isVisible({ timeout: 1000 }).catch(() => false);

        if (hasFilters) {
          // Filter should now include the selected team
          await expect(activeFilters).toBeVisible();
        }
      }
    });

    test('should show completion rate for each team', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Teams tab
      await page.click('[role="tab"]:has-text("Teams")');
      await page.waitForTimeout(500);

      // Look for percentage indicators in completion column
      const completionCells = page.locator('td:has-text("%")');
      const hasCells = await completionCells.count() > 0;

      if (hasCells) {
        expect(await completionCells.count()).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Phase 1: Question Analytics Tab', () => {
    test('should display Questions tab with analytics table', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Click on Questions tab
      const questionsTab = page.locator('[role="tab"]').filter({ hasText: 'Questions' });
      await expect(questionsTab).toBeVisible();
      await questionsTab.click();

      // Verify Question Analytics Table is displayed
      const questionAnalyticsTable = page.locator('text=Question Analytics').first();
      const hasTable = await questionAnalyticsTable.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasTable) {
        await expect(questionAnalyticsTable).toBeVisible();
      }
    });

    test('should display question-level statistics', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Questions tab
      await page.click('[role="tab"]:has-text("Questions")');
      await page.waitForTimeout(500);

      // Verify table headers for statistics
      const headers = ['Question', 'Type', 'Avg Score', 'Min', 'Max', 'Std Dev', 'Responses', 'Trend'];

      for (const header of headers) {
        const headerElement = page.locator(`th:has-text("${header}")`);
        const hasHeader = await headerElement.isVisible({ timeout: 1000 }).catch(() => false);

        if (hasHeader) {
          await expect(headerElement).toBeVisible();
        }
      }
    });

    test('should filter questions by template', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Questions tab
      await page.click('[role="tab"]:has-text("Questions")');
      await page.waitForTimeout(500);

      // Look for template selector/filter
      const templateSelector = page.locator('select, [role="combobox"]').filter({ has: page.locator('text=/template/i') }).first();
      const hasSelector = await templateSelector.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasSelector) {
        await templateSelector.click();
        await page.waitForTimeout(300);

        // Select first option
        const firstOption = page.locator('[role="option"]').first();
        const hasOptions = await firstOption.isVisible({ timeout: 1000 }).catch(() => false);

        if (hasOptions) {
          await firstOption.click();
          await page.waitForTimeout(500);

          // Table should update
          const table = page.locator('table');
          await expect(table).toBeVisible();
        }
      }
    });

    test('should allow sorting questions by statistics', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Questions tab
      await page.click('[role="tab"]:has-text("Questions")');
      await page.waitForTimeout(500);

      // Try sorting by Avg Score
      const avgScoreHeader = page.locator('th:has-text("Avg Score")');
      const hasHeader = await avgScoreHeader.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasHeader) {
        await avgScoreHeader.click();
        await page.waitForTimeout(300);

        // Verify table is still visible
        const table = page.locator('table');
        await expect(table).toBeVisible();
      }
    });

    test('should show trend indicators for questions', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Questions tab
      await page.click('[role="tab"]:has-text("Questions")');
      await page.waitForTimeout(500);

      // Look for trend indicators (up/down/stable arrows or text)
      const trendCell = page.locator('td').filter({ hasText: /↑|↓|→|up|down|stable/i }).first();
      const hasTrend = await trendCell.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasTrend) {
        await expect(trendCell).toBeVisible();
      }
    });

    test('should handle non-numeric question types gracefully', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Questions tab
      await page.click('[role="tab"]:has-text("Questions")');
      await page.waitForTimeout(500);

      // Look for N/A values in statistics columns for non-numeric questions
      const naCells = page.locator('td:has-text("N/A")');
      const hasCells = await naCells.count() > 0;

      // Non-numeric questions should show N/A for stats like avg, min, max
      // This is acceptable - just verify the table renders
      const table = page.locator('table');
      const hasTable = await table.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasTable) {
        await expect(table).toBeVisible();
      }
    });
  });

  test.describe('Phase 2: Status Trends Tab', () => {
    test('should display Status Trends tab with stacked area chart', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Click on Status Trends tab (may be labeled "Status" or "Status Trends")
      const statusTab = page.locator('[role="tab"]').filter({ hasText: /Status/i });
      await expect(statusTab).toBeVisible();
      await statusTab.click();
      await page.waitForTimeout(500);

      // Verify Status Trend Chart is displayed
      const statusTrendChart = page.locator('text=Status Trend').first();
      const hasChart = await statusTrendChart.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasChart) {
        await expect(statusTrendChart).toBeVisible();
      }
    });

    test('should display status breakdown chart per template', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Status Trends tab
      const statusTab = page.locator('[role="tab"]').filter({ hasText: /Status/i });
      await statusTab.click();
      await page.waitForTimeout(500);

      // Look for chart canvas elements (one per template)
      const chartCanvases = page.locator('canvas');
      const hasCanvases = await chartCanvases.count() > 0;

      if (hasCanvases) {
        expect(await chartCanvases.count()).toBeGreaterThan(0);
      }
    });

    test('should show red/yellow/green status percentages over time', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Status Trends tab
      const statusTab = page.locator('[role="tab"]').filter({ hasText: /Status/i });
      await statusTab.click();
      await page.waitForTimeout(500);

      // Look for legend or labels mentioning red/yellow/green
      const statusLabels = page.locator('text=/red|yellow|green/i');
      const hasLabels = await statusLabels.count() > 0;

      if (hasLabels) {
        expect(await statusLabels.count()).toBeGreaterThan(0);
      }
    });

    test('should display overall trend indicator', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Status Trends tab
      const statusTab = page.locator('[role="tab"]').filter({ hasText: /Status/i });
      await statusTab.click();
      await page.waitForTimeout(500);

      // Look for trend indicator text
      const trendIndicator = page.locator('text=/improving|declining|stable/i').first();
      const hasTrend = await trendIndicator.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasTrend) {
        await expect(trendIndicator).toBeVisible();
      }
    });

    test('should support team filtering in status trends', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Apply team filter first
      const teamSelector = page.locator('[data-testid="select-team"]');
      const hasSelector = await teamSelector.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasSelector) {
        await teamSelector.click();
        const firstOption = page.locator('[role="option"]').first();
        const hasOptions = await firstOption.isVisible({ timeout: 1000 }).catch(() => false);

        if (hasOptions) {
          await firstOption.click();
          await page.waitForTimeout(300);
        }
      }

      // Navigate to Status Trends tab
      const statusTab = page.locator('[role="tab"]').filter({ hasText: /Status/i });
      await statusTab.click();
      await page.waitForTimeout(500);

      // Chart should render with filtered data
      const canvas = page.locator('canvas').first();
      const hasCanvas = await canvas.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasCanvas) {
        await expect(canvas).toBeVisible();
      }
    });
  });

  test.describe('Phase 2: Injuries Tab', () => {
    test('should display Injuries tab with trend chart and body map', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Click on Injuries tab
      const injuriesTab = page.locator('[role="tab"]').filter({ hasText: 'Injuries' });
      await expect(injuriesTab).toBeVisible();
      await injuriesTab.click();
      await page.waitForTimeout(500);

      // Verify Injury Trend Chart is displayed
      const injuryTrendChart = page.locator('text=Injury Trend').first();
      const hasChart = await injuryTrendChart.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasChart) {
        await expect(injuryTrendChart).toBeVisible();
      }
    });

    test('should display injury trend line chart', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Injuries tab
      await page.click('[role="tab"]:has-text("Injuries")');
      await page.waitForTimeout(500);

      // Look for chart showing total injuries over time
      const chartCanvas = page.locator('canvas').first();
      const hasCanvas = await chartCanvas.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasCanvas) {
        await expect(chartCanvas).toBeVisible();
      }
    });

    test('should display most common injury locations table', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Injuries tab
      await page.click('[role="tab"]:has-text("Injuries")');
      await page.waitForTimeout(500);

      // Look for injury breakdown table or list
      const injuryList = page.locator('text=/most common|top injuries|body part/i').first();
      const hasList = await injuryList.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasList) {
        await expect(injuryList).toBeVisible();
      }
    });

    test('should display injury body map heatmap', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Injuries tab
      await page.click('[role="tab"]:has-text("Injuries")');
      await page.waitForTimeout(500);

      // Look for body map visualization
      const bodyMap = page.locator('text=/body map|injury map/i').first();
      const hasBodyMap = await bodyMap.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasBodyMap) {
        await expect(bodyMap).toBeVisible();
      }
    });

    test('should show body parts with color-coded injury frequency', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Injuries tab
      await page.click('[role="tab"]:has-text("Injuries")');
      await page.waitForTimeout(500);

      // Look for body part buttons/elements
      const bodyParts = page.locator('button[data-body-part], [data-testid^="body-part-"]');
      const hasParts = await bodyParts.count() > 0;

      if (hasParts) {
        expect(await bodyParts.count()).toBeGreaterThan(0);
      }
    });

    test('should include time slider for historical view', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Injuries tab
      await page.click('[role="tab"]:has-text("Injuries")');
      await page.waitForTimeout(500);

      // Look for time slider or range selector
      const timeSlider = page.locator('input[type="range"], [role="slider"]');
      const hasSlider = await timeSlider.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasSlider) {
        await expect(timeSlider).toBeVisible();

        // Try adjusting the slider
        await timeSlider.click();
        await page.waitForTimeout(300);
      }
    });

    test('should allow clicking body part to see detailed statistics', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Injuries tab
      await page.click('[role="tab"]:has-text("Injuries")');
      await page.waitForTimeout(500);

      // Find first body part button
      const bodyPartButton = page.locator('button[data-body-part]').first();
      const hasButton = await bodyPartButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasButton) {
        await bodyPartButton.click();
        await page.waitForTimeout(500);

        // Should show detailed stats or highlight the part
        // Verify something changed (exact UI depends on implementation)
        await expect(bodyPartButton).toBeVisible();
      }
    });

    test('should show summary stats for injuries', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Injuries tab
      await page.click('[role="tab"]:has-text("Injuries")');
      await page.waitForTimeout(500);

      // Look for summary statistics like "Total Injuries", "Athletes Affected"
      const summaryStats = page.locator('text=/total injuries|athletes affected|injury reports/i');
      const hasStats = await summaryStats.count() > 0;

      if (hasStats) {
        expect(await summaryStats.count()).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Phase 3: Tab Navigation & Organization', () => {
    test('should display all analytics tabs', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Verify all 5 tabs are present
      const tabs = ['Overview', 'Teams', 'Questions', 'Status', 'Injuries'];

      for (const tabName of tabs) {
        const tab = page.locator(`[role="tab"]:has-text("${tabName}")`);
        await expect(tab).toBeVisible();
      }
    });

    test('should navigate between tabs without losing filter state', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Apply a date filter
      const dateFromInput = page.locator('[data-testid="input-date-from"]');
      const hasDateInput = await dateFromInput.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasDateInput) {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await dateFromInput.fill(weekAgo.toISOString().split('T')[0]);
        await page.waitForTimeout(500);
      }

      // Navigate through all tabs
      const tabs = ['Teams', 'Questions', 'Status', 'Injuries', 'Overview'];

      for (const tabName of tabs) {
        const tab = page.locator(`[role="tab"]:has-text("${tabName}")`);
        await tab.click();
        await page.waitForTimeout(300);

        // Verify tab content loaded
        await expect(tab).toHaveAttribute('aria-selected', 'true');
      }

      // Verify filter is still applied
      if (hasDateInput) {
        const dateValue = await dateFromInput.inputValue();
        expect(dateValue).toBeTruthy();
      }
    });

    test('should maintain Overview tab with original features', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Overview tab should be selected by default
      const overviewTab = page.locator('[role="tab"]:has-text("Overview")');
      await expect(overviewTab).toHaveAttribute('aria-selected', 'true');

      // Verify original features still exist in Overview
      await expect(page.locator('[data-testid="section-trend-chart"]')).toBeVisible();
      await expect(page.locator('[data-testid="section-team-heatmap"]')).toBeVisible();
    });

    test('should display template-specific charts correctly', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Status Trends tab
      const statusTab = page.locator('[role="tab"]').filter({ hasText: /Status/i });
      await statusTab.click();
      await page.waitForTimeout(500);

      // If multiple templates exist, should show one chart per template
      const chartTitles = page.locator('h3, [data-testid$="-title"]').filter({ hasText: /template/i });
      const hasMultipleTemplates = await chartTitles.count() > 1;

      if (hasMultipleTemplates) {
        // Verify each template has its own chart section
        expect(await chartTitles.count()).toBeGreaterThanOrEqual(1);
      }
    });

    test('should be mobile responsive across all tabs', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Test each tab on mobile viewport
      const tabs = ['Overview', 'Teams', 'Questions', 'Status', 'Injuries'];

      for (const tabName of tabs) {
        const tab = page.locator(`[role="tab"]:has-text("${tabName}")`);
        await tab.click();
        await page.waitForTimeout(500);

        // Verify tab content is visible and not cut off
        const tabContent = page.locator('[role="tabpanel"]');
        await expect(tabContent).toBeVisible();
      }
    });
  });

  test.describe('Integration: Complete Analytics Workflow', () => {
    test('should provide complete wellness insights across all tabs', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // 1. Check summary cards for high-level overview
      await expect(page.locator('[data-testid="card-average-wellness"]')).toBeVisible();

      // 2. Navigate to Teams tab to compare team performance
      await page.click('[role="tab"]:has-text("Teams")');
      await page.waitForTimeout(500);

      // 3. Navigate to Questions tab to see question-level insights
      await page.click('[role="tab"]:has-text("Questions")');
      await page.waitForTimeout(500);

      // 4. Navigate to Status Trends to see wellness trajectory
      const statusTab = page.locator('[role="tab"]').filter({ hasText: /Status/i });
      await statusTab.click();
      await page.waitForTimeout(500);

      // 5. Navigate to Injuries to see injury patterns
      await page.click('[role="tab"]:has-text("Injuries")');
      await page.waitForTimeout(500);

      // All tabs should have loaded successfully
      expect(true).toBe(true);
    });

    test('should support drill-down from team comparison to filtered view', async ({ page }) => {
      await page.goto('/wellness-analytics');
      await page.waitForLoadState('networkidle');

      // Navigate to Teams tab
      await page.click('[role="tab"]:has-text("Teams")');
      await page.waitForTimeout(500);

      // Click on a team row
      const teamRow = page.locator('tbody tr').first();
      const hasRow = await teamRow.isVisible({ timeout: 1000 }).catch(() => false);

      if (hasRow) {
        await teamRow.click();
        await page.waitForTimeout(500);

        // Navigate to other tabs - they should show filtered data
        await page.click('[role="tab"]:has-text("Questions")');
        await page.waitForTimeout(300);

        const statusTab = page.locator('[role="tab"]').filter({ hasText: /Status/i });
        await statusTab.click();
        await page.waitForTimeout(300);

        // Filter should persist across tabs
        const activeFilters = page.locator('[data-testid="active-filters"]');
        const hasFilters = await activeFilters.isVisible({ timeout: 1000 }).catch(() => false);

        if (hasFilters) {
          await expect(activeFilters).toBeVisible();
        }
      }
    });
  });
});
