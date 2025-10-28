/**
 * Shared E2E Test Constants
 *
 * Centralizes timeout values, retry configuration, and other constants used across E2E tests.
 * This improves maintainability and ensures consistent timing across the test suite.
 */

// ============================================================================
// Animation and Rendering Timeouts
// ============================================================================

/**
 * CSS transition timeout for UI animations
 * Used for: Modal fade-in/out, color transitions, dropdown animations
 * Typical CSS transition duration: 200-300ms, we wait 500ms for safety
 */
export const CSS_TRANSITION_TIMEOUT = 500;

/**
 * Chart.js animation timeout
 * Used for: Chart rendering with default Chart.js animation duration (1000ms)
 * Chart.js animations complete in ~1000ms by default
 */
export const CHART_ANIMATION_TIMEOUT = 1000;

/**
 * Chart.js render timeout (animation + processing)
 * Used for: Charts with complex data or slower devices
 * Includes animation (1000ms) + data processing overhead
 */
export const CHART_RENDER_TIMEOUT = 2000;

/**
 * Form validation feedback timeout
 * Used for: Waiting for validation error messages to appear
 * Validation typically completes in 100-200ms, we wait 500ms for safety
 */
export const FORM_VALIDATION_TIMEOUT = 500;

// ============================================================================
// Network and Navigation Timeouts
// ============================================================================

/**
 * React SPA mount timeout
 * Used for: Waiting for React components to mount after page load
 * React apps can take 5-10s on slow connections to fully mount
 */
export const LOGIN_FORM_MOUNT_TIMEOUT = 30000;

/**
 * Client-side navigation timeout
 * Used for: Waiting for React Router or Wouter navigation to complete
 * Client-side navigation typically completes in 1-3s
 */
export const PAGE_NAVIGATION_TIMEOUT = 10000;

/**
 * Network idle timeout
 * Used for: Waiting for all network requests to complete
 * Useful for pages with multiple API calls or lazy-loaded components
 */
export const NETWORK_IDLE_TIMEOUT = 5000;

/**
 * Element visibility timeout
 * Used for: Default timeout for waiting for elements to become visible
 * Balances between quick feedback and reliability
 */
export const ELEMENT_VISIBILITY_TIMEOUT = 5000;

// ============================================================================
// Database Operation Retry Configuration
// ============================================================================

/**
 * Maximum number of retry attempts for database operations
 * Used in: global-setup.ts and global-teardown.ts
 */
export const DB_MAX_RETRIES = 3;

/**
 * Base delay for database retry (exponential backoff)
 * Delays: 1s, 2s, 4s for retries 1, 2, 3
 * Used in: global-setup.ts and global-teardown.ts
 */
export const DB_RETRY_BASE_DELAY_MS = 1000;

/**
 * Database connection timeout
 * Used in: postgres client configuration
 */
export const DB_CONNECT_TIMEOUT_SECONDS = 30;

/**
 * Database idle timeout for cleanup scripts
 * Used in: global-setup.ts and global-teardown.ts (short-lived scripts)
 */
export const DB_IDLE_TIMEOUT_SECONDS = 10;

// ============================================================================
// Visual Regression Testing
// ============================================================================

/**
 * Maximum pixel difference tolerance for non-chart screenshots
 * Used for: Static UI elements (forms, tables, modals)
 * Lower tolerance = stricter visual regression detection
 */
export const VISUAL_DIFF_TOLERANCE_STANDARD = 100;

/**
 * Maximum pixel difference tolerance for chart screenshots
 * Used for: Chart.js canvas elements
 * Charts have higher tolerance due to Canvas rendering variations
 */
export const VISUAL_DIFF_TOLERANCE_CHARTS = 150;

/**
 * Maximum pixel difference tolerance for complex page screenshots
 * Used for: Full-page screenshots with multiple components
 * Higher tolerance accounts for layout shifts and component rendering
 */
export const VISUAL_DIFF_TOLERANCE_COMPLEX_PAGE = 150;

/**
 * Maximum pixel difference tolerance for analytics/dashboard pages
 * Used for: Pages with multiple charts and dynamic content
 * Highest tolerance due to Canvas rendering + data-driven variations
 */
export const VISUAL_DIFF_TOLERANCE_ANALYTICS = 200;

// ============================================================================
// Test Data Patterns
// ============================================================================

/**
 * Test data name patterns for identifying test records
 * Used in: global-teardown.ts for cleanup
 */
export const TEST_DATA_PATTERNS = {
  /** Matches: Test1234567890, TestAthlete1703087654 */
  timestamp: /^Test\w*\d{10,}/,
  /** Matches: Test, TestAthlete, TestUser */
  testPrefix: /^Test/,
  /** Matches: test123@example.com, test1@test.com */
  testEmail: /test\d+@/,
  /** Test email domains for cleanup */
  testDomains: ['@test.com', '@example.com'],
} as const;

// ============================================================================
// Environment Configuration
// ============================================================================

/**
 * Default staging URL for local development
 */
export const DEFAULT_STAGING_URL = 'http://localhost:5000';

/**
 * Default testing environment URL
 */
export const DEFAULT_TESTING_URL = 'https://athletemetrics-testing-testing.up.railway.app';
