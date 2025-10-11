#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 *
 * Validates that all required environment variables are present
 * before deployment to Railway staging or production.
 */

const REQUIRED_VARS = {
  // Core environment variables
  NODE_ENV: {
    required: true,
    description: 'Node environment (development, staging, production)',
    validator: (val) => ['development', 'staging', 'production'].includes(val)
  },
  PORT: {
    required: true,
    description: 'Server port',
    validator: (val) => !isNaN(parseInt(val)) && parseInt(val) > 0
  },

  // Database
  DATABASE_URL: {
    required: true,
    description: 'PostgreSQL connection string',
    validator: (val) => val.startsWith('postgresql://') || val.startsWith('postgres://')
  },

  // Authentication
  SESSION_SECRET: {
    required: true,
    description: 'Session encryption secret',
    validator: (val) => val.length >= 32
  },
  ADMIN_EMAIL: {
    required: true,
    description: 'Admin email'
  },
  ADMIN_PASSWORD: {
    required: true,
    description: 'Admin password',
    validator: (val) => val.length >= 12
  },

  // Email service
  SENDGRID_API_KEY: {
    required: false,
    description: 'SendGrid API key',
    validator: (val) => !val || val.startsWith('SG.')
  },
  SENDGRID_FROM_EMAIL: {
    required: false,
    description: 'Email sender address'
  },
  SENDGRID_FROM_NAME: {
    required: false,
    description: 'Email sender name'
  },

  // Application
  APP_URL: {
    required: true,
    description: 'Application URL',
    validator: (val) => val.startsWith('http://') || val.startsWith('https://')
  }
};

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

function validateEnv() {
  console.log('🔍 Validating environment variables...\n');

  const environment = process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || 'unknown';
  console.log(`Environment: ${environment}\n`);

  let hasErrors = false;
  let hasWarnings = false;

  // Check required variables
  for (const [varName, config] of Object.entries(REQUIRED_VARS)) {
    const value = process.env[varName];

    if (!value) {
      if (config.required) {
        console.error(`❌ ERROR: ${varName} is required but not set`);
        console.error(`   Description: ${config.description}`);
        hasErrors = true;
      } else {
        console.warn(`⚠️  WARNING: ${varName} is not set (optional)`);
        console.warn(`   Description: ${config.description}`);
        hasWarnings = true;
      }
      continue;
    }

    // Validate value if validator exists
    if (config.validator && !config.validator(value)) {
      console.error(`❌ ERROR: ${varName} has invalid value`);
      console.error(`   Description: ${config.description}`);
      hasErrors = true;
      continue;
    }

    // Mask sensitive values in output
    const maskedValue = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN'].some(s => varName.includes(s))
      ? '***'
      : value;

    console.log(`✅ ${varName}: ${maskedValue}`);
  }

  // Production-specific validations
  if (environment === 'production') {
    console.log('\n🔒 Running production-specific validations...\n');

    // Ensure NODE_ENV is production
    if (process.env.NODE_ENV !== 'production') {
      console.error('❌ ERROR: NODE_ENV must be "production" in production environment');
      hasErrors = true;
    }

    // Ensure SESSION_SECRET is strong
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
      console.error('❌ ERROR: SESSION_SECRET must be at least 32 characters in production');
      hasErrors = true;
    }

    // Ensure ADMIN_PASSWORD is not default
    if (process.env.ADMIN_PASSWORD === 'password' || process.env.ADMIN_PASSWORD === 'admin' || process.env.ADMIN_PASSWORD === 'admin-password-123') {
      console.error('❌ ERROR: ADMIN_PASSWORD must not be a default value in production');
      hasErrors = true;
    }

    // Ensure APP_URL is HTTPS
    if (process.env.APP_URL && !process.env.APP_URL.startsWith('https://')) {
      console.error('❌ ERROR: APP_URL must use HTTPS in production');
      hasErrors = true;
    }

    // Warn if rate limit bypasses are enabled
    if (process.env.BYPASS_ANALYTICS_RATE_LIMIT === 'true' || process.env.BYPASS_GENERAL_RATE_LIMIT === 'true') {
      console.error('❌ ERROR: Rate limit bypasses must be disabled in production');
      hasErrors = true;
    }
  }

  // Show optional variables that are set
  console.log('\n📋 Optional variables:\n');
  OPTIONAL_VARS.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`✅ ${varName}: ${value}`);
    }
  });

  // Summary
  console.log('\n' + '='.repeat(50));

  if (hasErrors) {
    console.error('\n❌ Validation FAILED - Required environment variables are missing or invalid');
    console.error('Please fix the errors above before deploying.\n');
    process.exit(1);
  }

  if (hasWarnings) {
    console.warn('\n⚠️  Validation completed with WARNINGS');
    console.warn('Some optional variables are not set. This may be intentional.\n');
  } else {
    console.log('\n✅ Validation PASSED - All required environment variables are present and valid\n');
  }

  process.exit(0);
}

// Run validation
validateEnv();
