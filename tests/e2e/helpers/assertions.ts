/**
 * Custom Assertion Helper Functions for E2E Tests
 *
 * Provides reusable assertion utilities for Playwright tests
 */

import { Page, expect, Locator } from '@playwright/test';

/**
 * Expect toast/notification message to appear
 *
 * @param page - Playwright Page object
 * @param message - Expected message text (can be partial match)
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns Promise<void>
 */
export async function expectToastMessage(
  page: Page,
  message: string,
  timeout: number = 5000
): Promise<void> {
  const selectors = [
    '[data-testid="toast"]',
    '[data-testid="notification"]',
    '[role="alert"]',
    '.toast',
    '.notification',
    '.alert',
  ];

  let found = false;

  for (const selector of selectors) {
    try {
      const toast = page.locator(selector).filter({ hasText: message });
      await expect(toast).toBeVisible({ timeout });
      found = true;
      break;
    } catch {
      // Continue to next selector
    }
  }

  if (!found) {
    throw new Error(`Toast message "${message}" not found within ${timeout}ms`);
  }
}

/**
 * Expect form validation error for a specific field
 *
 * @param page - Playwright Page object
 * @param fieldName - Field name or label
 * @param errorMessage - Expected error message (can be partial match)
 * @returns Promise<void>
 */
export async function expectValidationError(
  page: Page,
  fieldName: string,
  errorMessage: string
): Promise<void> {
  // Try multiple strategies to find validation error
  const selectors = [
    `[data-testid="validation-error-${fieldName}"]`,
    `[data-testid="error-${fieldName}"]`,
    `#${fieldName}-error`,
    `.error-${fieldName}`,
  ];

  let found = false;

  for (const selector of selectors) {
    try {
      const error = page.locator(selector);
      await expect(error).toBeVisible();
      await expect(error).toContainText(errorMessage);
      found = true;
      break;
    } catch {
      // Continue to next selector
    }
  }

  // If not found by data-testid, try finding error near the input
  if (!found) {
    try {
      const input = page.locator(`[name="${fieldName}"]`).or(
        page.locator(`label:has-text("${fieldName}")`).locator('..').locator('input')
      );

      const errorNearInput = input.locator('..').locator('.error, [role="alert"]');
      await expect(errorNearInput).toBeVisible();
      await expect(errorNearInput).toContainText(errorMessage);
      found = true;
    } catch {
      // Error not found
    }
  }

  if (!found) {
    throw new Error(`Validation error "${errorMessage}" for field "${fieldName}" not found`);
  }
}

/**
 * Expect element to be visible
 *
 * @param page - Playwright Page object
 * @param selector - Element selector
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns Promise<void>
 */
export async function expectElementVisible(
  page: Page,
  selector: string,
  timeout: number = 5000
): Promise<void> {
  await expect(page.locator(selector)).toBeVisible({ timeout });
}

/**
 * Expect element to NOT be visible
 *
 * @param page - Playwright Page object
 * @param selector - Element selector
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns Promise<void>
 */
export async function expectElementNotVisible(
  page: Page,
  selector: string,
  timeout: number = 5000
): Promise<void> {
  await expect(page.locator(selector)).not.toBeVisible({ timeout });
}

/**
 * Expect data to appear in a table row
 *
 * @param page - Playwright Page object
 * @param rowData - Object with column values to match
 * @param tableSelector - Table selector (default: 'table')
 * @returns Promise<void>
 */
export async function expectInTable(
  page: Page,
  rowData: Record<string, string>,
  tableSelector: string = 'table'
): Promise<void> {
  const table = page.locator(tableSelector);
  await expect(table).toBeVisible();

  // Find row containing all the data
  const values = Object.values(rowData);

  // Build a row locator that contains all values
  let row = table.locator('tbody tr');

  for (const value of values) {
    row = row.filter({ hasText: value });
  }

  await expect(row).toBeVisible({
    timeout: 5000,
  });
}

/**
 * Expect element to have specific text
 *
 * @param page - Playwright Page object
 * @param selector - Element selector
 * @param expectedText - Expected text content
 * @returns Promise<void>
 */
export async function expectText(
  page: Page,
  selector: string,
  expectedText: string
): Promise<void> {
  await expect(page.locator(selector)).toHaveText(expectedText);
}

/**
 * Expect element to contain specific text
 *
 * @param page - Playwright Page object
 * @param selector - Element selector
 * @param expectedText - Text that should be contained
 * @returns Promise<void>
 */
export async function expectContainsText(
  page: Page,
  selector: string,
  expectedText: string
): Promise<void> {
  await expect(page.locator(selector)).toContainText(expectedText);
}

/**
 * Expect element count to match
 *
 * @param page - Playwright Page object
 * @param selector - Element selector
 * @param expectedCount - Expected number of elements
 * @returns Promise<void>
 */
export async function expectCount(
  page: Page,
  selector: string,
  expectedCount: number
): Promise<void> {
  await expect(page.locator(selector)).toHaveCount(expectedCount);
}

/**
 * Expect input to have specific value
 *
 * @param page - Playwright Page object
 * @param selector - Input selector
 * @param expectedValue - Expected input value
 * @returns Promise<void>
 */
export async function expectInputValue(
  page: Page,
  selector: string,
  expectedValue: string
): Promise<void> {
  await expect(page.locator(selector)).toHaveValue(expectedValue);
}

/**
 * Expect checkbox/radio to be checked
 *
 * @param page - Playwright Page object
 * @param selector - Checkbox/radio selector
 * @returns Promise<void>
 */
export async function expectChecked(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector)).toBeChecked();
}

