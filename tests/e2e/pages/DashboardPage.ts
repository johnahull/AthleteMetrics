/**
 * Dashboard Page Object Model
 */

import { Page } from '@playwright/test';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

export class DashboardPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(`${STAGING_URL}/dashboard`);
    await this.page.waitForLoadState('networkidle');
  }

  async isLoaded(): Promise<boolean> {
    return this.page.url().includes('/dashboard');
  }

  async navigate(route: string): Promise<void> {
    const linkText = route.charAt(0).toUpperCase() + route.slice(1);
    await this.page.click(`nav a:has-text("${linkText}")`);
    await this.page.waitForLoadState('networkidle');
  }

  async switchOrganization(orgName: string): Promise<void> {
    const selector = '[data-testid="org-selector"]';
    await this.page.selectOption(selector, { label: orgName }).catch(async () => {
      await this.page.click(selector);
      await this.page.click(`text="${orgName}"`);
    });
    await this.page.waitForLoadState('networkidle');
  }

  async logout(): Promise<void> {
    await this.page.click('[data-testid="logout-button"]').catch(() =>
      this.page.click('button:has-text("Logout")')
    );
  }

  async getCurrentUser(): Promise<string | null> {
    try {
      const element = await this.page.waitForSelector('[data-testid="current-user"]', { timeout: 2000 });
      return await element.textContent();
    } catch {
      return null;
    }
  }
}
