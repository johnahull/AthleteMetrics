import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * WELLNESS QUESTIONNAIRE: Coach Interface E2E Tests
 *
 * Tests verify the complete coach workflow for wellness questionnaires:
 * - Template management (create, edit, preview, delete)
 * - Request distribution (magic link, athlete accounts, team link, QR code)
 * - Request management (view, filter, cancel)
 * - QR code generation
 * - Completion rate tracking
 *
 * Tests follow TDD methodology: written first (RED), then implementation (GREEN).
 */

const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test data
function generateTestTemplate() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `Test Wellness Template ${uniqueId}`,
    description: 'Automated test template for E2E testing',
    questions: [
      {
        id: `q1_${uniqueId}`,
        type: 'scale' as const,
        label: 'How are you feeling today?',
        scaleMin: 1,
        scaleMax: 10,
        minLabel: 'Poor',
        maxLabel: 'Excellent',
        required: true,
      },
      {
        id: `q2_${uniqueId}`,
        type: 'text' as const,
        label: 'Any concerns or notes?',
        placeholder: 'Enter your notes...',
        required: false,
      },
      {
        id: `q3_${uniqueId}`,
        type: 'boolean' as const,
        label: 'Did you sleep well last night?',
        required: true,
      },
    ],
  };
}

test.describe('Wellness Coach Interface Tests', () => {
  let createdTemplateIds: string[] = [];
  let createdRequestIds: string[] = [];
  let testOrgId: string;
  let testOrgName: string;

  test.beforeAll(async ({ browser }) => {
    // Get organization ID once for all tests (from config file)
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
  });

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Navigate to wellness templates page
    await page.goto('/wellness');
    await page.waitForLoadState('networkidle');

    // Reset cleanup trackers
    createdTemplateIds = [];
    createdRequestIds = [];
  });

  test.afterEach(async ({ page }) => {
    // Cleanup created requests
    for (const requestId of createdRequestIds) {
      try {
        // Get the request first to find organization ID
        const requestResponse = await page.request.get(`${BASE_URL}/api/wellness/requests/${requestId}`);
        if (requestResponse.ok()) {
          const request = await requestResponse.json();
          await page.request.delete(
            `${BASE_URL}/api/organizations/${request.organizationId}/wellness/requests/${requestId}`
          );
        }
      } catch (error) {
        console.warn(`Failed to cleanup request ${requestId}:`, error);
      }
    }

    // Cleanup created templates
    for (const templateId of createdTemplateIds) {
      try {
        // Get the template first to find organization ID
        const templateResponse = await page.request.get(`${BASE_URL}/api/wellness/templates/${templateId}`);
        if (templateResponse.ok()) {
          const template = await templateResponse.json();
          await page.request.delete(
            `${BASE_URL}/api/organizations/${template.organizationId}/wellness/templates/${templateId}`
          );
        }
      } catch (error) {
        console.warn(`Failed to cleanup template ${templateId}:`, error);
      }
    }
  });

  test.describe('Template Management', () => {
    test('should navigate to wellness templates page', async ({ page }) => {
      // Verify page loaded
      await expect(page).toHaveURL(/\/wellness/);
      await expect(page.locator('h1').nth(1)).toContainText('Wellness');

      // Should see tabs: Templates, Requests
      await expect(page.locator('[role="tablist"]')).toBeVisible();
      await expect(page.locator('[role="tab"]:has-text("Templates")')).toBeVisible();
      await expect(page.locator('[role="tab"]:has-text("Requests")')).toBeVisible();
    });

    test('should create new wellness template with multiple questions', async ({ page }) => {
      const testTemplate = generateTestTemplate();

      // Click "Add Template" button
      await page.click('[data-testid="button-add-template"]');

      // Wait for template builder dialog/form
      await page.waitForSelector('[data-testid="template-builder"]', { timeout: 5000 });

      // Fill template name and description
      await page.fill('[data-testid="input-template-name"]', testTemplate.name);
      await page.fill('[data-testid="input-template-description"]', testTemplate.description);

      // Add scale question
      await page.click('[data-testid="button-add-question"]');
      // shadcn/ui Select: click trigger, then click option (use nth to get dropdown item, not trigger)
      await page.click('[data-testid="select-question-type"]');
      await page.locator('text=Scale (1-10)').nth(1).click({ force: true });
      await page.fill('[data-testid="input-question-label"]', testTemplate.questions[0].label);
      await page.fill('[data-testid="input-scale-min"]', '1');
      await page.fill('[data-testid="input-scale-max"]', '10');
      await page.fill('[data-testid="input-scale-min-label"]', testTemplate.questions[0].minLabel || '');
      await page.fill('[data-testid="input-scale-max-label"]', testTemplate.questions[0].maxLabel || '');
      await page.check('[data-testid="checkbox-question-required"]');
      await page.click('[data-testid="button-save-question"]');

      // Add text question
      await page.click('[data-testid="button-add-question"]');
      // shadcn/ui Select: click trigger, then click option
      await page.click('[data-testid="select-question-type"]');
      await page.locator('text=Text Response').first().click({ force: true });
      await page.fill('[data-testid="input-question-label"]', testTemplate.questions[1].label);
      if ('placeholder' in testTemplate.questions[1]) {
        await page.fill('[data-testid="input-text-placeholder"]', testTemplate.questions[1].placeholder || '');
      }
      await page.click('[data-testid="button-save-question"]');

      // Add boolean question
      await page.click('[data-testid="button-add-question"]');
      // shadcn/ui Select: click trigger, then click option
      await page.click('[data-testid="select-question-type"]');
      await page.locator('text=Yes/No').first().click({ force: true });
      await page.fill('[data-testid="input-question-label"]', testTemplate.questions[2].label);
      await page.check('[data-testid="checkbox-question-required"]');
      await page.click('[data-testid="button-save-question"]');

      // Listen for API response
      const responsePromise = page.waitForResponse(response =>
        response.url().includes('/wellness/templates') && response.request().method() === 'POST'
      );

      // Save template
      await page.click('[data-testid="button-save-template"]');

      // Capture template ID
      const response = await responsePromise;
      const template = await response.json();
      createdTemplateIds.push(template.id);

      // Verify success toast/message
      await expect(page.locator('[role="status"]')).toContainText(/created|success/i);

      // Verify template appears in list
      await expect(page.locator(`[data-testid="template-card-${template.id}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="template-card-${template.id}"]`)).toContainText(testTemplate.name);
    });

    test('should edit existing template', async ({ page }) => {
      // First create a template
      const testTemplate = generateTestTemplate();
      const createResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await createResponse.json();
      createdTemplateIds.push(template.id);

      // Reload page to see new template
      await page.reload();

      // Click edit button on template card
      await page.click(`[data-testid="button-edit-template-${template.id}"]`);

      // Wait for template builder
      await page.waitForSelector('[data-testid="template-builder"]');

      // Edit template name
      const updatedName = `Updated ${testTemplate.name}`;
      await page.fill('[data-testid="input-template-name"]', updatedName);

      // Save changes
      await page.click('[data-testid="button-save-template"]');

      // Verify success
      await expect(page.locator('[role="status"]')).toContainText(/updated|success/i);

      // Verify updated name appears
      await expect(page.locator(`[data-testid="template-card-${template.id}"]`)).toContainText(updatedName);
    });

    test('should preview template as athlete would see it', async ({ page }) => {
      // Create a template first
      const testTemplate = generateTestTemplate();
      const createResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await createResponse.json();
      createdTemplateIds.push(template.id);

      await page.reload();

      // Click preview button
      await page.click(`[data-testid="button-preview-template-${template.id}"]`);

      // Wait for preview modal
      await page.waitForSelector('[data-testid="template-preview"]');

      // Verify all questions are displayed
      await expect(page.locator('[data-testid="preview-question-0"]')).toContainText(testTemplate.questions[0].label);
      await expect(page.locator('[data-testid="preview-question-1"]')).toContainText(testTemplate.questions[1].label);
      await expect(page.locator('[data-testid="preview-question-2"]')).toContainText(testTemplate.questions[2].label);

      // Close preview
      await page.click('[data-testid="button-close-preview"]');
    });

    test('should delete template', async ({ page }) => {
      // Create a template
      const testTemplate = generateTestTemplate();
      const createResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await createResponse.json();
      createdTemplateIds.push(template.id);

      await page.reload();

      // Click delete button
      await page.click(`[data-testid="button-delete-template-${template.id}"]`);

      // Confirm deletion
      page.on('dialog', dialog => dialog.accept());
      await page.click('[data-testid="confirm-delete"]');

      // Verify template removed from list
      await expect(page.locator(`[data-testid="template-card-${template.id}"]`)).not.toBeVisible();

      // Remove from cleanup array since it's already deleted
      createdTemplateIds = createdTemplateIds.filter(id => id !== template.id);
    });

    test('should set template as default', async ({ page }) => {
      // Create a template
      const testTemplate = generateTestTemplate();
      const createResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await createResponse.json();
      createdTemplateIds.push(template.id);

      await page.reload();

      // Toggle default checkbox
      await page.check(`[data-testid="checkbox-default-template-${template.id}"]`);

      // Verify default badge appears
      await expect(page.locator(`[data-testid="badge-default-${template.id}"]`)).toBeVisible();
    });
  });

  test.describe('Request Distribution', () => {
    test('should open send request modal and select template', async ({ page }) => {
      // Navigate to Requests tab
      await page.click('[role="tab"]:has-text("Requests")');

      // Click "Send Request" button
      await page.click('[data-testid="button-send-request"]');

      // Wait for modal
      await page.waitForSelector('[data-testid="request-modal"]');

      // Verify template selector is visible
      await expect(page.locator('[data-testid="select-template"]')).toBeVisible();
    });

    test('should send request via magic link to specific athletes', async ({ page }) => {
      // Create a template first
      const testTemplate = generateTestTemplate();
      const createResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await createResponse.json();
      createdTemplateIds.push(template.id);

      // Navigate to Requests tab
      await page.click('[role="tab"]:has-text("Requests")');
      await page.click('[data-testid="button-send-request"]');

      // Select template
      await page.selectOption('[data-testid="select-template"]', template.id);

      // Select distribution method: Magic Link
      await page.click('[data-testid="radio-magic-link"]');

      // Select specific athletes
      await page.click('[data-testid="athlete-team-selector"]');
      await page.check('[data-testid="checkbox-athlete-1"]');
      await page.check('[data-testid="checkbox-athlete-2"]');
      await page.click('[data-testid="button-confirm-selection"]');

      // Set expiry date (7 days from now)
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 7);
      await page.fill('[data-testid="input-expiry-date"]', expiryDate.toISOString().split('T')[0]);

      // Listen for API response
      const responsePromise = page.waitForResponse(response =>
        response.url().includes('/wellness/requests') && response.request().method() === 'POST'
      );

      // Send request
      await page.click('[data-testid="button-send-request-submit"]');

      // Capture request ID
      const response = await responsePromise;
      const request = await response.json();
      createdRequestIds.push(request.id);

      // Verify success
      await expect(page.locator('[role="status"]')).toContainText(/sent|success/i);

      // Verify request appears in list
      await expect(page.locator(`[data-testid="request-row-${request.id}"]`)).toBeVisible();
    });

    test('should send request to entire team', async ({ page }) => {
      // Create a template
      const testTemplate = generateTestTemplate();
      const createResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await createResponse.json();
      createdTemplateIds.push(template.id);

      // Navigate to Requests tab
      await page.click('[role="tab"]:has-text("Requests")');
      await page.click('[data-testid="button-send-request"]');

      // Select template
      await page.selectOption('[data-testid="select-template"]', template.id);

      // Select distribution method
      await page.click('[data-testid="radio-team-link"]');

      // Select team
      await page.click('[data-testid="athlete-team-selector"]');
      await page.click('[data-testid="tab-teams"]');
      await page.check('[data-testid="checkbox-team-1"]');
      await page.click('[data-testid="button-confirm-selection"]');

      // Send request
      const responsePromise = page.waitForResponse(response =>
        response.url().includes('/wellness/requests') && response.request().method() === 'POST'
      );
      await page.click('[data-testid="button-send-request-submit"]');

      const response = await responsePromise;
      const request = await response.json();
      createdRequestIds.push(request.id);

      // Verify success
      await expect(page.locator('[role="status"]')).toContainText(/sent|success/i);
    });

    test('should generate QR code for team link', async ({ page }) => {
      // Create a template
      const testTemplate = generateTestTemplate();
      const createResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await createResponse.json();
      createdTemplateIds.push(template.id);

      // Navigate to Requests tab
      await page.click('[role="tab"]:has-text("Requests")');
      await page.click('[data-testid="button-send-request"]');

      // Select QR code distribution
      await page.selectOption('[data-testid="select-template"]', template.id);
      await page.click('[data-testid="radio-qr-code"]');

      // Select team
      await page.click('[data-testid="athlete-team-selector"]');
      await page.click('[data-testid="tab-teams"]');
      await page.check('[data-testid="checkbox-team-1"]');
      await page.click('[data-testid="button-confirm-selection"]');

      // Send request
      const responsePromise = page.waitForResponse(response =>
        response.url().includes('/wellness/requests') && response.request().method() === 'POST'
      );
      await page.click('[data-testid="button-send-request-submit"]');

      const response = await responsePromise;
      const request = await response.json();
      createdRequestIds.push(request.id);

      // Verify QR code modal appears
      await expect(page.locator('[data-testid="qr-code-modal"]')).toBeVisible();

      // Verify QR code image is displayed
      await expect(page.locator('[data-testid="qr-code-image"]')).toBeVisible();

      // Verify copy link button exists
      await expect(page.locator('[data-testid="button-copy-qr-link"]')).toBeVisible();

      // Verify download button exists
      await expect(page.locator('[data-testid="button-download-qr"]')).toBeVisible();
    });
  });

  test.describe('Request Management', () => {
    test('should view request list with status tracking', async ({ page }) => {
      // Navigate to Requests tab
      await page.click('[role="tab"]:has-text("Requests")');

      // Verify requests table/list is visible
      await expect(page.locator('[data-testid="requests-list"]')).toBeVisible();

      // Verify column headers
      await expect(page.locator('th:has-text("Template")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
      await expect(page.locator('th:has-text("Completion")')).toBeVisible();
      await expect(page.locator('th:has-text("Created")')).toBeVisible();
    });

    test('should filter requests by status', async ({ page }) => {
      // Navigate to Requests tab
      await page.click('[role="tab"]:has-text("Requests")');

      // Click filter dropdown
      await page.click('[data-testid="select-status-filter"]');

      // Select "Active" status
      await page.click('[data-testid="filter-active"]');

      // Verify URL or filter state updated
      await expect(page.locator('[data-testid="status-filter-badge"]')).toContainText('Active');

      // Verify only active requests shown
      const requestRows = page.locator('[data-testid^="request-row-"]');
      await expect(requestRows.first()).toBeVisible();
    });

    test('should view request details with completion rate', async ({ page }) => {
      // Create a request first
      const testTemplate = generateTestTemplate();
      const templateResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await templateResponse.json();
      createdTemplateIds.push(template.id);

      const requestResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/requests`, {
        data: {
          templateId: template.id,
          distributionMethod: 'magic_link',
          targetAthleteIds: ['athlete-1', 'athlete-2'],
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      const request = await requestResponse.json();
      createdRequestIds.push(request.id);

      await page.reload();
      await page.click('[role="tab"]:has-text("Requests")');

      // Click on request row to view details
      await page.click(`[data-testid="request-row-${request.id}"]`);

      // Verify details modal appears
      await expect(page.locator('[data-testid="request-detail-modal"]')).toBeVisible();

      // Verify completion rate display (e.g., "0/2 - 0%")
      await expect(page.locator('[data-testid="completion-rate"]')).toBeVisible();

      // Verify targeted athletes list
      await expect(page.locator('[data-testid="target-athletes-list"]')).toBeVisible();
    });

    test('should cancel active request', async ({ page }) => {
      // Create a request
      const testTemplate = generateTestTemplate();
      const templateResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await templateResponse.json();
      createdTemplateIds.push(template.id);

      const requestResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/requests`, {
        data: {
          templateId: template.id,
          distributionMethod: 'magic_link',
          targetAthleteIds: ['athlete-1'],
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      const request = await requestResponse.json();
      createdRequestIds.push(request.id);

      await page.reload();
      await page.click('[role="tab"]:has-text("Requests")');

      // Click cancel button on request
      await page.click(`[data-testid="button-cancel-request-${request.id}"]`);

      // Confirm cancellation
      page.on('dialog', dialog => dialog.accept());

      // Verify status updated to "Cancelled"
      await expect(page.locator(`[data-testid="request-status-${request.id}"]`)).toContainText('Cancelled');
    });

    test('should display completion rate progress bar', async ({ page }) => {
      // Create a request
      const testTemplate = generateTestTemplate();
      const templateResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await templateResponse.json();
      createdTemplateIds.push(template.id);

      const requestResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/requests`, {
        data: {
          templateId: template.id,
          distributionMethod: 'magic_link',
          targetAthleteIds: ['athlete-1', 'athlete-2', 'athlete-3'],
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      const request = await requestResponse.json();
      createdRequestIds.push(request.id);

      await page.reload();
      await page.click('[role="tab"]:has-text("Requests")');

      // Verify progress bar exists
      await expect(page.locator(`[data-testid="progress-bar-${request.id}"]`)).toBeVisible();

      // Verify completion text (e.g., "0/3 - 0%")
      await expect(page.locator(`[data-testid="completion-text-${request.id}"]`)).toContainText('0/3');
    });
  });

  test.describe('QR Code Generation', () => {
    test('should copy QR code link to clipboard', async ({ page }) => {
      // Create a request with QR code distribution
      const testTemplate = generateTestTemplate();
      const templateResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await templateResponse.json();
      createdTemplateIds.push(template.id);

      const requestResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/requests`, {
        data: {
          templateId: template.id,
          distributionMethod: 'qr_code',
          targetTeamIds: ['team-1'],
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      const request = await requestResponse.json();
      createdRequestIds.push(request.id);

      await page.reload();
      await page.click('[role="tab"]:has-text("Requests")');

      // Open QR code modal
      await page.click(`[data-testid="button-view-qr-${request.id}"]`);

      // Grant clipboard permissions
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

      // Click copy link button
      await page.click('[data-testid="button-copy-qr-link"]');

      // Verify success toast
      await expect(page.locator('[role="status"]')).toContainText(/copied|success/i);
    });

    test('should download QR code as PNG', async ({ page }) => {
      // Create a request with QR code
      const testTemplate = generateTestTemplate();
      const templateResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/templates`, {
        data: {
          name: testTemplate.name,
          description: testTemplate.description,
          config: { questions: testTemplate.questions },
          isActive: true,
          isDefault: false,
        },
      });
      const template = await templateResponse.json();
      createdTemplateIds.push(template.id);

      const requestResponse = await page.request.post(`${BASE_URL}/api/organizations/${testOrgId}/wellness/requests`, {
        data: {
          templateId: template.id,
          distributionMethod: 'qr_code',
          targetTeamIds: ['team-1'],
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      const request = await requestResponse.json();
      createdRequestIds.push(request.id);

      await page.reload();
      await page.click('[role="tab"]:has-text("Requests")');

      // Open QR code modal
      await page.click(`[data-testid="button-view-qr-${request.id}"]`);

      // Setup download event listener
      const downloadPromise = page.waitForEvent('download');

      // Click download button
      await page.click('[data-testid="button-download-qr"]');

      // Verify download starts
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.png$/);
    });
  });
});