/**
 * Expect checkbox/radio to NOT be checked
 *
 * @param page - Playwright Page object
 * @param selector - Checkbox/radio selector
 * @returns Promise<void>
 */
export async function expectNotChecked(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector)).not.toBeChecked();
}

/**
 * Expect element to be disabled
 *
 * @param page - Playwright Page object
 * @param selector - Element selector
 * @returns Promise<void>
 */
export async function expectDisabled(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector)).toBeDisabled();
}

/**
 * Expect element to be enabled
 *
 * @param page - Playwright Page object
 * @param selector - Element selector
 * @returns Promise<void>
 */
export async function expectEnabled(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector)).toBeEnabled();
}

/**
 * Expect URL to contain path
 *
 * @param page - Playwright Page object
 * @param expectedPath - Expected path in URL
 * @returns Promise<void>
 */
export async function expectUrlContains(page: Page, expectedPath: string): Promise<void> {
  expect(page.url()).toContain(expectedPath);
}

/**
 * Expect URL to match regex
 *
 * @param page - Playwright Page object
 * @param pattern - Regex pattern
 * @returns Promise<void>
 */
export async function expectUrlMatches(page: Page, pattern: RegExp): Promise<void> {
  await expect(page).toHaveURL(pattern);
}

/**
 * Expect no console errors on page
 *
 * @param page - Playwright Page object
 * @param allowedErrors - Array of error messages to ignore
 * @returns Promise<void>
 */
export async function expectNoConsoleErrors(
  page: Page,
  allowedErrors: string[] = []
): Promise<void> {
  const consoleErrors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!allowedErrors.some(allowed => text.includes(allowed))) {
        consoleErrors.push(text);
      }
    }
  });

  // Wait a moment for any errors to appear
  await page.waitForTimeout(1000);

  if (consoleErrors.length > 0) {
    throw new Error(`Console errors found:\n${consoleErrors.join('\n')}`);
  }
}

/**
 * Expect loading indicator to disappear
 *
 * @param page - Playwright Page object
 * @param timeout - Timeout in milliseconds (default: 10000)
 * @returns Promise<void>
 */
export async function expectLoadingComplete(
  page: Page,
  timeout: number = 10000
): Promise<void> {
  const loadingSelectors = [
    '[data-testid="loading"]',
    '[data-testid="spinner"]',
    '.loading',
    '.spinner',
    '[role="progressbar"]',
  ];

  for (const selector of loadingSelectors) {
    try {
      await expect(page.locator(selector)).not.toBeVisible({ timeout: 1000 });
    } catch {
      // Selector not found or still visible, continue
    }
  }
}

/**
 * Expect element to have attribute
 *
 * @param page - Playwright Page object
 * @param selector - Element selector
 * @param attribute - Attribute name
 * @param expectedValue - Expected attribute value
 * @returns Promise<void>
 */
export async function expectAttribute(
  page: Page,
  selector: string,
  attribute: string,
  expectedValue: string
): Promise<void> {
  await expect(page.locator(selector)).toHaveAttribute(attribute, expectedValue);
}

/**
 * Expect element to have CSS class
 *
 * @param page - Playwright Page object
 * @param selector - Element selector
 * @param className - Expected CSS class
 * @returns Promise<void>
 */
export async function expectHasClass(
  page: Page,
  selector: string,
  className: string
): Promise<void> {
  await expect(page.locator(selector)).toHaveClass(new RegExp(className));
}

/**
 * Expect dialog/modal to be visible
 *
 * @param page - Playwright Page object
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns Promise<void>
 */
export async function expectDialogVisible(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  const dialogSelectors = [
    '[role="dialog"]',
    '[role="alertdialog"]',
    '.dialog',
    '.modal',
    '[data-testid="dialog"]',
    '[data-testid="modal"]',
  ];

  let found = false;

  for (const selector of dialogSelectors) {
    try {
      await expect(page.locator(selector)).toBeVisible({ timeout: 1000 });
      found = true;
      break;
    } catch {
      // Continue to next selector
    }
  }

  if (!found) {
    throw new Error(`Dialog/modal not found within ${timeout}ms`);
  }
}

/**
 * Expect success message
 *
 * @param page - Playwright Page object
 * @param message - Expected success message (optional, partial match)
 * @returns Promise<void>
 */
export async function expectSuccessMessage(
  page: Page,
  message?: string
): Promise<void> {
  const selectors = [
    '[data-testid="success-message"]',
    '.success',
    '.alert-success',
    '[role="status"]',
  ];

  let found = false;

  for (const selector of selectors) {
    try {
      const element = page.locator(selector);
      await expect(element).toBeVisible({ timeout: 5000 });

      if (message) {
        await expect(element).toContainText(message);
      }

      found = true;
      break;
    } catch {
      // Continue to next selector
    }
  }

  if (!found) {
    throw new Error('Success message not found');
  }
}

/**
 * Expect error message
 *
 * @param page - Playwright Page object
 * @param message - Expected error message (optional, partial match)
 * @returns Promise<void>
 */
export async function expectErrorMessage(
  page: Page,
  message?: string
): Promise<void> {
  const selectors = [
    '[data-testid="error-message"]',
    '.error',
    '.alert-error',
    '[role="alert"]',
  ];

  let found = false;

  for (const selector of selectors) {
    try {
      const element = page.locator(selector);
      await expect(element).toBeVisible({ timeout: 5000 });

      if (message) {
        await expect(element).toContainText(message);
      }

      found = true;
      break;
    } catch {
      // Continue to next selector
    }
  }

  if (!found) {
    throw new Error('Error message not found');
  }
}
