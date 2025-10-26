/**
 * Athlete Helper Functions for E2E Tests
 */

import { Page } from '@playwright/test';
import { goToAthletes } from './navigation';

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
  await page.click('[data-testid="add-athlete-button"]', { timeout: 5000 }).catch((err) => {
    console.debug('Add athlete button testid not found, using text selector', err);
    return page.click('button:has-text("Add Athlete")');
  });

  // Fill form
  await page.fill('[name="firstName"]', athleteData.firstName);
  await page.fill('[name="lastName"]', athleteData.lastName);
  if (athleteData.email) await page.fill('[name="email"]', athleteData.email);
  if (athleteData.birthDate) await page.fill('[name="birthDate"]', athleteData.birthDate);
  if (athleteData.school) await page.fill('[name="school"]', athleteData.school);
  if (athleteData.sport) await page.selectOption('[name="sport"]', athleteData.sport);
  if (athleteData.position) await page.fill('[name="position"]', athleteData.position);
  if (athleteData.gender) await page.selectOption('[name="gender"]', athleteData.gender);

  // Submit
  await page.click('[data-testid="submit-athlete"]', { timeout: 5000 }).catch((err) => {
    console.debug('Submit athlete button testid not found, using type selector', err);
    return page.click('button[type="submit"]');
  });

  await page.waitForLoadState('networkidle');
}

/**
 * Edit athlete
 */
export async function editAthlete(page: Page, athleteName: string, updates: Record<string, string>): Promise<void> {
  await goToAthletes(page);
  await page.click(`tr:has-text("${athleteName}") [data-testid="edit-athlete"]`).catch(() =>
    page.click(`tr:has-text("${athleteName}") button:has-text("Edit")`)
  );

  for (const [field, value] of Object.entries(updates)) {
    await page.fill(`[name="${field}"]`, value);
  }

  await page.click('[data-testid="submit-athlete"]').catch(() =>
    page.click('button[type="submit"]')
  );

  await page.waitForLoadState('networkidle');
}

/**
 * Delete athlete
 */
export async function deleteAthlete(page: Page, athleteName: string): Promise<void> {
  await goToAthletes(page);
  await page.click(`tr:has-text("${athleteName}") [data-testid="delete-athlete"]`).catch(() =>
    page.click(`tr:has-text("${athleteName}") button:has-text("Delete")`)
  );

  // Confirm deletion
  await page.click('[data-testid="confirm-delete"]').catch(() =>
    page.click('button:has-text("Confirm")')
  );

  await page.waitForLoadState('networkidle');
}

/**
 * Search for athlete
 */
export async function searchAthlete(page: Page, searchTerm: string): Promise<void> {
  await goToAthletes(page);
  await page.fill('[data-testid="athlete-search"]', searchTerm).catch(() =>
    page.fill('input[placeholder*="Search" i]', searchTerm)
  );
  await page.waitForLoadState('networkidle');
}

/**
 * Go to athlete profile
 */
export async function goToAthleteProfile(page: Page, athleteName: string): Promise<void> {
  await goToAthletes(page);
  await page.click(`tr:has-text("${athleteName}") a, tr:has-text("${athleteName}") button:has-text("View")`);
  await page.waitForLoadState('networkidle');
}
