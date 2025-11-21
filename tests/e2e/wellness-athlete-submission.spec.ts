import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * WELLNESS QUESTIONNAIRE: Athlete Submission Interface E2E Tests
 *
 * Tests verify the complete athlete workflow for wellness questionnaires:
 * - Access via magic link (no authentication required)
 * - Access via authenticated athlete account
 * - Access via team link
 * - Access via QR code
 * - Complete questionnaire with all question types (scale, text, boolean, body map)
 * - Form validation and required fields
 * - Auto-save to local storage
 * - Mobile responsive design
 * - Submission confirmation
 * - View submission history
 * - Handle expired tokens
 *
 * Tests follow TDD methodology: written first (RED), then implementation (GREEN).
 */

const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to create a test request with magic link for athlete submission
async function createTestRequest(page: any, organizationId: string, templateId: string) {
  const response = await page.request.post(
    `${BASE_URL}/api/organizations/${organizationId}/wellness/requests`,
    {
      data: {
        templateId,
        distributionMethod: 'magic_link',
        targetAthleteIds: [], // Empty for testing - will use magic link
        requiresAuth: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to create test request: ${response.status()}`);
  }

  return await response.json();
}

// Helper to create a test template
async function createTestTemplate(page: any, organizationId: string) {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  const response = await page.request.post(
    `${BASE_URL}/api/organizations/${organizationId}/wellness/templates`,
    {
      data: {
        name: `Athlete Test Template ${uniqueId}`,
        description: 'Test template for athlete submission',
        config: {
          questions: [
            {
              id: `q1_${uniqueId}`,
              type: 'scale',
              label: 'How are you feeling today?',
              scaleMin: 1,
              scaleMax: 10,
              minLabel: 'Poor',
              maxLabel: 'Excellent',
              required: true,
            },
            {
              id: `q2_${uniqueId}`,
              type: 'text',
              label: 'Any concerns or notes?',
              placeholder: 'Enter your notes...',
              maxLength: 500,
              required: false,
            },
            {
              id: `q3_${uniqueId}`,
              type: 'boolean',
              label: 'Did you sleep well last night?',
              required: true,
            },
            {
              id: `q4_${uniqueId}`,
              type: 'body_map',
              label: 'Mark any areas of pain or discomfort',
              required: false,
            },
          ],
        },
        isActive: true,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to create test template: ${response.status()}`);
  }

  return await response.json();
}

test.describe('Wellness Athlete Submission Interface Tests', () => {
  let testOrgId: string;
  let testOrgName: string;
  let testTemplate: any;
  let testRequest: any;
  let magicLinkUrl: string;

  test.beforeAll(async ({ browser }) => {
    // Get organization ID from config
    const fs = await import('fs');
    const path = await import('path');
    const configPath = path.join(process.cwd(), 'tests/e2e/.local-e2e-config.json');

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      testOrgId = config.organizationId;
      testOrgName = config.organizationName;
    } else {
      throw new Error('Local E2E config not found. Run: node setup-local-e2e.mjs');
    }

    // Create test template and request once for all tests
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsDefaultUser(page);

    testTemplate = await createTestTemplate(page, testOrgId);
    testRequest = await createTestRequest(page, testOrgId, testTemplate.id);
    magicLinkUrl = `${BASE_URL}/wellness/submit/${testRequest.publicToken}`;

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    // Cleanup test data
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsDefaultUser(page);

    try {
      // Delete test request
      await page.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${testRequest.id}`
      );

      // Delete test template
      await page.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/templates/${testTemplate.id}`
      );
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }

    await context.close();
  });

  test.describe('Magic Link Access (No Authentication)', () => {
    test('should access wellness questionnaire via magic link without login', async ({ page }) => {
      // Navigate to magic link URL (no login required)
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Should see the questionnaire form
      await expect(page.locator('h1')).toContainText('Wellness Check-In');

      // Should see template name
      await expect(page.locator('text=' + testTemplate.name)).toBeVisible();

      // Should see all questions
      await expect(page.locator('text=How are you feeling today?')).toBeVisible();
      await expect(page.locator('text=Any concerns or notes?')).toBeVisible();
      await expect(page.locator('text=Did you sleep well last night?')).toBeVisible();
      await expect(page.locator('text=Mark any areas of pain or discomfort')).toBeVisible();
    });

    test('should display progress indicator showing completion status', async ({ page }) => {
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Progress indicator should show 0% initially
      const progressText = page.locator('[data-testid="progress-indicator"]');
      await expect(progressText).toContainText('0 of 4');
    });

    test('should reject expired magic link token', async ({ page, browser }) => {
      // Create an expired request
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      const expiredTemplate = await createTestTemplate(adminPage, testOrgId);
      const expiredResponse = await adminPage.request.post(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests`,
        {
          data: {
            templateId: expiredTemplate.id,
            distributionMethod: 'magic_link',
            targetAthleteIds: [],
            requiresAuth: false,
            expiresAt: new Date(Date.now() - 1000).toISOString(), // Already expired
          },
        }
      );

      const expiredRequest = await expiredResponse.json();
      const expiredUrl = `${BASE_URL}/wellness/submit/${expiredRequest.publicToken}`;

      await context.close();

      // Try to access expired link
      await page.goto(expiredUrl);
      await page.waitForLoadState('networkidle');

      // Should see error message
      await expect(page.locator('text=This wellness questionnaire link has expired')).toBeVisible();
      await expect(page.locator('text=Please contact your coach for a new link')).toBeVisible();

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/templates/${expiredTemplate.id}`
      );
      await cleanupContext.close();
    });
  });

  test.describe('Question Input Components', () => {
    test('should allow scale input (1-10 slider)', async ({ page }) => {
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Find the scale question
      const scaleQuestion = page.locator('[data-testid="question-scale"]').first();

      // Should see min and max labels
      await expect(scaleQuestion.locator('text=Poor')).toBeVisible();
      await expect(scaleQuestion.locator('text=Excellent')).toBeVisible();

      // Click on slider value (e.g., 7)
      const slider = scaleQuestion.locator('input[type="range"]');
      await slider.fill('7');

      // Value should be displayed
      await expect(scaleQuestion.locator('text=7')).toBeVisible();
    });

    test('should allow text input with character limit', async ({ page }) => {
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Find the text question
      const textQuestion = page.locator('[data-testid="question-text"]').first();
      const textarea = textQuestion.locator('textarea');

      // Type some text
      await textarea.fill('I felt a bit tired today after practice');

      // Should show character count
      await expect(textQuestion.locator('text=/\\d+ \\/ 500/')).toBeVisible();
    });

    test('should allow boolean (Yes/No) input', async ({ page }) => {
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Find the boolean question
      const booleanQuestion = page.locator('[data-testid="question-boolean"]').first();

      // Should see Yes and No buttons
      await expect(booleanQuestion.locator('button:has-text("Yes")')).toBeVisible();
      await expect(booleanQuestion.locator('button:has-text("No")')).toBeVisible();

      // Click Yes
      await booleanQuestion.locator('button:has-text("Yes")').click();

      // Yes button should be selected (different style)
      await expect(booleanQuestion.locator('button:has-text("Yes")')).toHaveClass(/selected|active|primary/);
    });

    test('should allow body map interaction', async ({ page }) => {
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Find the body map question
      const bodyMapQuestion = page.locator('[data-testid="question-body-map"]').first();

      // Should see body diagram
      const bodyDiagram = bodyMapQuestion.locator('[data-testid="body-diagram"]');
      await expect(bodyDiagram).toBeVisible();

      // Click on a body part (e.g., left knee)
      const leftKnee = bodyDiagram.locator('[data-body-part="left-knee"]');
      await leftKnee.click();

      // Body part should be marked/highlighted
      await expect(leftKnee).toHaveClass(/selected|marked|active/);

      // Should show selected parts list
      await expect(bodyMapQuestion.locator('text=Left Knee')).toBeVisible();
    });
  });

  test.describe('Form Validation', () => {
    test('should show validation errors for required fields', async ({ page }) => {
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Try to submit without filling required fields
      const submitButton = page.locator('button:has-text("Submit")');
      await submitButton.click();

      // Should see validation errors for required questions
      await expect(page.locator('text=This question is required')).toBeVisible();

      // Should not have navigated away
      await expect(page.locator('h1')).toContainText('Wellness Check-In');
    });

    test('should allow submission when all required fields are filled', async ({ page }) => {
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Fill required scale question
      const scaleSlider = page.locator('[data-testid="question-scale"]').first().locator('input[type="range"]');
      await scaleSlider.fill('7');

      // Fill required boolean question
      const yesButton = page.locator('[data-testid="question-boolean"]').first().locator('button:has-text("Yes")');
      await yesButton.click();

      // Submit form
      const submitButton = page.locator('button:has-text("Submit")');
      await submitButton.click();

      // Should see success confirmation
      await expect(page.locator('text=Thank you for completing the wellness questionnaire')).toBeVisible();
    });
  });

  test.describe('Auto-Save Functionality', () => {
    test('should auto-save form data to local storage', async ({ page }) => {
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Fill out a question
      const scaleSlider = page.locator('[data-testid="question-scale"]').first().locator('input[type="range"]');
      await scaleSlider.fill('8');

      // Wait for auto-save (debounced)
      await page.waitForTimeout(1500);

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Data should be restored from local storage
      const restoredValue = await scaleSlider.inputValue();
      expect(restoredValue).toBe('8');

      // Should see a "restoring previous answers" message
      await expect(page.locator('text=/Previous answers restored|Draft restored/')).toBeVisible();
    });

    test('should clear auto-save after successful submission', async ({ page }) => {
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Fill and submit
      await page.locator('[data-testid="question-scale"]').first().locator('input[type="range"]').fill('7');
      await page.locator('[data-testid="question-boolean"]').first().locator('button:has-text("Yes")').click();
      await page.locator('button:has-text("Submit")').click();

      // Wait for success
      await expect(page.locator('text=Thank you')).toBeVisible();

      // Go back (if there's a link)
      await page.goBack();

      // Form should be empty (no restoration)
      const scaleValue = await page.locator('[data-testid="question-scale"]').first().locator('input[type="range"]').inputValue();
      expect(scaleValue).toBe('1'); // Default value
    });
  });

  test.describe('Mobile Responsive Design', () => {
    test('should display correctly on mobile viewport (375x667)', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Should see mobile-optimized layout
      await expect(page.locator('h1')).toBeVisible();

      // Scale slider should be touch-friendly
      const scaleQuestion = page.locator('[data-testid="question-scale"]').first();
      const slider = scaleQuestion.locator('input[type="range"]');

      // Slider should have adequate touch target size (min 44x44px)
      const boundingBox = await slider.boundingBox();
      expect(boundingBox?.height).toBeGreaterThanOrEqual(44);

      // Buttons should be touch-friendly
      const submitButton = page.locator('button:has-text("Submit")');
      const buttonBox = await submitButton.boundingBox();
      expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
    });

    test('should support touch interactions for scale input', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      const slider = page.locator('[data-testid="question-scale"]').first().locator('input[type="range"]');

      // Simulate touch drag on slider
      await slider.tap();
      await slider.fill('6');

      // Value should update
      await expect(page.locator('text=6')).toBeVisible();
    });
  });

  test.describe('Submission Confirmation', () => {
    test('should show success message after submission', async ({ page }) => {
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Fill required fields
      await page.locator('[data-testid="question-scale"]').first().locator('input[type="range"]').fill('7');
      await page.locator('[data-testid="question-boolean"]').first().locator('button:has-text("Yes")').click();

      // Submit
      await page.locator('button:has-text("Submit")').click();

      // Success message
      await expect(page.locator('text=Thank you for completing the wellness questionnaire')).toBeVisible();
      await expect(page.locator('text=Your responses have been recorded')).toBeVisible();

      // Should show submission timestamp
      await expect(page.locator('text=/Submitted at|Submitted on/')).toBeVisible();
    });

    test('should prevent duplicate submissions for the same request', async ({ page }) => {
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // First submission
      await page.locator('[data-testid="question-scale"]').first().locator('input[type="range"]').fill('7');
      await page.locator('[data-testid="question-boolean"]').first().locator('button:has-text("Yes")').click();
      await page.locator('button:has-text("Submit")').click();

      // Wait for success
      await expect(page.locator('text=Thank you')).toBeVisible();

      // Try to submit again (navigate back or reload)
      await page.goto(magicLinkUrl);
      await page.waitForLoadState('networkidle');

      // Should show already submitted message
      await expect(page.locator('text=You have already submitted this questionnaire')).toBeVisible();
      await expect(page.locator('button:has-text("Submit")')).toBeDisabled();
    });
  });

  test.describe('Authenticated Athlete Access', () => {
    test('should allow authenticated athletes to submit via account', async ({ page }) => {
      // Login as athlete (assumes athlete account exists)
      await loginAsDefaultUser(page); // TODO: Use actual athlete login

      // Navigate to wellness page (athlete view)
      await page.goto('/wellness/my-requests');
      await page.waitForLoadState('networkidle');

      // Should see pending wellness requests
      await expect(page.locator('text=Pending Requests')).toBeVisible();

      // Click on a request to complete it
      const requestCard = page.locator('[data-testid="wellness-request-card"]').first();
      await requestCard.click();

      // Should navigate to submission form
      await expect(page.locator('h1')).toContainText('Wellness Check-In');

      // Should show athlete's name (pre-filled from auth)
      await expect(page.locator('text=/Welcome|Hello/')).toBeVisible();
    });
  });

  test.describe('Submission History', () => {
    test('should display submission history for authenticated athletes', async ({ page }) => {
      await loginAsDefaultUser(page); // TODO: Use actual athlete login

      // Navigate to wellness history page
      await page.goto('/wellness/history');
      await page.waitForLoadState('networkidle');

      // Should see list of previous submissions
      await expect(page.locator('h1')).toContainText('My Wellness History');

      // Should see submission cards with dates
      await expect(page.locator('[data-testid="submission-card"]').first()).toBeVisible();

      // Each card should show date, template name, and summary
      const firstCard = page.locator('[data-testid="submission-card"]').first();
      await expect(firstCard.locator('text=/\\d{1,2}\\/\\d{1,2}\\/\\d{4}/')).toBeVisible(); // Date
    });

    test('should allow viewing details of past submissions', async ({ page }) => {
      await loginAsDefaultUser(page); // TODO: Use actual athlete login

      await page.goto('/wellness/history');
      await page.waitForLoadState('networkidle');

      // Click on a submission card
      const firstCard = page.locator('[data-testid="submission-card"]').first();
      await firstCard.click();

      // Should open detail modal or navigate to detail page
      await expect(page.locator('text=Submission Details')).toBeVisible();

      // Should show all question responses
      await expect(page.locator('[data-testid="response-detail"]')).toBeVisible();
    });
  });

  test.describe('Team Link Access', () => {
    test('should allow access via team link without authentication', async ({ page, browser }) => {
      // Create a team link request
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      const teamLinkRequest = await adminPage.request.post(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests`,
        {
          data: {
            templateId: testTemplate.id,
            distributionMethod: 'team_link',
            targetTeamIds: [], // Empty for testing
            requiresAuth: false,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        }
      );

      const teamRequest = await teamLinkRequest.json();
      const teamLinkUrl = `${BASE_URL}/wellness/submit/${teamRequest.publicToken}`;

      await context.close();

      // Access team link (no login required)
      await page.goto(teamLinkUrl);
      await page.waitForLoadState('networkidle');

      // Should see questionnaire
      await expect(page.locator('h1')).toContainText('Wellness Check-In');

      // Should prompt for name if not authenticated
      await expect(page.locator('text=What\'s your name?')).toBeVisible();

      // Fill name and proceed
      await page.locator('input[name="name"]').fill('Test Athlete');
      await page.locator('button:has-text("Continue")').click();

      // Should see questionnaire form
      await expect(page.locator('text=How are you feeling today?')).toBeVisible();

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${teamRequest.id}`
      );
      await cleanupContext.close();
    });
  });
});
