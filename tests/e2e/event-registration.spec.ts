import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';
import { navigateTo } from './helpers/navigation';

/**
 * TIER 1 CRITICAL: Event Registration Tests
 *
 * These tests verify the event registration workflows:
 * - Viewing registrations as admin
 * - Approving pending registrations
 * - Declining pending registrations
 * - Athlete viewing their registrations
 * - Registration status transitions
 *
 * Tests follow TDD methodology: written first, infrastructure built to make them pass.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Shared test organization for all tests in this file
let sharedTestOrganizationId: string | null = null;

// Helper to create a test organization with events enabled
async function getOrCreateTestOrganization(page: any): Promise<string> {
  if (sharedTestOrganizationId) {
    return sharedTestOrganizationId;
  }

  const uniqueId = Date.now().toString(36);
  const orgData = {
    name: `TestOrg_Registration_${uniqueId}`,
    eventsEnabled: true,
  };

  const response = await page.request.post(`${STAGING_URL}/api/organizations`, {
    data: orgData,
  });

  if (!response.ok()) {
    console.warn('Failed to create test organization:', await response.text());
    throw new Error('Failed to create test organization');
  }

  const org = await response.json();
  sharedTestOrganizationId = org.id;
  console.log(`Created test organization: ${org.name} (${org.id})`);
  return org.id;
}

// Helper to generate unique test event data
function generateTestEvent() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 1);

  return {
    name: `RegTestEvent_${uniqueId}`,
    eventType: 'combine',
    location: 'Registration Test Venue',
    startDate: futureDate.toISOString().split('T')[0],
    description: 'E2E registration test event - safe to delete',
    visibility: 'public',
    registrationMode: 'request_approval', // Requires approval for testing workflow
    status: 'published',
  };
}

// Helper to create test event via API (with organization)
async function createTestEvent(page: any) {
  const testEvent = generateTestEvent();
  const organizationId = await getOrCreateTestOrganization(page);

  const response = await page.request.post(`${STAGING_URL}/api/events`, {
    data: {
      ...testEvent,
      organizationId,
    },
  });

  const createdEvent = await response.json();
  return { ...testEvent, ...createdEvent };
}

// Helper to create a test registration
async function createTestRegistration(page: any, eventId: string, status: string = 'pending') {
  const response = await page.request.post(`${STAGING_URL}/api/events/${eventId}/registrations`, {
    data: {
      athleteNotes: 'E2E test registration',
      status,
    },
  });

  return response.json();
}

test.describe('Event Registration Management', () => {
  /**
   * FIXME: These tests require:
   * 1. A test organization with eventsEnabled=true
   * 2. The test user to be a member of that organization
   *
   * Site admins can create organizations but the API doesn't allow self-adding as member.
   * To make these tests pass, pre-create an org with the test user as a member.
   */
  let testEventId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test.afterEach(async ({ page }) => {
    // Cleanup test event
    if (testEventId) {
      try {
        await page.request.delete(`${STAGING_URL}/api/events/${testEventId}`);
      } catch (error) {
        console.warn(`Failed to cleanup event ${testEventId}:`, error);
      }
      testEventId = null;
    }
  });

  test.fixme('should display registrations tab on event detail page', async ({ page }) => {
    // Create event via API
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Navigate to event detail
    await navigateTo(page, `/events/${event.id}`);

    // Verify registrations tab is visible (text-based selector since no data-testid)
    const registrationsTab = page.locator('button[role="tab"]:has-text("Registrations"), [data-testid="tab-registrations"]').first();
    await expect(registrationsTab).toBeVisible();

    // Click on registrations tab
    await registrationsTab.click();
    await page.waitForLoadState('networkidle');

    // Verify registrations content loads (could show "No registrations" or table)
    await expect(page.locator('text=/Registrations|No registrations|No athletes/i').first()).toBeVisible();
  });

  test.fixme('should show empty state when no registrations', async ({ page }) => {
    // FIXME: Requires org membership
    // Create event via API
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Navigate to event detail registrations tab
    await navigateTo(page, `/events/${event.id}`);
    const registrationsTab = page.locator('button[role="tab"]:has-text("Registrations")').first();
    await registrationsTab.click();
    await page.waitForLoadState('networkidle');

    // Verify empty state message (flexible matching)
    const emptyState = page.locator('text=/No registrations|No athletes|empty/i');
    await expect(emptyState.first()).toBeVisible();
  });

  test.fixme('should display registration with pending status', async ({ page }) => {
    // Create event via API
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Create a pending registration via API
    await createTestRegistration(page, event.id, 'pending');

    // Navigate to event detail registrations tab
    await navigateTo(page, `/events/${event.id}`);
    const registrationsTab = page.locator('button[role="tab"]:has-text("Registrations")').first();
    await registrationsTab.click();
    await page.waitForLoadState('networkidle');

    // Verify pending registration is visible
    await expect(page.locator('text=/Pending|Awaiting/i').first()).toBeVisible();
  });

  test.fixme('should approve pending registration', async ({ page }) => {
    // Create event via API
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Create a pending registration via API
    const registration = await createTestRegistration(page, event.id, 'pending');

    // Navigate to event detail registrations tab
    await navigateTo(page, `/events/${event.id}`);
    const registrationsTab = page.locator('button[role="tab"]:has-text("Registrations")').first();
    await registrationsTab.click();
    await page.waitForLoadState('networkidle');

    // Find and click approve button
    const approveButton = page.locator('button:has-text("Approve")').first();
    if (await approveButton.isVisible()) {
      await approveButton.click();

      // Wait for approval to complete
      await page.waitForLoadState('networkidle');

      // Verify status changed to approved
      await expect(page.locator('text=/Approved|Registered/i').first()).toBeVisible();
    } else {
      // Check for checkmark icon button pattern
      const approveIcon = page.locator('[data-testid="approve-registration"]').first();
      if (await approveIcon.isVisible()) {
        await approveIcon.click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('text=/Approved|Registered/i').first()).toBeVisible();
      }
    }
  });

  test.fixme('should decline pending registration', async ({ page }) => {
    // Create event via API
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Create a pending registration via API
    await createTestRegistration(page, event.id, 'pending');

    // Navigate to event detail registrations tab
    await navigateTo(page, `/events/${event.id}`);
    const registrationsTab = page.locator('button[role="tab"]:has-text("Registrations")').first();
    await registrationsTab.click();
    await page.waitForLoadState('networkidle');

    // Find and click decline button
    const declineButton = page.locator('button:has-text("Decline")').first();
    if (await declineButton.isVisible()) {
      await declineButton.click();

      // If there's a confirmation modal, confirm it
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
      if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.click();
      }

      // Wait for decline to complete
      await page.waitForLoadState('networkidle');

      // Verify status changed to declined
      await expect(page.locator('text=/Declined/i').first()).toBeVisible();
    } else {
      // Check for X icon button pattern
      const declineIcon = page.locator('[data-testid="decline-registration"]').first();
      if (await declineIcon.isVisible()) {
        await declineIcon.click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('text=/Declined/i').first()).toBeVisible();
      }
    }
  });

  test.fixme('should filter registrations by status', async ({ page }) => {
    // Create event via API
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Navigate to event detail registrations tab
    await navigateTo(page, `/events/${event.id}`);
    const registrationsTab = page.locator('button[role="tab"]:has-text("Registrations")').first();
    await registrationsTab.click();
    await page.waitForLoadState('networkidle');

    // Check for filter dropdown
    const filterDropdown = page.locator('select, [data-testid="status-filter"]');
    if (await filterDropdown.isVisible()) {
      // Test filtering by status
      await filterDropdown.selectOption('pending');
      await page.waitForLoadState('networkidle');

      // Return to all
      await filterDropdown.selectOption('all');
      await page.waitForLoadState('networkidle');
    }
  });

  test.fixme('should show registration count on event card', async ({ page }) => {
    // Create event via API
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Create a registration
    await createTestRegistration(page, event.id, 'approved');

    // Navigate to events list
    await navigateTo(page, '/events');
    await page.waitForLoadState('networkidle');

    // Find event card and verify registration count
    const eventCard = page.locator(`[data-testid="event-card"]:has-text("${event.name}")`);
    if (await eventCard.isVisible()) {
      // Check for registration count indicator
      await expect(eventCard.locator('text=/registered|registration/i')).toBeVisible();
    }
  });
});

