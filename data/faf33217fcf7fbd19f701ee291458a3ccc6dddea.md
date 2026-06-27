# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: offline-functionality.spec.ts >> Offline Functionality >> should show offline indicator when connection is lost
- Location: tests/e2e/offline-functionality.spec.ts:10:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('[data-testid="offline-indicator"]')
Expected pattern: /offline/i
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('[data-testid="offline-indicator"]')

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { loginAsDefaultUser } from './helpers/auth';
  3   | 
  4   | test.describe('Offline Functionality', () => {
  5   |   test.beforeEach(async ({ page }) => {
  6   |     // Use auth helper that handles storageState and proper selectors
  7   |     await loginAsDefaultUser(page);
  8   |   });
  9   | 
  10  |   test('should show offline indicator when connection is lost', async ({ page, context }) => {
  11  |     await page.goto('/dashboard');
  12  | 
  13  |     // Simulate offline
  14  |     await context.setOffline(true);
  15  | 
  16  |     // Wait for offline indicator to appear (replaced hard-coded timeout)
  17  |     const offlineIndicator = page.locator('[data-testid="offline-indicator"]');
  18  |     await expect(offlineIndicator).toBeVisible({ timeout: 3000 });
> 19  |     await expect(offlineIndicator).toContainText(/offline/i);
      |                                    ^ Error: expect(locator).toContainText(expected) failed
  20  |   });
  21  | 
  22  |   test('should show online indicator when connection is restored', async ({ page, context }) => {
  23  |     await page.goto('/dashboard');
  24  | 
  25  |     // Go offline first
  26  |     await context.setOffline(true);
  27  |     const offlineIndicator = page.locator('[data-testid="offline-indicator"]');
  28  |     await expect(offlineIndicator).toBeVisible({ timeout: 3000 });
  29  | 
  30  |     // Go back online
  31  |     await context.setOffline(false);
  32  | 
  33  |     // Wait for connection state to update
  34  |     await page.waitForFunction(() => navigator.onLine, { timeout: 3000 });
  35  | 
  36  |     // Should show online indicator or hide offline indicator
  37  |     const isVisible = await offlineIndicator.isVisible().catch(() => false);
  38  | 
  39  |     if (isVisible) {
  40  |       // If visible, should show "online" or "connected"
  41  |       await expect(offlineIndicator).toContainText(/online|connected|synced/i, { timeout: 3000 });
  42  |     }
  43  |   });
  44  | 
  45  |   test('should queue measurements when offline', async ({ page, context }) => {
  46  |     await page.goto('/data-entry');
  47  |     await page.waitForLoadState('networkidle');
  48  | 
  49  |     // Go offline
  50  |     await context.setOffline(true);
  51  |     await page.waitForFunction(() => !navigator.onLine, { timeout: 3000 });
  52  | 
  53  |     // Try to add a measurement
  54  |     const valueInput = page.locator('input[type="number"]').first();
  55  |     if (await valueInput.isVisible()) {
  56  |       await valueInput.fill('10.5');
  57  | 
  58  |       // Look for submit/save button
  59  |       const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Add")').first();
  60  |       if (await submitButton.isVisible()) {
  61  |         await submitButton.click();
  62  | 
  63  |         // Wait for queue indicator to update (replaced hard-coded timeout)
  64  |         const queueIndicator = page.locator('[data-testid="offline-queue-count"]');
  65  |         const isQueueVisible = await queueIndicator.isVisible().catch(() => false);
  66  | 
  67  |         if (isQueueVisible) {
  68  |           await expect(queueIndicator).toContainText(/1|pending|queued/i, { timeout: 3000 });
  69  |         }
  70  |       }
  71  |     }
  72  |   });
  73  | 
  74  |   test('should sync queued measurements when back online', async ({ page, context }) => {
  75  |     await page.goto('/data-entry');
  76  |     await page.waitForLoadState('networkidle');
  77  | 
  78  |     // Go offline and add measurement
  79  |     await context.setOffline(true);
  80  |     await page.waitForFunction(() => !navigator.onLine, { timeout: 3000 });
  81  | 
  82  |     const valueInput = page.locator('input[type="number"]').first();
  83  |     if (await valueInput.isVisible()) {
  84  |       await valueInput.fill('10.5');
  85  | 
  86  |       const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Add")').first();
  87  |       if (await submitButton.isVisible()) {
  88  |         await submitButton.click();
  89  | 
  90  |         // Wait for form submission to process
  91  |         await page.waitForLoadState('networkidle');
  92  |       }
  93  |     }
  94  | 
  95  |     // Set up network monitoring BEFORE going online
  96  |     const syncApiCallPromise = page.waitForResponse(
  97  |       response => response.url().includes('/api/measurements') && response.request().method() === 'POST',
  98  |       { timeout: 15000 }
  99  |     ).catch(() => null); // Don't fail if no sync call (might not have queued data)
  100 | 
  101 |     // Go back online
  102 |     await context.setOffline(false);
  103 |     await page.waitForFunction(() => navigator.onLine, { timeout: 3000 });
  104 | 
  105 |     // Verify sync API call was made (network monitoring)
  106 |     const syncResponse = await syncApiCallPromise;
  107 |     if (syncResponse) {
  108 |       // Verify successful sync
  109 |       expect(syncResponse.status()).toBe(200);
  110 |     }
  111 | 
  112 |     // Wait for sync to complete by monitoring queue/sync indicators
  113 |     const queueIndicator = page.locator('[data-testid="offline-queue-count"]');
  114 |     const syncIndicator = page.locator('[data-testid="sync-status"]');
  115 | 
  116 |     const queueVisible = await queueIndicator.isVisible().catch(() => false);
  117 |     const syncVisible = await syncIndicator.isVisible().catch(() => false);
  118 | 
  119 |     if (queueVisible) {
```