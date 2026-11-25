import { test, expect, type Browser, type Page } from '@playwright/test';
import { loginWithCredentials } from './helpers/auth';

/**
 * E2E Tests: Anytime (standing) wellness requests (AM-FEAT-027)
 *
 * Coach sends an "Anytime" request to one athlete; the athlete answers it from
 * "Anytime check-ins" as often as they like (a same-day resubmit replaces the day's
 * entry), it never raises the dashboard pending-tasks banner, the coach sees day
 * compliance, and a signed-out visit to its link asks to sign in.
 *
 * Needs an organization with wellness enabled, a coach, an athlete and an active
 * template; the athlete needs at least one measurement (the athlete dashboard only
 * mounts the pending-tasks banner once it has data). Given by env vars (defaults
 * match a local seed):
 *   ANYTIME_COACH_USERNAME / ANYTIME_ATHLETE_USERNAME / ANYTIME_PASSWORD
 *   ANYTIME_ATHLETE_NAME (as shown in the athlete picker) / ANYTIME_TEMPLATE_NAME
 *
 * Components: RequestModal, RequestsList (/wellness Requests tab), wellness-my-requests,
 * wellness-submit, PendingTasksBanner (/my-dashboard)
 */

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';
const COACH = process.env.ANYTIME_COACH_USERNAME || 'anytime_coach';
const ATHLETE = process.env.ANYTIME_ATHLETE_USERNAME || 'anytime_athlete1';
const PASSWORD = process.env.ANYTIME_PASSWORD || 'AnytimePass123!';
const ATHLETE_NAME = process.env.ANYTIME_ATHLETE_NAME || 'Ava Anytime';
const TEMPLATE_NAME = process.env.ANYTIME_TEMPLATE_NAME || 'Anytime Daily Check';

// Each role signs in in its own context; never reuse the shared storageState session
test.use({ storageState: { cookies: [], origins: [] } });

async function newSignedInPage(browser: Browser, username: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginWithCredentials(page, username, PASSWORD);
  return page;
}

async function openRequestsTab(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/wellness`);
  await page.getByRole('tab', { name: 'Requests' }).click();
}

/** Answer the template's required scale question and submit; expects the standing success card */
async function submitCheckIn(page: Page): Promise<void> {
  await expect(page.getByTestId('standing-replace-note')).toBeVisible();
  // Standing requests use the signed-in athlete: no name picker
  await expect(page.getByTestId('athlete-selector')).toHaveCount(0);
  const slider = page.getByRole('slider').first();
  await slider.focus();
  await slider.press('ArrowRight');
  const submitted = page.waitForResponse(
    r => r.url().includes('/api/wellness/responses') && r.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Submit' }).click();
  expect((await submitted).ok()).toBeTruthy();
  await expect(page.getByTestId('standing-submit-success')).toBeVisible();
}

test.describe.serial('Wellness Anytime requests', () => {
  test.setTimeout(90 * 1000);

  let requestId: string;
  let publicToken: string;
  let requestsPath: string; // /api/organizations/<orgId>/wellness/requests

  test.afterAll(async ({ browser }) => {
    if (!requestId) return;
    const page = await newSignedInPage(browser, COACH);
    const res = await page.request.put(`${BASE_URL}${requestsPath}/${requestId}/cancel`, { data: {} });
    if (!res.ok()) console.warn(`Failed to cancel request ${requestId}: ${res.status()}`);
    await page.context().close();
  });

  test('coach sends an Anytime request to one athlete', async ({ browser }) => {
    const page = await newSignedInPage(browser, COACH);
    await openRequestsTab(page);

    await page.getByTestId('button-send-request').click();
    const modal = page.getByTestId('request-modal');
    await expect(modal).toBeVisible();

    await modal.getByTestId('select-template').click();
    await page.getByRole('option', { name: TEMPLATE_NAME }).click();

    await modal.getByTestId('send-mode-anytime').click();
    await expect(modal.getByTestId('anytime-description')).toBeVisible();
    // Anytime requests never expire and are answered by signed-in athletes only
    await expect(modal.getByTestId('input-expiry-date')).toHaveCount(0);
    await expect(modal.getByTestId('radio-magic-link')).toBeDisabled();

    await modal.locator('label', { hasText: ATHLETE_NAME }).first().click();

    const created = page.waitForResponse(
      r => /\/wellness\/requests$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST'
    );
    await modal.getByTestId('button-send-request-submit').click();
    const response = await created;
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.isStanding).toBe(true);
    expect(body.distributionMethod).toBe('athlete_account');
    expect(body.expiresAt).toBeNull();
    requestId = body.id;
    requestsPath = new URL(response.url()).pathname;
    publicToken = body.publicToken;
    expect(publicToken).toBeTruthy();

    await expect(modal).toBeHidden();
    await expect(page.getByTestId(`request-status-${requestId}`)).toContainText('Anytime');

    await page.context().close();
  });

  test('athlete answers it from Anytime check-ins, twice the same day, with no dashboard banner', async ({ browser }) => {
    const page = await newSignedInPage(browser, ATHLETE);

    // An optional, never-due request must not raise the pending-tasks banner
    const myRequests = page.waitForResponse(r => r.url().includes('/api/wellness/my-requests'));
    await page.goto(`${BASE_URL}/my-dashboard`);
    // The banner only mounts in the full (non-empty) dashboard; prove that layout rendered
    await expect(page.getByText('Ready for your next session?')).toBeVisible();
    await myRequests;
    await expect(page.getByTestId('pending-tasks-banner')).toHaveCount(0);

    await page.goto(`${BASE_URL}/wellness/my-requests`);
    const anytime = page.getByTestId('anytime-requests-section');
    await expect(anytime).toContainText('Anytime check-ins');
    // (Card titles of organization templates read "Wellness Check-In": the public template
    // endpoint this page uses only serves system templates. Pre-existing, not Anytime-specific.)
    await expect(anytime.getByTestId('wellness-request-card')).toHaveCount(1);
    await expect(page.getByTestId('pending-requests-section')).toHaveCount(0);

    await anytime.getByRole('button', { name: 'Fill out' }).click();
    await expect(page).toHaveURL(new RegExp(`/wellness/submit/${publicToken}$`));
    await expect(page.getByText(TEMPLATE_NAME).first()).toBeVisible();
    await submitCheckIn(page);

    // Still listed after a check-in
    await page.getByRole('link', { name: 'Back to my check-ins' }).click();
    await expect(page.getByTestId('anytime-requests-section').getByTestId('wellness-request-card')).toHaveCount(1);

    // A second check-in the same day succeeds (it replaces today's entry)
    await page.goto(`${BASE_URL}/wellness/submit/${publicToken}`);
    await submitCheckIn(page);

    await page.context().close();
  });

  test('coach sees day compliance for the Anytime request', async ({ browser }) => {
    const page = await newSignedInPage(browser, COACH);
    await openRequestsTab(page);
    // Compliance counts COMPLETE UTC days (ending yesterday) since the request was created, so a request
    // created today has none yet; today's entries count from tomorrow. The day-counting itself
    // (two submits on one day = one entry day) is covered by the wellness-compliance unit tests.
    await expect(page.getByTestId(`request-status-${requestId}`)).toContainText('Anytime');
    await expect(page.getByTestId(`completion-text-${requestId}`)).toHaveText('No complete days yet');
    await page.context().close();
  });

  test('a signed-out visit to the request link asks to sign in', async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE_URL}/wellness/submit/${publicToken}`);
    await expect(page.getByText('Please sign in to submit this check-in')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
    await page.context().close();
  });
});
