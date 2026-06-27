# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: coach-report-creation.spec.ts >> Coach Report Creation - TDD Tests >> should configure composite index with weights
- Location: tests/e2e/coach-report-creation.spec.ts:190:3

# Error details

```
TimeoutError: page.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('button:has-text("Coach Report")')

```

# Page snapshot

```yaml
- generic:
  - generic:
    - generic:
      - complementary:
        - generic:
          - generic:
            - generic:
              - img
            - generic:
              - generic:
                - heading [level=1]: AthleteMetrics
                - generic: BETA
              - paragraph: Analytics Platform
        - navigation:
          - link:
            - /url: /
            - generic:
              - img
              - generic: Dashboard
          - link:
            - /url: /organizations
            - generic:
              - img
              - generic: Organizations
          - link:
            - /url: /user-management
            - generic:
              - img
              - generic: User Management
          - link:
            - /url: /global-athletes
            - generic:
              - img
              - generic: Global Athletes
          - link:
            - /url: /admin/measurements
            - generic:
              - img
              - generic: Measurements
          - link:
            - /url: /wellness-templates
            - generic:
              - img
              - generic: Wellness Templates
          - link:
            - /url: /metrics
            - generic:
              - img
              - generic: Metrics
          - link:
            - /url: /sports
            - generic:
              - img
              - generic: Sports
          - link:
            - /url: /benchmarks
            - generic:
              - img
              - generic: Benchmarks
          - link:
            - /url: /admin
            - generic:
              - img
              - generic: Site Settings
        - generic:
          - generic:
            - generic:
              - img
              - generic:
                - paragraph: E2E OrgAdmin
                - paragraph: site admin
            - button:
              - img
          - link:
            - /url: /profile
            - generic:
              - img
              - generic: Profile
          - link:
            - /url: /notification-settings
            - generic:
              - img
              - generic: Notifications
          - button:
            - img
            - generic: Sign Out
      - main:
        - generic:
          - button:
            - img
            - generic: Hide Menu
          - generic:
            - generic:
              - generic:
                - img
                - generic: Online
            - generic: AthleteMetrics
            - generic:
              - generic:
                - generic: Welcome,
                - generic: E2E
              - button:
                - img
                - generic: Logout
        - generic:
          - list
          - generic:
            - generic:
              - generic:
                - heading [level=1]: Reports
                - paragraph: Create and manage coach and individual reports
              - generic:
                - button:
                  - img
                  - text: Select
                - button:
                  - img
                  - text: Create Report
            - generic:
              - generic:
                - generic:
                  - img
                  - textbox:
                    - /placeholder: Search reports by name or description...
                - combobox:
                  - generic: All Reports
                  - img
              - generic:
                - generic:
                  - img
                  - text: "Filters:"
                - button:
                  - img
                  - text: Select date range
                - button [disabled]: Teams
                - button [disabled]: Metrics
                - generic:
                  - switch
                  - generic:
                    - img
                    - text: Show Archived
            - generic:
              - img
              - heading [level=3]: No reports found
              - paragraph: Create your first report to get started with performance analytics.
          - generic:
            - generic:
              - link:
                - /url: /privacy
                - text: Privacy Policy
              - generic: "|"
              - link:
                - /url: /terms
                - text: Terms of Service
            - generic: © 2026 AthleteMetrics. All rights reserved.
  - dialog "Create New Report" [ref=e2]:
    - generic [ref=e3]:
      - heading "Create New Report" [level=2] [ref=e4]
      - paragraph [ref=e5]: Step 1 of 8
    - progressbar [ref=e6]
    - generic [ref=e8]:
      - generic [ref=e9]:
        - text: Report Type
        - radiogroup [ref=e10]:
          - generic [ref=e11] [cursor=pointer]:
            - radio "Team Report Team-wide performance analysis with rankings and composite index" [checked] [ref=e12]:
              - img [ref=e14]
            - radio [checked]
            - generic [ref=e16]:
              - generic [ref=e17]: Team Report
              - generic [ref=e18]: Team-wide performance analysis with rankings and composite index
          - generic [ref=e19] [cursor=pointer]:
            - radio "Individual Report Individual athlete performance with team rank and percentiles" [ref=e20]
            - radio
            - generic [ref=e21]:
              - generic [ref=e22]: Individual Report
              - generic [ref=e23]: Individual athlete performance with team rank and percentiles
      - generic [ref=e24]:
        - button "Back" [disabled]:
          - img
          - text: Back
        - button "Next" [active] [ref=e25] [cursor=pointer]:
          - text: Next
          - img
    - button "Close" [ref=e26] [cursor=pointer]:
      - img [ref=e27]
      - generic [ref=e30]: Close
```

