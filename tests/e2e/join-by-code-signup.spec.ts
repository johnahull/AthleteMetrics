import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: signing up from a /join/:code link requests membership in that organization.
 *
 * API calls are stubbed with page.route, so no user or membership is created in the target
 * environment and no real join code is needed.
 */

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

async function fillAndSubmitRegistration(page: Page) {
  await expect(page).toHaveURL(/\/register\?redirect=\/join\/JOINBTA/);
  await page.getByLabel('First Name').fill('Lucy');
  await page.getByLabel('Last Name').fill('Ortiz');
  await page.getByLabel('Date of Birth').fill('1990-01-01');
  await page.getByLabel('Email').fill('lucy@example.com');
  await page.getByLabel('Username').fill('lucyortiz');
  await page.getByLabel('Password', { exact: true }).fill('Str0ng!Passw0rd');
  await page.getByLabel('Confirm Password').fill('Str0ng!Passw0rd');
  await page.getByTestId('checkbox-terms-accepted').click();
  const submit = page.getByRole('button', { name: /create account/i });
  await expect(submit).toBeEnabled(); // enabled once the debounced username/email checks pass
  await submit.click();
}

test.describe('Join link signup', () => {
  test('register from /join/:code requests membership and shows the result', async ({ page }) => {
    let membershipBody: unknown = null;

    await page.route('**/api/organizations/join/JOINBTA', (route) =>
      route.fulfill({ json: { organization: { id: 'org-1', name: 'Big Time Athletes', description: null, location: null, orgType: 'club', autoApproveRequests: true } } }),
    );
    await page.route('**/api/auth/check-**', (route) => route.fulfill({ json: { available: true } }));
    await page.route('**/api/auth/register', (route) => route.fulfill({ status: 201, json: { success: true } }));
    await page.route('**/api/membership-requests', (route) => {
      membershipBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { request: { status: 'approved' }, message: 'ok' } });
    });

    await page.goto(`${BASE_URL}/join/JOINBTA`);
    await page.getByRole('button', { name: /create account/i }).click();
    await fillAndSubmitRegistration(page);

    await expect(page.getByText("You've joined Big Time Athletes.")).toBeVisible();
    expect(membershipBody).toEqual({ organizationId: 'org-1', discoveryMethod: 'direct_link' });
  });

  test('an unverified signup to an auto-approve org is told it will join once the email is verified', async ({ page }) => {
    await page.route('**/api/organizations/join/JOINBTA', (route) =>
      route.fulfill({ json: { organization: { id: 'org-1', name: 'Big Time Athletes', description: null, location: null, orgType: 'club', autoApproveRequests: true } } }),
    );
    await page.route('**/api/auth/check-**', (route) => route.fulfill({ json: { available: true } }));
    await page.route('**/api/auth/register', (route) => route.fulfill({ status: 201, json: { success: true } }));
    await page.route('**/api/membership-requests', (route) =>
      route.fulfill({ status: 201, json: { request: { status: 'pending' }, awaitingEmailVerification: true, message: 'ok' } }),
    );

    await page.goto(`${BASE_URL}/join/JOINBTA`);
    await page.getByRole('button', { name: /create account/i }).click();
    await fillAndSubmitRegistration(page);

    await expect(
      page.getByText("Verify your email and you'll be added to Big Time Athletes automatically."),
    ).toBeVisible();
  });

  test('login honors a safe ?redirect and ignores an unsafe one', async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ json: { user: { id: 'u1' }, redirectUrl: '/dashboard' } }),
    );
    await page.route('**/api/organizations/join/JOINBTA', (route) =>
      route.fulfill({ status: 404, json: { message: 'Organization not found' } }),
    );

    await page.goto(`${BASE_URL}/login?redirect=/join/JOINBTA`);
    await page.getByTestId('input-username').fill('lucy');
    await page.getByTestId('input-password').fill('pw');
    await page.getByTestId('button-login').click();
    await expect(page).toHaveURL(/\/join\/JOINBTA$/);

    for (const unsafe of ['//evil.com', '/.//evil.com']) {
      await page.goto(`${BASE_URL}/login?redirect=${encodeURIComponent(unsafe)}`);
      await page.getByTestId('input-username').fill('lucy');
      await page.getByTestId('input-password').fill('pw');
      await page.getByTestId('button-login').click();
      // falls back to the backend redirectUrl, on this origin
      await page.waitForURL((u) => u.pathname === '/dashboard' || u.pathname === '/login');
      expect(new URL(page.url()).host).toBe(new URL(BASE_URL).host);
    }
  });
});
