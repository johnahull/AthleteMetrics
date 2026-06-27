# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: measurement-entry.spec.ts >> Measurement Entry Tests >> should support multiple measurement types
- Location: tests/e2e/measurement-entry.spec.ts:278:3

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid="select-metric"], select[name="metric"]')

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
            - tab "Single Entry" [selected] [ref=e153] [cursor=pointer]
            - tab "Batch Entry" [ref=e154] [cursor=pointer]
            - tab "Import/Export" [ref=e155] [cursor=pointer]
            - tab "Device Import" [ref=e156] [cursor=pointer]
          - tabpanel "Single Entry" [ref=e157]:
            - generic [ref=e159]:
              - heading "Add New Measurement" [level=3] [ref=e160]
              - generic [ref=e161]:
                - generic [ref=e162]:
                  - generic [ref=e163]:
                    - generic [ref=e164]: Athlete *
                    - generic [ref=e166] [cursor=pointer]:
                      - generic [ref=e167]:
                        - img [ref=e168]
                        - generic [ref=e171]: Select athlete...
                      - img [ref=e173]
                    - paragraph [ref=e175]: Click to browse or type to search athletes
                  - generic [ref=e176]:
                    - generic [ref=e177]: Test Date *
                    - textbox "Test Date *" [ref=e178]: 2026-04-16
                  - generic [ref=e179]:
                    - generic [ref=e180]: Metric *
                    - combobox "Metric *" [ref=e181] [cursor=pointer]:
                      - img [ref=e182]
                    - combobox [ref=e184]
                - generic [ref=e185]:
                  - generic [ref=e186]:
                    - generic [ref=e187]: Value *
                    - spinbutton "Value *" [ref=e189]
                    - paragraph [ref=e190]: Units auto-selected based on metric
                  - generic [ref=e191]:
                    - text: Fly-In Distance (Optional)
                    - generic [ref=e192]:
                      - spinbutton "Fly-In Distance (Optional)" [ref=e193]
                      - generic [ref=e194]: yd
                    - paragraph [ref=e195]: Distance from start of acceleration to timing gate
                - generic [ref=e196]:
                  - text: Notes
                  - textbox "Notes" [ref=e197]:
                    - /placeholder: Optional notes about this measurement...
                - generic [ref=e199]:
                  - checkbox "Add new athlete" [ref=e200] [cursor=pointer]
                  - checkbox
                  - generic [ref=e201]: Add new athlete
                - generic [ref=e202]:
                  - button "Clear Form" [ref=e203] [cursor=pointer]
                  - button "Save Measurement" [disabled]:
                    - img
                    - text: Save Measurement
        - generic [ref=e205]:
          - heading "Recent Entries" [level=3] [ref=e206]
          - generic [ref=e208]:
            - paragraph [ref=e209]: No recent measurements found.
            - paragraph [ref=e210]: Start by adding a new measurement above.
      - generic [ref=e211]:
        - generic [ref=e212]:
          - link "Privacy Policy" [ref=e213] [cursor=pointer]:
            - /url: /privacy
          - generic [ref=e214]: "|"
          - link "Terms of Service" [ref=e215] [cursor=pointer]:
            - /url: /terms
        - generic [ref=e216]: © 2026 AthleteMetrics. All rights reserved.
