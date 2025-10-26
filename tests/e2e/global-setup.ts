import { chromium, FullConfig } from '@playwright/test';

/**
 * Global Setup for E2E Tests
 *
 * This runs ONCE before all tests.
 * Use it to:
 * - Create test organization
 * - Seed test users (if not already created)
 * - Set up test data
 * - Verify staging environment is accessible
 */

async function globalSetup(config: FullConfig) {
  console.log('\n🚀 Starting E2E Test Setup...\n');

  const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';
  const STAGING_USERNAME = process.env.STAGING_USERNAME || '';
  const STAGING_PASSWORD = process.env.STAGING_PASSWORD || '';

  // Verify required environment variables
  if (!STAGING_URL) {
    throw new Error('STAGING_URL environment variable is required');
  }

  if (!STAGING_USERNAME || !STAGING_PASSWORD) {
    console.warn('⚠️  WARNING: STAGING_USERNAME or STAGING_PASSWORD not set');
    console.warn('   Tests will use default credentials or may fail');
  }

  // Launch browser for setup
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Verify staging environment is accessible
    console.log(`🔍 Verifying staging environment: ${STAGING_URL}`);
    const response = await page.goto(STAGING_URL);

    if (!response || response.status() >= 400) {
      throw new Error(`Staging environment not accessible: ${response?.status()}`);
    }

    console.log('✅ Staging environment is accessible');

    // Verify login credentials work
    console.log('🔐 Verifying login credentials...');
    await page.goto(`${STAGING_URL}/login`);
    await page.waitForLoadState('networkidle');

    await page.fill('[data-testid="input-username"]', STAGING_USERNAME);
    await page.fill('[data-testid="input-password"]', STAGING_PASSWORD);
    await page.click('[data-testid="button-login"]');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      throw new Error('Login credentials are invalid');
    }

    console.log('✅ Login credentials verified');

    // TODO: Seed test data if needed
    // - Create test organization (if not exists)
    // - Create test users with different roles (if not exists)
    // - Create test teams (if not exists)

    console.log('\n✅ E2E Test Setup Complete\n');
  } catch (error) {
    console.error('\n❌ E2E Test Setup Failed:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalSetup;
