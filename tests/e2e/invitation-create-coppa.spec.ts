import { test, expect } from '@playwright/test';
import { getUserByRole } from './fixtures/test-users';

/**
 * COPPA E2E — Invite-Create Age Capture (coach-side)
 *
 * Verifies the coach-side COPPA gate in the invitation modal:
 * 1. The athlete invite modal shows an optional Date of Birth field.
 * 2. Entering an under-13 DOB reveals a required parent-email field with the
 *    COPPA alert, and submit is blocked without it.
 * 3. An invitation created with coach-provided birthDate/parentEmail prefills
 *    the accept page and completes to the consent holding screen.
 *
 * Requires an E2E environment with seeded role users (org_admin) — like the
 * other invitation specs, this cannot run against a bare local dev DB.
 */

const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';
const RUN_ID = Date.now().toString(36);

function dobForAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

test.describe('COPPA: invite-create age capture', () => {
  test('under-13 DOB in invite modal reveals required parent email and blocks send without it', async ({ page }) => {
    const admin = getUserByRole('org_admin');

    // Login through the UI so the app shell (and modal) is reachable
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="username"], #username', admin.username);
    await page.fill('input[name="password"], #password', admin.password);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Open the athlete invite modal from the athletes page
    await page.goto(`${BASE_URL}/athletes`);
    await page.waitForLoadState('networkidle');
    const inviteButton = page.getByRole('button', { name: /invite/i }).first();
    await expect(inviteButton, 'an Invite button should exist on the athletes page').toBeVisible();
    await inviteButton.click();

    // DOB field is present for athlete invitations
    const dobInput = page.locator('[data-testid="input-invite-birth-date"]');
    await expect(dobInput, 'DOB field should be in the athlete invite modal').toBeVisible();

    // Parent email hidden until an under-13 DOB is entered
    await expect(page.locator('[data-testid="input-invite-parent-email"]')).toBeHidden();

    await page.locator('[data-testid="input-invite-first-name"]').fill(`CoppaModal${RUN_ID}`);
    await page.locator('[data-testid="input-invite-last-name"]').fill('E2E');
    await page.locator('[data-testid="input-invite-email"]').fill(`e2e_coppa_modal_${RUN_ID}@example.com`);
    await dobInput.fill(dobForAge(12));

    // COPPA alert + required parent email appear
    await expect(page.locator('[data-testid="input-invite-parent-email"]')).toBeVisible();
    await expect(page.getByText(/COPPA/i).first()).toBeVisible();

    // Submitting without a parent email is blocked by validation
    await page.locator('[data-testid="button-send-invitation"]').click();
    await expect(
      page.getByText(/parent or guardian email is required/i),
      'validation should block an under-13 invite without parent email'
    ).toBeVisible();

    // Providing the parent email allows the invite to send
    await page.locator('[data-testid="input-invite-parent-email"]').fill(`e2e_coppa_modal_parent_${RUN_ID}@example.com`);
    await page.locator('[data-testid="button-send-invitation"]').click();
    await expect(page.locator('[data-testid="button-send-invitation"]')).toBeHidden({ timeout: 10000 });
  });

  test('coach-provided DOB/parent email prefill the accept page and reach the consent holding screen', async ({ page, request }) => {
    const admin = getUserByRole('org_admin');

    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: admin.username, password: admin.password },
    });
    expect(loginRes.ok()).toBeTruthy();

    const orgsRes = await request.get(`${BASE_URL}/api/auth/me/organizations`);
    const orgs = await orgsRes.json();
    const organizationId = Array.isArray(orgs) ? orgs[0]?.id ?? orgs[0]?.organizationId : orgs.organizations?.[0]?.id;
    expect(organizationId).toBeTruthy();

    const parentEmail = `e2e_coppa_prefill_parent_${RUN_ID}@example.com`;
    const createRes = await request.post(`${BASE_URL}/api/invitations`, {
      data: {
        email: `e2e_coppa_prefill_${RUN_ID}@example.com`,
        firstName: `CoppaPrefill${RUN_ID}`,
        lastName: 'E2E',
        role: 'athlete',
        organizationId,
        teamIds: [],
        birthDate: dobForAge(12),
        parentEmail,
      },
    });
    expect(createRes.status()).toBe(201);
    const { inviteLink } = await createRes.json();

    await page.context().clearCookies();
    await page.goto((inviteLink as string).replace(/^https?:\/\/[^/]+/, BASE_URL));
    await page.waitForLoadState('networkidle');

    // Prefill: DOB and parent email arrive from the invitation
    await expect(page.locator('#birthDate')).toHaveValue(dobForAge(12));
    await expect(page.locator('#parentEmail')).toHaveValue(parentEmail);

    // Complete the rest and land on the consent holding screen
    await page.locator('#username').fill(`e2ecoppapre${RUN_ID}`);
    await page.locator('#password').fill('ValidPass1!!');
    await page.locator('#confirmPassword').fill('ValidPass1!!');
    await page.locator('#termsAccepted').check();
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText(/consent request has been sent/i)).toBeVisible({ timeout: 10000 });
  });
});
