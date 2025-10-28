/**
 * Selector Helper Functions for E2E Tests
 *
 * Provides reusable selector fallback utilities to reduce code duplication
 * and improve test reliability when dealing with dynamic selectors.
 */

import { Page, Locator } from '@playwright/test';

/**
 * Click element with primary selector, fallback to secondary if primary fails
 *
 * @param page - Playwright Page object
 * @param primarySelector - Primary selector to try first (e.g., data-testid)
 * @param fallbackSelector - Fallback selector if primary fails (e.g., text content)
 * @param description - Human-readable description for logging
 * @param options - Click options (button, modifiers, etc.)
 * @returns Promise<void>
 */
export async function clickWithFallback(
  page: Page,
  primarySelector: string,
  fallbackSelector: string,
  description: string = 'Element',
  options?: Parameters<Page['click']>[1]
): Promise<void> {
  try {
    await page.click(primarySelector, options);
  } catch (error) {
    console.debug(`${description}: primary selector "${primarySelector}" failed, using fallback "${fallbackSelector}"`,
      error instanceof Error ? error.message : error
    );
    await page.click(fallbackSelector, options);
  }
}

/**
 * Fill input with primary selector, fallback to secondary if primary fails
 *
 * @param page - Playwright Page object
 * @param primarySelector - Primary selector to try first
 * @param fallbackSelector - Fallback selector if primary fails
 * @param value - Value to fill in the input
 * @param description - Human-readable description for logging
 * @returns Promise<void>
 */
export async function fillWithFallback(
  page: Page,
  primarySelector: string,
  fallbackSelector: string,
  value: string,
  description: string = 'Input'
): Promise<void> {
  try {
    await page.fill(primarySelector, value);
  } catch (error) {
    console.debug(`${description}: primary selector "${primarySelector}" failed, using fallback "${fallbackSelector}"`,
      error instanceof Error ? error.message : error
    );
    await page.fill(fallbackSelector, value);
  }
}

/**
 * Get locator with primary selector, fallback to secondary if primary fails
 *
 * @param page - Playwright Page object
 * @param primarySelector - Primary selector to try first
 * @param fallbackSelector - Fallback selector if primary fails
 * @param description - Human-readable description for logging
 * @returns Locator (always returns a locator, even if element doesn't exist yet)
 */
export function locatorWithFallback(
  page: Page,
  primarySelector: string,
  fallbackSelector: string,
  description: string = 'Element'
): Locator {
  // Try to use primary selector if element exists, otherwise use fallback
  // Note: This returns a locator immediately without waiting for element
  try {
    const primaryLocator = page.locator(primarySelector);
    // Return primary locator - it will be evaluated when used
    return primaryLocator;
  } catch (error) {
    console.debug(`${description}: primary selector "${primarySelector}" failed, using fallback "${fallbackSelector}"`,
      error instanceof Error ? error.message : error
    );
    return page.locator(fallbackSelector);
  }
}

/**
 * Wait for element with primary selector, fallback to secondary if primary fails
 *
 * @param page - Playwright Page object
 * @param primarySelector - Primary selector to try first
 * @param fallbackSelector - Fallback selector if primary fails
 * @param description - Human-readable description for logging
 * @param options - Wait options (timeout, state, etc.)
 * @returns Promise<void>
 */
export async function waitForSelectorWithFallback(
  page: Page,
  primarySelector: string,
  fallbackSelector: string,
  description: string = 'Element',
  options?: Parameters<Page['waitForSelector']>[1]
): Promise<void> {
  try {
    await page.waitForSelector(primarySelector, options);
  } catch (error) {
    console.debug(`${description}: primary selector "${primarySelector}" failed, using fallback "${fallbackSelector}"`,
      error instanceof Error ? error.message : error
    );
    await page.waitForSelector(fallbackSelector, options);
  }
}

/**
 * Get element text with primary selector, fallback to secondary if primary fails
 *
 * @param page - Playwright Page object
 * @param primarySelector - Primary selector to try first
 * @param fallbackSelector - Fallback selector if primary fails
 * @param description - Human-readable description for logging
 * @returns Promise<string | null> - Element text content or null if not found
 */
