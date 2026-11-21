/**
 * E2E Tests for the site admin "AI insights prompt" card on /admin.
 *
 * Coverage:
 * 1. Site admin edits a tone field, saves, reloads: the value persists
 * 2. Reset to default clears the field; saving stores nothing for it
 * 3. Role over 200 characters and a 6-line checklist are blocked
 * 4. "Show assembled system prompt" reveals the read-only system prompt
 * 5. An org admin is redirected away from /admin
 *
 * No AI provider is called (no generation is triggered). The CI E2E suite is red (#490), so run this spec locally.
 */

import { test, expect, type Page } from '@playwright/test';
import { loginAs as loginAsRole } from './helpers/auth';
import { canTestRoleAuthorization } from './fixtures/test-users';

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';
type Role = Parameters<typeof loginAsRole>[1];

/** Log in and mark the onboarding tour as done: its overlay would intercept clicks on a first login. */
async function loginAs(page: Page, role: Role) {
  await loginAsRole(page, role);
  await page.request.put(`${BASE_URL}/api/profile/onboarding-status`, { data: { completed: true } });
}

const TONE = 'Keep it warm and short. Celebrate small wins.';

test.describe('Site admin AI insights prompt', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!canTestRoleAuthorization('site_admin', 'org_admin'), 'Needs distinct site admin and org admin accounts');

  let originalOverrides: unknown = null;

  async function openCard(page: Page) {
    await page.goto(`${BASE_URL}/admin`);
    await expect(page.getByText('AI insights prompt', { exact: true })).toBeVisible({ timeout: 20000 });
    // The defaults load after the card: wait for the placeholder so the page is settled
    await expect(page.getByRole('textbox', { name: 'Parent tone' })).toHaveAttribute('placeholder', /\S{10}/, { timeout: 20000 });
  }

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'site_admin');
    originalOverrides = (await (await page.request.get(`${BASE_URL}/api/site-settings`)).json()).aiPromptOverrides ?? null;
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'site_admin');
    await page.request.patch(`${BASE_URL}/api/site-settings`, { data: { aiPromptOverrides: originalOverrides ?? {} } });
    await ctx.close();
  });

  test('site admin saves a tone, reloads and sees it persisted', async ({ page }) => {
    await loginAs(page, 'site_admin');
    await openCard(page);
    await expect(page.getByText('Changes apply to all organizations immediately')).toBeVisible();

    await page.getByRole('textbox', { name: 'Parent tone' }).fill(TONE);
    await page.getByRole('button', { name: 'Save prompt' }).click();
    await expect(page.getByText('AI prompt updated').first()).toBeVisible();

    await page.reload();
    await openCard(page);
    await expect(page.getByRole('textbox', { name: 'Parent tone' })).toHaveValue(TONE);
    await expect(page.getByText(`${TONE.length} / 1500`)).toBeVisible();
  });

  test('a field over 1500 characters is blocked with a message', async ({ page }) => {
    await loginAs(page, 'site_admin');
    await openCard(page);
    await page.getByRole('textbox', { name: 'Coach tone' }).fill('a'.repeat(1501));
    await page.getByRole('button', { name: 'Save prompt' }).click();
    await expect(page.getByText(/must be 1500 characters or less/)).toBeVisible();
  });

  test('Role over 200 characters and a 6-line checklist are blocked with the field limits', async ({ page }) => {
    await loginAs(page, 'site_admin');
    await openCard(page);
    await page.getByRole('textbox', { name: 'Role' }).fill('r'.repeat(201));
    await expect(page.getByText('201 / 200')).toBeVisible();
    await page.getByRole('textbox', { name: 'Analysis checklist' }).fill('a\nb\nc\nd\ne\nf');
    await page.getByRole('button', { name: 'Save prompt' }).click();
    await expect(page.getByText('Role must be 200 characters or less')).toBeVisible();
    await expect(page.getByText(/needs exactly 7 lines/)).toBeVisible();
  });

  test('reset to default clears the field and saving persists the default', async ({ page }) => {
    await loginAs(page, 'site_admin');
    await openCard(page);
    await expect(page.getByRole('textbox', { name: 'Parent tone' })).toHaveValue(TONE);

    await page.getByRole('button', { name: 'Reset Parent tone to default' }).click();
    await expect(page.getByRole('textbox', { name: 'Parent tone' })).toHaveValue('');
    await page.getByRole('button', { name: 'Save prompt' }).click();
    await expect(page.getByText('AI prompt updated').first()).toBeVisible();

    await page.reload();
    await openCard(page);
    await expect(page.getByRole('textbox', { name: 'Parent tone' })).toHaveValue('');
  });

  test('assembled system prompt is shown read-only on demand', async ({ page }) => {
    await loginAs(page, 'site_admin');
    await openCard(page);
    const preview = page.getByTestId('ai-system-prompt-preview');
    await expect(preview).toBeHidden();
    await page.getByRole('button', { name: 'Show assembled system prompt' }).click();
    await expect(preview).toBeVisible();
    // The role in force: the saved override if there is one, else the default shown as the placeholder
    const roleBox = page.getByRole('textbox', { name: 'Role' });
    const role = (await roleBox.inputValue()) || (await roleBox.getAttribute('placeholder')) || '';
    expect(role.length).toBeGreaterThan(10);
    await expect(preview).toContainText(role);
    await expect(page.getByText(/part of the user message/)).toBeVisible();
  });

  test('org admin cannot reach the card', async ({ page }) => {
    await loginAs(page, 'org_admin');
    await page.goto(`${BASE_URL}/admin`);
    await expect(page.getByText('AI insights prompt', { exact: true })).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/admin$/);
  });
});

