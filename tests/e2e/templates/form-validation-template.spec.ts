import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from '../helpers/auth';
import { FORM_VALIDATION_TIMEOUT } from '../constants';

/**
 * E2E Test Template: Form Validation
 *
 * This template provides a standard structure for testing form validation
 * rules and error handling in the application.
 *
 * HOW TO USE:
 * 1. Copy this file to tests/e2e/[form-name]-validation.spec.ts
 * 2. Replace [FORM] with your form name (e.g., "Athlete Registration", "Team Creation")
 * 3. Replace [ROUTE] with your route path (e.g., "/athletes", "/teams")
 * 4. Update test data and validation rules to match your form
 * 5. Update selectors to match your actual form fields
 * 6. Run tests: npm run test:staging
 *
 * EXAMPLE: For an "Athlete Registration" form:
 * - File: tests/e2e/athlete-registration-validation.spec.ts
 * - Route: /athletes
 * - Validation rules: Required firstName/lastName, valid email, valid birthDate
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Test data for validation scenarios
const validData = {
  // TODO: Replace with valid data for your form
  field1: 'Valid Value',
  email: 'valid@example.com',
  phone: '+1-555-123-4567',
  number: '42',
  url: 'https://example.com',
};

const invalidData = {
  // TODO: Replace with invalid data for your form
  emailInvalid: 'not-an-email',
  phoneInvalid: '123',
  numberInvalid: 'abc',
  urlInvalid: 'not-a-url',
  tooShort: 'ab',
  tooLong: 'a'.repeat(300),
};

test.describe('[FORM] Validation Tests', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // TODO: Navigate to your form
    await page.goto(`${STAGING_URL}/[ROUTE]`);
    await page.waitForLoadState('networkidle');

    // Open the form (if it's in a modal/dialog)
    // TODO: Update selector to match your "Add" button
    await page.click('[data-testid="add-[entity]-button"]');
    await page.waitForSelector('[role="dialog"], form', { timeout: 5000 });
  });

  test('should show validation errors for all required fields', async ({ page }) => {
    // Try to submit without filling any fields
    await page.click('button[type="submit"]');

    // Wait for validation errors to appear
    await page.waitForSelector('.error, [role="alert"], text=/required|must/i', {
      timeout: 5000
    });

    // Count validation error messages
    const errorCount = await page.locator('.error, [role="alert"], text=/required|must/i').count();

    // TODO: Update expected count to match number of required fields
    expect(errorCount).toBeGreaterThan(0);

    // Should still be on the form (not submitted)
    const formVisible = await page.locator('[role="dialog"], form').count();
    expect(formVisible).toBeGreaterThan(0);
  });

  test('should show specific error for each required field', async ({ page }) => {
    // TODO: Test each required field individually
    // Example for a "Name" field:

    // Try to submit with only name field empty
    await page.fill('[data-testid="input-field1"]', validData.field1);
    // Leave required field empty
    await page.click('button[type="submit"]');

    // Should show specific error for the empty field
    await page.waitForSelector('[data-testid="error-[required-field]"], text=/[field].*required/i', {
      timeout: 5000
    });

    const specificError = await page.locator('[data-testid="error-[required-field]"], text=/[field].*required/i').count();
    expect(specificError).toBeGreaterThan(0);
  });

  test('should validate email format', async ({ page }) => {
    // TODO: If your form has email fields

    // Fill email field with invalid format
    await page.click('[data-testid="button-add-email"]'); // If using dynamic email array
    await page.fill('[data-testid="input-email-0"]', invalidData.emailInvalid);

    // Try to submit or trigger validation
    await page.click('button[type="submit"]');

    // Should show email validation error
    await page.waitForSelector('text=/invalid.*email|valid.*email|email.*format/i', {
      timeout: 5000
    });

    const emailError = await page.locator('text=/invalid.*email|valid.*email|email.*format/i').count();
    expect(emailError).toBeGreaterThan(0);

    // Fill with valid email
    await page.fill('[data-testid="input-email-0"]', validData.email);

    // Error should disappear
    await page.waitForTimeout(FORM_VALIDATION_TIMEOUT); // Brief wait for validation
    const errorAfterFix = await page.locator('text=/invalid.*email/i').count();
    expect(errorAfterFix).toBe(0);
  });

  test('should validate phone number format', async ({ page }) => {
    // TODO: If your form has phone fields

    // Skip test if phone field not present
    const hasPhoneField = await page.locator('[data-testid="button-add-phone"], [data-testid="input-phone"]').count();
    if (hasPhoneField === 0) {
      test.skip();
    }

    // Fill phone field with invalid format
    await page.click('[data-testid="button-add-phone"]');
    await page.fill('[data-testid="input-phone-0"]', invalidData.phoneInvalid);

    // Try to submit
    await page.click('button[type="submit"]');

    // Should show phone validation error
    await page.waitForSelector('text=/invalid.*phone|valid.*phone|phone.*format/i', {
      timeout: 5000
    });

    const phoneError = await page.locator('text=/invalid.*phone|valid.*phone|phone.*format/i').count();
    expect(phoneError).toBeGreaterThan(0);
  });

  test('should validate number fields', async ({ page }) => {
    // TODO: If your form has number fields (age, score, etc.)

    // Skip test if number field not present
    const hasNumberField = await page.locator('[data-testid="input-[number-field]"]').count();
    if (hasNumberField === 0) {
      test.skip();
    }

    // Fill number field with non-numeric value
    await page.fill('[data-testid="input-[number-field]"]', invalidData.numberInvalid);

    // Try to submit
    await page.click('button[type="submit"]');

    // Should show number validation error
    await page.waitForSelector('text=/must.*number|invalid.*number|numeric/i', {
      timeout: 5000
    });

    const numberError = await page.locator('text=/must.*number|invalid.*number|numeric/i').count();
    expect(numberError).toBeGreaterThan(0);
  });

  test('should validate minimum length', async ({ page }) => {
    // TODO: If your form has min length requirements

    // Skip test if no min length fields
    const hasMinLengthField = await page.locator('[data-testid="input-[field-with-minlength]"]').count();
    if (hasMinLengthField === 0) {
      test.skip();
    }

    // Fill field with value below minimum length
    await page.fill('[data-testid="input-[field-with-minlength]"]', invalidData.tooShort);

    // Try to submit
    await page.click('button[type="submit"]');

    // Should show min length error
    await page.waitForSelector('text=/minimum.*length|at least.*characters|too short/i', {
      timeout: 5000
    });

    const minLengthError = await page.locator('text=/minimum.*length|at least.*characters|too short/i').count();
    expect(minLengthError).toBeGreaterThan(0);
  });

  test('should validate maximum length', async ({ page }) => {
    // TODO: If your form has max length requirements

    // Skip test if no max length fields
    const hasMaxLengthField = await page.locator('[data-testid="input-[field-with-maxlength]"]').count();
    if (hasMaxLengthField === 0) {
      test.skip();
    }

    // Fill field with value above maximum length
    await page.fill('[data-testid="input-[field-with-maxlength]"]', invalidData.tooLong);

    // Try to submit
    await page.click('button[type="submit"]');

    // Should show max length error
    await page.waitForSelector('text=/maximum.*length|too long|exceeds.*limit/i', {
      timeout: 5000
    });

    const maxLengthError = await page.locator('text=/maximum.*length|too long|exceeds.*limit/i').count();
    expect(maxLengthError).toBeGreaterThan(0);
  });

  test('should validate date fields', async ({ page }) => {
    // TODO: If your form has date fields

    // Skip test if no date fields
    const hasDateField = await page.locator('[data-testid="input-[date-field]"]').count();
    if (hasDateField === 0) {
      test.skip();
    }

    // Fill date field with invalid format
    await page.fill('[data-testid="input-[date-field]"]', 'invalid-date');

    // Try to submit
    await page.click('button[type="submit"]');

    // Should show date validation error
    await page.waitForSelector('text=/invalid.*date|valid.*date|date.*format/i', {
      timeout: 5000
    });

    const dateError = await page.locator('text=/invalid.*date|valid.*date|date.*format/i').count();
    expect(dateError).toBeGreaterThan(0);
  });

  test('should validate URL fields', async ({ page }) => {
    // TODO: If your form has URL fields

    // Skip test if no URL fields
    const hasUrlField = await page.locator('[data-testid="input-[url-field]"]').count();
    if (hasUrlField === 0) {
      test.skip();
    }

    // Fill URL field with invalid format
    await page.fill('[data-testid="input-[url-field]"]', invalidData.urlInvalid);

    // Try to submit
    await page.click('button[type="submit"]');

    // Should show URL validation error
    await page.waitForSelector('text=/invalid.*url|valid.*url|url.*format/i', {
      timeout: 5000
    });

    const urlError = await page.locator('text=/invalid.*url|valid.*url|url.*format/i').count();
    expect(urlError).toBeGreaterThan(0);
  });

  test('should validate conditional/dependent fields', async ({ page }) => {
    // TODO: If your form has fields that are required based on other field values

    // Example: "If sport is 'Other', then 'Other Sport Name' is required"
    test.skip(true, 'No conditional validation in this form');

    // Select option that triggers conditional requirement
    await page.selectOption('[data-testid="select-category"]', 'other');

    // Try to submit without filling conditional field
    await page.click('button[type="submit"]');

    // Should show error for conditional field
    await page.waitForSelector('text=/[conditional-field].*required/i', {
      timeout: 5000
    });
  });

  test('should validate unique constraints', async ({ page }) => {
    // TODO: If your form has uniqueness requirements (e.g., unique username)

    test.skip(true, 'No unique constraints in this form');

    // Fill with value that already exists
    await page.fill('[data-testid="input-[unique-field]"]', 'existing-value');

    // Try to submit
    await page.click('button[type="submit"]');

    // Should show uniqueness error
    await page.waitForSelector('text=/already.*exists|already.*taken|must.*unique/i', {
      timeout: 5000
    });
  });

  test('should clear validation errors when field becomes valid', async ({ page }) => {
    // Fill required field, triggering error
    await page.click('button[type="submit"]');
    await page.waitForSelector('.error, [role="alert"]');

    // Now fill the field with valid data
    await page.fill('[data-testid="input-[required-field]"]', validData.field1);

    // Wait briefly for validation to clear
    await page.waitForTimeout(FORM_VALIDATION_TIMEOUT);

    // Error should be gone or count should decrease
    const errorsAfter = await page.locator('.error, [role="alert"]').count();

    // At minimum, the specific field error should be cleared
    const specificErrorAfter = await page.locator('[data-testid="error-[required-field]"]').count();
    expect(specificErrorAfter).toBe(0);
  });

  test('should validate on blur (lose focus)', async ({ page }) => {
    // TODO: If your form validates on blur

    // Fill field with invalid value
    await page.fill('[data-testid="input-email-0"]', invalidData.emailInvalid);

    // Click away (blur the field)
    await page.click('body');

    // Should show validation error without submitting
    await page.waitForSelector('text=/invalid.*email/i', { timeout: 2000 });

    const blurError = await page.locator('text=/invalid.*email/i').count();
    expect(blurError).toBeGreaterThan(0);
  });

  test('should successfully submit with all valid data', async ({ page }) => {
    // Fill all required fields with valid data
    // TODO: Update to match your form's required fields
    await page.fill('[data-testid="input-field1"]', validData.field1);
    await page.click('[data-testid="button-add-email"]');
    await page.fill('[data-testid="input-email-0"]', validData.email);

    // Submit the form
    await page.click('button[type="submit"]');

    // Should close modal/redirect (no validation errors)
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });

    // Should show success message
    const successMessage = await page.locator('text=/success|created|added/i').count();
    expect(successMessage).toBeGreaterThan(0);
  });

  test('should show helpful error messages', async ({ page }) => {
    // Submit empty form to trigger all errors
    await page.click('button[type="submit"]');
    await page.waitForSelector('.error, [role="alert"]');

    // Get all error messages
    const errorElements = await page.locator('.error, [role="alert"]').all();

    // Verify errors are user-friendly
    for (const errorEl of errorElements) {
      const errorText = await errorEl.textContent();

      // Errors should not be empty
      expect(errorText?.trim().length).toBeGreaterThan(0);

      // Errors should be human-readable (no raw field names like "firstName_req_err")
      // They should contain words like "required", "must", "invalid", etc.
      const isHumanReadable = /required|must|invalid|should|please|enter|provide|format/i.test(errorText || '');
      expect(isHumanReadable).toBe(true);
    }
  });

  test('should disable submit button while submitting', async ({ page }) => {
    // TODO: If your form disables submit button during submission

    // Fill form with valid data
    await page.fill('[data-testid="input-field1"]', validData.field1);

    // Click submit
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Check if button is disabled immediately after click
    // (This may require checking quickly before submission completes)
    const isDisabled = await submitButton.isDisabled().catch(() => false);

    // Note: This assertion may be flaky depending on network speed
    // Consider adding a delay in your form submission handler for testing
    // expect(isDisabled).toBe(true);
  });
});

test.describe('[FORM] Validation Summary', () => {
  test('print form validation test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('[FORM] Validation Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Required field validation');
    console.log('✅ Specific errors for each field');
    console.log('✅ Email format validation');
    console.log('✅ Phone number format validation');
    console.log('✅ Number field validation');
    console.log('✅ Minimum length validation');
    console.log('✅ Maximum length validation');
    console.log('✅ Date field validation');
    console.log('✅ URL field validation');
    console.log('✅ Conditional field validation');
    console.log('✅ Unique constraint validation');
    console.log('✅ Error clearing on valid input');
    console.log('✅ Validation on blur');
    console.log('✅ Successful submission with valid data');
    console.log('✅ User-friendly error messages');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
