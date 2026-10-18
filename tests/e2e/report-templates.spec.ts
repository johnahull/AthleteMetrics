import { test, expect, type Page } from '@playwright/test';
import { loginAsDefaultUser, setCsrfHeader } from './helpers/auth';

/**
 * Report templates: save wizard choices as an org-wide template, start a new report from it,
 * and combine several benchmark sets. Run locally (E2E suite baseline is red, #490).
 */

const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';
const unique = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const next = (page: Page) => page.getByRole('button', { name: /^Next/ }).click();

/** Team report wizard up to step 6 (benchmarks); picks the first metric unless one is prefilled. */
async function toBenchmarksStep(page: Page, name: string, pickMetric: boolean) {
  await page.goto(`${BASE_URL}/reports`);
  await page.getByRole('button', { name: /new report|create report/i }).first().click();
  await expect(page.getByText('Step 1 of 8')).toBeVisible();
  return {
    continueFromTypeStep: async () => {
      await next(page);
      await page.getByLabel(/Report Name/i).fill(name);
      await next(page); // timeframe
      await next(page); // metrics
      if (pickMetric) await page.getByRole('checkbox').first().check();
      await next(page); // benchmarks
    },
  };
}

test.describe('Report templates', () => {
  const createdTemplateIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    await setCsrfHeader(page);
  });

  test.afterEach(async ({ page }) => {
    for (const id of createdTemplateIds.splice(0)) {
      await page.request.delete(`${BASE_URL}/api/report-templates/${id}`).catch(() => {});
    }
  });

  test('saves a template from the wizard and prefills a new report from it', async ({ page }) => {
    const templateName = `E2E template ${unique()}`;

    const first = await toBenchmarksStep(page, `E2E report ${unique()}`, true);
    await first.continueFromTypeStep();
    await next(page); // filters
    await next(page); // audience / charts
    await page.getByRole('button', { name: 'Save as template' }).click();
    await page.getByLabel(/Template name/i).fill(templateName);
    const saved = page.waitForResponse((r) => r.url().includes('/report-templates') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save template' }).click();
    const body = await (await saved).json();
    createdTemplateIds.push(body.id);
    await expect(page.getByRole('dialog', { name: 'Save as template' })).toBeHidden();

    // A fresh wizard offers the template and prefills the metric step from it
    await page.reload();
    await page.getByRole('button', { name: /new report|create report/i }).first().click();
    await page.getByRole('combobox', { name: /Start from template/i }).click();
    await page.getByRole('option', { name: templateName }).click();
    await next(page);
    await page.getByLabel(/Report Name/i).fill(`E2E from template ${unique()}`);
    await next(page);
    await next(page);
    await expect(page.getByRole('checkbox', { checked: true }).first()).toBeVisible();
  });

  test('shows a duplicate-name error when saving a template twice', async ({ page }) => {
    const templateName = `E2E dup ${unique()}`;
    const res = await page.request.get(`${BASE_URL}/api/auth/session`);
    const orgId = (await res.json())?.user?.organizations?.[0]?.organizationId;
    test.skip(!orgId, 'needs a logged-in user with an organization');
    const created = await page.request.post(`${BASE_URL}/api/organizations/${orgId}/report-templates`, {
      data: { name: templateName, metrics: ['FLY10_TIME'] },
    });
    test.skip(!created.ok(), 'report-templates API not available');
    createdTemplateIds.push((await created.json()).id);

    const wizard = await toBenchmarksStep(page, `E2E report ${unique()}`, true);
    await wizard.continueFromTypeStep();
    await next(page);
    await next(page);
    await page.getByRole('button', { name: 'Save as template' }).click();
    await page.getByLabel(/Template name/i).fill(templateName);
    await page.getByRole('button', { name: 'Save template' }).click();
    await expect(page.getByText(/already exists/i)).toBeVisible();
  });

  test('combines two benchmark sets in one report', async ({ page }) => {
    const wizard = await toBenchmarksStep(page, `E2E sets ${unique()}`, true);
    await wizard.continueFromTypeStep();
    const picker = page.getByRole('combobox', { name: /Add a benchmark set/i }).or(
      page.getByRole('combobox').filter({ hasText: /Add a benchmark set/i }),
    );
    test.skip(!(await picker.count()), 'organization has no benchmark sets');

    for (let i = 0; i < 2; i++) {
      await picker.first().click();
      const options = page.getByRole('option');
      test.skip((await options.count()) < 2, 'needs at least two benchmark sets');
      await options.nth(i).click();
    }
    await expect(page.getByText(/Benchmarks from set:/)).toHaveCount(2);
  });
});
