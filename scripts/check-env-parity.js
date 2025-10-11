#!/usr/bin/env node

/**
 * Environment Parity Check Script
 *
 * Compares environment variable keys between staging and production
 * to ensure configuration parity (without exposing values).
 */

const { execSync } = require('child_process');

const REQUIRED_VARS = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'SESSION_SECRET',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',
  'SENDGRID_FROM_NAME',
  'APP_URL'
];

const OPTIONAL_VARS = [
  'INVITATION_EXPIRY_DAYS',
  'ANALYTICS_RATE_WINDOW_MS',
  'ANALYTICS_RATE_LIMIT',
  'UPLOAD_RATE_LIMIT',
  'MAX_CSV_FILE_SIZE',
  'MAX_IMAGE_FILE_SIZE',
  'MAX_CSV_ROWS',
  'ENABLE_DEBUG_LOGGING',
  'BYPASS_ANALYTICS_RATE_LIMIT',
  'BYPASS_GENERAL_RATE_LIMIT'
];

const ENVIRONMENT_SPECIFIC = [
  'NODE_ENV',
  'APP_URL',
  'ENABLE_DEBUG_LOGGING',
  'BYPASS_ANALYTICS_RATE_LIMIT',
  'BYPASS_GENERAL_RATE_LIMIT'
];

function getEnvVarsFromRailway(serviceId) {
  try {
    const output = execSync(
      `railway variables --service ${serviceId} --json`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    const vars = JSON.parse(output);
    return Object.keys(vars);
  } catch (error) {
    console.error(`Error fetching variables: ${error.message}`);
    return null;
  }
}

function checkParity() {
  console.log('\n🔍 Checking environment variable parity...\n');

  const stagingServiceId = process.env.RAILWAY_STAGING_SERVICE_ID;
  const productionServiceId = process.env.RAILWAY_PRODUCTION_SERVICE_ID;

  if (!stagingServiceId || !productionServiceId) {
    console.error('❌ ERROR: RAILWAY_STAGING_SERVICE_ID and RAILWAY_PRODUCTION_SERVICE_ID must be set');
    console.error('Set these environment variables before running this script.\n');
    process.exit(1);
  }

  console.log('Fetching staging variables...');
  const stagingVars = getEnvVarsFromRailway(stagingServiceId);

  if (!stagingVars) {
    console.error('❌ Failed to fetch staging variables\n');
    process.exit(1);
  }

  console.log('Fetching production variables...');
  const productionVars = getEnvVarsFromRailway(productionServiceId);

  if (!productionVars) {
    console.error('❌ Failed to fetch production variables\n');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Environment Variable Comparison\n');

  let hasIssues = false;

  // Check required variables in both environments
  console.log('Required Variables:');
  REQUIRED_VARS.forEach(varName => {
    const inStaging = stagingVars.includes(varName);
    const inProduction = productionVars.includes(varName);

    if (inStaging && inProduction) {
      console.log(`  ✅ ${varName}: Present in both`);
    } else if (!inStaging && !inProduction) {
      console.log(`  ❌ ${varName}: MISSING in both environments`);
      hasIssues = true;
    } else if (!inStaging) {
      console.log(`  ⚠️  ${varName}: MISSING in staging`);
      hasIssues = true;
    } else if (!inProduction) {
      console.log(`  ⚠️  ${varName}: MISSING in production`);
      hasIssues = true;
    }
  });

  // Check optional variables
  console.log('\nOptional Variables:');
  OPTIONAL_VARS.forEach(varName => {
    const inStaging = stagingVars.includes(varName);
    const inProduction = productionVars.includes(varName);

    if (inStaging && inProduction) {
      console.log(`  ✅ ${varName}: Present in both`);
    } else if (!inStaging && !inProduction) {
      console.log(`  ⚪ ${varName}: Not set in either (OK)`);
    } else if (!inStaging) {
      console.log(`  ⚠️  ${varName}: Only in production`);
    } else if (!inProduction) {
      console.log(`  ⚠️  ${varName}: Only in staging`);
    }
  });

  // Find variables in one environment but not the other (excluding environment-specific)
  const stagingOnly = stagingVars.filter(
    v => !productionVars.includes(v) &&
         !REQUIRED_VARS.includes(v) &&
         !OPTIONAL_VARS.includes(v) &&
         !ENVIRONMENT_SPECIFIC.includes(v)
  );

  const productionOnly = productionVars.filter(
    v => !stagingVars.includes(v) &&
         !REQUIRED_VARS.includes(v) &&
         !OPTIONAL_VARS.includes(v) &&
         !ENVIRONMENT_SPECIFIC.includes(v)
  );

  if (stagingOnly.length > 0) {
    console.log('\n⚠️  Variables only in STAGING:');
    stagingOnly.forEach(v => console.log(`  - ${v}`));
  }

  if (productionOnly.length > 0) {
    console.log('\n⚠️  Variables only in PRODUCTION:');
    productionOnly.forEach(v => console.log(`  - ${v}`));
  }

  // Summary
  console.log('\n' + '='.repeat(50));

  if (hasIssues) {
    console.error('\n❌ Environment parity check FAILED');
    console.error('Required variables are missing or inconsistent between environments.\n');
    process.exit(1);
  }

  if (stagingOnly.length > 0 || productionOnly.length > 0) {
    console.warn('\n⚠️  Environment parity check completed with WARNINGS');
    console.warn('Some variables differ between environments. This may be intentional.\n');
    process.exit(0);
  }

  console.log('\n✅ Environment parity check PASSED');
  console.log('All required variables are present in both environments.\n');
  process.exit(0);
}

// Handle interrupts
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Check interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Check terminated');
  process.exit(143);
});

// Run check
checkParity();
