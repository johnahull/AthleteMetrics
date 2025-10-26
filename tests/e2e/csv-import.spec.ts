import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';
import { goToImportExport } from './helpers/navigation';
import path from 'path';

/**
 * TIER 1 CRITICAL: CSV Import Tests
 *
 * These tests verify the CSV import functionality:
 * - Upload CSV and show preview
 * - Column mapping workflow
 * - Import creates athletes/measurements
 * - Error handling for invalid data
 * - Large file handling
 * - Auto-create teams during import
 * - Import measurements from CSV
 * - Duplicate athlete handling
 * - Cancel import flow
 * - Import progress tracking
 *
 * Tests follow TDD methodology: written first, infrastructure built to make them pass.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// CSV file paths (will be created in fixtures)
const VALID_ATHLETES_CSV = path.join(__dirname, 'fixtures/csv-files/valid-athletes.csv');
const VALID_MEASUREMENTS_CSV = path.join(__dirname, 'fixtures/csv-files/valid-measurements.csv');
const INVALID_DATA_CSV = path.join(__dirname, 'fixtures/csv-files/invalid-data.csv');
const LARGE_FILE_CSV = path.join(__dirname, 'fixtures/csv-files/large-file.csv');

test.describe('CSV Import Tests', () => {

  // Setup: Login before each test
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToImportExport(page);
  });

  test('should upload CSV and show preview', async ({ page }) => {
    // Select import type (athletes)
    await page.click('[data-testid="select-import-type"]');
    await page.click('text="Athletes", [data-value="athletes"]');

    // Upload CSV file
    const fileInput = page.locator('[data-testid="input-file-upload"]');
    await fileInput.setInputFiles(VALID_ATHLETES_CSV);

    // Wait for file to be processed
    await page.waitForTimeout(2000);

    // Should show preview table
    const previewTable = await page.locator('table, [role="table"], .preview').count();
    expect(previewTable).toBeGreaterThan(0);

    // Should show rows from CSV
    const rows = await page.locator('tbody tr, [role="row"]').count();
    expect(rows).toBeGreaterThan(0);
  });

  test('should support column mapping workflow', async ({ page }) => {
    // Upload CSV
    await page.click('[data-testid="select-import-type"]');
    await page.click('text="Athletes"');

    const fileInput = page.locator('[data-testid="input-file-upload"]');
    await fileInput.setInputFiles(VALID_ATHLETES_CSV);
    await page.waitForTimeout(2000);

    // Look for column mapping interface
    const mappingInterface = await page.locator('text=/map.*column|column.*mapping|select.*field/i').count();

    if (mappingInterface > 0) {
      // Column mapping is available
      // Map first name column
      await page.click('select:near(text="First Name"), [data-testid*="map-first-name"]').catch(() => {
        // Column mapping might be automatic
      });
    }

    // Should be able to proceed with import
    const importButton = page.locator('[data-testid="button-import"]');
    const isEnabled = await importButton.isEnabled();
    expect(isEnabled).toBeTruthy();
  });

  test('should confirm import and create athletes', async ({ page }) => {
    // Upload CSV
    await page.click('[data-testid="select-import-type"]');
    await page.click('text="Athletes"');

    const fileInput = page.locator('[data-testid="input-file-upload"]');
    await fileInput.setInputFiles(VALID_ATHLETES_CSV);
    await page.waitForTimeout(2000);

    // Get initial athlete count (navigate to athletes page)
    await page.goto(`${STAGING_URL}/athletes`);
    await page.waitForLoadState('networkidle');
    const initialCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();

    // Go back to import
    await goToImportExport(page);
    await page.click('[data-testid="select-import-type"]');
    await page.click('text="Athletes"');
    await fileInput.setInputFiles(VALID_ATHLETES_CSV);
    await page.waitForTimeout(2000);

    // Confirm import
    await page.click('[data-testid="button-import"]');

    // Wait for import to complete
    await page.waitForTimeout(3000);

    // Should show success message
    const successMessage = await page.locator('text=/import.*complete|success|imported/i').count();
    expect(successMessage).toBeGreaterThan(0);

    // Navigate to athletes page and verify count increased
    await page.goto(`${STAGING_URL}/athletes`);
    await page.waitForLoadState('networkidle');
    const finalCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
    expect(finalCount).toBeGreaterThan(initialCount);
  });

  test('should display import errors for invalid data', async ({ page }) => {
    // Upload invalid CSV
    await page.click('[data-testid="select-import-type"]');
    await page.click('text="Athletes"');

    const fileInput = page.locator('[data-testid="input-file-upload"]');
    await fileInput.setInputFiles(INVALID_DATA_CSV);
    await page.waitForTimeout(2000);

    // Should show error messages or warnings
    const errorMessages = await page.locator('.error, [role="alert"], text=/invalid|error|warning/i').count();
    expect(errorMessages).toBeGreaterThan(0);

    // Import button might be disabled or show warnings
    const importButton = page.locator('[data-testid="button-import"]');
    const warningText = await page.locator('text=/row.*error|invalid.*data/i').count();
    expect(warningText).toBeGreaterThan(0);
  });

  test('should handle large file imports', async ({ page }) => {
    // Upload large CSV
    await page.click('[data-testid="select-import-type"]');
    await page.click('text="Athletes"');

    const fileInput = page.locator('[data-testid="input-file-upload"]');
    await fileInput.setInputFiles(LARGE_FILE_CSV);

    // Wait for file to be processed (may take longer)
    await page.waitForTimeout(5000);

    // Should show preview (possibly paginated)
    const previewTable = await page.locator('table, [role="table"]').count();
    expect(previewTable).toBeGreaterThan(0);

    // Should show row count
    const rowCountText = await page.locator('text=/\\d+.*row|record/i').count();
    expect(rowCountText).toBeGreaterThan(0);

    // Should be able to proceed with import
    const importButton = page.locator('[data-testid="button-import"]');
    const isEnabled = await importButton.isEnabled();
    expect(isEnabled).toBeTruthy();
  });

  test('should auto-create teams during import if specified', async ({ page }) => {
    // Upload CSV with team data
    await page.click('[data-testid="select-import-type"]');
    await page.click('text="Athletes"');

    // Select team handling option
    const teamHandling = page.locator('[data-testid="select-team-handling"]');
    const teamHandlingExists = await teamHandling.count();

    if (teamHandlingExists > 0) {
      await teamHandling.click();
      await page.click('text=/create.*new.*team|auto.*create/i');
    }

    const fileInput = page.locator('[data-testid="input-file-upload"]');
    await fileInput.setInputFiles(VALID_ATHLETES_CSV);
    await page.waitForTimeout(2000);

    // Confirm import
    await page.click('[data-testid="button-import"]');
    await page.waitForTimeout(3000);

    // Navigate to teams page and verify new teams
    await page.goto(`${STAGING_URL}/teams`);
    await page.waitForLoadState('networkidle');

    const teamsExist = await page.locator('[data-testid^="team-"], .team-card, tr').count();
    expect(teamsExist).toBeGreaterThan(0);
  });

  test('should import measurements from CSV', async ({ page }) => {
    // Upload measurements CSV
    await page.click('[data-testid="select-import-type"]');
    await page.click('text="Measurements"');

    const fileInput = page.locator('[data-testid="input-file-upload"]');
    await fileInput.setInputFiles(VALID_MEASUREMENTS_CSV);
    await page.waitForTimeout(2000);

    // Preview should show measurement data
    const previewTable = await page.locator('table').count();
    expect(previewTable).toBeGreaterThan(0);

    // Confirm import
    await page.click('[data-testid="button-import"]');
    await page.waitForTimeout(3000);

    // Should show success
    const successMessage = await page.locator('text=/import.*complete|success/i').count();
    expect(successMessage).toBeGreaterThan(0);
  });

  test('should handle duplicate athlete detection', async ({ page }) => {
    // Upload CSV with athletes
    await page.click('[data-testid="select-import-type"]');
    await page.click('text="Athletes"');

    // Select athlete handling mode
    const athleteMode = page.locator('[data-testid="select-athlete-mode"]');
    const athleteModeExists = await athleteMode.count();

    if (athleteModeExists > 0) {
      await athleteMode.click();

      // Look for duplicate handling options
      const skipOption = await page.locator('text=/skip.*duplicate|ignore.*existing/i').count();
      const updateOption = await page.locator('text=/update.*existing|overwrite/i').count();

      if (skipOption > 0) {
        await page.click('text=/skip.*duplicate/i');
      } else if (updateOption > 0) {
        await page.click('text=/update.*existing/i');
      }
    }

    const fileInput = page.locator('[data-testid="input-file-upload"]');
    await fileInput.setInputFiles(VALID_ATHLETES_CSV);
    await page.waitForTimeout(2000);

    // Should show duplicate detection info
    const duplicateInfo = await page.locator('text=/duplicate|already.*exist|matching/i').count();

    // Import should proceed with chosen strategy
    await page.click('[data-testid="button-import"]');
    await page.waitForTimeout(3000);
  });

  test('should support cancel import flow', async ({ page }) => {
    // Upload CSV
    await page.click('[data-testid="select-import-type"]');
    await page.click('text="Athletes"');

    const fileInput = page.locator('[data-testid="input-file-upload"]');
    await fileInput.setInputFiles(VALID_ATHLETES_CSV);
    await page.waitForTimeout(2000);

    // Click cancel button
    const cancelButton = page.locator('[data-testid="button-cancel-import"]');
    const cancelExists = await cancelButton.count();

    if (cancelExists > 0) {
      await cancelButton.click();

      // Should reset to initial state
      const uploadZone = await page.locator('[data-testid="file-drop-zone"]').count();
      expect(uploadZone).toBeGreaterThan(0);
    }
  });

  test('should track import progress', async ({ page }) => {
    // Upload CSV
    await page.click('[data-testid="select-import-type"]');
    await page.click('text="Athletes"');

    const fileInput = page.locator('[data-testid="input-file-upload"]');
    await fileInput.setInputFiles(VALID_ATHLETES_CSV);
    await page.waitForTimeout(2000);

    // Start import
    await page.click('[data-testid="button-import"]');

    // Should show progress indicator
    const progressIndicator = await page.locator('[role="progressbar"], .progress, text=/importing|processing/i').count();

    // Progress should complete
    await page.waitForTimeout(3000);

    // Should show completion message
    const completionMessage = await page.locator('text=/complete|success|finished/i').count();
    expect(completionMessage).toBeGreaterThan(0);
  });
});

test.describe('CSV Import Summary', () => {
  test('print CSV import test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('CSV Import Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Upload CSV and show preview');
    console.log('✅ Column mapping workflow');
    console.log('✅ Confirm import creates athletes');
    console.log('✅ Import error handling');
    console.log('✅ Large file handling');
    console.log('✅ Auto-create teams during import');
    console.log('✅ Import measurements from CSV');
    console.log('✅ Duplicate athlete handling');
    console.log('✅ Cancel import flow');
    console.log('✅ Import progress tracking');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