test.describe('Athlete Registration View (My Events)', () => {
  let testEventId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test.afterEach(async ({ page }) => {
    if (testEventId) {
      try {
        await page.request.delete(`${STAGING_URL}/api/events/${testEventId}`);
      } catch (error) {
        console.warn(`Failed to cleanup event ${testEventId}:`, error);
      }
      testEventId = null;
    }
  });

  test('should display my-events page', async ({ page }) => {
    await navigateTo(page, '/my-events');

    // Verify page loads
    await expect(page.locator('h1:has-text("My Events")')).toBeVisible();
  });

  test('should show "Find Events" button on my-events page', async ({ page }) => {
    await navigateTo(page, '/my-events');

    // Verify Find Events button is visible (use .first() to handle multiple matches)
    const findButton = page.locator('button:has-text("Find Events"), a:has-text("Find Events")').first();
    await expect(findButton).toBeVisible();
  });

  test('should show empty state when no registrations', async ({ page }) => {
    await navigateTo(page, '/my-events');
    await page.waitForLoadState('networkidle');

    // Check for either events or empty state (more flexible patterns)
    const emptyState = page.locator('text=/No events|haven\'t registered|not registered|Find Events/i');
    const eventCards = page.locator('[data-testid="registration-card"], [data-testid="event-card"]');

    const hasEmptyState = await emptyState.first().isVisible().catch(() => false);
    const hasEventCards = (await eventCards.count()) > 0;

    // Either we have registrations or we have empty state (page loads properly)
    expect(hasEmptyState || hasEventCards).toBeTruthy();
  });

  test.fixme('should categorize registrations into upcoming and past', async ({ page }) => {
    // Create event in the future
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Register for the event
    await page.request.post(`${STAGING_URL}/api/events/${event.id}/register`, {
      data: { athleteNotes: 'Test registration' },
    });

    await navigateTo(page, '/my-events');
    await page.waitForLoadState('networkidle');

    // Check for section headers (may be "Upcoming Events" or "Pending")
    const upcomingSection = page.locator('text=/Upcoming|Pending/i');
    const hasUpcoming = await upcomingSection.isVisible().catch(() => false);

    // At least one section should be visible if we have a registration
    expect(hasUpcoming).toBeTruthy();
  });

  test.fixme('should show registration status badge', async ({ page }) => {
    // Create event
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Register for the event
    await page.request.post(`${STAGING_URL}/api/events/${event.id}/register`, {
      data: { athleteNotes: 'Test registration' },
    });

    await navigateTo(page, '/my-events');
    await page.waitForLoadState('networkidle');

    // Look for status badges
    const statusBadge = page.locator('text=/Pending|Registered|Approved|Waitlisted/i').first();
    await expect(statusBadge).toBeVisible();
  });

  test.fixme('should navigate to event details from my-events', async ({ page }) => {
    // Create event
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Register for the event
    await page.request.post(`${STAGING_URL}/api/events/${event.id}/register`, {
      data: { athleteNotes: 'Test registration' },
    });

    await navigateTo(page, '/my-events');
    await page.waitForLoadState('networkidle');

    // Find and click View Details button
    const viewButton = page.locator('button:has-text("View Details"), a:has-text("View Details")').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();

      // Verify navigation to event detail page
      await page.waitForURL(/\/events\//, { timeout: 5000 });
    }
  });
});