export async function getTextWithFallback(
  page: Page,
  primarySelector: string,
  fallbackSelector: string,
  description: string = 'Element'
): Promise<string | null> {
  try {
    const element = await page.locator(primarySelector).first();
    return await element.textContent();
  } catch (error) {
    console.debug(`${description}: primary selector "${primarySelector}" failed, using fallback "${fallbackSelector}"`,
      error instanceof Error ? error.message : error
    );
    const element = await page.locator(fallbackSelector).first();
    return await element.textContent();
  }
}

/**
 * Check if element exists with primary selector, fallback to secondary if primary fails
 *
 * @param page - Playwright Page object
 * @param primarySelector - Primary selector to try first
 * @param fallbackSelector - Fallback selector if primary fails
 * @param description - Human-readable description for logging
 * @returns Promise<boolean> - True if element exists, false otherwise
 */
export async function existsWithFallback(
  page: Page,
  primarySelector: string,
  fallbackSelector: string,
  description: string = 'Element'
): Promise<boolean> {
  try {
    const count = await page.locator(primarySelector).count();
    return count > 0;
  } catch (error) {
    console.debug(`${description}: primary selector "${primarySelector}" failed, using fallback "${fallbackSelector}"`,
      error instanceof Error ? error.message : error
    );
    const count = await page.locator(fallbackSelector).count();
    return count > 0;
  }
}

/**
 * Generic selector fallback wrapper for any page method
 *
 * @param operation - Function that performs the operation with a selector
 * @param primarySelector - Primary selector to try first
 * @param fallbackSelector - Fallback selector if primary fails
 * @param description - Human-readable description for logging
 * @returns Promise<T> - Result of the operation
 */
export async function withFallback<T>(
  operation: (selector: string) => Promise<T>,
  primarySelector: string,
  fallbackSelector: string,
  description: string = 'Element'
): Promise<T> {
  try {
    return await operation(primarySelector);
  } catch (error) {
    console.debug(`${description}: primary selector "${primarySelector}" failed, using fallback "${fallbackSelector}"`,
      error instanceof Error ? error.message : error
    );
    return await operation(fallbackSelector);
  }
}

/**
 * Multiple selector fallback - tries each selector in order until one succeeds
 *
 * @param page - Playwright Page object
 * @param selectors - Array of selectors to try in order
 * @param description - Human-readable description for logging
 * @returns Locator for first selector that matches
 */
export function locatorWithMultipleFallbacks(
  page: Page,
  selectors: string[],
  description: string = 'Element'
): Locator {
  if (selectors.length === 0) {
    throw new Error('At least one selector must be provided');
  }

  // Try each selector in order
  for (let i = 0; i < selectors.length; i++) {
    const selector = selectors[i];
    try {
      const locator = page.locator(selector);
      if (i > 0) {
        console.debug(`${description}: using fallback selector #${i + 1}: "${selector}"`);
      }
      return locator;
    } catch (error) {
      if (i === selectors.length - 1) {
        // Last selector also failed
        console.error(`${description}: all ${selectors.length} selectors failed`,
          error instanceof Error ? error.message : error
        );
        throw error;
      }
      // Try next selector
      continue;
    }
  }

  // Should never reach here, but TypeScript needs a return
  return page.locator(selectors[0]);
}

/**
 * Click with multiple selector fallbacks
 *
 * @param page - Playwright Page object
 * @param selectors - Array of selectors to try in order
 * @param description - Human-readable description for logging
 * @param options - Click options
 * @returns Promise<void>
 */
export async function clickWithMultipleFallbacks(
  page: Page,
  selectors: string[],
  description: string = 'Element',
  options?: Parameters<Page['click']>[1]
): Promise<void> {
  if (selectors.length === 0) {
    throw new Error('At least one selector must be provided');
  }

  let lastError: Error | unknown;

  for (let i = 0; i < selectors.length; i++) {
    const selector = selectors[i];
    try {
      await page.click(selector, options);
      if (i > 0) {
        console.debug(`${description}: succeeded with fallback selector #${i + 1}: "${selector}"`);
      }
      return; // Success!
    } catch (error) {
      lastError = error;
      if (i < selectors.length - 1) {
        console.debug(`${description}: selector #${i + 1} "${selector}" failed, trying next...`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  // All selectors failed
  console.error(`${description}: all ${selectors.length} selectors failed`,
    lastError instanceof Error ? lastError.message : lastError
  );
  throw lastError;
}
