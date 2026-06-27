# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: batch-measurement-entry.spec.ts >> Batch Measurement Entry Tests >> should show row-specific errors after failed save
- Location: tests/e2e/batch-measurement-entry.spec.ts:463:3

# Error details

```
TimeoutError: locator.selectOption: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid^="batch-row-"]').first().locator('select').first()
    - locator resolved to <select data-testid="batch-athlete-0" name="measurements.0.athleteId" class="w-full p-2 border rounded ">…</select>
  - attempting select option action
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
    - waiting 20ms
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
      - waiting 100ms
    30 × waiting for element to be visible and enabled
       - did not find some options
     - retrying select option action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e6]:
      - img [ref=e8]
      - generic [ref=e10]:
        - generic [ref=e11]:
          - heading "AthleteMetrics" [level=1] [ref=e12]
          - generic [ref=e13]: BETA
        - paragraph [ref=e14]: Analytics Platform
    - navigation [ref=e15]:
      - link "Dashboard" [ref=e16] [cursor=pointer]:
        - /url: /
        - generic [ref=e17]:
          - img [ref=e18]
          - generic [ref=e23]: Dashboard
      - link "Organizations" [ref=e24] [cursor=pointer]:
        - /url: /organizations
        - generic [ref=e25]:
          - img [ref=e26]
          - generic [ref=e30]: Organizations
      - link "User Management" [ref=e31] [cursor=pointer]:
        - /url: /user-management
        - generic [ref=e32]:
          - img [ref=e33]
          - generic [ref=e45]: User Management
      - link "Global Athletes" [ref=e46] [cursor=pointer]:
        - /url: /global-athletes
        - generic [ref=e47]:
          - img [ref=e48]
          - generic [ref=e51]: Global Athletes
      - link "Measurements" [ref=e52] [cursor=pointer]:
        - /url: /admin/measurements
        - generic [ref=e53]:
          - img [ref=e54]
          - generic [ref=e56]: Measurements
      - link "Wellness Templates" [ref=e57] [cursor=pointer]:
        - /url: /wellness-templates
        - generic [ref=e58]:
          - img [ref=e59]
          - generic [ref=e63]: Wellness Templates
      - link "Metrics" [ref=e64] [cursor=pointer]:
        - /url: /metrics
        - generic [ref=e65]:
          - img [ref=e66]
          - generic [ref=e69]: Metrics
      - link "Sports" [ref=e70] [cursor=pointer]:
        - /url: /sports
        - generic [ref=e71]:
          - img [ref=e72]
          - generic [ref=e78]: Sports
      - link "Benchmarks" [ref=e79] [cursor=pointer]:
        - /url: /benchmarks
        - generic [ref=e80]:
          - img [ref=e81]
          - generic [ref=e85]: Benchmarks
      - link "Site Settings" [ref=e86] [cursor=pointer]:
        - /url: /admin
        - generic [ref=e87]:
          - img [ref=e88]
          - generic [ref=e91]: Site Settings
    - generic [ref=e92]:
      - generic [ref=e93]:
        - generic [ref=e94]:
          - img [ref=e95]
          - generic [ref=e98]:
            - paragraph [ref=e99]: E2E OrgAdmin
            - paragraph [ref=e100]: site admin
        - button [ref=e101] [cursor=pointer]:
          - img [ref=e102]
      - link "Profile" [ref=e105] [cursor=pointer]:
        - /url: /profile
        - generic [ref=e106]:
          - img [ref=e107]
          - generic [ref=e110]: Profile
      - link "Notifications" [ref=e111] [cursor=pointer]:
        - /url: /notification-settings
        - generic [ref=e112]:
          - img [ref=e113]
          - generic [ref=e116]: Notifications
      - button "Sign Out" [ref=e117] [cursor=pointer]:
        - img [ref=e118]
        - generic [ref=e121]: Sign Out
    - generic [ref=e123]:
      - paragraph [ref=e124]: Organization Context
      - paragraph [ref=e125]: E2E Test Organization 2
      - button "← Back to Site View" [ref=e126] [cursor=pointer]
  - main [ref=e127]:
    - generic [ref=e128]:
      - button "Toggle menu" [ref=e129] [cursor=pointer]:
        - img
        - generic [ref=e130]: Hide Menu
      - generic [ref=e131]:
        - generic [ref=e133]:
          - img [ref=e134]
          - generic [ref=e138]: Online
        - generic [ref=e139]: AthleteMetrics
        - generic [ref=e140]:
          - generic [ref=e141]:
            - generic [ref=e142]: Welcome,
            - generic [ref=e143]: E2E
          - button "Logout" [ref=e144] [cursor=pointer]:
            - img
            - generic [ref=e145]: Logout
    - generic [ref=e146]:
      - region "Notifications (F8)":
        - list
      - generic [ref=e148]:
        - heading "Data Entry" [level=1] [ref=e150]
        - generic [ref=e151]:
          - tablist [ref=e152]:
            - tab "Single Entry" [ref=e153] [cursor=pointer]
            - tab "Batch Entry" [selected] [ref=e154] [cursor=pointer]
            - tab "Import/Export" [ref=e155] [cursor=pointer]
            - tab "Device Import" [ref=e156] [cursor=pointer]
          - tabpanel "Batch Entry" [ref=e157]:
            - generic [ref=e158]:
              - generic [ref=e159]:
                - generic [ref=e160]: Batch Measurement Entry
                - generic [ref=e161]: Enter measurements for multiple athletes at once
              - generic [ref=e162]:
                - generic [ref=e163]:
                  - button "Quick Setup" [ref=e164] [cursor=pointer]:
                    - img
                    - text: Quick Setup
                  - button "Add Row" [ref=e165] [cursor=pointer]:
                    - img
                    - text: Add Row
                  - button "Copy Previous Row" [ref=e166] [cursor=pointer]:
                    - img
                    - text: Copy Previous Row
                  - button "Clear All" [ref=e167] [cursor=pointer]:
                    - img
                    - text: Clear All
                  - button "Save All" [ref=e169] [cursor=pointer]:
                    - img
                    - text: Save All
                - table [ref=e171]:
                  - rowgroup [ref=e172]:
                    - row "Athlete Date Metric Value Notes Actions" [ref=e173]:
                      - columnheader "Athlete" [ref=e174]
                      - columnheader "Date" [ref=e175]
                      - columnheader "Metric" [ref=e176]
                      - columnheader "Value" [ref=e177]
                      - columnheader "Notes" [ref=e178]
                      - columnheader "Actions" [ref=e179]
                  - rowgroup [ref=e180]:
                    - row "Select athlete... 2026-04-16" [ref=e181]:
                      - cell "Select athlete..." [ref=e182]:
                        - combobox [ref=e184]:
                          - option "Select athlete..." [selected]
                      - cell "2026-04-16" [ref=e185]:
                        - textbox [ref=e187]: 2026-04-16
                      - cell [ref=e188]:
                        - combobox [ref=e190]
                      - cell [ref=e191]:
                        - spinbutton [ref=e193]: "0"
                      - cell [ref=e194]:
                        - textbox "Optional notes..." [ref=e195]
                      - cell [ref=e196]:
                        - button [ref=e197] [cursor=pointer]:
                          - img
                    - row "Select athlete... 2026-04-16" [ref=e198]:
                      - cell "Select athlete..." [ref=e199]:
                        - combobox [active] [ref=e201]:
                          - option "Select athlete..." [selected]
                      - cell "2026-04-16" [ref=e202]:
                        - textbox [ref=e204]: 2026-04-16
                      - cell [ref=e205]:
                        - combobox [ref=e207]
                      - cell [ref=e208]:
                        - spinbutton [ref=e210]: "0"
                      - cell [ref=e211]:
                        - textbox "Optional notes..." [ref=e212]
                      - cell [ref=e213]:
                        - button [ref=e214] [cursor=pointer]:
                          - img
                - generic [ref=e215]: 2 rows
        - generic [ref=e217]:
          - heading "Recent Entries" [level=3] [ref=e218]
          - generic [ref=e220]:
            - paragraph [ref=e221]: No recent measurements found.
            - paragraph [ref=e222]: Start by adding a new measurement above.
      - generic [ref=e223]:
        - generic [ref=e224]:
          - link "Privacy Policy" [ref=e225] [cursor=pointer]:
            - /url: /privacy
          - generic [ref=e226]: "|"
          - link "Terms of Service" [ref=e227] [cursor=pointer]:
            - /url: /terms
        - generic [ref=e228]: © 2026 AthleteMetrics. All rights reserved.
```

