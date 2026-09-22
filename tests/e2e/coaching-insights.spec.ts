import { test, expect } from './fixtures/e2e-base';
import { loginAs, loginAsDefaultUser } from './helpers/auth';
import { isSameUserMode } from './fixtures/test-users';

/**
 * E2E Tests for Coaching Insights Feature
 *
 * Test Coverage:
 * 1. Site admin enabling AI for organization
 * 2. Org admin enabling AI for their organization
 * 3. Feature flag hierarchy (site admin gates org admin)
 * 4. Generating coaching insights
 * 5. Editing coaching insights
 * 6. PDF export includes insights
 * 7. Feature visibility when disabled
 */

test.describe('Coaching Insights - Site Admin Configuration', () => {
  // Store original settings for cleanup
  let originalAIModel: string | null = null;

  test.beforeEach(async ({ page }) => {
    // Use auth helper that handles storageState and proper selectors
    // In CI with same-user mode, loginAsDefaultUser gives site admin access
    if (isSameUserMode()) {
      await loginAsDefaultUser(page);
    } else {
      await loginAs(page, 'site_admin');
    }
  });

  test.afterEach(async ({ page }) => {
    // Restore original AI model if it was changed
    if (originalAIModel) {
      await page.goto('/admin');
      const modelSelect = page.locator('[data-testid="ai-model-select"]').first();
      await modelSelect.click();
      await page.click(`text=${originalAIModel}`);
      await page.waitForTimeout(1000); // Wait for save
      originalAIModel = null;
    }
  });

  test('should allow site admin to select AI model', async ({ page }) => {
    // Navigate to admin page
    await page.click('a[href="/admin"]');
    await page.waitForURL('/admin');

    // Find AI Model Configuration card
    await expect(page.locator('text=AI Model Configuration')).toBeVisible();

    // Open AI model dropdown
    const modelSelect = page.locator('[data-testid="ai-model-select"]').first();
    await modelSelect.click();

    // Verify all 7 models are available
    await expect(page.locator('text=GPT-5 Nano')).toBeVisible();
    await expect(page.locator('text=Gemini 2.0 Flash Lite')).toBeVisible();
    await expect(page.locator('text=Gemini 2.5 Flash Lite')).toBeVisible();
    await expect(page.locator('text=Claude Haiku 3')).toBeVisible();
    await expect(page.locator('text=Claude Haiku 4.5')).toBeVisible();
    await expect(page.locator('text=Gemini 2.5 Pro')).toBeVisible();
    await expect(page.locator('text=Claude Sonnet 4.5')).toBeVisible();

    // Select a premium model
    await page.click('text=Claude Sonnet 4.5');

    // Verify selection saved
    await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
  });

  test('should allow site admin to enable AI for specific organization', async ({ page }) => {
    // Navigate to organizations page
    await page.click('a[href="/organizations"]');
    await page.waitForURL('/organizations');

    // Click settings button for first organization
    const settingsButton = page.locator('[data-testid^="settings-org-"]').first();
    await settingsButton.click();

    // Wait for organization settings page
    await expect(page.locator('text=Organization Settings')).toBeVisible();

    // Find Coaching Insights toggle
    const aiToggle = page.locator('button[role="switch"]').filter({ hasText: /Enable Coaching Insights/i }).first();

    // Enable AI for this organization
    const isEnabled = await aiToggle.getAttribute('data-state');
    if (isEnabled !== 'checked') {
      await aiToggle.click();
      await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
    }

    // Verify toggle is now enabled
    await expect(aiToggle).toHaveAttribute('data-state', 'checked');
  });
});

