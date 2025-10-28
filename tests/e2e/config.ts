/**
 * Shared E2E Test Configuration
 *
 * Centralizes environment detection and base URL configuration to avoid duplication
 * across test files and helper utilities.
 *
 * Usage:
 * import { BASE_URL, ENV_NAME, isTesting } from './config';
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
