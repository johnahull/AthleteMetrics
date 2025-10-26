/**
 * Athletes Page Object Model
 */

import { Page, expect } from '@playwright/test';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

export class AthletesPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(`${STAGING_URL}/athletes`);
    await this.page.waitForLoadState('networkidle');
  }

  async clickAddAthlete(): Promise<void> {
    await this.page.click('[data-testid="add-athlete-button"]').catch(() =>
      this.page.click('button:has-text("Add Athlete")')
    );
  }

  async fillAthleteForm(data: {
    firstName: string;
    lastName: string;
    email?: string;
    birthDate?: string;
    school?: string;
    sport?: string;
    position?: string;
    gender?: string;
  }): Promise<void> {
    await this.page.fill('[name="firstName"]', data.firstName);
    await this.page.fill('[name="lastName"]', data.lastName);
    
    if (data.email) await this.page.fill('[name="email"]', data.email);
    if (data.birthDate) await this.page.fill('[name="birthDate"]', data.birthDate);
    if (data.school) await this.page.fill('[name="school"]', data.school);
    if (data.sport) await this.page.selectOption('[name="sport"]', data.sport);
    if (data.position) await this.page.fill('[name="position"]', data.position);
    if (data.gender) await this.page.selectOption('[name="gender"]', data.gender);
  }

  async submitAthleteForm(): Promise<void> {
    await this.page.click('[data-testid="submit-athlete"]').catch(() =>
      this.page.click('button[type="submit"]')
    );
    await this.page.waitForLoadState('networkidle');
  }

  async searchAthlete(name: string): Promise<void> {
    await this.page.fill('[data-testid="athlete-search"]', name).catch(() =>
      this.page.fill('input[placeholder*="Search" i]', name)
    );
    await this.page.waitForTimeout(500);
  }

  async clickEditAthlete(athleteName: string): Promise<void> {
    await this.page.click(`tr:has-text("${athleteName}") [data-testid="edit-athlete"]`).catch(() =>
      this.page.click(`tr:has-text("${athleteName}") button:has-text("Edit")`)
    );
  }

  async clickDeleteAthlete(athleteName: string): Promise<void> {
    await this.page.click(`tr:has-text("${athleteName}") [data-testid="delete-athlete"]`).catch(() =>
      this.page.click(`tr:has-text("${athleteName}") button:has-text("Delete")`)
    );
  }

  async confirmDelete(): Promise<void> {
    await this.page.click('[data-testid="confirm-delete"]').catch(() =>
      this.page.click('button:has-text("Confirm")')
    );
    await this.page.waitForLoadState('networkidle');
  }

  async selectAthletes(athleteNames: string[]): Promise<void> {
    for (const name of athleteNames) {
      await this.page.check(`tr:has-text("${name}") input[type="checkbox"]`);
    }
  }

  async clickBulkDelete(): Promise<void> {
    await this.page.click('[data-testid="bulk-delete-button"]').catch(() =>
      this.page.click('button:has-text("Delete Selected")')
    );
  }

  async isAthleteInList(athleteName: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(`tr:has-text("${athleteName}")`, { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async getValidationErrors(): Promise<string[]> {
    const errors = await this.page.locator('.error, [role="alert"]').all();
    const errorTexts: string[] = [];
    for (const error of errors) {
      const text = await error.textContent();
      if (text) errorTexts.push(text);
    }
    return errorTexts;
  }
}
