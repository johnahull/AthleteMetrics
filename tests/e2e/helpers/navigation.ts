/**
 * Navigation Helper Functions for E2E Tests
 *
 * Provides reusable navigation utilities for Playwright tests
 */

import { Page, expect } from '@playwright/test';
import { clickWithMultipleFallbacks } from './selectors';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

/**
 * Navigate to a specific route
 *
 * @param page - Playwright Page object
 * @param route - Route path (e.g., '/athletes', '/dashboard')
 * @param waitForLoad - Whether to wait for network idle (default: true)
 * @returns Promise<void>
 */
export async function navigateTo(page: Page, route: string, waitForLoad: boolean = true): Promise<void> {
  const url = route.startsWith('http') ? route : `${STAGING_URL}${route}`;
  await page.goto(url, { timeout: 60000 }); // Increase timeout to 60s for slow pages

  if (waitForLoad) {
    // Wait for DOM content first, then try networkidle with timeout fallback
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {
      console.warn(`networkidle timeout for ${route}, continuing anyway`);
    });
  }
}

/**
 * Switch organization context
 *
 * @param page - Playwright Page object
 * @param orgName - Organization name to switch to
 * @returns Promise<void>
 */
export async function switchOrganization(page: Page, orgName: string): Promise<void> {
  // Try multiple selector strategies for organization switcher
  const selectors = [
    '[data-testid="org-selector"]',
    '[data-testid="organization-selector"]',
    'select[name="organization"]',
    '[aria-label="Select Organization"]',
  ];

  let switched = false;

  for (const selector of selectors) {
    try {
      const element = await page.waitForSelector(selector, { timeout: 2000 });

      if (element) {
        // Check if it's a select element
        const tagName = await element.evaluate(el => el.tagName.toLowerCase());

        if (tagName === 'select') {
          await element.selectOption({ label: orgName });
        } else {
          // Assume it's a dropdown/combobox
          await element.click();
          await page.click(`text="${orgName}"`);
        }

        // Wait for page to update after switching
        await page.waitForLoadState('networkidle');
        switched = true;
        break;
      }
    } catch {
      // Continue to next selector
    }
  }

  if (!switched) {
    throw new Error(`Could not find organization selector to switch to "${orgName}"`);
  }
}

/**
 * Get current organization from UI
 *
 * @param page - Playwright Page object
 * @returns Promise<string | null> - Organization name or null if not found
 */
export async function getCurrentOrganization(page: Page): Promise<string | null> {
  const selectors = [
    '[data-testid="org-selector"]',
    '[data-testid="current-organization"]',
    'select[name="organization"]',
  ];

  for (const selector of selectors) {
    try {
      const element = await page.waitForSelector(selector, { timeout: 2000 });

      if (element) {
        const tagName = await element.evaluate(el => el.tagName.toLowerCase());

        if (tagName === 'select') {
          return await element.evaluate((el: HTMLSelectElement) => {
            return el.options[el.selectedIndex]?.text || null;
          });
        } else {
          return await element.textContent();
        }
      }
    } catch {
      // Continue to next selector
    }
  }

  return null;
}

/**
 * Wait for page to fully load
 * Waits for network idle and DOM content loaded
 *
 * @param page - Playwright Page object
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns Promise<void>
 */
export async function waitForPageLoad(page: Page, timeout: number = 30000): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout });
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Click navigation link by text
 *
 * @param page - Playwright Page object
 * @param linkText - Text of the navigation link
 * @returns Promise<void>
 */
export async function clickNavLink(page: Page, linkText: string): Promise<void> {
  const selectors = [
    `[data-testid="nav-${linkText.toLowerCase().replace(/\s+/g, '-')}"]`,
    `nav a:has-text("${linkText}")`,
    `[role="navigation"] a:has-text("${linkText}")`,
    `a:has-text("${linkText}")`,
  ];

  await clickWithMultipleFallbacks(
    page,
    selectors,
    `Navigation link "${linkText}"`,
    { timeout: 2000 }
  );

  await waitForPageLoad(page);
}

/**
 * Navigate to dashboard
 *
 * @param page - Playwright Page object
 * @returns Promise<void>
 */
export async function goToDashboard(page: Page): Promise<void> {
  await navigateTo(page, '/dashboard');
}

/**
 * Navigate to athletes page
 *
 * @param page - Playwright Page object
 * @returns Promise<void>
 */
export async function goToAthletes(page: Page): Promise<void> {
  await navigateTo(page, '/athletes');
}

