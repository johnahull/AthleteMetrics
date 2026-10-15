import { test, expect } from '@playwright/test';

/**
 * E2E: a site admin assigns a user who belongs to no organization.
 *
 * Every API call is stubbed with page.route, so nothing is created in the target environment.
 */

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

const siteAdmin = { id: 'admin-1', username: 'admin', firstName: 'Site', lastName: 'Admin', role: 'site_admin', isSiteAdmin: true };

// The app registers a service worker, which would bypass page.route stubs
test.use({ serviceWorkers: 'block' });

test.describe('Assign unaffiliated users', () => {
  test('site admin assigns Lucy to an organization and parents are blocked', async ({ page }) => {
    let unaffiliated = [
      { id: 'u1', firstName: 'Lucy', lastName: 'Ortiz', username: 'lucyortiz', emails: ['lucy@example.com'], isActive: true, isParent: false },
      { id: 'u2', firstName: 'Pat', lastName: 'Parent', username: 'patp', emails: ['pat@example.com'], isActive: true, isParent: true },
    ];
    let assignBody: unknown = null;

    await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: siteAdmin } }));
    await page.route('**/api/auth/me/organizations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/admin/impersonation-status', (route) => route.fulfill({ json: { isImpersonating: false } }));
    await page.route('**/api/csrf-token', (route) => route.fulfill({ json: { csrfToken: 'test' } }));
    await page.route('**/api/site-admins', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/organizations-with-users', (route) =>
      route.fulfill({ json: [{ id: 'org-1', name: 'Big Time Athletes', createdAt: new Date().toISOString(), users: [], invitations: [] }] }),
    );
    await page.route('**/api/users/unaffiliated', (route) => route.fulfill({ json: unaffiliated }));
    await page.route('**/api/organizations/org-1/users/u1/assign', (route) => {
      assignBody = route.request().postDataJSON();
      unaffiliated = unaffiliated.filter((u) => u.id !== 'u1');
      return route.fulfill({ status: 201, json: { id: 'm1' } });
    });

    await page.goto(`${BASE_URL}/user-management`);

    await expect(page.getByRole('heading', { name: 'Unaffiliated Users' })).toBeVisible();
    const parentRow = page.getByTestId('unaffiliated-user-u2');
    await expect(parentRow.getByRole('button', { name: /assign to organization/i })).toBeDisabled();

    await page.getByTestId('unaffiliated-user-u1').getByRole('button', { name: /assign to organization/i }).click();
    await page.getByRole('combobox', { name: 'Organization' }).click();
    await page.getByRole('option', { name: 'Big Time Athletes' }).click();
    await page.getByRole('button', { name: 'Assign', exact: true }).click();

    await expect(page.getByTestId('unaffiliated-user-u1')).toBeHidden();
    expect(assignBody).toEqual({ role: 'athlete' });
  });
});