# Test source

```ts
  373 |     const batchErrorLocator = page.locator('.error, [role="alert"]').or(page.locator('text=/required|invalid|must/i'));
  374 |     await batchErrorLocator.first().waitFor({ timeout: 5000 });
  375 | 
  376 |     // Should show validation errors
  377 |     const errors = await batchErrorLocator.count();
  378 |     expect(errors).toBeGreaterThan(0);
  379 |   });
  380 | 
  381 |   test('should clear all rows when requested', async ({ page }) => {
  382 |     await navigateToBatchEntry(page);
  383 | 
  384 |     // Add 3 rows
  385 |     const addRowButton = page.locator('[data-testid="batch-add-row"], button:has-text("Add Row")');
  386 |     await addRowButton.click();
  387 |     await addRowButton.click();
  388 |     await addRowButton.click();
  389 | 
  390 |     const initialCount = await page.locator('[data-testid^="batch-row-"]').count();
  391 |     expect(initialCount).toBeGreaterThanOrEqual(3);
  392 | 
  393 |     // Click clear all button
  394 |     const clearButton = page.locator('[data-testid="batch-clear-all"], button:has-text("Clear All")');
  395 |     const hasClearButton = await clearButton.count();
  396 | 
  397 |     if (hasClearButton > 0) {
  398 |       await clearButton.click();
  399 | 
  400 |       // Confirm if there's a confirmation dialog
  401 |       const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Clear")');
  402 |       const hasConfirm = await confirmButton.count();
  403 |       if (hasConfirm > 0) {
  404 |         await confirmButton.click();
  405 |       }
  406 | 
  407 |       // Should have 0 rows or show empty state
  408 |       const finalCount = await page.locator('[data-testid^="batch-row-"]').count();
  409 |       expect(finalCount).toBe(0);
  410 |     }
  411 |   });
  412 | 
  413 |   test('should display mobile card view on small screens', async ({ page, viewport }) => {
  414 |     // Set mobile viewport
  415 |     await page.setViewportSize({ width: 375, height: 667 });
  416 | 
  417 |     await navigateToBatchEntry(page);
  418 | 
  419 |     // Add a row
  420 |     const addRowButton = page.locator('[data-testid="batch-add-row"], button:has-text("Add Row")');
  421 |     await addRowButton.click();
  422 | 
  423 |     // Look for card layout instead of table
  424 |     const cardView = page.locator('[data-testid="batch-card-view"], .batch-card, [data-testid^="batch-card-"]');
  425 |     const tableView = page.locator('table, [role="grid"]');
  426 | 
  427 |     const hasCards = await cardView.count();
  428 |     const hasTable = await tableView.count();
  429 | 
  430 |     // Should show cards on mobile, not table
  431 |     // OR table should be responsive/scrollable
  432 |     expect(hasCards > 0 || hasTable > 0).toBeTruthy();
  433 |   });
  434 | 
  435 |   test('should handle batch save errors gracefully', async ({ page }) => {
  436 |     await navigateToBatchEntry(page);
  437 | 
  438 |     // Add a row with invalid data (e.g., negative value)
  439 |     const addRowButton = page.locator('[data-testid="batch-add-row"], button:has-text("Add Row")');
  440 |     await addRowButton.click();
  441 | 
  442 |     const row = page.locator('[data-testid^="batch-row-"]').first();
  443 | 
  444 |     // Select athlete and metric
  445 |     await row.locator('select').first().selectOption({ index: 1 });
  446 |     await row.locator('select').nth(1).selectOption('FLY10_TIME');
  447 | 
  448 |     // Enter invalid value (negative)
  449 |     await row.locator('input[type="number"]').fill('-1.25');
  450 |     await row.locator('input[type="date"]').fill('2025-01-15');
  451 | 
  452 |     // Try to save
  453 |     const saveButton = page.locator('[data-testid="batch-save-all"], button:has-text("Save All")');
  454 |     await saveButton.click();
  455 | 
  456 |     // Should show error message
  457 |     await page.waitForSelector('text=/error|invalid|failed/i', { timeout: 5000 });
  458 | 
  459 |     const errorMessage = await page.locator('text=/error|invalid|failed/i').count();
  460 |     expect(errorMessage).toBeGreaterThan(0);
  461 |   });
  462 | 
  463 |   test('should show row-specific errors after failed save', async ({ page }) => {
  464 |     await navigateToBatchEntry(page);
  465 | 
  466 |     // Add 2 rows - one valid, one invalid
  467 |     const addRowButton = page.locator('[data-testid="batch-add-row"], button:has-text("Add Row")');
  468 |     await addRowButton.click();
  469 |     await addRowButton.click();
  470 | 
  471 |     // Fill first row with valid data
  472 |     const firstRow = page.locator('[data-testid^="batch-row-"]').first();
> 473 |     await firstRow.locator('select').first().selectOption({ index: 1 });
      |                                              ^ TimeoutError: locator.selectOption: Timeout 15000ms exceeded.
  474 |     await firstRow.locator('select').nth(1).selectOption('FLY10_TIME');
  475 |     await firstRow.locator('input[type="number"]').fill('1.25');
  476 |     await firstRow.locator('input[type="date"]').fill('2025-01-15');
  477 | 
  478 |     // Fill second row with missing required field (no athlete)
  479 |     const secondRow = page.locator('[data-testid^="batch-row-"]').nth(1);
  480 |     await secondRow.locator('select').nth(1).selectOption('FLY10_TIME');
  481 |     await secondRow.locator('input[type="number"]').fill('1.30');
  482 |     await secondRow.locator('input[type="date"]').fill('2025-01-15');
  483 | 
  484 |     // Try to save
  485 |     const saveButton = page.locator('[data-testid="batch-save-all"], button:has-text("Save All")');
  486 |     await saveButton.click();
  487 | 
  488 |     // Should show validation error for second row
  489 |     await page.waitForSelector('.error, [role="alert"]', { timeout: 5000 });
  490 | 
  491 |     const errors = await page.locator('.error, [role="alert"]').count();
  492 |     expect(errors).toBeGreaterThan(0);
  493 |   });
  494 | });
  495 | 
  496 | test.describe('Quick Setup Wizard Tests', () => {
  497 | 
  498 |   test.beforeEach(async ({ page }) => {
  499 |     await loginAsDefaultUser(page);
  500 |     await navigateToBatchEntry(page);
  501 |   });
  502 | 
  503 |   test('should open Quick Setup Wizard when button is clicked', async ({ page }) => {
  504 |     // Click Quick Setup Wizard button
  505 |     const wizardButton = page.locator('[data-testid="batch-quick-setup"], button:has-text("Quick Setup")');
  506 |     await wizardButton.click();
  507 | 
  508 |     // Should show wizard dialog
  509 |     await expect(page.locator('[role="dialog"]').filter({ hasText: /quick.*setup|setup.*wizard/i })).toBeVisible();
  510 | 
  511 |     // Should show Step 1 heading
  512 |     await expect(page.locator('text=/step.*1|select.*athletes/i')).toBeVisible();
  513 |   });
  514 | 
  515 |   test('should navigate through wizard steps with Next button', async ({ page }) => {
  516 |     // Open wizard
  517 |     const wizardButton = page.locator('[data-testid="batch-quick-setup"], button:has-text("Quick Setup")');
  518 |     await wizardButton.click();
  519 | 
  520 |     // Step 1: Select at least one athlete
  521 |     const teamCheckbox = page.locator('[data-testid="team-checkbox"]').first();
  522 |     await teamCheckbox.click();
  523 | 
  524 |     // Click Next
  525 |     const nextButton = page.locator('button:has-text("Next")');
  526 |     await nextButton.click();
  527 | 
  528 |     // Should show Step 2
  529 |     await expect(page.locator('text=/step.*2|select.*metric/i')).toBeVisible();
  530 | 
  531 |     // Step 2: Select at least one metric
  532 |     const metricCheckbox = page.locator('[data-testid="metric-checkbox"]').first();
  533 |     await metricCheckbox.click();
  534 | 
  535 |     // Click Next
  536 |     await nextButton.click();
  537 | 
  538 |     // Should show Step 3
  539 |     await expect(page.locator('text=/step.*3|configuration/i')).toBeVisible();
  540 | 
  541 |     // Click Next
  542 |     await nextButton.click();
  543 | 
  544 |     // Should show Step 4 (Review)
  545 |     await expect(page.locator('text=/step.*4|review|summary/i')).toBeVisible();
  546 |   });
  547 | 
  548 |   test('should allow going back to previous steps', async ({ page }) => {
  549 |     // Open wizard and navigate to Step 3
  550 |     const wizardButton = page.locator('[data-testid="batch-quick-setup"], button:has-text("Quick Setup")');
  551 |     await wizardButton.click();
  552 | 
  553 |     const teamCheckbox = page.locator('[data-testid="team-checkbox"]').first();
  554 |     await teamCheckbox.click();
  555 | 
  556 |     const nextButton = page.locator('button:has-text("Next")');
  557 |     await nextButton.click();
  558 | 
  559 |     const metricCheckbox = page.locator('[data-testid="metric-checkbox"]').first();
  560 |     await metricCheckbox.click();
  561 |     await nextButton.click();
  562 | 
  563 |     // Now on Step 3, click Back
  564 |     const backButton = page.locator('button:has-text("Back")');
  565 |     await backButton.click();
  566 | 
  567 |     // Should be back on Step 2
  568 |     await expect(page.locator('text=/step.*2|select.*metric/i')).toBeVisible();
  569 |   });
  570 | 
  571 |   test('should select team and display athletes in Step 1', async ({ page }) => {
  572 |     // Open wizard
  573 |     const wizardButton = page.locator('[data-testid="batch-quick-setup"], button:has-text("Quick Setup")');
```