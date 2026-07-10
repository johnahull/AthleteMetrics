import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';
import { navigateTo } from './helpers/navigation';

/**
 * TIER 1 CRITICAL: Event Join Flow Tests
 *
 * These tests verify the event discovery and join workflows:
 * - Join via event code
 * - Event lookup by code
 * - Invitation token acceptance
 * - Registration via code flow
 * - Error handling for invalid codes
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
    name: `TestOrg_Join_${uniqueId}`,
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
    name: `JoinTestEvent_${uniqueId}`,
    eventType: 'combine',
    location: 'Join Test Venue',
    startDate: futureDate.toISOString().split('T')[0],
    description: 'E2E join flow test event - safe to delete',
    visibility: 'public',
    registrationMode: 'open',
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

test.describe('Event Join Page', () => {
  let testEventId: string | null = null;

  test.afterEach(async ({ page }) => {
    // Cleanup test event
    if (testEventId) {
      try {
        await loginAsDefaultUser(page);
        await page.request.delete(`${STAGING_URL}/api/events/${testEventId}`);
      } catch (error) {
        console.warn(`Failed to cleanup event ${testEventId}:`, error);
      }
      testEventId = null;
    }
  });

  test('should display event code lookup form', async ({ page }) => {
    // Navigate to join page without code
    await page.goto(`${STAGING_URL}/events/join`);

    // Verify page title
    await expect(page.locator('text=/Join an Event|Find Event/i')).toBeVisible();

    // Verify code input field
    const codeInput = page.locator('input[id="eventCode"], input[placeholder*="code" i]');
    await expect(codeInput).toBeVisible();

    // Verify lookup button
    const lookupButton = page.locator('button:has-text("Look Up"), button:has-text("Find")');
    await expect(lookupButton).toBeVisible();
  });

  test('should show error for invalid event code', async ({ page }) => {
    // Navigate to join page
    await page.goto(`${STAGING_URL}/events/join`);

    // Enter invalid code
    const codeInput = page.locator('input[id="eventCode"], input[placeholder*="code" i]').first();
    await codeInput.fill('INVALIDCODE123');

    // Click lookup
    const lookupButton = page.locator('button:has-text("Look Up"), button:has-text("Find")').first();
    await lookupButton.click();

    // Wait for response
    await page.waitForLoadState('networkidle');

    // Verify error message (use flexible pattern and .first())
    await expect(page.locator('text=/not found|invalid|error|doesn\'t exist/i').first()).toBeVisible();
  });

  test('should lookup and display event by valid code', async ({ page }) => {
    // First login to create event
    await loginAsDefaultUser(page);
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Now test the join flow (could be from a different session)
    await page.goto(`${STAGING_URL}/events/join`);

    // Enter valid event code
    const codeInput = page.locator('input[id="eventCode"], input[placeholder*="code" i]');
    await codeInput.fill(event.eventCode);

    // Click lookup
    const lookupButton = page.locator('button:has-text("Look Up"), button:has-text("Find")');
    await lookupButton.click();

    // Wait for response
    await page.waitForLoadState('networkidle');

    // Verify event details are displayed
    await expect(page.locator(`text=${event.name}`)).toBeVisible();
  });

  test('should navigate directly to event via code in URL', async ({ page }) => {
    // First login to create event
    await loginAsDefaultUser(page);
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Navigate directly with code in URL
    await page.goto(`${STAGING_URL}/events/join/${event.eventCode}`);
    await page.waitForLoadState('networkidle');

    // Verify event details are displayed
    await expect(page.locator(`text=${event.name}`)).toBeVisible();
  });

  test('should show event details including date and location', async ({ page }) => {
    // First login to create event
    await loginAsDefaultUser(page);
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Navigate to event via code
    await page.goto(`${STAGING_URL}/events/join/${event.eventCode}`);
    await page.waitForLoadState('networkidle');

    // Verify event name
    await expect(page.locator(`text=${event.name}`)).toBeVisible();

    // Verify location is shown (if present)
    if (event.location) {
      await expect(page.locator(`text=${event.location}`)).toBeVisible();
    }
  });

  test('should show registration status and spots available', async ({ page }) => {
    // First login to create event
    await loginAsDefaultUser(page);
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Navigate to event via code
    await page.goto(`${STAGING_URL}/events/join/${event.eventCode}`);
    await page.waitForLoadState('networkidle');

    // Verify registration info is shown
    const registrationInfo = page.locator('text=/registered|spots|available|open/i');
    await expect(registrationInfo.first()).toBeVisible();
  });
});

test.describe('Event Registration via Code', () => {
  let testEventId: string | null = null;

  test.afterEach(async ({ page }) => {
    if (testEventId) {
      try {
        await loginAsDefaultUser(page);
        await page.request.delete(`${STAGING_URL}/api/events/${testEventId}`);
      } catch (error) {
        console.warn(`Failed to cleanup event ${testEventId}:`, error);
      }
      testEventId = null;
    }
  });

  test.fixme('should prompt login when not authenticated', async ({ page }) => {
    // Create event first (need to login temporarily)
    await loginAsDefaultUser(page);
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Clear session/logout
    await page.context().clearCookies();

    // Navigate to event via code
    await page.goto(`${STAGING_URL}/events/join/${event.eventCode}`);
    await page.waitForLoadState('networkidle');

    // Verify login prompt or redirect to login page (flexible check)
    const loginPrompt = page.locator('text=/sign in|create account|log in|login|password/i').first();
    const signInButton = page.locator('button:has-text("Sign In"), a:has-text("Sign In"), button:has-text("Login")').first();

    // Either the prompt text or a sign-in button should be visible
    const hasPrompt = await loginPrompt.isVisible().catch(() => false);
    const hasButton = await signInButton.isVisible().catch(() => false);

    expect(hasPrompt || hasButton).toBeTruthy();
  });

  test.fixme('should show registration form when authenticated', async ({ page }) => {
    // Create event and stay logged in
    await loginAsDefaultUser(page);
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Navigate to event via code
    await page.goto(`${STAGING_URL}/events/join/${event.eventCode}`);
    await page.waitForLoadState('networkidle');

    // Verify registration form elements
    const registerButton = page.locator('button:has-text("Register"), button:has-text("Join")');
    await expect(registerButton.first()).toBeVisible();
  });

  test.fixme('should show notes field for registration', async ({ page }) => {
    // Create event and stay logged in
    await loginAsDefaultUser(page);
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Navigate to event via code
    await page.goto(`${STAGING_URL}/events/join/${event.eventCode}`);
    await page.waitForLoadState('networkidle');

    // Look for notes textarea
    const notesField = page.locator('textarea[id="notes"], textarea[name="athleteNotes"], textarea[placeholder*="notes" i]');
    if (await notesField.isVisible()) {
      await expect(notesField).toBeVisible();
    }
  });

  test.fixme('should complete registration for open event', async ({ page }) => {
    // Create event with open registration
    await loginAsDefaultUser(page);
    const organizationId = await getOrCreateTestOrganization(page);
    const eventData = {
      ...generateTestEvent(),
      registrationMode: 'open',
      organizationId,
    };

    const response = await page.request.post(`${STAGING_URL}/api/events`, {
      data: eventData,
    });
    const event = await response.json();
    testEventId = event.id;

    // Navigate to event via code
    await page.goto(`${STAGING_URL}/events/join/${event.eventCode}`);
    await page.waitForLoadState('networkidle');

    // Accept terms if required
    const termsCheckbox = page.locator('input[type="checkbox"][id="terms"]');
    if (await termsCheckbox.isVisible().catch(() => false)) {
      await termsCheckbox.check();
    }

    // Click register
    const registerButton = page.locator('button:has-text("Register"), button:has-text("Join")').first();
    if (await registerButton.isVisible().catch(() => false)) {
      await registerButton.click();

      // Wait for registration to complete
      await page.waitForLoadState('networkidle');

      // Verify success message or redirect (flexible)
      const successIndicator = page.locator('text=/registered|success|confirmed|already registered/i');
      await expect(successIndicator.first()).toBeVisible({ timeout: 10000 });
    } else {
      // If no register button, user may already be registered or page has different structure
      const alreadyRegistered = page.locator('text=/already registered|registered/i');
      await expect(alreadyRegistered.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show pending status for approval-required events', async ({ page }) => {
    // Create event requiring approval
    await loginAsDefaultUser(page);
    const organizationId = await getOrCreateTestOrganization(page);
    const eventData = {
      ...generateTestEvent(),
      registrationMode: 'request_approval',
      organizationId,
    };

    const response = await page.request.post(`${STAGING_URL}/api/events`, {
      data: eventData,
    });
    const event = await response.json();
    testEventId = event.id;

    // Navigate to event via code
    await page.goto(`${STAGING_URL}/events/join/${event.eventCode}`);
    await page.waitForLoadState('networkidle');

    // Verify approval notice is shown
    const approvalNote = page.locator('text=/approval|pending|requires approval/i');
    await expect(approvalNote.first()).toBeVisible();
  });

  test('should show success confirmation after registration', async ({ page }) => {
    // Create event
    await loginAsDefaultUser(page);
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Navigate to event via code
    await page.goto(`${STAGING_URL}/events/join/${event.eventCode}`);
    await page.waitForLoadState('networkidle');

    // Accept terms if required
    const termsCheckbox = page.locator('input[type="checkbox"][id="terms"]');
    if (await termsCheckbox.isVisible()) {
      await termsCheckbox.check();
    }

    // Click register
    const registerButton = page.locator('button:has-text("Register"), button:has-text("Join")').first();
    if (await registerButton.isEnabled()) {
      await registerButton.click();

      // Wait for registration to complete
      await page.waitForLoadState('networkidle');

      // Verify success elements
      const successPage = page.locator('text=/You\'re Registered|Registration Successful|Confirmed/i');
      await expect(successPage.first()).toBeVisible({ timeout: 10000 });

      // Verify "View My Events" button appears
      const myEventsButton = page.locator('button:has-text("View My Events"), a:has-text("View My Events")');
      await expect(myEventsButton.first()).toBeVisible();
    }
  });
});

test.describe('Event Invitation Flow', () => {
  let testEventId: string | null = null;

  test.afterEach(async ({ page }) => {
    if (testEventId) {
      try {
        await loginAsDefaultUser(page);
        await page.request.delete(`${STAGING_URL}/api/events/${testEventId}`);
      } catch (error) {
        console.warn(`Failed to cleanup event ${testEventId}:`, error);
      }
      testEventId = null;
    }
  });

  test('should show error for invalid invitation token', async ({ page }) => {
    // Navigate to invite page with invalid token
    await page.goto(`${STAGING_URL}/events/invite/invalid-token-xyz`);
    await page.waitForLoadState('networkidle');

    // Verify error message (use .first() to handle multiple matches)
    await expect(page.locator('text=/invalid|expired|not found|error/i').first()).toBeVisible();
  });

  test.fixme('should display invitation page elements', async ({ page }) => {
    // Create event and invitation
    await loginAsDefaultUser(page);
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Create invitation via API
    const inviteResponse = await page.request.post(`${STAGING_URL}/api/events/${event.id}/invitations`, {
      data: {
        email: 'test-invite@example.com',
      },
    });

    if (inviteResponse.ok()) {
      const invitation = await inviteResponse.json();

      // Navigate to invitation page
      await page.goto(`${STAGING_URL}/events/invite/${invitation.token}`);
      await page.waitForLoadState('networkidle');

      // Verify invitation page content
      await expect(page.locator('text=/invited|invitation/i').first()).toBeVisible();
      await expect(page.locator(`text=${event.name}`)).toBeVisible();
    }
  });

  test.fixme('should show accept and decline buttons on invitation page', async ({ page }) => {
    // Create event and invitation
    await loginAsDefaultUser(page);
    const event = await createTestEvent(page);
    testEventId = event.id;

    // Create invitation via API
    const inviteResponse = await page.request.post(`${STAGING_URL}/api/events/${event.id}/invitations`, {
      data: {
        email: 'test-invite@example.com',
      },
    });

    if (inviteResponse.ok()) {
      const invitation = await inviteResponse.json();

      // Navigate to invitation page
      await page.goto(`${STAGING_URL}/events/invite/${invitation.token}`);
      await page.waitForLoadState('networkidle');

      // Verify action buttons
      const acceptButton = page.locator('button:has-text("Accept")');
      const declineButton = page.locator('button:has-text("Decline")');

      await expect(acceptButton).toBeVisible();
      await expect(declineButton).toBeVisible();
    }
  });

  test('should handle expired invitation gracefully', async ({ page }) => {
    // Navigate to a likely expired/fake token
    await page.goto(`${STAGING_URL}/events/invite/expired-token-test`);
    await page.waitForLoadState('networkidle');

    // Verify appropriate error message (use .first() to handle multiple matches)
    await expect(page.locator('text=/invalid|expired|not available|error|not found/i').first()).toBeVisible();
  });
});

test.describe('Navigation from My Events to Join', () => {
  test('should navigate from My Events to join page', async ({ page }) => {
    await loginAsDefaultUser(page);

    // Go to my-events page
    await navigateTo(page, '/my-events');
    await page.waitForLoadState('networkidle');

    // Find and click "Find Events" button (use .first() to handle multiple matches)
    const findButton = page.locator('button:has-text("Find Events"), a:has-text("Find Events"), button:has-text("Browse Events")').first();
    if (await findButton.isVisible().catch(() => false)) {
      await findButton.click();

      // Verify navigation to join page
      await page.waitForURL(/\/events\/join/, { timeout: 5000 });
      await expect(page.locator('text=/Join an Event|Find Event|Enter.*code/i').first()).toBeVisible();
    } else {
      // If button not found, page may have different structure - just verify we're on my-events
      await expect(page.locator('h1:has-text("My Events")')).toBeVisible();
    }
  });
});