# Test source

```ts
  99  |     await page.fill('textarea[name="description"], textarea[placeholder*="description"]', testReport.description);
  100 | 
  101 |     // Click Next/Continue
  102 |     await page.click('button:has-text("Next"), button:has-text("Continue")');
  103 | 
  104 |     // Step 3: Select timeframe - preset option
  105 |     await page.click('button:has-text("Preset"), input[value="preset"] + label');
  106 |     await page.selectOption('select[name="preset"], select >> nth=0', 'season');
  107 | 
  108 |     // Click Next
  109 |     await page.click('button:has-text("Next"), button:has-text("Continue")');
  110 | 
  111 |     // Step 4: Select metrics (at least one)
  112 |     const metricCheckbox = page.locator('input[type="checkbox"]').first();
  113 |     await metricCheckbox.check();
  114 | 
  115 |     // Click Next
  116 |     await page.click('button:has-text("Next"), button:has-text("Continue")');
  117 | 
  118 |     // Step 5: Skip benchmarks for now (optional)
  119 |     await page.click('button:has-text("Skip"), button:has-text("Next"), button:has-text("Continue")');
  120 | 
  121 |     // Step 6: Skip composite index (optional)
  122 |     await page.click('button:has-text("Skip"), button:has-text("Next"), button:has-text("Continue")');
  123 | 
  124 |     // Step 7: Submit report creation
  125 |     const responsePromise = page.waitForResponse(response =>
  126 |       response.url().includes('/api/reports') && response.request().method() === 'POST'
  127 |     );
  128 | 
  129 |     await page.click('button:has-text("Create Report"), button[type="submit"]');
  130 | 
  131 |     // Capture report ID
  132 |     const response = await responsePromise;
  133 |     const data = await response.json();
  134 |     createdReportIds.push(data.id);
  135 | 
  136 |     // Verify success message
  137 |     await expect(page.locator('text=Report Created, text=Success')).toBeVisible({ timeout: 5000 });
  138 |   });
  139 | 
  140 |   test('should create a coach report with custom date range', async ({ page }) => {
  141 |     const testReport = generateTestReport();
  142 | 
  143 |     await page.goto(`${STAGING_URL}/reports`);
  144 |     await page.waitForLoadState('networkidle');
  145 | 
  146 |     // Open wizard
  147 |     await page.click('button:has-text("Create Report"), button:has-text("New Report")');
  148 |     await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  149 | 
  150 |     // Select Coach Report
  151 |     await page.click('button:has-text("Coach Report"), input[value="coach"] + label');
  152 | 
  153 |     // Fill basic details
  154 |     await page.fill('input[name="name"], input[placeholder*="name"]', testReport.name);
  155 |     await page.click('button:has-text("Next"), button:has-text("Continue")');
  156 | 
  157 |     // Select custom timeframe
  158 |     await page.click('button:has-text("Custom"), input[value="custom"] + label');
  159 | 
  160 |     // Fill date range
  161 |     const startDate = page.locator('input[type="date"], input[name="customStart"]').first();
  162 |     const endDate = page.locator('input[type="date"], input[name="customEnd"]').last();
  163 | 
  164 |     await startDate.fill('2024-01-01');
  165 |     await endDate.fill('2024-12-31');
  166 | 
  167 |     await page.click('button:has-text("Next")');
  168 | 
  169 |     // Select at least one metric
  170 |     await page.locator('input[type="checkbox"]').first().check();
  171 |     await page.click('button:has-text("Next")');
  172 | 
  173 |     // Skip remaining steps and create
  174 |     await page.click('button:has-text("Skip"), button:has-text("Next")'); // Benchmarks
  175 |     await page.click('button:has-text("Skip"), button:has-text("Next")'); // Composite index
  176 | 
  177 |     const responsePromise = page.waitForResponse(response =>
  178 |       response.url().includes('/api/reports') && response.request().method() === 'POST'
  179 |     );
  180 | 
  181 |     await page.click('button:has-text("Create Report"), button[type="submit"]');
  182 | 
  183 |     const response = await responsePromise;
  184 |     const data = await response.json();
  185 |     createdReportIds.push(data.id);
  186 | 
  187 |     await expect(page.locator('text=Report Created, text=Success')).toBeVisible({ timeout: 5000 });
  188 |   });
  189 | 
  190 |   test('should configure composite index with weights', async ({ page }) => {
  191 |     const testReport = generateTestReport();
  192 | 
  193 |     await page.goto(`${STAGING_URL}/reports`);
  194 |     await page.waitForLoadState('networkidle');
  195 | 
  196 |     // Create report and navigate to composite index step
  197 |     await page.click('button:has-text("Create Report"), button:has-text("New Report")');
  198 |     await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
> 199 |     await page.click('button:has-text("Coach Report")');
      |                ^ TimeoutError: page.click: Timeout 15000ms exceeded.
  200 | 
  201 |     await page.fill('input[name="name"]', testReport.name);
  202 |     await page.click('button:has-text("Next")');
  203 | 
  204 |     // Timeframe
  205 |     await page.selectOption('select[name="preset"]', 'season');
  206 |     await page.click('button:has-text("Next")');
  207 | 
  208 |     // Select multiple metrics
  209 |     const checkboxes = page.locator('input[type="checkbox"]');
  210 |     const count = await checkboxes.count();
  211 |     if (count >= 2) {
  212 |       await checkboxes.nth(0).check();
  213 |       await checkboxes.nth(1).check();
  214 |     }
  215 |     await page.click('button:has-text("Next")');
  216 | 
  217 |     // Skip benchmarks
  218 |     await page.click('button:has-text("Skip"), button:has-text("Next")');
  219 | 
  220 |     // Enable composite index
  221 |     await page.click('input[type="checkbox"][name="enableCompositeIndex"], button:has-text("Enable")');
  222 | 
  223 |     // Set weights (should equal 1.0 total)
  224 |     const weightInput = page.locator('input[type="number"], input[type="range"]').first();
  225 |     await weightInput.fill('0.5');
  226 | 
  227 |     await page.click('button:has-text("Next")');
  228 | 
  229 |     const responsePromise = page.waitForResponse(response =>
  230 |       response.url().includes('/api/reports') && response.request().method() === 'POST'
  231 |     );
  232 | 
  233 |     await page.click('button:has-text("Create Report")');
  234 | 
  235 |     const response = await responsePromise;
  236 |     const data = await response.json();
  237 |     createdReportIds.push(data.id);
  238 | 
  239 |     // Verify composite index is in config
  240 |     expect(data.config.compositeIndex).toBeDefined();
  241 |     expect(data.config.compositeIndex.enabled).toBe(true);
  242 |   });
  243 | 
  244 |   test('should generate and display coach report', async ({ page }) => {
  245 |     // First, get user's organizationContext
  246 |     const userOrgId = await page.evaluate(() => {
  247 |       const authData = localStorage.getItem('auth');
  248 |       if (authData) {
  249 |         const parsed = JSON.parse(authData);
  250 |         return parsed.organizationContext || null;
  251 |       }
  252 |       return null;
  253 |     });
  254 | 
  255 |     // Create a report via API
  256 |     const testReport = generateTestReport();
  257 |     const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
  258 |       data: {
  259 |         name: testReport.name,
  260 |         description: testReport.description,
  261 |         reportType: 'coach',
  262 |         organizationId: userOrgId, // REQUIRED: organizationId must be included
  263 |         config: {
  264 |           timeframe: { type: 'preset', preset: 'season' },
  265 |           metrics: ['FLY10_TIME'],
  266 |           filters: {}
  267 |         }
  268 |       }
  269 |     });
  270 | 
  271 |     const reportData = await createResponse.json();
  272 |     createdReportIds.push(reportData.id);
  273 | 
  274 |     // Navigate to report
  275 |     await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
  276 |     await page.waitForLoadState('networkidle');
  277 | 
  278 |     // Click "Generate Report" button
  279 |     await page.click('button:has-text("Generate Report"), button:has-text("Run Report")');
  280 | 
  281 |     // Wait for report to load
  282 |     await page.waitForResponse(response =>
  283 |       response.url().includes(`/api/reports/${reportData.id}/generate`) &&
  284 |       response.request().method() === 'POST'
  285 |     );
  286 | 
  287 |     // Verify report displays
  288 |     await expect(page.locator('text=Performance Snapshot, text=Team Analysis')).toBeVisible({ timeout: 10000 });
  289 | 
  290 |     // Verify report has data tables
  291 |     await expect(page.locator('table, [role="table"]')).toBeVisible();
  292 |   });
  293 | 
  294 |   test('should display metric rankings (1-to-n)', async ({ page }) => {
  295 |     // Get user's organizationContext
  296 |     const userOrgId = await page.evaluate(() => {
  297 |       const authData = localStorage.getItem('auth');
  298 |       if (authData) {
  299 |         const parsed = JSON.parse(authData);
```