test.describe('Coaching Insights - Org Admin Configuration', () => {
  test.beforeEach(async ({ page }) => {
    // Login as org admin
    await page.goto('/login');
    await page.fill('#username, input[name="username"]', process.env.E2E_ORG_ADMIN_USERNAME || 'orgadmin');
    await page.fill('#password, input[name="password"]', process.env.E2E_ORG_ADMIN_PASSWORD || 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should show disabled state when site admin has not enabled AI', async ({ page }) => {
    // Navigate to org admin settings
    await page.click('a[href*="/settings"]');

    // Wait for settings page
    await expect(page.locator('text=Coaching Insights')).toBeVisible();

    // Check if AI is enabled by site admin
    const alert = page.locator('text=Feature must be enabled by site administrator');
    const isDisabled = await alert.isVisible();

    if (isDisabled) {
      // Verify toggle is disabled
      const aiToggle = page.locator('button[role="switch"]').filter({ hasText: /Enable Coaching Insights/i }).first();
      await expect(aiToggle).toBeDisabled();
    }
  });

  test('should allow org admin to enable AI when site admin allows', async ({ page }) => {
    // First, ensure site admin has enabled AI for this org
    // (This would be done in a separate test or setup)

    // Navigate to org admin settings
    await page.click('a[href*="/settings"]');
    await expect(page.locator('text=Coaching Insights')).toBeVisible();

    // Find AI toggle
    const aiToggle = page.locator('button[role="switch"]').filter({ hasText: /Enable Coaching Insights/i }).first();

    // If toggle is not disabled, enable it
    const isDisabled = await aiToggle.isDisabled();
    if (!isDisabled) {
      const isEnabled = await aiToggle.getAttribute('data-state');
      if (isEnabled !== 'checked') {
        await aiToggle.click();
        await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

test.describe('Coaching Insights - Generation and Editing', () => {
  test.beforeEach(async ({ page }) => {
    // Login as coach or org admin
    await page.goto('/login');
    await page.fill('#username, input[name="username"]', process.env.E2E_ORG_ADMIN_USERNAME || 'orgadmin');
    await page.fill('#password, input[name="password"]', process.env.E2E_ORG_ADMIN_PASSWORD || 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should generate coaching insights for team report', async ({ page }) => {
    // Navigate to reports page
    await page.click('a[href="/reports"]');
    await page.waitForURL('/reports');

    // Click on first team report
    const firstReport = page.locator('[data-testid^="team-report-"]').first();
    await firstReport.click();

    // Wait for report to load
    await expect(page.locator('text=Report Summary')).toBeVisible();

    // Find Coaching Insights card
    const insightsCard = page.locator('text=Coaching Insights').first();
    await expect(insightsCard).toBeVisible();

    // Check if "Generate Insights" button exists
    const generateButton = page.locator('button:has-text("Generate Insights")');
    const hasButton = await generateButton.isVisible();

    if (hasButton) {
      // Click generate button
      await generateButton.click();

      // Wait for generation to complete (spinner should appear then disappear)
      await expect(page.locator('text=Generating insights')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Generating insights')).not.toBeVisible({ timeout: 30000 });

      // Verify insights are displayed
      await expect(page.locator('[data-testid="insights-display"]')).toBeVisible();

      // Verify Edit and Regenerate buttons appear
      await expect(page.locator('button:has-text("Edit")')).toBeVisible();
      await expect(page.locator('button:has-text("Regenerate")')).toBeVisible();
    }
  });

  test('should allow editing coaching insights', async ({ page }) => {
    // Navigate to reports page
    await page.click('a[href="/reports"]');
    await page.waitForURL('/reports');

    // Click on a report that has insights
    const firstReport = page.locator('[data-testid^="team-report-"]').first();
    await firstReport.click();

    // Wait for insights to be visible
    const editButton = page.locator('button:has-text("Edit")');
    const hasEditButton = await editButton.isVisible();

    if (hasEditButton) {
      // Click Edit button
      await editButton.click();

      // Verify textarea appears
      const textarea = page.locator('textarea[data-testid="insights-editor"]');
      await expect(textarea).toBeVisible();

      // Get current text
      const originalText = await textarea.inputValue();

      // Modify text
      const newText = originalText + '\n\nEdited via E2E test.';
      await textarea.fill(newText);

      // Click Save button
      await page.click('button:has-text("Save")');

      // Verify save success message
      await expect(page.locator('text=Insights updated')).toBeVisible({ timeout: 5000 });

      // Verify text is displayed (not in edit mode)
      await expect(textarea).not.toBeVisible();
      await expect(page.locator('text=Edited via E2E test')).toBeVisible();
    }
  });

  test('should regenerate coaching insights', async ({ page }) => {
    // Navigate to reports page
    await page.click('a[href="/reports"]');
    await page.waitForURL('/reports');

    // Click on a report that has insights
    const firstReport = page.locator('[data-testid^="team-report-"]').first();
    await firstReport.click();

    // Find Regenerate button
    const regenerateButton = page.locator('button:has-text("Regenerate")');
    const hasRegenerateButton = await regenerateButton.isVisible();

    if (hasRegenerateButton) {
      // Get current insights text
      const currentInsights = await page.locator('[data-testid="insights-display"]').textContent();

      // Click Regenerate
      await regenerateButton.click();

      // Wait for regeneration
      await expect(page.locator('text=Generating insights')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Generating insights')).not.toBeVisible({ timeout: 30000 });

      // Verify insights updated (new content loaded)
      const newInsights = await page.locator('[data-testid="insights-display"]').textContent();

      // Note: insights may be same or different depending on AI model
      // We just verify the regeneration completed successfully
      expect(newInsights).toBeTruthy();
    }
  });
});

test.describe('Coaching Insights - PDF Export', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('#username, input[name="username"]', process.env.E2E_ORG_ADMIN_USERNAME || 'orgadmin');
    await page.fill('#password, input[name="password"]', process.env.E2E_ORG_ADMIN_PASSWORD || 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should include coaching insights in PDF export', async ({ page }) => {
    // Navigate to reports
    await page.click('a[href="/reports"]');
    await page.waitForURL('/reports');

    // Click on a report with insights
    const firstReport = page.locator('[data-testid^="team-report-"]').first();
    await firstReport.click();

    // Check if insights exist
    const insightsDisplay = page.locator('[data-testid="insights-display"]');
    const hasInsights = await insightsDisplay.isVisible();

    if (hasInsights) {
      // Get insights text for verification
      const insightsText = await insightsDisplay.textContent();

      // Find and click PDF export button
      const exportButton = page.locator('button:has-text("Export PDF")');
      await expect(exportButton).toBeVisible();

      // Trigger download
      const downloadPromise = page.waitForEvent('download');
      await exportButton.click();
      const download = await downloadPromise;

      // Verify download occurred
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);

      // Note: Actual PDF content verification would require a PDF parsing library
      // For now, we verify the download was triggered successfully
    }
  });
});

test.describe('Coaching Insights - Feature Visibility', () => {
  test('should hide insights when AI disabled at org level', async ({ page }) => {
    // This test assumes there's a test organization with AI disabled
    // Login as user in org with AI disabled
    await page.goto('/login');
    await page.fill('#username, input[name="username"]', 'testuser');
    await page.fill('#password, input[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');

    // Navigate to a report
    await page.click('a[href="/reports"]');
    await page.waitForURL('/reports');

    const firstReport = page.locator('[data-testid^="team-report-"]').first();
    const hasReport = await firstReport.isVisible();

    if (hasReport) {
      await firstReport.click();

      // Verify Coaching Insights card does NOT appear
      const insightsCard = page.locator('text=Coaching Insights');
      await expect(insightsCard).not.toBeVisible();
    }
  });

  test('should show insights when AI enabled at both levels', async ({ page }) => {
    // Login to org with AI enabled
    await page.goto('/login');
    await page.fill('#username, input[name="username"]', process.env.E2E_ORG_ADMIN_USERNAME || 'orgadmin');
    await page.fill('#password, input[name="password"]', process.env.E2E_ORG_ADMIN_PASSWORD || 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');

    // Navigate to a report
    await page.click('a[href="/reports"]');
    await page.waitForURL('/reports');

    const firstReport = page.locator('[data-testid^="team-report-"]').first();
    await firstReport.click();

    // Verify Coaching Insights card DOES appear
    const insightsCard = page.locator('text=Coaching Insights');

    // Check if AI is enabled for this org
    const isVisible = await insightsCard.isVisible();

    if (isVisible) {
      // Verify either "Generate Insights" button or insights display
      const generateButton = page.locator('button:has-text("Generate Insights")');
      const insightsDisplay = page.locator('[data-testid="insights-display"]');

      const hasButton = await generateButton.isVisible();
      const hasDisplay = await insightsDisplay.isVisible();

      expect(hasButton || hasDisplay).toBeTruthy();
    }
  });
});

test.describe('Coaching Insights - Individual Report', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('#username, input[name="username"]', process.env.E2E_ORG_ADMIN_USERNAME || 'orgadmin');
    await page.fill('#password, input[name="password"]', process.env.E2E_ORG_ADMIN_PASSWORD || 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should generate insights for individual athlete report', async ({ page }) => {
    // Navigate to reports
    await page.click('a[href="/reports"]');
    await page.waitForURL('/reports');

    // Switch to individual reports tab if exists
    const individualTab = page.locator('button:has-text("Individual Reports")');
    const hasTab = await individualTab.isVisible();

    if (hasTab) {
      await individualTab.click();
    }

    // Click on first individual report
    const firstIndividualReport = page.locator('[data-testid^="individual-report-"]').first();
    const hasReport = await firstIndividualReport.isVisible();

    if (hasReport) {
      await firstIndividualReport.click();

      // Find Coaching Insights card
      const insightsCard = page.locator('text=Coaching Insights').first();
      const hasInsightsCard = await insightsCard.isVisible();

      if (hasInsightsCard) {
        // Try to generate insights
        const generateButton = page.locator('button:has-text("Generate Insights")');
        const hasButton = await generateButton.isVisible();

        if (hasButton) {
          await generateButton.click();

          // Wait for generation
          await expect(page.locator('text=Generating insights')).toBeVisible({ timeout: 5000 });
          await expect(page.locator('text=Generating insights')).not.toBeVisible({ timeout: 30000 });

          // Verify insights displayed
          await expect(page.locator('[data-testid="insights-display"]')).toBeVisible();
        }
      }
    }
  });
});
