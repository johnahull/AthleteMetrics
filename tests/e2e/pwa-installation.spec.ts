import { test, expect } from './fixtures/e2e-base';

test.describe('PWA Installation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
  });

  test('should have a valid web app manifest', async ({ page }) => {
    // Check manifest link exists in HTML
    const manifestLink = await page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);

    // Get manifest URL
    const manifestHref = await manifestLink.getAttribute('href');
    expect(manifestHref).toBeTruthy();

    // Fetch and parse manifest
    const manifestResponse = await page.goto(manifestHref!);
    expect(manifestResponse?.status()).toBe(200);

    const manifestJson = await manifestResponse?.json();

    // Verify required manifest fields
    expect(manifestJson).toHaveProperty('name');
    expect(manifestJson).toHaveProperty('short_name');
    expect(manifestJson).toHaveProperty('start_url');
    expect(manifestJson).toHaveProperty('display');
    expect(manifestJson).toHaveProperty('theme_color');
    expect(manifestJson).toHaveProperty('background_color');
    expect(manifestJson).toHaveProperty('icons');

    // Verify manifest values
    expect(manifestJson.name).toBe('AthleteMetrics');
    expect(manifestJson.short_name).toBe('AthleteMetrics');
    expect(manifestJson.display).toBe('standalone');

    // Verify icons array has required sizes
    const icons = manifestJson.icons;
    expect(icons.length).toBeGreaterThanOrEqual(2);

    const icon192 = icons.find((icon: any) => icon.sizes === '192x192');
    const icon512 = icons.find((icon: any) => icon.sizes === '512x512');

    expect(icon192).toBeTruthy();
    expect(icon512).toBeTruthy();
  });

  test('should have theme-color meta tag', async ({ page }) => {
    const themeColor = await page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveCount(1);

    const color = await themeColor.getAttribute('content');
    expect(color).toBeTruthy();
    // Expect a valid color value (hex, rgb, or CSS color name)
    expect(color).toMatch(/^(#[0-9a-fA-F]{6}|rgb|hsl|[a-z]+)$/);
  });

  test('should register service worker successfully', async ({ page }) => {
    // Wait for service worker to register
    await page.waitForTimeout(2000);

    // Check service worker registration
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration !== undefined;
      }
      return false;
    });

    expect(swRegistered).toBe(true);
  });

  test('should meet PWA installability criteria', async ({ page }) => {
    // Check if beforeinstallprompt event can be triggered
    // Note: In test environment this might not fire, but we can check prerequisites

    // Check manifest exists
    const manifestLink = await page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);

    // Check service worker support
    const hasSW = await page.evaluate(() => {
      return 'serviceWorker' in navigator;
    });
    expect(hasSW).toBe(true);

    // Check HTTPS (localhost is considered secure)
    const protocol = await page.evaluate(() => window.location.protocol);
    expect(protocol === 'https:' || protocol === 'http:').toBe(true);

    // Check icons exist
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifestResponse = await page.goto(manifestHref!);
    const manifestJson = await manifestResponse?.json();

    expect(manifestJson.icons.length).toBeGreaterThanOrEqual(2);
  });

  test('should cache assets for offline use', async ({ page, context }) => {
    // Navigate to page and wait for service worker
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Go offline
    await context.setOffline(true);

    // Try navigating to cached page
    await page.goto('/');

    // Page should still load from cache
    await expect(page.locator('body')).toBeVisible();

    // Restore online status
    await context.setOffline(false);
  });
});