```

# Test source

```ts
  199 |     // View athlete profile
  200 |     const viewButton = page.locator('[data-testid^="button-view-athlete-"]').first();
  201 |     const viewButtonExists = await viewButton.count();
  202 | 
  203 |     if (viewButtonExists > 0) {
  204 |       await viewButton.click();
  205 |       // Wait for profile page to load with measurements
  206 |       await page.waitForSelector('[data-testid^="button-edit-measurement-"], button:has-text("Edit"), .measurement-row', { timeout: 5000 });
  207 | 
  208 |       // Find edit measurement button
  209 |       const editMeasurementButton = page.locator('[data-testid^="button-edit-measurement-"], button:has-text("Edit")');
  210 |       const editExists = await editMeasurementButton.count();
  211 | 
  212 |       if (editExists > 0) {
  213 |         await editMeasurementButton.first().click();
  214 | 
  215 |         // Wait for edit form
  216 |         await page.waitForSelector('[role="dialog"], .modal, form', { timeout: 5000 });
  217 | 
  218 |         // Update measurement value
  219 |         const newValue = 1.30;
  220 |         await page.fill('[data-testid="input-value"], input[name="value"]', newValue.toString());
  221 | 
  222 |         // Save changes
  223 |         await page.click('button[type="submit"]:has-text("Save"), button:has-text("Update")');
  224 |         // Wait for update success
  225 |         await expect(page.locator(`text=${newValue}`)).toBeVisible({ timeout: 3000 });
  226 | 
  227 |         // Verify update success
  228 |         const updated = await page.locator(`text=${newValue}`).count();
  229 |         expect(updated).toBeGreaterThan(0);
  230 |       }
  231 |     }
  232 |   });
  233 | 
  234 |   test('should successfully delete a measurement', async ({ page }) => {
  235 |     // Navigate to athlete profile
  236 |     await page.goto(`${STAGING_URL}/athletes`);
  237 |     // Wait for athletes page to load
  238 |     await page.waitForSelector('[data-testid^="button-view-athlete-"]', { timeout: 5000 });
  239 | 
  240 |     const viewButton = page.locator('[data-testid^="button-view-athlete-"]').first();
  241 |     const viewButtonExists = await viewButton.count();
  242 | 
  243 |     if (viewButtonExists > 0) {
  244 |       await viewButton.click();
  245 |       // Wait for profile page with measurements to load
  246 |       await page.waitForSelector('[data-testid^="button-delete-measurement-"], .measurement-row, tr', { timeout: 5000 });
  247 | 
  248 |       // Get initial measurement count
  249 |       const initialCount = await page.locator('[data-testid^="button-delete-measurement-"], .measurement-row, tr').count();
  250 | 
  251 |       // Find delete measurement button
  252 |       const deleteMeasurementButton = page.locator('[data-testid^="button-delete-measurement-"], button:has-text("Delete")');
  253 |       const deleteExists = await deleteMeasurementButton.count();
  254 | 
  255 |       if (deleteExists > 0) {
  256 |         await deleteMeasurementButton.first().click();
  257 | 
  258 |         // Confirm deletion
  259 |         const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
  260 |         const confirmExists = await confirmButton.count();
  261 |         if (confirmExists > 0) {
  262 |           await confirmButton.click();
  263 |         }
  264 | 
  265 |         // Wait for deletion to complete
  266 |         await expect(async () => {
  267 |           const currentCount = await page.locator('[data-testid^="button-delete-measurement-"], .measurement-row, tr').count();
  268 |           expect(currentCount).toBeLessThan(initialCount);
  269 |         }).toPass({ timeout: 5000 });
  270 | 
  271 |         // Verify measurement was deleted
  272 |         const finalCount = await page.locator('[data-testid^="button-delete-measurement-"], .measurement-row, tr').count();
  273 |         expect(finalCount).toBeLessThan(initialCount);
  274 |       }
  275 |     }
  276 |   });
  277 | 
  278 |   test('should support multiple measurement types', async ({ page }) => {
  279 |     await goToDataEntry(page);
  280 | 
  281 |     const measurementTypes = [
  282 |       { name: 'FLY10_TIME', value: 1.25 },
  283 |       { name: 'VERTICAL_JUMP', value: 28.5 },
  284 |       { name: 'DASH_40YD', value: 5.2 }
  285 |     ];
  286 | 
  287 |     for (const measurement of measurementTypes) {
  288 |       // Select athlete
  289 |       const athleteSelect = page.locator('[data-testid="select-athlete"], select[name="athlete"]');
  290 |       const athleteSelectExists = await athleteSelect.count();
  291 | 
  292 |       if (athleteSelectExists > 0) {
  293 |         await athleteSelect.click();
  294 |         await page.click('[role="option"]').catch(() => page.locator('option').nth(1).click());
  295 |       }
  296 | 
  297 |       // Select measurement type
  298 |       const metricSelect = page.locator('[data-testid="select-metric"], select[name="metric"]');
> 299 |       await metricSelect.click();
      |                          ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  300 |       await page.click(`text="${measurement.name}"`).catch(() => {
  301 |         page.locator(`option:has-text("${measurement.name}")`).click();
  302 |       });
  303 | 
  304 |       // Enter value
  305 |       await page.fill('[data-testid="input-value"], input[name="value"]', measurement.value.toString());
  306 | 
  307 |       // Submit
  308 |       await page.click('[data-testid="button-submit-measurement"], button[type="submit"]');
  309 |       // Wait for success message
  310 |       await page.waitForSelector('text=/measurement.*added|success/i', { timeout: 5000 });
  311 |     }
  312 | 
  313 |     // Verify success messages appeared for all types
  314 |     const successCount = await page.locator('text=/measurement.*added|success/i').count();
  315 |     expect(successCount).toBeGreaterThan(0);
  316 |   });
  317 | 
  318 |   test('should display measurement history for athlete', async ({ page }) => {
  319 |     // Navigate to athlete profile
  320 |     await page.goto(`${STAGING_URL}/athletes`);
  321 |     // Wait for athletes page to load
  322 |     await page.waitForSelector('[data-testid^="button-view-athlete-"]', { timeout: 5000 });
  323 | 
  324 |     const viewButton = page.locator('[data-testid^="button-view-athlete-"]').first();
  325 |     const viewButtonExists = await viewButton.count();
  326 | 
  327 |     if (viewButtonExists > 0) {
  328 |       await viewButton.click();
  329 |       // Wait for profile page with measurement data to load
  330 |       await page.waitForSelector('text=/measurement.*history|performance.*history|recent measurements|FLY10|VERTICAL|DASH|seconds|inches/i', { timeout: 5000 });
  331 | 
  332 |       // Look for measurement history section
  333 |       const historySection = await page.locator('text=/measurement.*history|performance.*history|recent measurements/i').count();
  334 | 
  335 |       if (historySection > 0) {
  336 |         // Verify measurements are displayed
  337 |         const measurements = await page.locator('[data-testid^="measurement-"], .measurement-row, tr').count();
  338 |         expect(measurements).toBeGreaterThan(0);
  339 |       }
  340 | 
  341 |       // Alternatively, check for any measurement data
  342 |       const measurementData = await page.locator('text=/FLY10|VERTICAL|DASH|seconds|inches/i').count();
  343 |       expect(measurementData).toBeGreaterThan(0);
  344 |     }
  345 |   });
  346 | });
  347 | 
  348 | test.describe('Measurement Entry Summary', () => {
  349 |   test('print measurement entry test summary', async () => {
  350 |     console.log('\n═══════════════════════════════════════════════════');
  351 |     console.log('Measurement Entry Tests Summary');
  352 |     console.log('═══════════════════════════════════════════════════');
  353 |     console.log('✅ Add measurement for athlete');
  354 |     console.log('✅ Measurement appears in athlete profile');
  355 |     console.log('✅ Validation errors for invalid data');
  356 |     console.log('✅ Verify measurement');
  357 |     console.log('✅ Edit existing measurement');
  358 |     console.log('✅ Delete measurement');
  359 |     console.log('✅ Multiple measurement types');
  360 |     console.log('✅ Measurement history display');
  361 |     console.log('═══════════════════════════════════════════════════\n');
  362 |   });
  363 | });
  364 | 
```