/**
 * Shared E2E Test Configuration
 *
 * Centralizes environment detection and base URL configuration to avoid duplication
 * across test files and helper utilities.
 *
 * Usage:
 * import { BASE_URL, ENV_NAME, isTesting, getEnvironmentConfig } from './config';
 */

// Auto-detect environment based on which environment variables are set
// Priority: TESTING_* > STAGING_*
export const isTesting = !!process.env.TESTING_URL || !!process.env.TESTING_USERNAME;

// Environment name for logging and debugging
export const ENV_NAME = isTesting ? 'TESTING' : 'STAGING';

// Base URL for the application under test
export const BASE_URL = isTesting
  ? (process.env.TESTING_URL || 'https://athletemetrics-testing.up.railway.app')
  : (process.env.STAGING_URL || 'http://localhost:5000');

// Export individual environment URLs for backward compatibility
export const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';
export const TESTING_URL = process.env.TESTING_URL || 'https://athletemetrics-testing.up.railway.app';

/**
 * Get environment-specific configuration
 * Centralizes environment detection logic to avoid duplication
 */
export function getEnvironmentConfig() {
  const isTesting = !!process.env.TESTING_URL || !!process.env.TESTING_USERNAME;
  const ENV_NAME = isTesting ? 'TESTING' : 'STAGING';

  return {
    isTesting,
    ENV_NAME,
    // Environment-specific test data names to prevent conflicts
    E2E_ORG_NAME: `E2E Test Organization (${ENV_NAME})`,
    E2E_SECOND_ORG_NAME: `E2E Test Organization 2 (${ENV_NAME})`,
    E2E_TEAM_NAME: `E2E Test Team (${ENV_NAME})`,
    // URLs
    TARGET_URL: isTesting
      ? (process.env.TESTING_URL || 'https://athletemetrics-testing-testing.up.railway.app')
      : (process.env.STAGING_URL || 'http://localhost:5000'),
    // Credentials
    TARGET_USERNAME: isTesting
      ? (process.env.TESTING_USERNAME || '')
      : (process.env.STAGING_USERNAME || ''),
    TARGET_PASSWORD: isTesting
      ? (process.env.TESTING_PASSWORD || '')
      : (process.env.STAGING_PASSWORD || ''),
    // Database URL
    DATABASE_URL: isTesting
      ? process.env.TESTING_DATABASE_URL
      : process.env.DATABASE_URL,
  };
}
