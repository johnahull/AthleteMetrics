import { test, expect } from '@playwright/test';
import postgres from 'postgres';
import bcrypt from 'bcrypt';
import { loginWithCredentials } from './helpers/auth';

/**
 * Athlete profile completion gate.
 *
 * A legacy/imported/OAuth athlete without a birthdate logs in, is redirected to
 * /complete-profile, submits a date of birth and lands on the dashboard.
 *
 * Needs DATABASE_URL of the database the app under test uses (the no-DOB user is
 * inserted directly: registration always requires a DOB). Run locally; the E2E
 * suite is baseline-red in CI (#490).
 *
 *   DATABASE_URL=... STAGING_URL=http://localhost:5000 \
 *     npx playwright test tests/e2e/complete-profile.spec.ts --config=playwright.staging.config.ts
 */
const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';
const DATABASE_URL = process.env.DATABASE_URL;
const RUN_ID = Date.now().toString(36);
// One user per Playwright project: projects run in parallel and each deletes its own user
let USERNAME = '';
const PASSWORD = 'ValidPass1!';

test.describe('Complete profile gate', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(!DATABASE_URL, 'DATABASE_URL is required to seed a no-DOB athlete');

  let sql: postgres.Sql;

  test.beforeAll(async ({}, testInfo) => {
    USERNAME = `e2e-nodob-${RUN_ID}-${testInfo.project.name.replace(/\W/g, '')}`;
    sql = postgres(DATABASE_URL!, { max: 1, ssl: DATABASE_URL!.includes('localhost') ? false : 'require' });
    const hash = await bcrypt.hash(PASSWORD, 10);
    await sql`
      insert into users (username, first_name, last_name, full_name, emails, password, is_site_admin, is_email_verified)
      values (${USERNAME}, 'No', 'Dob', 'No Dob', array[${`${USERNAME}@example.com`}]::text[], ${hash}, false, true)`;
  });

  test.afterAll(async () => {
    await sql`delete from users where username = ${USERNAME}`;
    await sql.end();
  });

  test('no-DOB athlete is redirected, submits a DOB and reaches the dashboard', async ({ page }) => {
    await loginWithCredentials(page, USERNAME, PASSWORD);

    await expect(page).toHaveURL(/\/complete-profile/);
    await expect(page.getByText('Complete your profile', { exact: true })).toBeVisible();
    await expect(page.locator('#email')).toHaveCount(0); // real email already on file

    // Navigating elsewhere bounces back
    await page.goto(`${BASE_URL}/athletes`);
    await expect(page).toHaveURL(/\/complete-profile/);

    await page.locator('#birthDate').fill('1995-04-12');
    await page.getByRole('button', { name: /continue/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).not.toHaveURL(/complete-profile/);
  });
});
