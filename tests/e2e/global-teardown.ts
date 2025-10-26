import { FullConfig } from '@playwright/test';

/**
 * Global Teardown for E2E Tests
 *
 * This runs ONCE after all tests complete.
 * Use it to:
 * - Clean up test data
 * - Remove test users (if desired)
 * - Archive test results
 * - Send notifications
 */

async function globalTeardown(config: FullConfig) {
  console.log('\n🧹 Starting E2E Test Teardown...\n');

  try {
    // TODO: Clean up test data if needed
    // - Remove test athletes created during tests
    // - Remove test measurements
    // - Remove test teams (if created during tests)
    // Note: Be careful not to delete permanent test users/organizations

    console.log('✅ Test data cleanup complete (if any)');

    // Log test results summary
    console.log('\n📊 E2E Test Run Complete');
    console.log('   See playwright-report/ for detailed results');

    console.log('\n✅ E2E Test Teardown Complete\n');
  } catch (error) {
    console.error('\n❌ E2E Test Teardown Failed:', error);
    // Don't throw - teardown failures shouldn't fail the test run
  }
}

export default globalTeardown;
