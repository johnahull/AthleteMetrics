import { test, expect, type APIRequestContext } from '@playwright/test';
import { getUserByRole } from './fixtures/test-users';

/**
 * COPPA E2E — Invitation Accept Age Gate (P0-11)
 *
 * Verifies the legally critical invite-accept journey:
 * 1. An under-13 date of birth on the accept-invitation page reveals the
 *    parent email field with the COPPA warning, and submitting leads to the
 *    consent-sent holding screen with NO authenticated session.
 * 2. An adult date of birth completes account creation and redirects into
 *    the app as before.
 *
 * Invitations are created through the real API with an org-admin session,
 * using the inviteLink returned by POST /api/invitations.
 *
 * Test isolation: storageState is cleared so no shared auth state leaks in.
 */

const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';
const RUN_ID = Date.now().toString(36);

function dobForAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/** Login as org admin and create an athlete invitation; returns the invite link. */
async function createAthleteInvitation(
  request: APIRequestContext,
  suffix: string
): Promise<{ inviteLink: string; email: string }> {
  const admin = getUserByRole('org_admin');

  const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { username: admin.username, password: admin.password },
  });
  expect(loginRes.ok(), 'org admin login should succeed').toBeTruthy();

  const orgsRes = await request.get(`${BASE_URL}/api/auth/me/organizations`);
  expect(orgsRes.ok(), 'should fetch admin organizations').toBeTruthy();
  const orgs = await orgsRes.json();
  const organizationId = Array.isArray(orgs) ? orgs[0]?.id ?? orgs[0]?.organizationId : orgs.organizations?.[0]?.id;
  expect(organizationId, 'org admin should belong to at least one organization').toBeTruthy();

  const email = `e2e_coppa_inv_${suffix}@example.com`;
  const createRes = await request.post(`${BASE_URL}/api/invitations`, {
    data: {
      email,
      firstName: `CoppaInvite${suffix}`,
      lastName: 'E2E',
      role: 'athlete',
      organizationId,
      teamIds: [],
    },
  });
  expect(createRes.status(), 'invitation creation should return 201').toBe(201);
  const body = await createRes.json();
  expect(body.inviteLink, 'response should include inviteLink').toBeTruthy();

  return { inviteLink: body.inviteLink as string, email };
}

/** Fill the common accept-invitation form fields (except birthDate/parentEmail). */
async function fillBaseFields(page: import('@playwright/test').Page, suffix: string) {
  await page.locator('#username').fill(`e2ecoppainv${suffix}`);
  await page.locator('#password').fill('ValidPass1!!');
  await page.locator('#confirmPassword').fill('ValidPass1!!');
  await page.locator('#termsAccepted').check();
}

test.describe('COPPA: invitation accept age gate', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('under-13 DOB reveals parent email + submits to consent holding screen (no session)', async ({ page, request }) => {
    const suffix = `${RUN_ID}u13`;
    const { inviteLink } = await createAthleteInvitation(request, suffix);

    await page.goto(inviteLink.replace(/^https?:\/\/[^/]+/, BASE_URL));
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#birthDate'), 'DOB field should be on the accept page').toBeVisible();

    // Parent email hidden until a minor DOB is entered
    await expect(page.locator('#parentEmail')).toBeHidden();

    await page.locator('#birthDate').fill(dobForAge(12));

    // Under-13 → parent email field + COPPA warning appear
    await expect(page.locator('#parentEmail'), 'parent email should appear for under-13').toBeVisible();
    await expect(page.getByText(/COPPA/i).first(), 'COPPA warning should be shown').toBeVisible();

    await page.locator('#parentEmail').fill(`e2e_coppa_parent_${suffix}@example.com`);
    await fillBaseFields(page, suffix);
    await page.locator('button[type="submit"]').click();

    // Consent-sent holding screen — NOT logged in, no redirect into the app
    await expect(
      page.getByText(/consent request has been sent/i),
      'holding screen should confirm the consent request was sent'
    ).toBeVisible({ timeout: 10000 });
    expect(page.url()).not.toMatch(/\/athletes\//);

    // No authenticated session: /api/auth/me should not return this new user
    const meRes = await page.request.get(`${BASE_URL}/api/auth/me`);
    if (meRes.ok()) {
      const me = await meRes.json();
      expect(me?.username ?? me?.user?.username).not.toBe(`e2ecoppainv${suffix}`);
    }
  });

  test('adult DOB completes account creation and enters the app', async ({ page, request }) => {
    const suffix = `${RUN_ID}adult`;
    const { inviteLink } = await createAthleteInvitation(request, suffix);

    await page.goto(inviteLink.replace(/^https?:\/\/[^/]+/, BASE_URL));
    await page.waitForLoadState('networkidle');

    await page.locator('#birthDate').fill(dobForAge(25));

    // Adult → no required parent email gate
    await fillBaseFields(page, suffix);
    await page.locator('button[type="submit"]').click();

    // Successful accept redirects the athlete into the app
    await page.waitForURL(/\/athletes\//, { timeout: 15000 });
    expect(page.url()).toMatch(/\/athletes\//);
  });
});
