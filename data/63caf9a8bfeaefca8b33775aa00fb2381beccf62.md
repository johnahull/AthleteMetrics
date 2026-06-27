# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: metric-sport-tags.spec.ts >> Metric Sport Tags - Site Admin Table Display >> should show first 3 sports + overflow indicator for metrics with many sports
- Location: tests/e2e/metric-sport-tags.spec.ts:295:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
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
  - main [ref=e122]:
    - generic [ref=e123]:
      - button "Toggle menu" [ref=e124] [cursor=pointer]:
        - img
        - generic [ref=e125]: Hide Menu
      - generic [ref=e126]:
        - generic [ref=e128]:
          - img [ref=e129]
          - generic [ref=e133]: Online
        - generic [ref=e134]: AthleteMetrics
        - generic [ref=e135]:
          - generic [ref=e136]:
            - generic [ref=e137]: Welcome,
            - generic [ref=e138]: E2E
          - button "Logout" [ref=e139] [cursor=pointer]:
            - img
            - generic [ref=e140]: Logout
    - generic [ref=e141]:
      - region "Notifications (F8)":
        - list
      - generic [ref=e142]:
        - heading "Site Administration" [level=1] [ref=e144]
        - generic [ref=e145]:
          - generic [ref=e146]:
            - generic [ref=e147]:
              - img [ref=e148]
              - text: AI Model Configuration
            - generic [ref=e151]: Select the AI model to use for generating coaching insights
          - generic [ref=e152]:
            - generic [ref=e153]:
              - text: AI Model
              - combobox [ref=e154] [cursor=pointer]:
                - generic [ref=e155]:
                  - generic:
                    - generic:
                      - generic: GPT-5 Nano
                      - generic: $0.05/$0.4 per 1M
                - img [ref=e156]
            - generic [ref=e158]:
              - generic [ref=e159]:
                - generic [ref=e160]: "Selected Model:"
                - generic [ref=e161]: GPT-5 Nano
              - generic [ref=e162]:
                - generic [ref=e163]: "Tier:"
                - generic [ref=e164]: Budget
              - generic [ref=e165]:
                - generic [ref=e166]: "Estimated Cost:"
                - generic [ref=e167]: $0.01 per 100 reports
        - generic [ref=e168]:
          - generic [ref=e169]:
            - generic [ref=e170]:
              - img [ref=e171]
              - text: Wellness Module
            - generic [ref=e173]: Control global access to wellness questionnaires and health tracking
          - generic [ref=e175]:
            - generic [ref=e176]:
              - generic [ref=e177]: Enable Wellness Module
              - generic [ref=e178]: When disabled, wellness features are hidden for all organizations
            - switch [checked] [ref=e179] [cursor=pointer]
        - generic [ref=e180]:
          - generic [ref=e181]:
            - generic [ref=e182]:
              - img [ref=e183]
              - text: Sprint F-V Profiling
            - generic [ref=e185]: Control global access to JB Morin force-velocity sprint profiling
          - generic [ref=e186]:
            - generic [ref=e187]:
              - generic [ref=e188]:
                - generic [ref=e189]: Enable Sprint F-V Profiling
                - generic [ref=e190]: When disabled, force-velocity profiling is hidden for all organizations
              - switch [ref=e191] [cursor=pointer]
            - generic [ref=e192]:
              - img [ref=e193]
              - generic [ref=e195]:
                - paragraph [ref=e196]: Sprint F-V Profiling Disabled
                - paragraph [ref=e197]: All organizations are currently unable to access force-velocity profiling. Organization-level settings are frozen until you re-enable this module.
        - generic [ref=e198]:
          - generic [ref=e199]:
            - generic [ref=e200]:
              - img [ref=e201]
              - text: Global Wellness Templates
            - generic [ref=e204]: Manage system templates that appear in all organizations' wellness libraries
          - generic [ref=e205]:
            - paragraph [ref=e206]: Create and manage global wellness questionnaire templates that all organizations can clone and customize.
            - link "Manage Templates" [ref=e207] [cursor=pointer]:
              - /url: /wellness-templates
        - generic [ref=e208]:
          - generic [ref=e209]:
            - generic [ref=e210]:
              - img [ref=e211]
              - text: Derived Metrics Recalculation
            - generic [ref=e213]: Recalculate all derived metrics using the best trial values
          - generic [ref=e214]:
            - paragraph [ref=e215]: Use this after updating derived metric formulas or fixing calculation logic. This will update all calculated measurements (like Approach Reach, Block Reach, Top Speed) using the best value from multiple trials instead of the last imported value.
            - button "Recalculate All Derived Metrics" [ref=e216] [cursor=pointer]
        - generic [ref=e217]:
          - generic [ref=e218]:
            - generic [ref=e219]:
              - generic [ref=e220]:
                - generic [ref=e221]:
                  - img [ref=e222]
                  - generic [ref=e225]: Global Push Notifications
                - generic [ref=e226]:
                  - img [ref=e227]
                  - text: Enabled
              - generic [ref=e229]: Control push notifications across the entire platform
            - generic [ref=e231]:
              - generic [ref=e232]:
                - text: Enable Push Notifications
                - paragraph [ref=e233]: Master kill switch for all push notifications platform-wide
              - switch "Enable Push Notifications" [checked] [ref=e234] [cursor=pointer]
          - generic [ref=e235]:
            - generic [ref=e236]:
              - generic [ref=e237]:
                - img [ref=e238]
                - generic [ref=e240]: Notification Analytics
              - generic [ref=e241]: Platform-wide notification statistics (last 30 days)
            - generic [ref=e243]:
              - generic [ref=e244]:
                - generic [ref=e245]:
                  - generic [ref=e246]: "0"
                  - paragraph [ref=e247]: Total Subscriptions
                - generic [ref=e248]:
                  - generic [ref=e249]: "0"
                  - paragraph [ref=e250]: Delivered
                - generic [ref=e251]:
                  - generic [ref=e252]: 0%
                  - paragraph [ref=e253]: Click Rate
              - generic [ref=e254]:
                - heading "Notifications by Type" [level=4] [ref=e255]
                - generic [ref=e256]:
                  - generic [ref=e257]:
                    - generic [ref=e258]: Wellness Surveys
                    - generic [ref=e259]: "0"
                  - generic [ref=e260]:
                    - generic [ref=e261]: Wellness Digest
                    - generic [ref=e262]: "0"
                  - generic [ref=e263]:
                    - generic [ref=e264]: Measurements
                    - generic [ref=e265]: "0"
                  - generic [ref=e266]:
                    - generic [ref=e267]: Announcements
                    - generic [ref=e268]: "0"
          - generic [ref=e269]:
            - generic [ref=e270]:
              - generic [ref=e271]:
                - img [ref=e272]
                - generic [ref=e275]: Emergency Broadcast
              - generic [ref=e276]: Send an urgent notification to all users with push enabled
            - button "Send Broadcast" [ref=e278] [cursor=pointer]:
              - img
              - text: Send Broadcast
      - generic [ref=e279]:
        - generic [ref=e280]:
          - link "Privacy Policy" [ref=e281] [cursor=pointer]:
            - /url: /privacy
          - generic [ref=e282]: "|"
          - link "Terms of Service" [ref=e283] [cursor=pointer]:
            - /url: /terms
        - generic [ref=e284]: © 2026 AthleteMetrics. All rights reserved.
