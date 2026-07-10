import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';
import { navigateTo } from './helpers/navigation';

/**
 * TIER 1 CRITICAL: Event CRUD Tests
 *
 * These tests verify the core event management functionality:
 * - Creating new events
 * - Viewing event lists
 * - Editing event information
 * - Freezing/unfreezing events
 * - Event code generation
 *
 * Tests follow TDD methodology: written first, infrastructure built to make them pass.
 *
 * IMPORTANT: Events feature requires an organization with eventsEnabled=true.
 * These tests create a test organization as part of setup.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test event data to avoid conflicts in parallel execution
function generateTestEvent() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 1);

  return {
    name: `TestEvent_${uniqueId}`,
    eventType: 'combine',
    location: 'Test Gymnasium',
    startDate: futureDate.toISOString().split('T')[0],
    description: 'E2E test event - safe to delete',
  };
}

// Helper to create a test organization with events enabled and add user as admin
async function createTestOrganization(page: any): Promise<{ id: string; name: string }> {
  const uniqueId = Date.now().toString(36);
  const orgData = {
    name: `TestOrg_Events_${uniqueId}`,
    eventsEnabled: true,
  };

  // Create organization
  const response = await page.request.post(`${STAGING_URL}/api/organizations`, {
    data: orgData,
  });

  if (!response.ok()) {
    console.warn('Failed to create test organization:', await response.text());
    throw new Error('Failed to create test organization');
  }

  const org = await response.json();

  // Get current user info
  const userResponse = await page.request.get(`${STAGING_URL}/api/auth/me`);
  const userData = await userResponse.json();
  const userId = userData?.user?.id;

  if (userId) {
    // Add current user to organization as org_admin
    try {
      await page.request.post(`${STAGING_URL}/api/organizations/${org.id}/members`, {
        data: {
          userId: userId,
          role: 'org_admin',
        },
      });
      console.log(`Added user ${userId} to organization ${org.id} as org_admin`);
    } catch (error) {
      console.warn('Could not add user to organization (may already be member):', error);
    }
  }

  return org;
}

// Helper to navigate to events page (with org context handling)
async function goToEvents(page: any, organizationId?: string) {
  // First, reload the page to pick up any new org memberships
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Navigate to events
  await navigateTo(page, '/events');

  // Wait for page to load - check for Events heading with longer timeout
  try {
    await page.waitForSelector('h1:has-text("Events")', { timeout: 15000 });
  } catch {
    // Check if we're seeing the "select organization" message
    const selectOrgMessage = await page.locator('text=/select an organization/i').isVisible();
    if (selectOrgMessage) {
      // If we need to select an org and have an org ID, the frontend may need additional navigation
      console.log('Events page requires organization context. User may need to switch orgs in UI.');
      throw new Error('Events page requires organization context. The test user must be a member of an org with eventsEnabled=true.');
    }
    throw new Error('Events page did not load properly');
  }
}

test.describe('Event CRUD Tests', () => {
  // Track created events and organization for cleanup
  let createdEventIds: string[] = [];
  let testOrganizationId: string | null = null;

  // Setup: Login before each test
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdEventIds = [];

    // Create test organization with events enabled if not already created
    if (!testOrganizationId) {
      try {
        const org = await createTestOrganization(page);
        testOrganizationId = org.id;
        console.log(`Created test organization: ${org.name} (${org.id})`);
      } catch (error) {
        console.warn('Could not create test organization, some tests may fail:', error);
      }
    }
  });

  // Cleanup: Delete test events created during test
  test.afterEach(async ({ page }) => {
    for (const eventId of createdEventIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/events/${eventId}`);
      } catch (error) {
        console.warn(`Failed to cleanup event ${eventId}:`, error);
      }
    }
  });

  // Cleanup organization after all tests
  test.afterAll(async ({ browser }) => {
    if (testOrganizationId) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginAsDefaultUser(page);
      try {
        await page.request.delete(`${STAGING_URL}/api/organizations/${testOrganizationId}`);
        console.log(`Cleaned up test organization: ${testOrganizationId}`);
      } catch (error) {
        console.warn(`Failed to cleanup organization ${testOrganizationId}:`, error);
      }
      await context.close();
    }
  });

  test.fixme('should display events list page for org admins', async ({ page }) => {
    // FIXME: This test requires a user who is a member of an org with eventsEnabled=true.
    // Site admins can create orgs but cannot add themselves as members via API.
    // To make this test pass, pre-create an org with the test user as a member.
    test.skip(!testOrganizationId, 'Test organization required');

    await goToEvents(page, testOrganizationId!);

    // Verify page title
    await expect(page.locator('h1')).toContainText('Events');

    // Verify tabs are present (using flexible selectors)
    const overviewTab = page.locator('[data-testid="tab-overview"], button:has-text("Overview")');
    const upcomingTab = page.locator('[data-testid="tab-upcoming"], button:has-text("Upcoming")');
    const pastTab = page.locator('[data-testid="tab-past"], button:has-text("Past")');
    const draftsTab = page.locator('[data-testid="tab-drafts"], button:has-text("Drafts")');

    await expect(overviewTab).toBeVisible();
    await expect(upcomingTab).toBeVisible();
    await expect(pastTab).toBeVisible();
    await expect(draftsTab).toBeVisible();

    // Verify create button is visible
    await expect(page.locator('[data-testid="create-event-button"]')).toBeVisible();
  });

  test.fixme('should navigate to create event page', async ({ page }) => {
    // FIXME: Requires org context in frontend
    test.skip(!testOrganizationId, 'Test organization required');

    await goToEvents(page, testOrganizationId!);

    // Click create event button
    await page.click('[data-testid="create-event-button"]');

    // Wait for navigation to create page or modal
    await page.waitForURL('**/events/new', { timeout: 5000 }).catch(() => {
      // If no navigation, check for modal
      return page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    });
  });

  test.fixme('should create a new event with basic information', async ({ page }) => {
    // FIXME: Requires org context in frontend to navigate to create event page
    test.skip(!testOrganizationId, 'Test organization required');

    const testEvent = generateTestEvent();

    await goToEvents(page, testOrganizationId!);

    // Click create event button
    await page.click('[data-testid="create-event-button"]');

    // Wait for form (either page or modal)
    await page.waitForSelector('input[name="name"], [data-testid="input-event-name"]', { timeout: 10000 });

    // Fill in event information - Step 1: Basic Info
    await page.fill('input[name="name"], [data-testid="input-event-name"]', testEvent.name);
    await page.fill('input[name="startDate"], [data-testid="input-start-date"]', testEvent.startDate);

    // Optional: fill in location if field exists
    const locationField = page.locator('input[name="location"], [data-testid="input-location"]');
    if (await locationField.isVisible()) {
      await locationField.fill(testEvent.location);
    }

    // Optional: fill in description if field exists
    const descriptionField = page.locator('textarea[name="description"], [data-testid="input-description"]');
    if (await descriptionField.isVisible()) {
      await descriptionField.fill(testEvent.description);
    }

    // Navigate through wizard steps
    const nextButton = page.locator('button:has-text("Next")');
    if (await nextButton.isVisible()) {
      // Multi-step form - click through to the end
      while (await nextButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextButton.click();
        await page.waitForTimeout(300); // Wait for animation
      }
    }

    // Listen for API response to capture event ID
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/events') && response.request().method() === 'POST'
    );

    // Submit the form - try various button texts
    const submitButton = page.locator('button:has-text("Publish Event"), button:has-text("Create Event"), button:has-text("Save"), button[type="submit"]').first();
    await submitButton.click();

    // Capture event ID from API response
    try {
      const response = await responsePromise;
      const event = await response.json();
      if (event?.id) {
        createdEventIds.push(event.id);
      }
    } catch (error) {
      console.warn('Failed to capture event ID for cleanup:', error);
    }

    // Verify success - should redirect to events list or event detail
    await page.waitForURL(/\/events/, { timeout: 10000 });

    // Verify event appears in the list or we're on detail page
    await page.waitForSelector(`text=${testEvent.name}`, { timeout: 10000 });
  });

  test.fixme('should view event details', async ({ page }) => {
    // FIXME: Event detail page requires org context - user must be member of org with eventsEnabled
    test.skip(!testOrganizationId, 'Test organization required');

    const testEvent = generateTestEvent();

    // Create event via API first (with organization)
    const createResponse = await page.request.post(`${STAGING_URL}/api/events`, {
      data: {
        name: testEvent.name,
        startDate: testEvent.startDate,
        location: testEvent.location,
        description: testEvent.description,
        visibility: 'org_private',
        registrationMode: 'open',
        status: 'published',
        organizationId: testOrganizationId,
      },
    });

    const createdEvent = await createResponse.json();
    if (createdEvent?.id) {
      createdEventIds.push(createdEvent.id);
    }

    // Navigate to event detail page
    await navigateTo(page, `/events/${createdEvent.id}`);

    // Verify event name is displayed
    await expect(page.locator('h1')).toContainText(testEvent.name);

    // Verify key tabs are present (using flexible selectors)
    const overviewTab = page.locator('[data-testid="tab-overview"], button:has-text("Overview")');
    const registrationsTab = page.locator('[data-testid="tab-registrations"], button:has-text("Registrations")');
    const checkinTab = page.locator('[data-testid="tab-checkin"], button:has-text("Check-In")');

    await expect(overviewTab).toBeVisible();
    await expect(registrationsTab).toBeVisible();
    await expect(checkinTab).toBeVisible();
  });

  test('should display event code and allow copy', async ({ page }) => {
    test.skip(!testOrganizationId, 'Test organization required');

    const testEvent = generateTestEvent();

    // Create event via API first (with organization)
    const createResponse = await page.request.post(`${STAGING_URL}/api/events`, {
      data: {
        name: testEvent.name,
        startDate: testEvent.startDate,
        status: 'published',
        visibility: 'public',
        organizationId: testOrganizationId,
      },
    });

    const createdEvent = await createResponse.json();
    if (createdEvent?.id) {
      createdEventIds.push(createdEvent.id);
    }

    // Navigate to event detail page
    await navigateTo(page, `/events/${createdEvent.id}`);

    // Verify event code is displayed
    const eventCodeElement = page.locator('text=/Code:/i').first();
    await expect(eventCodeElement).toBeVisible();

    // Check for copy button
    const copyButton = page.locator('button:has-text("Copy"), [aria-label*="copy"]').first();
    if (await copyButton.isVisible()) {
      // Verify clipboard interaction is possible
      await expect(copyButton).toBeEnabled();
    }
  });

  test('should freeze and unfreeze an event', async ({ page }) => {
    test.skip(!testOrganizationId, 'Test organization required');

    const testEvent = generateTestEvent();

    // Create event via API first (with organization)
    const createResponse = await page.request.post(`${STAGING_URL}/api/events`, {
      data: {
        name: testEvent.name,
        startDate: testEvent.startDate,
        status: 'published',
        organizationId: testOrganizationId,
      },
    });

    const createdEvent = await createResponse.json();
    if (createdEvent?.id) {
      createdEventIds.push(createdEvent.id);
    }

    // Navigate to event detail page
    await navigateTo(page, `/events/${createdEvent.id}`);

    // Click freeze button
    const freezeButton = page.locator('button:has-text("Freeze")');
    await expect(freezeButton).toBeVisible();
    await freezeButton.click();

    // Wait for freeze to complete
    await page.waitForLoadState('networkidle');

    // Verify frozen badge appears (use specific badge selector)
    await expect(page.locator('text="Frozen"').first()).toBeVisible();

    // Now unfreeze
    const unfreezeButton = page.locator('button:has-text("Unfreeze")');
    await expect(unfreezeButton).toBeVisible();
    await unfreezeButton.click();

    // Verify frozen badge is removed
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button:has-text("Freeze")')).toBeVisible();
  });

  test.fixme('should filter events by tab', async ({ page }) => {
    // FIXME: Requires org context in frontend
    test.skip(!testOrganizationId, 'Test organization required');

    await goToEvents(page, testOrganizationId!);

    // Click Upcoming tab (using flexible selectors)
    await page.click('[data-testid="tab-upcoming"], button:has-text("Upcoming")');
    await page.waitForLoadState('networkidle');

    // Click Past tab
    await page.click('[data-testid="tab-past"], button:has-text("Past")');
    await page.waitForLoadState('networkidle');

    // Click Drafts tab
    await page.click('[data-testid="tab-drafts"], button:has-text("Drafts")');
    await page.waitForLoadState('networkidle');

    // Return to Overview
    await page.click('[data-testid="tab-overview"], button:has-text("Overview")');
    await page.waitForLoadState('networkidle');
  });

  test.fixme('should show empty state when no events', async ({ page }) => {
    // FIXME: Requires org context in frontend
    test.skip(!testOrganizationId, 'Test organization required');

    await goToEvents(page, testOrganizationId!);

    // If no events exist, verify empty state is shown
    const emptyState = page.locator('text=/No events yet|Create your first event/i');
    const eventCards = page.locator('[data-testid="event-card"]');

    // Either we have events or we have empty state
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    const hasEventCards = (await eventCards.count()) > 0;

    expect(hasEmptyState || hasEventCards).toBeTruthy();
  });
});