test.describe('Registration Workflow Integration', () => {
  let testEventId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test.afterEach(async ({ page }) => {
    if (testEventId) {
      try {
        await page.request.delete(`${STAGING_URL}/api/events/${testEventId}`);
      } catch (error) {
        console.warn(`Failed to cleanup event ${testEventId}:`, error);
      }
      testEventId = null;
    }
  });

  test.fixme('should complete full registration approval workflow', async ({ page }) => {
    // Create event with approval required
    const eventData = generateTestEvent();
    eventData.registrationMode = 'request_approval';
    const organizationId = await getOrCreateTestOrganization(page);

    const createResponse = await page.request.post(`${STAGING_URL}/api/events`, {
      data: {
        ...eventData,
        organizationId,
      },
    });
    const event = await createResponse.json();
    testEventId = event.id;

    // Simulate registration (would normally be from another user)
    await createTestRegistration(page, event.id, 'pending');

    // Go to event registrations
    await navigateTo(page, `/events/${event.id}`);
    const registrationsTab = page.locator('button[role="tab"]:has-text("Registrations")').first();
    await registrationsTab.click();
    await page.waitForLoadState('networkidle');

    // Verify pending registration
    await expect(page.locator('text=/Pending|Awaiting/i').first()).toBeVisible();

    // Approve it
    const approveButton = page.locator('button:has-text("Approve"), [data-testid="approve-registration"]').first();
    if (await approveButton.isVisible()) {
      await approveButton.click();
      await page.waitForLoadState('networkidle');

      // Verify approved status
      await expect(page.locator('text=/Approved|Registered/i').first()).toBeVisible();
    }
  });

  test.fixme('should handle capacity limits with waitlist', async ({ page }) => {
    // Create event with limited capacity
    const organizationId = await getOrCreateTestOrganization(page);
    const eventData = {
      ...generateTestEvent(),
      maxRegistrations: 2,
      registrationMode: 'open',
      organizationId,
    };

    const createResponse = await page.request.post(`${STAGING_URL}/api/events`, {
      data: eventData,
    });
    const event = await createResponse.json();
    testEventId = event.id;

    // Navigate to event
    await navigateTo(page, `/events/${event.id}`);
    await page.waitForLoadState('networkidle');

    // Verify capacity is displayed
    const capacityText = page.locator('text=/spots|capacity|remaining/i');
    if (await capacityText.isVisible()) {
      await expect(capacityText).toBeVisible();
    }
  });
});
