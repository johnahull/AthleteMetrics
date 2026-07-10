import { test, expect } from './fixtures/e2e-base';
import { loginWithCredentials } from './helpers/auth';
import { getUserByRole } from './fixtures/test-users';

/**
 * E2E Tests for Issue #367 Phase 2 — Custom metric explanation fields
 *
 * Verifies:
 *  1. Org admin can fill Explanations tab fields on a custom metric form
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Custom Metric Form — Explanations Tab', () => {
  const createdMetricCodes: string[] = [];
  let orgId: string | null = null;

  test.beforeEach(async ({ page }) => {
    // Login as site admin (has org context too)
    const siteAdmin = getUserByRole('site_admin');
    await loginWithCredentials(page, siteAdmin.username, siteAdmin.password);

    // Get org ID from API
    const meRes = await page.request.get(`${TESTING_URL}/api/auth/me`);
    if (meRes.ok()) {
      const data = await meRes.json();
      // Site admin: get first org from organizations list, or from user context
      const orgsRes = await page.request.get(`${TESTING_URL}/api/organizations`);
      if (orgsRes.ok()) {
        const orgs = await orgsRes.json();
        if (Array.isArray(orgs) && orgs.length > 0) {
          orgId = orgs[0].id;
        }
      }
    }
  });

  test.afterEach(async ({ page }) => {
    // Archive any custom metrics created during the test
    for (const code of createdMetricCodes) {
      try {
        if (orgId) {
          await page.request.post(
            `${TESTING_URL}/api/organizations/${orgId}/custom-metrics/${code}/archive`,
          );
        }
      } catch {
        // best-effort cleanup
      }
    }
    createdMetricCodes.length = 0;
  });

  test('org admin can fill Explanations tab fields on a custom metric', async ({ page }) => {
    test.skip(!orgId, 'No organization context available');

    await page.goto(`${TESTING_URL}/organizations/${orgId}/custom-metrics`);
    await page.waitForLoadState('networkidle');

    // Click "New Custom Metric" button
    const newButton = page.locator('[data-testid="new-custom-metric-button"]');
    const hasButton = await newButton.isVisible({ timeout: 5000 }).catch(() => false);
    test.skip(!hasButton, 'New Custom Metric button not visible — org admin access required');

    await newButton.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill basic info (required fields)
    const uniqueId = Date.now().toString(36);
    const label = `Expl Tab Test ${uniqueId}`;
    await page.fill('input[name="label"], input[placeholder*="15m Sprint"]', label);

    const unitInput = page.locator('input[name="unit"]').or(page.getByPlaceholder('e.g., s, in, mph'));
    if (await unitInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await unitInput.fill('meters');
    }

    const descInput = page.locator('textarea[name="description"]').or(page.getByPlaceholder('Describe'));
    if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descInput.fill('Basic description for test metric.');
    }

    // Switch to Explanations tab
    const explTab = page.locator('[role="tab"]', { hasText: 'Explanations' });
    await expect(explTab).toBeVisible({ timeout: 3000 });
    await explTab.click();

    // Fill explanation fields
    const shortDescInput = page.locator('input[name="shortDescription"]');
    const whatInput = page.locator('textarea[name="whatItMeasures"]');
    const whyInput = page.locator('textarea[name="whyItMatters"]');

    await expect(shortDescInput).toBeVisible({ timeout: 3000 });
    await shortDescInput.fill('A short description for the glossary.');
    await whatInput.fill('This metric measures **horizontal distance** from a standing start.');
    await whyInput.fill('Important for assessing lower body power transfer.');

    // Listen for API response
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/organizations/') &&
        response.url().includes('/custom-metrics') &&
        response.request().method() === 'POST',
    );

    // Submit the form
    const submitButton = page.locator('button[type="submit"]').or(
      page.getByRole('button', { name: /create|save/i }),
    );
    await submitButton.click();

    // Wait for API response
    const response = await responsePromise;
    expect(response).toBeTruthy();
    expect(response.ok()).toBe(true);

    const body = await response.json();
    if (body.code) createdMetricCodes.push(body.code);

    // Verify the explanation fields were saved
    expect(body.shortDescription).toBe('A short description for the glossary.');
    expect(body.whatItMeasures).toBe(
      'This metric measures **horizontal distance** from a standing start.',
    );
    expect(body.whyItMatters).toBe('Important for assessing lower body power transfer.');
  });
});
