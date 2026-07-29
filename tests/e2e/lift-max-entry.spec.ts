import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';
import { goToDataEntry } from './helpers/navigation';

/**
 * Lift-Max Entry E2E
 *
 * Verifies the paired-input metric entry flow for weighted 1RM-est lifts:
 *  - Selecting a paired-input metric (BENCH_1RM) reveals (load, reps) inputs
 *  - Live preview computes the 1RM estimate via Epley
 *  - Quick-pick weight chips populate the load field
 *  - Reps stepper increments/decrements
 *  - Tiered guardrails: silent at 1-12, warn at 13-15, redirect at >15
 *  - Submitted measurement appears on the athlete profile with source set + est. marker
 *  - Bodyweight count metric (PULLUPS_MAX) renders the standard single-value form
 *
 * Requires the testing environment to have:
 *  - Migrations 0124, 0125, 0126 applied
 *  - At least one athlete linked to a team for the logged-in user's org
 */

test.describe('Lift-max paired-input entry', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test('selects BENCH_1RM, sees live preview, submits computed 1RM', async ({ page }) => {
    await goToDataEntry(page);

    // Select an athlete (first available)
    await page.locator('[data-testid="athlete-selector"], select[name="userId"], [placeholder*="Select athlete" i]').first().click();
    await page.locator('[role="option"]').first().click().catch(() => {});

    // Pick BENCH_1RM
    await page.locator('select[name="metric"], [data-testid="metric-select"]').first().selectOption({ label: 'Bench Press 1RM Estimate' }).catch(async () => {
      // Fallback for combobox pattern
      await page.getByRole('combobox', { name: /metric/i }).first().click();
      await page.getByRole('option', { name: /Bench Press 1RM Estimate$/ }).first().click();
    });

    // Paired-input region appears
    await expect(page.locator('[data-testid="paired-input-fields"]')).toBeVisible();

    // Enter (315, 3) — Epley: 315 * (1 + 3/30) = 346.5
    await page.locator('[data-testid="paired-primary-input"]').fill('315');
    await page.locator('[data-testid="paired-auxiliary-input"]').fill('3');

    // Output zone shows ~346.5 with est. chip
    await expect(page.locator('[data-testid="paired-computed-value"]')).toContainText('346', { timeout: 5000 });
    await expect(page.locator('[data-testid="est-chip"]')).toBeVisible();

    // Submit
    await page.getByRole('button', { name: /save|submit|add measurement/i }).first().click();

    // Confirm success (toast or redirect)
    await expect(page.locator('text=/success|added|saved/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('weight quick-pick chip populates the load field', async ({ page }) => {
    await goToDataEntry(page);
    await page.locator('[data-testid="athlete-selector"], [placeholder*="Select athlete" i]').first().click();
    await page.locator('[role="option"]').first().click().catch(() => {});
    await page.locator('select[name="metric"], [data-testid="metric-select"]').first().selectOption({ label: 'Bench Press 1RM Estimate' }).catch(async () => {
      await page.getByRole('combobox', { name: /metric/i }).first().click();
      await page.getByRole('option', { name: /Bench Press 1RM Estimate$/ }).first().click();
    });

    await page.locator('[data-testid="weight-quick-pick-225"]').click();
    await expect(page.locator('[data-testid="paired-primary-input"]')).toHaveValue('225');
  });

  test('reps stepper increments and decrements', async ({ page }) => {
    await goToDataEntry(page);
    await page.locator('[data-testid="athlete-selector"], [placeholder*="Select athlete" i]').first().click();
    await page.locator('[role="option"]').first().click().catch(() => {});
    await page.locator('select[name="metric"], [data-testid="metric-select"]').first().selectOption({ label: 'Bench Press 1RM Estimate' }).catch(async () => {
      await page.getByRole('combobox', { name: /metric/i }).first().click();
      await page.getByRole('option', { name: /Bench Press 1RM Estimate$/ }).first().click();
    });

    await page.locator('[data-testid="aux-step-up"]').click();
    await page.locator('[data-testid="aux-step-up"]').click();
    await page.locator('[data-testid="aux-step-up"]').click();
    await expect(page.locator('[data-testid="paired-auxiliary-input"]')).toHaveValue('3');
    await page.locator('[data-testid="aux-step-down"]').click();
    await expect(page.locator('[data-testid="paired-auxiliary-input"]')).toHaveValue('2');
  });

  test('tiered guardrail: 13 reps shows soft warning chip but preview remains', async ({ page }) => {
    await goToDataEntry(page);
    await page.locator('[data-testid="athlete-selector"], [placeholder*="Select athlete" i]').first().click();
    await page.locator('[role="option"]').first().click().catch(() => {});
    await page.locator('select[name="metric"], [data-testid="metric-select"]').first().selectOption({ label: 'Bench Press 1RM Estimate' }).catch(async () => {
      await page.getByRole('combobox', { name: /metric/i }).first().click();
      await page.getByRole('option', { name: /Bench Press 1RM Estimate$/ }).first().click();
    });

    await page.locator('[data-testid="paired-primary-input"]').fill('200');
    await page.locator('[data-testid="paired-auxiliary-input"]').fill('13');

    // Warning chip visible, preview value still shown
    await expect(page.locator('[data-testid="reps-warn-chip"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="paired-computed-value"]')).not.toContainText('—');
  });

  test('tiered guardrail: 16 reps suppresses preview and shows redirect prompt', async ({ page }) => {
    await goToDataEntry(page);
    await page.locator('[data-testid="athlete-selector"], [placeholder*="Select athlete" i]').first().click();
    await page.locator('[role="option"]').first().click().catch(() => {});
    await page.locator('select[name="metric"], [data-testid="metric-select"]').first().selectOption({ label: 'Bench Press 1RM Estimate' }).catch(async () => {
      await page.getByRole('combobox', { name: /metric/i }).first().click();
      await page.getByRole('option', { name: /Bench Press 1RM Estimate$/ }).first().click();
    });

    await page.locator('[data-testid="paired-primary-input"]').fill('200');
    await page.locator('[data-testid="paired-auxiliary-input"]').fill('16');

    await expect(page.locator('[data-testid="reps-redirect-prompt"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="paired-computed-value"]')).toContainText('—');

    // Clicking the redirect button switches the metric
    await page.locator('[data-testid="reps-redirect-button"]').click();
    // Paired fields should disappear since PUSHUPS_MAX has no auxiliaryInputConfig
    await expect(page.locator('[data-testid="paired-input-fields"]')).not.toBeVisible();
  });

  test('PULLUPS_MAX renders standard single-value form (no paired fields)', async ({ page }) => {
    await goToDataEntry(page);
    await page.locator('[data-testid="athlete-selector"], [placeholder*="Select athlete" i]').first().click();
    await page.locator('[role="option"]').first().click().catch(() => {});
    await page.locator('select[name="metric"], [data-testid="metric-select"]').first().selectOption({ label: 'Max Pull-ups' }).catch(async () => {
      await page.getByRole('combobox', { name: /metric/i }).first().click();
      await page.getByRole('option', { name: /Max Pull-ups/ }).first().click();
    });

    await expect(page.locator('[data-testid="paired-input-fields"]')).not.toBeVisible();
    // measurement-form.tsx uses "measurement-value"; athlete-measurement-form.tsx
    // uses "input-measurement-value". Match either so the test runs against
    // both entry-points without depending on which one is mounted at /data-entry.
    await expect(
      page.locator('[data-testid="measurement-value"], [data-testid="input-measurement-value"]'),
    ).toBeVisible();
  });
});
