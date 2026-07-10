import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * WELLNESS QUESTIONNAIRE: Athlete Dropdown Selector E2E Tests
 *
 * Feature: Replace text input with dropdown for selecting targeted athletes
 * - Displays dropdown of targeted athletes (from targetAthleteIds and targetTeamIds)
 * - Format: "Athlete Name (Team Name)"
 * - Manual entry fallback: "Not listed? Enter manually"
 * - Multiple submissions allowed (same athlete can submit multiple times)
 * - Security: Verify athlete is authorized for this request
 *
 * Tests follow TDD methodology: written first (RED), then implementation (GREEN).
 */

const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to create a test organization
async function createTestOrganization(page: any) {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  const response = await page.request.post(`${BASE_URL}/api/organizations`, {
    data: {
      name: `Test Org Wellness Dropdown ${uniqueId}`,
      type: 'college',
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create test organization: ${response.status()}`);
  }

  return await response.json();
}

// Helper to create a test team
async function createTestTeam(page: any, organizationId: string) {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  const response = await page.request.post(`${BASE_URL}/api/organizations/${organizationId}/teams`, {
    data: {
      name: `Test Team ${uniqueId}`,
      sport: 'Basketball',
      level: 'varsity',
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create test team: ${response.status()}`);
  }

  return await response.json();
}

// Helper to create a test athlete
async function createTestAthlete(page: any, organizationId: string, teamId: string, name: { first: string; last: string }) {
  const uniqueId = Date.now().toString(36).substring(0, 6);
  const response = await page.request.post(`${BASE_URL}/api/organizations/${organizationId}/athletes`, {
    data: {
      firstName: name.first,
      lastName: name.last,
      email: `${name.first.toLowerCase()}.${name.last.toLowerCase()}.${uniqueId}@test.com`,
      teamId,
      role: 'athlete',
    },
  });

  if (!response.ok()) {
    const error = await response.text();
    throw new Error(`Failed to create test athlete: ${response.status()} - ${error}`);
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
        name: `Dropdown Test Template ${uniqueId}`,
        description: 'Test template for athlete dropdown',
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

// Helper to create a wellness request
async function createWellnessRequest(page: any, organizationId: string, data: {
  templateId: string;
  targetAthleteIds?: string[];
  targetTeamIds?: string[];
}) {
  const response = await page.request.post(
    `${BASE_URL}/api/organizations/${organizationId}/wellness/requests`,
    {
      data: {
        templateId: data.templateId,
        distributionMethod: 'magic_link',
        targetAthleteIds: data.targetAthleteIds || [],
        targetTeamIds: data.targetTeamIds || [],
        requiresAuth: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to create wellness request: ${response.status()}`);
  }

  return await response.json();
}

// Helper to fill wellness questions
async function fillWellnessQuestions(page: any) {
  // Fill required scale question
  const scaleSlider = page.locator('[data-testid="question-scale"]').first().locator('input[type="range"]');
  await scaleSlider.fill('7');
}

test.describe('Wellness Athlete Dropdown Selector', () => {
  let testOrgId: string;
  let team1: any;
  let team2: any;
  let athlete1: any;
  let athlete2: any;
  let athlete3: any;
  let testTemplate: any;

  test.beforeAll(async ({ browser }) => {
    // Setup: Create org, teams, athletes, template
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsDefaultUser(page);

    // Create organization
    const testOrg = await createTestOrganization(page);
    testOrgId = testOrg.id;

    // Create 2 teams
    team1 = await createTestTeam(page, testOrgId);
    team2 = await createTestTeam(page, testOrgId);

    // Create 3 athletes (2 in team1, 1 in team2)
    athlete1 = await createTestAthlete(page, testOrgId, team1.id, { first: 'Alice', last: 'Anderson' });
    athlete2 = await createTestAthlete(page, testOrgId, team1.id, { first: 'Bob', last: 'Brown' });
    athlete3 = await createTestAthlete(page, testOrgId, team2.id, { first: 'Charlie', last: 'Chen' });

    // Create wellness template
    testTemplate = await createTestTemplate(page, testOrgId);

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    // Cleanup - skip if setup didn't complete (variables are undefined)
    if (!testOrgId) {
      console.log('Skipping cleanup - test setup did not complete');
      return;
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsDefaultUser(page);

    try {
      // Delete template (only if it was created)
      if (testTemplate?.id) {
        await page.request.delete(
          `${BASE_URL}/api/organizations/${testOrgId}/wellness/templates/${testTemplate.id}`
        );
      }

      // Delete athletes (only if they were created)
      if (athlete1?.id) {
        await page.request.delete(`${BASE_URL}/api/organizations/${testOrgId}/athletes/${athlete1.id}`);
      }
      if (athlete2?.id) {
        await page.request.delete(`${BASE_URL}/api/organizations/${testOrgId}/athletes/${athlete2.id}`);
      }
      if (athlete3?.id) {
        await page.request.delete(`${BASE_URL}/api/organizations/${testOrgId}/athletes/${athlete3.id}`);
      }

      // Delete teams (only if they were created)
      if (team1?.id) {
        await page.request.delete(`${BASE_URL}/api/organizations/${testOrgId}/teams/${team1.id}`);
      }
      if (team2?.id) {
        await page.request.delete(`${BASE_URL}/api/organizations/${testOrgId}/teams/${team2.id}`);
      }

      // Delete organization
      await page.request.delete(`${BASE_URL}/api/organizations/${testOrgId}`);
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }

    await context.close();
  });

  test.describe('Athlete Dropdown Display', () => {
    test('should display dropdown with targeted athletes from team targeting', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request targeting team1
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetTeamIds: [team1.id],
      });

      await context.close();

      const magicLink = `${BASE_URL}/wellness/submit/${request.publicToken}`;
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');

      // Should see athlete selector dropdown
      const selector = page.locator('[data-testid="athlete-selector"]');
      await expect(selector).toBeVisible();

      // Click dropdown to see options
      await selector.click();

      // Should see both team1 athletes with team name
      await expect(page.locator(`text=Alice Anderson (${team1.name})`)).toBeVisible();
      await expect(page.locator(`text=Bob Brown (${team1.name})`)).toBeVisible();

      // Should NOT see team2 athlete (not targeted)
      await expect(page.locator(`text=Charlie Chen`)).not.toBeVisible();

      // Should see manual entry option
      await expect(page.locator('text=Not listed? Enter manually')).toBeVisible();

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await cleanupContext.close();
    });

    test('should display dropdown with directly targeted athletes', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request targeting specific athletes
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetAthleteIds: [athlete1.id, athlete3.id],
      });

      await context.close();

      const magicLink = `${BASE_URL}/wellness/submit/${request.publicToken}`;
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');

      // Should see athlete selector dropdown
      const selector = page.locator('[data-testid="athlete-selector"]');
      await expect(selector).toBeVisible();

      // Click dropdown
      await selector.click();

      // Should see targeted athletes
      await expect(page.locator(`text=Alice Anderson (${team1.name})`)).toBeVisible();
      await expect(page.locator(`text=Charlie Chen (${team2.name})`)).toBeVisible();

      // Should NOT see non-targeted athlete
      await expect(page.locator(`text=Bob Brown`)).not.toBeVisible();

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await cleanupContext.close();
    });

    test('should display dropdown with combined targeting (athletes + teams)', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request targeting team2 + athlete1 directly
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetAthleteIds: [athlete1.id],
        targetTeamIds: [team2.id],
      });

      await context.close();

      const magicLink = `${BASE_URL}/wellness/submit/${request.publicToken}`;
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');

      // Click dropdown
      const selector = page.locator('[data-testid="athlete-selector"]');
      await selector.click();

      // Should see athlete1 (directly targeted)
      await expect(page.locator(`text=Alice Anderson (${team1.name})`)).toBeVisible();

      // Should see athlete3 (team2 member)
      await expect(page.locator(`text=Charlie Chen (${team2.name})`)).toBeVisible();

      // Should NOT see athlete2 (not in target)
      await expect(page.locator(`text=Bob Brown`)).not.toBeVisible();

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await cleanupContext.close();
    });

    test('should handle athletes without team (show name only)', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create athlete without team
      const uniqueId = Date.now().toString(36).substring(0, 6);
      const noTeamResponse = await adminPage.request.post(
        `${BASE_URL}/api/organizations/${testOrgId}/athletes`,
        {
          data: {
            firstName: 'Dana',
            lastName: 'Davis',
            email: `dana.davis.${uniqueId}@test.com`,
            role: 'athlete',
          },
        }
      );
      const noTeamAthlete = await noTeamResponse.json();

      // Create wellness request targeting this athlete
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetAthleteIds: [noTeamAthlete.id],
      });

      await context.close();

      const magicLink = `${BASE_URL}/wellness/submit/${request.publicToken}`;
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');

      // Click dropdown
      const selector = page.locator('[data-testid="athlete-selector"]');
      await selector.click();

      // Should see athlete name without team (no parentheses)
      await expect(page.locator('text=Dana Davis').first()).toBeVisible();

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/athletes/${noTeamAthlete.id}`
      );
      await cleanupContext.close();
    });
  });

  test.describe('Submission with Selected Athlete', () => {
    test('should submit with selected athlete ID and store as real user', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetTeamIds: [team1.id],
      });

      await context.close();

      const magicLink = `${BASE_URL}/wellness/submit/${request.publicToken}`;
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');

      // Select athlete from dropdown
      await page.locator('[data-testid="athlete-selector"]').click();
      await page.locator(`text=Alice Anderson (${team1.name})`).click();

      // Fill questionnaire
      await fillWellnessQuestions(page);

      // Submit
      await page.locator('button:has-text("Submit")').click();
      await expect(page.locator('text=Your wellness response has been submitted')).toBeVisible();

      // Verify submission stored with actual user ID (not 'magic-link-submission')
      const verifyContext = await browser.newContext();
      const verifyPage = await verifyContext.newPage();
      await loginAsDefaultUser(verifyPage);

      const responsesResp = await verifyPage.request.get(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/responses?startDate=2024-01-01&endDate=2099-12-31`
      );
      const responsesData = await responsesResp.json();

      const submission = responsesData.find((r: any) => r.requestId === request.id);
      expect(submission).toBeDefined();
      expect(submission.userId).toBe(athlete1.id);
      expect(submission.userFullName).toContain('Alice Anderson');
      expect(submission.teamId).toBe(team1.id);
      expect(submission.teamNameSnapshot).toBe(team1.name);

      // Cleanup
      await verifyPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await verifyContext.close();
    });

    test('should allow multiple submissions from same athlete', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetTeamIds: [team1.id],
      });

      await context.close();

      const magicLink = `${BASE_URL}/wellness/submit/${request.publicToken}`;

      // First submission
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');
      await page.locator('[data-testid="athlete-selector"]').click();
      await page.locator(`text=Bob Brown`).first().click();
      await fillWellnessQuestions(page);
      await page.locator('button:has-text("Submit")').click();
      await expect(page.locator('text=Your wellness response has been submitted')).toBeVisible();

      // Second submission (same athlete)
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');
      await page.locator('[data-testid="athlete-selector"]').click();
      await page.locator(`text=Bob Brown`).first().click();
      await fillWellnessQuestions(page);
      await page.locator('button:has-text("Submit")').click();
      await expect(page.locator('text=Your wellness response has been submitted')).toBeVisible();

      // Verify both submissions are stored
      const verifyContext = await browser.newContext();
      const verifyPage = await verifyContext.newPage();
      await loginAsDefaultUser(verifyPage);

      const responsesResp = await verifyPage.request.get(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/responses?startDate=2024-01-01&endDate=2099-12-31&athleteIds=${athlete2.id}`
      );
      const responsesData = await responsesResp.json();

      const submissions = responsesData.filter((r: any) => r.requestId === request.id && r.userId === athlete2.id);
      expect(submissions.length).toBeGreaterThanOrEqual(2);

      // Cleanup
      await verifyPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await verifyContext.close();
    });
  });

  test.describe('Manual Entry Fallback', () => {
    test('should allow manual entry when "Not listed" selected', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetTeamIds: [team1.id],
      });

      await context.close();

      const magicLink = `${BASE_URL}/wellness/submit/${request.publicToken}`;
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');

      // Select manual entry
      await page.locator('[data-testid="athlete-selector"]').click();
      await page.locator('text=Not listed? Enter manually').click();

      // Should see text input
      const manualInput = page.locator('[data-testid="manual-name-input"]');
      await expect(manualInput).toBeVisible();

      // Should see back button
      await expect(page.locator('text=Back to athlete list')).toBeVisible();

      // Enter name
      await manualInput.fill('Jane Doe');

      // Fill questionnaire and submit
      await fillWellnessQuestions(page);
      await page.locator('button:has-text("Submit")').click();

      await expect(page.locator('text=Your wellness response has been submitted')).toBeVisible();

      // Verify submission stored with magic-link-submission user ID
      const verifyContext = await browser.newContext();
      const verifyPage = await verifyContext.newPage();
      await loginAsDefaultUser(verifyPage);

      const responsesResp = await verifyPage.request.get(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/responses?startDate=2024-01-01&endDate=2099-12-31`
      );
      const responsesData = await responsesResp.json();

      const submission = responsesData.find(
        (r: any) => r.requestId === request.id && r.userFullName === 'Jane Doe'
      );
      expect(submission).toBeDefined();
      expect(submission.userId).toBe('magic-link-submission');

      // Cleanup
      await verifyPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await verifyContext.close();
    });

    test('should allow switching back to dropdown from manual entry', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetTeamIds: [team1.id],
      });

      await context.close();

      const magicLink = `${BASE_URL}/wellness/submit/${request.publicToken}`;
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');

      // Select manual entry
      await page.locator('[data-testid="athlete-selector"]').click();
      await page.locator('text=Not listed? Enter manually').click();

      // Should see manual input
      await expect(page.locator('[data-testid="manual-name-input"]')).toBeVisible();

      // Click back button
      await page.locator('button:has-text("Back to athlete list")').click();

      // Should see dropdown again
      await expect(page.locator('[data-testid="athlete-selector"]')).toBeVisible();
      await expect(page.locator('[data-testid="manual-name-input"]')).not.toBeVisible();

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await cleanupContext.close();
    });
  });

  test.describe('Validation', () => {
    test('should validate athlete selection is required', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetTeamIds: [team1.id],
      });

      await context.close();

      const magicLink = `${BASE_URL}/wellness/submit/${request.publicToken}`;
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');

      // Fill questions but don't select athlete
      await fillWellnessQuestions(page);

      // Try to submit
      await page.locator('button:has-text("Submit")').click();

      // Should see validation error
      await expect(page.locator('text=Please select your name')).toBeVisible();

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await cleanupContext.close();
    });

    test('should validate manual entry name is required', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetTeamIds: [team1.id],
      });

      await context.close();

      const magicLink = `${BASE_URL}/wellness/submit/${request.publicToken}`;
      await page.goto(magicLink);
      await page.waitForLoadState('networkidle');

      // Select manual entry but don't fill name
      await page.locator('[data-testid="athlete-selector"]').click();
      await page.locator('text=Not listed? Enter manually').click();

      // Fill questions
      await fillWellnessQuestions(page);

      // Try to submit
      await page.locator('button:has-text("Submit")').click();

      // Should see validation error
      await expect(page.locator('text=Please enter your name')).toBeVisible();

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await cleanupContext.close();
    });
  });

  test.describe('Security', () => {
    test('should reject submission if selected athlete is not in targeted list', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request targeting only team1
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetTeamIds: [team1.id],
      });

      await context.close();

      // Try to submit with athlete3 (who is in team2, not targeted)
      const maliciousSubmission = await page.request.post(`${BASE_URL}/api/wellness/responses`, {
        data: {
          requestId: request.id,
          token: request.publicToken,
          templateId: testTemplate.id,
          selectedAthleteId: athlete3.id, // NOT in targeted list
          responses: {
            [`q1_${testTemplate.config.questions[0].id.split('_')[1]}`]: { value: 7 },
          },
          date: new Date().toISOString().split('T')[0],
        },
      });

      // Should be rejected with 403 Forbidden
      expect(maliciousSubmission.status()).toBe(403);
      const errorData = await maliciousSubmission.json();
      expect(errorData.message).toContain('not authorized');

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await cleanupContext.close();
    });

    test('should accept submission if selected athlete is in targeted team', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request targeting team1
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetTeamIds: [team1.id],
      });

      await context.close();

      // Submit with athlete1 (who is in team1)
      const validSubmission = await page.request.post(`${BASE_URL}/api/wellness/responses`, {
        data: {
          requestId: request.id,
          token: request.publicToken,
          templateId: testTemplate.id,
          selectedAthleteId: athlete1.id, // IN targeted list
          responses: {
            [`q1_${testTemplate.config.questions[0].id.split('_')[1]}`]: { value: 8 },
          },
          date: new Date().toISOString().split('T')[0],
        },
      });

      // Should be accepted
      expect(validSubmission.status()).toBe(201);

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await cleanupContext.close();
    });

    test('should accept submission if selected athlete is directly targeted', async ({ page, browser }) => {
      const context = await browser.newContext();
      const adminPage = await context.newPage();
      await loginAsDefaultUser(adminPage);

      // Create wellness request targeting athlete3 directly
      const request = await createWellnessRequest(adminPage, testOrgId, {
        templateId: testTemplate.id,
        targetAthleteIds: [athlete3.id],
      });

      await context.close();

      // Submit with athlete3
      const validSubmission = await page.request.post(`${BASE_URL}/api/wellness/responses`, {
        data: {
          requestId: request.id,
          token: request.publicToken,
          templateId: testTemplate.id,
          selectedAthleteId: athlete3.id, // Directly targeted
          responses: {
            [`q1_${testTemplate.config.questions[0].id.split('_')[1]}`]: { value: 9 },
          },
          date: new Date().toISOString().split('T')[0],
        },
      });

      // Should be accepted
      expect(validSubmission.status()).toBe(201);

      // Cleanup
      const cleanupContext = await browser.newContext();
      const cleanupPage = await cleanupContext.newPage();
      await loginAsDefaultUser(cleanupPage);
      await cleanupPage.request.delete(
        `${BASE_URL}/api/organizations/${testOrgId}/wellness/requests/${request.id}`
      );
      await cleanupContext.close();
    });
  });
});
