/**
 * Login Page Object Model
 */

import { Page, expect } from '@playwright/test';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

export class LoginPage {
  constructor(private page: Page) {}

  /**
   * Navigate to login page
   */
  async goto(): Promise<void> {
    await this.page.goto(`${STAGING_URL}/login`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Fill in login credentials and submit
   */
  async login(username: string, password: string): Promise<void> {
    await this.page.fill('input[name="username"]', username);
    await this.page.fill('input[name="password"]', password);
    await this.page.click('button[type="submit"]');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get error message if present
   */
  async getErrorMessage(): Promise<string | null> {
    const selectors = [
      '[data-testid="login-error"]',
      '.error-message',
      '[role="alert"]',
      'text=/Invalid credentials/i',
    ];

    for (const selector of selectors) {
      try {
        const element = await this.page.waitForSelector(selector, { timeout: 2000 });
        if (element) {
          return await element.textContent();
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Check if on login page
   */
  async isLoginPage(): Promise<boolean> {
    return this.page.url().includes('/login');
  }

  /**
   * Verify login page elements are visible
   */
  async expectLoginForm(): Promise<void> {
    await expect(this.page.locator('input[name="username"]')).toBeVisible();
    await expect(this.page.locator('input[name="password"]')).toBeVisible();
    await expect(this.page.locator('button[type="submit"]')).toBeVisible();
  }

  /**
   * Click forgot password link
   */
  async clickForgotPassword(): Promise<void> {
    await this.page.click('a:has-text("Forgot Password")');
  }

  /**
   * Check remember me checkbox
   */
  async checkRememberMe(): Promise<void> {
    await this.page.check('input[name="rememberMe"]');
  }
}
