import { FullConfig, chromium } from '@playwright/test';

/**
 * Global Teardown for E2E Tests
 *
 * This runs ONCE after all tests complete.
 * Use it to:
 * - Clean up test data
 * - Remove test athletes/measurements created during tests
 * - Archive test results
 */

async function globalTeardown(config: FullConfig) {
  console.log('\n🧹 Starting E2E Test Teardown...\n');

  const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';
  const STAGING_USERNAME = process.env.STAGING_USERNAME;
  const STAGING_PASSWORD = process.env.STAGING_PASSWORD;

  // Skip cleanup if credentials not available
  if (!STAGING_USERNAME || !STAGING_PASSWORD) {
    console.warn('⚠️  Skipping test data cleanup: STAGING credentials not set');
    console.log('   Test data will remain in staging database');
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Login to staging
    console.log('🔐 Logging in to staging...');
    await page.goto(`${STAGING_URL}/login`);
    await page.fill('input[name="username"]', STAGING_USERNAME);
    await page.fill('input[name="password"]', STAGING_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Step 2: Clean up test athletes (those created with "TestFirst" or "Test" prefix)
    console.log('🗑️  Cleaning up test athletes...');
    const response = await page.request.get(`${STAGING_URL}/api/athletes`);

    if (response.ok()) {
      const athletes = await response.json();

      // Enhanced filtering to catch timestamp-based test names
      // Matches: TestFirst123456789, Test123, TestLast987654321, etc.
      const timestampPattern = /^Test\w*\d{10,}/; // Matches Test followed by 10+ digits

      const testAthletes = athletes.filter((athlete: any) => {
        const firstNameMatch = athlete.firstName?.startsWith('Test') ||
                              timestampPattern.test(athlete.firstName || '');
        const lastNameMatch = athlete.lastName?.startsWith('Test') ||
                             timestampPattern.test(athlete.lastName || '');
        const emailMatch = athlete.emails?.some((email: string) =>
          email.includes('@test.com') ||
          email.includes('@example.com') ||
          /test\d+@/.test(email) // Matches test123@, test456@, etc.
        );

        return firstNameMatch || lastNameMatch || emailMatch;
      });

      console.log(`   Found ${testAthletes.length} test athletes to clean up`);

      // Track cleanup results
      let successCount = 0;
      let failureCount = 0;
      const failures: Array<{ id: string; name: string; error: string }> = [];

      // Delete test athletes (this will cascade to measurements)
      for (const athlete of testAthletes) {
        try {
          const deleteResponse = await page.request.delete(
            `${STAGING_URL}/api/athletes/${athlete.id}`
          );
          if (deleteResponse.ok()) {
            successCount++;
            console.log(`   ✓ Deleted test athlete: ${athlete.firstName} ${athlete.lastName}`);
          } else {
            failureCount++;
            const errorMsg = `HTTP ${deleteResponse.status()}`;
            failures.push({
              id: athlete.id,
              name: `${athlete.firstName} ${athlete.lastName}`,
              error: errorMsg
            });
            console.warn(`   ⚠ Failed to delete athlete ${athlete.id}: ${errorMsg}`);
          }
        } catch (error) {
          failureCount++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          failures.push({
            id: athlete.id,
            name: `${athlete.firstName} ${athlete.lastName}`,
            error: errorMsg
          });
          console.warn(`   ⚠ Failed to delete athlete ${athlete.id}:`, errorMsg);
        }
      }

      // Summary
      console.log(`\n   Cleanup summary:`);
      console.log(`   ✓ Successfully deleted: ${successCount} athletes`);
      if (failureCount > 0) {
        console.warn(`\n⚠️  WARNING: Failed to delete ${failureCount} test athletes!`);
        console.warn(`   Test data accumulation detected in staging database.`);
        console.warn(`   This may cause future test conflicts or database pollution.`);
        console.warn(`   Failed athletes:`, JSON.stringify(failures, null, 2));
        console.warn(`\n   Action required: Manual cleanup may be needed in staging environment.`);
        console.warn(`   Review the failed athletes list above for details.\n`);
      }
    }

    console.log('✅ Test data cleanup complete');

    // Log test results summary
    console.log('\n📊 E2E Test Run Complete');
    console.log('   See playwright-report/ for detailed results');

    console.log('\n✅ E2E Test Teardown Complete\n');
  } catch (error) {
    console.error('\n❌ E2E Test Teardown Failed:', error);
    console.error('   Test data may remain in staging database');
    console.error('   This could lead to test data accumulation and future test conflicts.');
    console.error('   Manual cleanup of staging environment may be required.\n');
    // Don't throw - teardown failures shouldn't fail the test run
    // Rationale: Test suite results are more important than cleanup failures.
    // However, we log prominently to ensure cleanup issues are noticed and addressed.
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalTeardown;