/**
 * Navigate to teams page
 *
 * @param page - Playwright Page object
 * @returns Promise<void>
 */
export async function goToTeams(page: Page): Promise<void> {
  await navigateTo(page, '/teams');
}

/**
 * Navigate to data entry page
 *
 * @param page - Playwright Page object
 * @returns Promise<void>
 */
export async function goToDataEntry(page: Page): Promise<void> {
  await navigateTo(page, '/data-entry');
}

/**
 * Navigate to analytics page
 *
 * @param page - Playwright Page object
 * @returns Promise<void>
 */
export async function goToAnalytics(page: Page): Promise<void> {
  await navigateTo(page, '/analytics');
}

/**
 * Navigate to import/export functionality
 *
 * Import/Export is now a tab within the Data Entry page.
 * This function navigates to Data Entry with the import tab selected
 * and waits for the lazy-loaded content to appear.
 *
 * @param page - Playwright Page object
 * @returns Promise<void>
 */
export async function goToImportExport(page: Page): Promise<void> {
  await navigateTo(page, '/data-entry?tab=import');
  // Wait for the lazy-loaded Import/Export content to appear
  await page.waitForSelector('[data-testid="file-drop-zone"]', { timeout: 15000 });
}

/**
 * Navigate to organizations page
 *
 * @param page - Playwright Page object
 * @returns Promise<void>
 */
export async function goToOrganizations(page: Page): Promise<void> {
  await navigateTo(page, '/organizations');
}

/**
 * Navigate to specific athlete profile
 *
 * @param page - Playwright Page object
 * @param athleteId - Athlete ID
 * @returns Promise<void>
 */
export async function goToAthleteProfile(page: Page, athleteId: string): Promise<void> {
  await navigateTo(page, `/athletes/${athleteId}`);
}

/**
 * Navigate to specific team page
 *
 * @param page - Playwright Page object
 * @param teamId - Team ID
 * @returns Promise<void>
 */
export async function goToTeamPage(page: Page, teamId: string): Promise<void> {
  await navigateTo(page, `/teams/${teamId}`);
}

/**
 * Navigate to specific organization profile
 *
 * @param page - Playwright Page object
 * @param organizationId - Organization ID
 * @returns Promise<void>
 */
export async function goToOrganizationProfile(page: Page, organizationId: string): Promise<void> {
  await navigateTo(page, `/organizations/${organizationId}`);
}

/**
 * Wait for navigation to complete
 * Useful after clicking links or buttons that trigger navigation
 *
 * @param page - Playwright Page object
 * @param timeout - Timeout in milliseconds (default: 30000)
 * @returns Promise<void>
 */
export async function waitForNavigation(page: Page, timeout: number = 30000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Verify current URL matches expected path
 *
 * @param page - Playwright Page object
 * @param expectedPath - Expected path (can be string or regex)
 * @returns Promise<void>
 */
export async function expectCurrentUrl(page: Page, expectedPath: string | RegExp): Promise<void> {
  if (typeof expectedPath === 'string') {
    expect(page.url()).toContain(expectedPath);
  } else {
    await expect(page).toHaveURL(expectedPath);
  }
}

/**
 * Get current page URL
 *
 * @param page - Playwright Page object
 * @returns string - Current URL
 */
export function getCurrentUrl(page: Page): string {
  return page.url();
}

/**
 * Reload current page
 *
 * @param page - Playwright Page object
 * @param waitForLoad - Whether to wait for network idle (default: true)
 * @returns Promise<void>
 */
export async function reloadPage(page: Page, waitForLoad: boolean = true): Promise<void> {
  await page.reload();

  if (waitForLoad) {
    await waitForPageLoad(page);
  }
}

/**
 * Go back in browser history
 *
 * @param page - Playwright Page object
 * @param waitForLoad - Whether to wait for network idle (default: true)
 * @returns Promise<void>
 */
export async function goBack(page: Page, waitForLoad: boolean = true): Promise<void> {
  await page.goBack();

  if (waitForLoad) {
    await waitForPageLoad(page);
  }
}

/**
 * Go forward in browser history
 *
 * @param page - Playwright Page object
 * @param waitForLoad - Whether to wait for network idle (default: true)
 * @returns Promise<void>
 */
export async function goForward(page: Page, waitForLoad: boolean = true): Promise<void> {
  await page.goForward();

  if (waitForLoad) {
    await waitForPageLoad(page);
  }
}
