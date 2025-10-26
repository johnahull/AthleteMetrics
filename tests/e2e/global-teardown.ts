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
      const testAthletes = athletes.filter((athlete: any) =>
        athlete.firstName?.startsWith('Test') ||
        athlete.lastName?.startsWith('Test') ||
        athlete.emails?.some((email: string) => email.includes('@test.com'))
      );

      console.log(`   Found ${testAthletes.length} test athletes to clean up`);

      // Delete test athletes (this will cascade to measurements)
      for (const athlete of testAthletes) {
        try {
          const deleteResponse = await page.request.delete(
            `${STAGING_URL}/api/athletes/${athlete.id}`
          );
          if (deleteResponse.ok()) {
            console.log(`   ✓ Deleted test athlete: ${athlete.firstName} ${athlete.lastName}`);
          }
        } catch (error) {
          console.warn(`   ⚠ Failed to delete athlete ${athlete.id}:`, error);
        }
      }
    }

    console.log('✅ Test data cleanup complete');

    // Log test results summary
    console.log('\n📊 E2E Test Run Complete');
    console.log('   See playwright-report/ for detailed results');

    console.log('\n✅ E2E Test Teardown Complete\n');
  } catch (error) {
    console.error('\n❌ E2E Test Teardown Failed:', error);
    console.log('   Test data may remain in staging database');
    // Don't throw - teardown failures shouldn't fail the test run
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalTeardown;
