/**
 * Athlete Helper Functions for E2E Tests
 */

import { Page } from '@playwright/test';
import { goToAthletes } from './navigation';
import { clickWithFallback, fillWithFallback } from './selectors';

/**
 * Create athlete via UI
 */
export async function createAthlete(page: Page, athleteData: {
  firstName: string;
  lastName: string;
  email: string;
  birthDate?: string;
  school?: string;
  sport?: string;
  position?: string;
  gender?: string;
}): Promise<void> {
  await goToAthletes(page);

  await clickWithFallback(
    page,
    '[data-testid="add-athlete-button"]',
    'button:has-text("Add Athlete")',
    'Add athlete button',
    { timeout: 5000 }
  );

  // Fill form
  await fillWithFallback(page, '[data-testid="athlete-first-name"]', '[name="firstName"]', athleteData.firstName, 'First name');
  await fillWithFallback(page, '[data-testid="athlete-last-name"]', '[name="lastName"]', athleteData.lastName, 'Last name');
  if (athleteData.email) await fillWithFallback(page, '[data-testid="athlete-email"]', '[name="email"]', athleteData.email, 'Email');
  if (athleteData.birthDate) await fillWithFallback(page, '[data-testid="athlete-birth-date"]', '[name="birthDate"]', athleteData.birthDate, 'Birth date');
  if (athleteData.school) await fillWithFallback(page, '[data-testid="athlete-school"]', '[name="school"]', athleteData.school, 'School');
  if (athleteData.sport) await page.selectOption('[name="sport"]', athleteData.sport);
  if (athleteData.position) await fillWithFallback(page, '[data-testid="athlete-position"]', '[name="position"]', athleteData.position, 'Position');
  if (athleteData.gender) await page.selectOption('[name="gender"]', athleteData.gender);

  // Submit
  await clickWithFallback(
    page,
    '[data-testid="submit-athlete"]',
    'button[type="submit"]',
    'Submit athlete button',
    { timeout: 5000 }
  );

  await page.waitForLoadState('networkidle');
}

/**
 * Edit athlete
 */
export async function editAthlete(page: Page, athleteName: string, updates: Record<string, string>): Promise<void> {
  await goToAthletes(page);

  await clickWithFallback(
    page,
    `tr:has-text("${athleteName}") [data-testid="edit-athlete"]`,
    `tr:has-text("${athleteName}") button:has-text("Edit")`,
    `Edit button for ${athleteName}`
  );

  for (const [field, value] of Object.entries(updates)) {
    // Note: Could be enhanced with fillWithFallback if testid attributes are added
    await page.fill(`[name="${field}"]`, value);
  }

  await clickWithFallback(
    page,
    '[data-testid="submit-athlete"]',
    'button[type="submit"]',
    'Submit athlete button'
  );

  await page.waitForLoadState('networkidle');
}

/**
 * Delete athlete
 */
export async function deleteAthlete(page: Page, athleteName: string): Promise<void> {
  await goToAthletes(page);

  await clickWithFallback(
    page,
    `tr:has-text("${athleteName}") [data-testid="delete-athlete"]`,
    `tr:has-text("${athleteName}") button:has-text("Delete")`,
    `Delete button for ${athleteName}`
  );

  // Confirm deletion
  await clickWithFallback(
    page,
    '[data-testid="confirm-delete"]',
    'button:has-text("Confirm")',
    'Confirm delete button'
  );

  await page.waitForLoadState('networkidle');
}

/**
 * Search for athlete
 */
export async function searchAthlete(page: Page, searchTerm: string): Promise<void> {
  await goToAthletes(page);

  await fillWithFallback(
    page,
    '[data-testid="athlete-search"]',
    'input[placeholder*="Search" i]',
    searchTerm,
    'Athlete search input'
  );

  await page.waitForLoadState('networkidle');
}

/**
 * Go to athlete profile
 */
export async function goToAthleteProfile(page: Page, athleteName: string): Promise<void> {
  await goToAthletes(page);

  await clickWithFallback(
    page,
    `tr:has-text("${athleteName}") [data-testid="view-athlete"]`,
    `tr:has-text("${athleteName}") a, tr:has-text("${athleteName}") button:has-text("View")`,
    `View profile link for ${athleteName}`
  );

  await page.waitForLoadState('networkidle');
}