```

# Test source

```ts
  201 |     expect(metric.sportAssociations).toContain('SOCCER');
  202 |   });
  203 | 
  204 |   test('should remove sport associations by clearing badges', async ({ page }) => {
  205 |     // Create a metric with sports
  206 |     const testMetric = generateTestMetricWithSports(['SOCCER', 'BASKETBALL']);
  207 |     const createResponse = await page.request.post(`${STAGING_URL}/api/metrics`, {
  208 |       data: testMetric,
  209 |     });
  210 |     expect(createResponse.ok()).toBeTruthy();
  211 |     createdMetricCodes.push(testMetric.code);
  212 | 
  213 |     await page.goto(`${STAGING_URL}/metrics`);
  214 | 
  215 |     // Click edit button
  216 |     await page.click(`[data-testid="edit-metric-${testMetric.code}"]`);
  217 |     await page.waitForSelector('[data-testid="metric-form-dialog"]');
  218 | 
  219 |     // Remove Soccer by clicking the X button
  220 |     await page.click('[data-testid="remove-sport-SOCCER"]');
  221 | 
  222 |     // Remove Basketball
  223 |     await page.click('[data-testid="remove-sport-BASKETBALL"]');
  224 | 
  225 |     // Should show "All Sports" placeholder again
  226 |     await expect(page.locator('[data-testid="sport-multi-select"]')).toContainText('All Sports');
  227 | 
  228 |     // Submit form
  229 |     await page.click('[data-testid="save-metric-button"]');
  230 | 
  231 |     // Wait for success
  232 |     await expect(page.getByText('Metric updated')).toBeVisible({ timeout: 5000 });
  233 | 
  234 |     // Verify sports were removed
  235 |     const response = await page.request.get(`${STAGING_URL}/api/metrics/${testMetric.code}`);
  236 |     const metric = await response.json();
  237 |     expect(metric.sportAssociations === null || metric.sportAssociations?.length === 0).toBeTruthy();
  238 |   });
  239 | });
  240 | 
  241 | test.describe('Metric Sport Tags - Site Admin Table Display', () => {
  242 |   test.beforeEach(async ({ page }) => {
  243 |     await loginAsDefaultUser(page);
  244 |   });
  245 | 
  246 |   test('should display Sports column in metrics table', async ({ page }) => {
  247 |     await page.goto(`${STAGING_URL}/metrics`);
  248 | 
  249 |     // Wait for table
  250 |     await page.waitForSelector('[data-testid="metrics-table"]', { timeout: 5000 });
  251 | 
  252 |     // Should see Sports column header
  253 |     const sportsHeader = page.locator('th:has-text("Sports")');
  254 |     await expect(sportsHeader).toBeVisible();
  255 |   });
  256 | 
  257 |   test('should show "All Sports" badge for default metrics (universal)', async ({ page }) => {
  258 |     await page.goto(`${STAGING_URL}/metrics`);
  259 | 
  260 |     // Wait for table
  261 |     await page.waitForSelector('[data-testid="metrics-table"]', { timeout: 5000 });
  262 | 
  263 |     // Default metrics have null sportAssociations (available to all sports)
  264 |     const fly10Row = page.locator('[data-testid="metric-row-FLY10_TIME"]');
  265 |     await expect(fly10Row).toBeVisible();
  266 | 
  267 |     // Should see "All Sports" badge in sports column
  268 |     const sportsBadge = fly10Row.locator('[data-testid="sports-cell"] >> text=All Sports');
  269 |     await expect(sportsBadge).toBeVisible();
  270 |   });
  271 | 
  272 |   test('should show "All Sports" badge for metrics without associations', async ({ page }) => {
  273 |     // Create a metric without sport associations
  274 |     const testMetric = generateTestMetricWithSports([]);
  275 |     const response = await page.request.post(`${STAGING_URL}/api/metrics`, {
  276 |       data: testMetric,
  277 |     });
  278 |     expect(response.ok()).toBeTruthy();
  279 | 
  280 |     await page.goto(`${STAGING_URL}/metrics`);
  281 |     await page.waitForSelector('[data-testid="metrics-table"]');
  282 | 
  283 |     // Find the test metric row
  284 |     const metricRow = page.locator(`[data-testid="metric-row-${testMetric.code}"]`);
  285 |     await expect(metricRow).toBeVisible();
  286 | 
  287 |     // Should show "All Sports" badge
  288 |     const allSportsBadge = metricRow.locator('[data-testid="sports-cell"] >> text=All Sports');
  289 |     await expect(allSportsBadge).toBeVisible();
  290 | 
  291 |     // Cleanup
  292 |     await page.request.delete(`${STAGING_URL}/api/metrics/${testMetric.code}`);
  293 |   });
  294 | 
  295 |   test('should show first 3 sports + overflow indicator for metrics with many sports', async ({ page }) => {
  296 |     // Create a metric with 5 sports
  297 |     const testMetric = generateTestMetricWithSports(['SOCCER', 'BASKETBALL', 'VOLLEYBALL', 'TENNIS', 'BASEBALL']);
  298 |     const response = await page.request.post(`${STAGING_URL}/api/metrics`, {
  299 |       data: testMetric,
  300 |     });
> 301 |     expect(response.ok()).toBeTruthy();
      |                           ^ Error: expect(received).toBeTruthy()
  302 | 
  303 |     await page.goto(`${STAGING_URL}/metrics`);
  304 |     await page.waitForSelector('[data-testid="metrics-table"]');
  305 | 
  306 |     // Find the test metric row
  307 |     const metricRow = page.locator(`[data-testid="metric-row-${testMetric.code}"]`);
  308 |     await expect(metricRow).toBeVisible();
  309 | 
  310 |     const sportsCell = metricRow.locator('[data-testid="sports-cell"]');
  311 | 
  312 |     // Should show first 3 sports
  313 |     await expect(sportsCell.locator('text=Soccer')).toBeVisible();
  314 |     await expect(sportsCell.locator('text=Basketball')).toBeVisible();
  315 |     await expect(sportsCell.locator('text=Volleyball')).toBeVisible();
  316 | 
  317 |     // Should show "+2 more" indicator
  318 |     await expect(sportsCell.locator('text=+2 more')).toBeVisible();
  319 | 
  320 |     // Cleanup
  321 |     await page.request.delete(`${STAGING_URL}/api/metrics/${testMetric.code}`);
  322 |   });
  323 | });
  324 | 
  325 | test.describe('Metric Sport Tags - Org Admin Filtering', () => {
  326 |   let testOrgId: string;
  327 | 
  328 |   test.beforeEach(async ({ page }) => {
  329 |     await loginAsDefaultUser(page);
  330 | 
  331 |     // Get or create a test organization
  332 |     const orgsResponse = await page.request.get(`${STAGING_URL}/api/organizations`);
  333 |     const orgs = await orgsResponse.json();
  334 |     testOrgId = orgs[0]?.id;
  335 |   });
  336 | 
  337 |   test('should display sport filter dropdown in organization metrics card', async ({ page }) => {
  338 |     await page.goto(`${STAGING_URL}/organizations/${testOrgId}/settings`);
  339 | 
  340 |     // Navigate to metrics tab
  341 |     await page.click('text=Metrics');
  342 | 
  343 |     // Wait for organization metrics card
  344 |     await page.waitForSelector('[data-testid="organization-metrics-card"]', { timeout: 5000 });
  345 | 
  346 |     // Should see sport filter dropdown
  347 |     const sportFilter = page.locator('[data-testid="sport-filter-dropdown"]');
  348 |     await expect(sportFilter).toBeVisible();
  349 | 
  350 |     // Should default to "All Sports"
  351 |     await expect(sportFilter).toContainText('All Sports');
  352 |   });
  353 | 
  354 |   test('should display Sports column in organization metrics table', async ({ page }) => {
  355 |     await page.goto(`${STAGING_URL}/organizations/${testOrgId}/settings`);
  356 |     await page.click('text=Metrics');
  357 |     await page.waitForSelector('[data-testid="organization-metrics-card"]');
  358 | 
  359 |     // Should see Sports column in table
  360 |     const sportsHeader = page.locator('[data-testid="organization-metrics-card"] >> th:has-text("Sports")');
  361 |     await expect(sportsHeader).toBeVisible();
  362 |   });
  363 | 
  364 |   test('should filter metrics by selected sport', async ({ page }) => {
  365 |     await page.goto(`${STAGING_URL}/organizations/${testOrgId}/settings`);
  366 |     await page.click('text=Metrics');
  367 |     await page.waitForSelector('[data-testid="organization-metrics-card"]');
  368 | 
  369 |     // Get initial count of visible metrics (should be all metrics)
  370 |     const initialRows = await page.locator('[data-testid^="org-metric-row-"]').count();
  371 | 
  372 |     // Open sport filter dropdown
  373 |     await page.click('[data-testid="sport-filter-dropdown"]');
  374 | 
  375 |     // Select "Soccer"
  376 |     await page.click('[data-testid="sport-filter-option-SOCCER"]');
  377 | 
  378 |     // Wait for filter to apply
  379 |     await page.waitForLoadState('networkidle');
  380 | 
  381 |     // Should now only show metrics tagged with Soccer + general metrics (no tags)
  382 |     const filteredRows = await page.locator('[data-testid^="org-metric-row-"]').count();
  383 | 
  384 |     // Default metrics (FLY10_TIME) have no sport tags, so they appear in all filters
  385 |     const fly10Row = page.locator('[data-testid="org-metric-row-FLY10_TIME"]');
  386 |     await expect(fly10Row).toBeVisible();
  387 | 
  388 |     // Filtered count equals initial count since default metrics have no sport associations
  389 |     expect(filteredRows).toBeLessThanOrEqual(initialRows);
  390 |   });
  391 | 
  392 |   test('should show general metrics (no tags) when filtering by specific sport', async ({ page }) => {
  393 |     // Create a general metric (no sport associations)
  394 |     const generalMetric = generateTestMetricWithSports([]);
  395 |     await page.request.post(`${STAGING_URL}/api/metrics`, {
  396 |       data: generalMetric,
  397 |     });
  398 | 
  399 |     // Enable the metric for the organization
  400 |     await page.request.post(`${STAGING_URL}/api/organizations/${testOrgId}/metrics/${generalMetric.code}/enable`);
  401 | 
```