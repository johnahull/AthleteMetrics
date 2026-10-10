/**
 * E2E: Manage eval templates (AM-FEAT-019)
 *
 * Coverage: Events header "Manage templates" -> list -> edit an organization template (rename, required switch,
 * reorder) -> the New event picker shows the change; delete with confirm; the default is read-only for a coach
 * (no Edit, a direct PATCH is 403) and can be duplicated into the organization.
 *
 * Test data is created through the API and removed in afterAll. The CI E2E suite is red (#490), so run this spec
 * locally against a database with the site metrics and the default "Soccer eval (yards)" template.
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';
const unique = Date.now().toString(36);
const TEMPLATE_NAME = `E2E Manage ${unique}`;
const RENAMED = `E2E Managed ${unique}`;
const TO_DELETE = `E2E Delete me ${unique}`;
const DEFAULT_NAME = 'Soccer eval (yards)';

async function json(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Log in and keep the first-visit onboarding tour from covering the page (a fresh local user has not seen it) */
async function login(page: Page) {
  await loginAsDefaultUser(page);
  const me = await json(await page.request.get(`${BASE_URL}/api/auth/me`));
  const id = me?.user?.id ?? me?.id;
  await page.addInitScript((uid) => {
    try {
      localStorage.setItem(`onboarding_seen_${uid}`, 'true');
    } catch {
      // storage blocked: the tour may show
    }
  }, id);
}

test.describe('Manage eval templates', () => {
  test.describe.configure({ mode: 'serial' });

  const created = { organizationId: '', isSiteAdmin: false, templateId: '', deleteId: '', defaultId: '', extraIds: [] as string[] };

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsDefaultUser(page);
    const api = page.request;
    const memberships = await json(await api.get(`${BASE_URL}/api/auth/me/organizations`));
    const me = await json(await api.get(`${BASE_URL}/api/auth/me`));
    created.isSiteAdmin = !!(me?.user?.isSiteAdmin ?? me?.isSiteAdmin);
    created.organizationId = (Array.isArray(memberships) ? memberships[0]?.organizationId : undefined) ?? me?.user?.primaryOrganizationId;
    expect(created.organizationId, 'the test user needs an organization').toBeTruthy();

    const make = async (name: string) => {
      const res = await api.post(`${BASE_URL}/api/organizations/${created.organizationId}/eval-templates`, {
        data: {
          name,
          sport: 'SOCCER',
          metrics: [
            { metricKey: 'DASH_10', isRequired: true, displayOrder: 0 },
            { metricKey: 'FLY_10', isRequired: false, displayOrder: 1 },
          ],
        },
      });
      expect(res.ok(), `create ${name}: ${await res.text()}`).toBeTruthy();
      return (await res.json()).id as string;
    };
    created.templateId = await make(TEMPLATE_NAME);
    created.deleteId = await make(TO_DELETE);
    const list = await json(await api.get(`${BASE_URL}/api/organizations/${created.organizationId}/eval-templates`));
    created.defaultId = list.find((t: { name: string; organizationId: string | null }) => t.name === DEFAULT_NAME && !t.organizationId)?.id ?? '';
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsDefaultUser(page);
      const list = await json(await page.request.get(`${BASE_URL}/api/organizations/${created.organizationId}/eval-templates`));
      const copies = Array.isArray(list) ? list.filter((t: { name: string; organizationId: string | null }) => t.organizationId && t.name === `${DEFAULT_NAME} (copy)`) : [];
      for (const id of [created.templateId, created.deleteId, ...created.extraIds, ...copies.map((t: { id: string }) => t.id)].filter(Boolean)) {
        await page.request.delete(`${BASE_URL}/api/eval-templates/${id}`).catch(() => {});
      }
    } finally {
      await context.close();
    }
  });

  test('Events header links to the template list', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/events`);
    await page.getByRole('link', { name: 'Manage templates' }).click();
    await expect(page).toHaveURL(/\/events\/templates$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Eval templates' })).toBeVisible();
    await expect(page.getByRole('heading', { name: TEMPLATE_NAME })).toBeVisible();
  });

  test('edits a template (rename, required, reorder) and the New event picker shows it', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/events/templates`);
    await page.getByRole('link', { name: `Edit ${TEMPLATE_NAME}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Edit template' })).toBeVisible();

    await page.getByLabel('Name').fill(RENAMED);
    const rows = page.locator('[data-metric-row]');
    await expect(rows).toHaveCount(2);
    await rows.nth(1).getByRole('switch', { name: 'Required' }).click();
    await rows.nth(1).getByRole('button', { name: /^Move .+ up$/ }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Template saved').first()).toBeVisible();

    const saved = await json(await page.request.get(`${BASE_URL}/api/eval-templates/${created.templateId}`));
    expect(saved.name).toBe(RENAMED);
    expect(saved.metrics.map((m: { metricKey: string; isRequired: boolean }) => [m.metricKey, m.isRequired])).toEqual([
      ['FLY_10', true],
      ['DASH_10', true],
    ]);

    await page.goto(`${BASE_URL}/events/new`);
    await page.getByLabel(/event name/i).fill(`E2E unused ${unique}`);
    await page.getByLabel(/start date/i).fill(new Date().toISOString().split('T')[0]);
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('combobox', { name: /start from template/i }).click();
    await expect(page.getByRole('option', { name: RENAMED })).toBeVisible();
  });

  test('deletes an organization template after confirming', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/events/templates`);
    await page.getByRole('button', { name: `Delete ${TO_DELETE}` }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Events already created from it keep their tests.');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: TO_DELETE })).toBeVisible();

    await page.getByRole('button', { name: `Delete ${TO_DELETE}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: TO_DELETE })).toHaveCount(0);
    expect((await page.request.get(`${BASE_URL}/api/eval-templates/${created.deleteId}`)).status()).toBe(404);
    created.deleteId = '';
  });

  test('a coach sees the default read-only, cannot PATCH it, and duplicates it', async ({ page }) => {
    test.skip(created.isSiteAdmin, 'The default user is a site admin, who may edit the default');
    test.skip(!created.defaultId, `No "${DEFAULT_NAME}" default template in this database`);
    await login(page);
    await page.goto(`${BASE_URL}/events/templates`);
    await expect(page.getByRole('link', { name: `Edit ${DEFAULT_NAME}` })).toHaveCount(0);
    expect((await page.request.patch(`${BASE_URL}/api/eval-templates/${created.defaultId}`, { data: { description: 'x' } })).status()).toBe(403);

    await page.getByRole('link', { name: `View ${DEFAULT_NAME}` }).click();
    await expect(page.getByText(/Only a site admin can change the default template/)).toBeVisible();
    await page.getByRole('button', { name: 'Duplicate as my template' }).click();
    await expect(page.getByText('Template duplicated').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Edit template' })).toBeVisible();
    const id = page.url().split('/').pop()!;
    created.extraIds.push(id);
    const copy = await json(await page.request.get(`${BASE_URL}/api/eval-templates/${id}`));
    expect(copy).toMatchObject({ name: `${DEFAULT_NAME} (copy)`, organizationId: created.organizationId });
  });
});
