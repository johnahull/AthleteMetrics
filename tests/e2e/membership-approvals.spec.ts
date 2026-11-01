import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: membership-request approvals live on the User Management page.
 *
 * API calls are stubbed with page.route, so no user, request or membership is created in the target
 * environment. Service workers are blocked so the stubs also see requests made after the first page load.
 */

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.use({ serviceWorkers: 'block' });

const pendingRequest = (id: string, name: string, email: string, org: { id: string; name: string }, verified = true) => ({
  id,
  userId: `user-${id}`,
  organizationId: org.id,
  status: 'pending',
  requestedRole: 'athlete',
  discoveryMethod: 'join_code',
  createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  expiresAt: null,
  user: {
    id: `user-${id}`, firstName: name.split(' ')[0], lastName: name.split(' ')[1], fullName: name, email,
    isEmailVerified: verified, school: 'Central High', graduationYear: 2028, birthYear: 2010,
  },
  organization: org,
});

const ORG_A = { id: 'org-a', name: 'Big Time Athletes' };
const ORG_B = { id: 'org-b', name: 'Beta Club' };

async function stubApi(page: Page, opts: { isSiteAdmin: boolean; requests: ReturnType<typeof pendingRequest>[] }) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  let remaining = [...opts.requests];

  await page.route('**/api/auth/me', (r) =>
    r.fulfill({
      json: {
        user: {
          id: 'admin-1', username: 'admin1', firstName: 'Ada', lastName: 'Admin',
          role: opts.isSiteAdmin ? 'site_admin' : 'org_admin', isSiteAdmin: opts.isSiteAdmin,
        },
      },
    }),
  );
  await page.route('**/api/auth/me/organizations', (r) =>
    r.fulfill({ json: [{ organizationId: ORG_A.id, role: 'org_admin' }] }),
  );
  await page.route('**/api/organizations-with-users', (r) =>
    r.fulfill({
      json: [
        { ...ORG_A, createdAt: '2025-01-01', users: [], invitations: [] },
        ...(opts.isSiteAdmin ? [{ ...ORG_B, createdAt: '2025-01-01', users: [], invitations: [] }] : []),
      ],
    }),
  );
  await page.route('**/api/site-admins', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/users/unaffiliated', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/membership-requests/pending', (r) => r.fulfill({ json: { requests: remaining } }));
  await page.route('**/api/membership-requests/*/approve', (r) => {
    calls.push({ method: 'POST', url: r.request().url(), body: r.request().postDataJSON() });
    const id = r.request().url().split('/membership-requests/')[1].split('/')[0];
    remaining = remaining.filter((q) => q.id !== id);
    return r.fulfill({ json: { request: { id, status: 'approved' } } });
  });
  await page.route('**/api/membership-requests/*/reject', (r) => {
    calls.push({ method: 'POST', url: r.request().url(), body: r.request().postDataJSON() });
    const id = r.request().url().split('/membership-requests/')[1].split('/')[0];
    remaining = remaining.filter((q) => q.id !== id);
    return r.fulfill({ json: { request: { id, status: 'rejected' } } });
  });
  return calls;
}

test.describe('Membership approvals on User Management', () => {
  test('an org admin sees pending requests and can approve one', async ({ page }) => {
    const calls = await stubApi(page, {
      isSiteAdmin: false,
      requests: [
        pendingRequest('req-1', 'Lucy Ortiz', 'lucy@example.com', ORG_A),
        pendingRequest('req-2', 'Sam Rivera', 'sam@example.com', ORG_A, false),
      ],
    });

    await page.goto(`${BASE_URL}/user-management`);
    await expect(page.getByText('Pending Membership Requests (2)')).toBeVisible();
    await expect(page.getByText('Lucy Ortiz')).toBeVisible();
    await expect(page.getByText('Email not verified')).toHaveCount(1);

    await page.getByTestId('approve-request-req-1').click();

    await expect(page.getByText('Pending Membership Requests (1)')).toBeVisible();
    await expect(page.getByText('Lucy Ortiz')).toHaveCount(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/api/membership-requests/req-1/approve');
  });

  test('rejecting sends the typed reason', async ({ page }) => {
    const calls = await stubApi(page, {
      isSiteAdmin: false,
      requests: [pendingRequest('req-1', 'Lucy Ortiz', 'lucy@example.com', ORG_A)],
    });

    await page.goto(`${BASE_URL}/user-management`);
    await page.getByTestId('reject-request-req-1').click();
    await page.getByPlaceholder('Reason (optional)').fill('Not on the roster');
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('Pending Membership Requests')).toHaveCount(0); // none left -> section hidden
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ reason: 'Not on the roster' });
  });

  test('a site admin sees requests from every organization, grouped by organization', async ({ page }) => {
    await stubApi(page, {
      isSiteAdmin: true,
      requests: [
        pendingRequest('req-1', 'Lucy Ortiz', 'lucy@example.com', ORG_A),
        pendingRequest('req-2', 'Sam Rivera', 'sam@example.com', ORG_B),
      ],
    });

    await page.goto(`${BASE_URL}/user-management`);
    await expect(page.getByText('Pending Membership Requests (2)')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Big Time Athletes' })).toContainText('Lucy Ortiz');
    await expect(page.getByRole('region', { name: 'Beta Club' })).toContainText('Sam Rivera');
  });

  test('with nothing pending the section is not shown', async ({ page }) => {
    await stubApi(page, { isSiteAdmin: false, requests: [] });
    await page.goto(`${BASE_URL}/user-management`);
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
    await expect(page.getByText('Pending Membership Requests')).toHaveCount(0);
  });
});