test.describe('Org admin AI insight wording (layered on the site wording)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!canTestRoleAuthorization('site_admin', 'org_admin'), 'Needs distinct site admin and org admin accounts');

  const ORG_TONE = 'Short, upbeat and plain. No jargon.';
  let orgId = '';
  let originalOrgOverrides: unknown = null;
  let originalAiEnabled = false;

  const settingsUrl = () => `${BASE_URL}/organizations/${orgId}/settings/admin`;

  test.beforeAll(async ({ browser }) => {
    const siteCtx = await browser.newContext();
    const sitePage = await siteCtx.newPage();
    await loginAs(sitePage, 'site_admin');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'org_admin');
    orgId = (await (await page.request.get(`${BASE_URL}/api/auth/me/organizations`)).json())[0].organizationId;
    const before = await (await page.request.get(`${BASE_URL}/api/organizations/${orgId}`)).json();
    originalOrgOverrides = before.aiPromptOverrides ?? null;
    originalAiEnabled = !!before.aiEnabled;
    await sitePage.request.patch(`${BASE_URL}/api/organizations/${orgId}`, { data: { aiEnabledBySiteAdmin: true } });
    await page.request.patch(`${BASE_URL}/api/organizations/${orgId}/org-settings`, { data: { aiEnabled: true } });
    await siteCtx.close();
    await ctx.close();
  });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'org_admin');
    await page.request.patch(`${BASE_URL}/api/organizations/${orgId}/org-settings`, { data: { aiPromptOverrides: originalOrgOverrides } });
    await page.request.patch(`${BASE_URL}/api/organizations/${orgId}/org-settings`, { data: { aiEnabled: originalAiEnabled } });
    await ctx.close();
  });

  test('org admin sets a tone, reloads and sees it; the other slots show the inherited text', async ({ page }) => {
    await loginAs(page, 'org_admin');
    await page.goto(settingsUrl());
    await expect(page.getByText('Insight wording')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('textbox', { name: 'Athlete tone' })).toHaveAttribute('placeholder', /\S{10}/, { timeout: 20000 });
    // Role and checklist are site-only
    await expect(page.getByRole('textbox', { name: 'Role' })).toHaveCount(0);

    await page.getByRole('textbox', { name: 'Parent tone' }).fill(ORG_TONE);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Settings updated').first()).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Parent tone' })).toHaveValue(ORG_TONE, { timeout: 20000 });
    await expect(page.getByRole('textbox', { name: 'Coach tone' })).toHaveValue('');
  });

  test('a coach cannot write the wording or read the inherited text', async ({ page }) => {
    test.skip(!canTestRoleAuthorization('coach'), 'Needs a coach account');
    await loginAs(page, 'coach');
    const patch = await page.request.patch(`${BASE_URL}/api/organizations/${orgId}/org-settings`, { data: { aiPromptOverrides: { toneCoach: 'x' } } });
    expect(patch.status()).toBe(403);
    expect((await page.request.get(`${BASE_URL}/api/organizations/${orgId}/ai-prompt-defaults`)).status()).toBe(403);
    const org = await (await page.request.get(`${BASE_URL}/api/organizations/${orgId}`)).json();
    expect(org).not.toHaveProperty('aiPromptOverrides');
  });
});
