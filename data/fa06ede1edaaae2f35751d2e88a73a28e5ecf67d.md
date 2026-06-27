# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: report-public-sharing.spec.ts >> Report Public Sharing - TDD Tests >> should display frozen snapshot data (not live)
- Location: tests/e2e/report-public-sharing.spec.ts:238:3

# Error details

```
Error: expect(received).toBeDefined()

Received: undefined
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
        - alert [ref=e219]:
          - img [ref=e220]
          - generic [ref=e222]: Failed to load notification settings. Please try refreshing the page.
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
  170 |     createdSnapshotIds.push(snapshotData.id);
  171 | 
  172 |     // Verify public URL is displayed
  173 |     const publicUrlInput = page.locator('input[readonly], input[disabled]').filter({ hasText: /\/public\/reports\// });
  174 |     await expect(publicUrlInput).toBeVisible({ timeout: 5000 });
  175 | 
  176 |     // Verify URL contains token
  177 |     const url = await publicUrlInput.inputValue();
  178 |     expect(url).toContain('/public/reports/');
  179 |     expect(url.split('/').pop()).toHaveLength(21); // nanoid default length
  180 |   });
  181 | 
  182 |   test('should access public report without authentication', async ({ page, context }) => {
  183 |     // First, create a report and snapshot while authenticated
  184 |     const userOrgId = await getUserOrgId(page);
  185 |     const testReport = generateTestReport();
  186 |     const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
  187 |       data: {
  188 |         name: testReport.name,
  189 |         reportType: 'coach',
  190 |         organizationId: userOrgId,
  191 |         config: {
  192 |           timeframe: { type: 'preset', preset: 'season' },
  193 |           metrics: ['FLY10_TIME']
  194 |         }
  195 |       }
  196 |     });
  197 | 
  198 |     const reportData = await createResponse.json();
  199 |     createdReportIds.push(reportData.id);
  200 | 
  201 |     // Create snapshot via API
  202 |     const snapshotResponse = await page.request.post(`${STAGING_URL}/api/reports/${reportData.id}/snapshots`, {
  203 |       data: {
  204 |         expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
  205 |       }
  206 |     });
  207 | 
  208 |     const snapshotData = await snapshotResponse.json();
  209 |     createdSnapshotIds.push(snapshotData.id);
  210 | 
  211 |     const publicToken = snapshotData.publicToken;
  212 |     const publicUrl = `${STAGING_URL}/public/reports/${publicToken}`;
  213 | 
  214 |     // Now open in incognito/new context (no authentication)
  215 |     const incognitoContext = await context.browser()!.newContext();
  216 |     const incognitoPage = await incognitoContext.newPage();
  217 | 
  218 |     try {
  219 |       // Navigate to public URL
  220 |       await incognitoPage.goto(publicUrl);
  221 |       await incognitoPage.waitForLoadState('networkidle');
  222 | 
  223 |       // Verify report is displayed without login
  224 |       await expect(incognitoPage.locator('text=Performance, text=Report')).toBeVisible({ timeout: 5000 });
  225 | 
  226 |       // Verify data tables are visible
  227 |       await expect(incognitoPage.locator('table, [role="table"]')).toBeVisible();
  228 | 
  229 |       // Verify NO edit/delete buttons (read-only)
  230 |       await expect(incognitoPage.locator('button:has-text("Edit"), button:has-text("Delete")')).not.toBeVisible();
  231 | 
  232 |     } finally {
  233 |       await incognitoPage.close();
  234 |       await incognitoContext.close();
  235 |     }
  236 |   });
  237 | 
  238 |   test('should display frozen snapshot data (not live)', async ({ page, context }) => {
  239 |     const userOrgId = await getUserOrgId(page);
  240 |     const testReport = generateTestReport();
  241 |     const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
  242 |       data: {
  243 |         name: testReport.name,
  244 |         reportType: 'coach',
  245 |         organizationId: userOrgId,
  246 |         config: {
  247 |           timeframe: { type: 'preset', preset: 'season' },
  248 |           metrics: ['FLY10_TIME']
  249 |         }
  250 |       }
  251 |     });
  252 | 
  253 |     const reportData = await createResponse.json();
  254 |     createdReportIds.push(reportData.id);
  255 | 
  256 |     // Create snapshot
  257 |     const snapshotResponse = await page.request.post(`${STAGING_URL}/api/reports/${reportData.id}/snapshots`, {
  258 |       data: {
  259 |         expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  260 |       }
  261 |     });
  262 | 
  263 |     const snapshotData = await snapshotResponse.json();
  264 |     createdSnapshotIds.push(snapshotData.id);
  265 | 
  266 |     const publicToken = snapshotData.publicToken;
  267 |     const publicUrl = `${STAGING_URL}/public/reports/${publicToken}`;
  268 | 
  269 |     // Verify snapshot has frozen data
> 270 |     expect(snapshotData.snapshotData).toBeDefined();
      |                                       ^ Error: expect(received).toBeDefined()
  271 |     expect(snapshotData.snapshotData.generatedAt).toBeDefined();
  272 |     expect(snapshotData.snapshotData.dataSnapshot).toBeDefined();
  273 | 
  274 |     // Access public URL
  275 |     const incognitoContext = await context.browser()!.newContext();
  276 |     const incognitoPage = await incognitoContext.newPage();
  277 | 
  278 |     try {
  279 |       await incognitoPage.goto(publicUrl);
  280 |       await incognitoPage.waitForLoadState('networkidle');
  281 | 
  282 |       // Verify "Generated on" timestamp is displayed
  283 |       await expect(incognitoPage.locator('text=Generated on, text=Snapshot from')).toBeVisible({ timeout: 5000 });
  284 | 
  285 |     } finally {
  286 |       await incognitoPage.close();
  287 |       await incognitoContext.close();
  288 |     }
  289 |   });
  290 | 
  291 |   test('should revoke public link', async ({ page }) => {
  292 |     const userOrgId = await getUserOrgId(page);
  293 |     const testReport = generateTestReport();
  294 |     const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
  295 |       data: {
  296 |         name: testReport.name,
  297 |         reportType: 'coach',
  298 |         organizationId: userOrgId,
  299 |         config: {
  300 |           timeframe: { type: 'preset', preset: 'season' },
  301 |           metrics: ['FLY10_TIME']
  302 |         }
  303 |       }
  304 |     });
  305 | 
  306 |     const reportData = await createResponse.json();
  307 |     createdReportIds.push(reportData.id);
  308 | 
  309 |     // Create snapshot
  310 |     const snapshotResponse = await page.request.post(`${STAGING_URL}/api/reports/${reportData.id}/snapshots`, {
  311 |       data: {
  312 |         expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  313 |       }
  314 |     });
  315 | 
  316 |     const snapshotData = await snapshotResponse.json();
  317 |     const snapshotId = snapshotData.id;
  318 | 
  319 |     // Navigate to report to see snapshots
  320 |     await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
  321 |     await page.click('button:has-text("Share")');
  322 |     await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  323 | 
  324 |     // Find and click revoke button
  325 |     await page.click(`button:has-text("Revoke"), button[data-snapshot-id="${snapshotId}"]:has-text("Delete")`);
  326 | 
  327 |     // Confirm revocation
  328 |     await page.click('button:has-text("Confirm"), button:has-text("Yes")');
  329 | 
  330 |     // Verify snapshot is revoked via API
  331 |     const checkResponse = await page.request.get(`${STAGING_URL}/api/public/reports/${snapshotData.publicToken}`);
  332 |     expect(checkResponse.status()).toBe(404);
  333 |   });
  334 | 
  335 |   test('should return 404 for expired public link', async ({ page, context }) => {
  336 |     const userOrgId = await getUserOrgId(page);
  337 |     const testReport = generateTestReport();
  338 |     const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
  339 |       data: {
  340 |         name: testReport.name,
  341 |         reportType: 'coach',
  342 |         organizationId: userOrgId,
  343 |         config: {
  344 |           timeframe: { type: 'preset', preset: 'season' },
  345 |           metrics: ['FLY10_TIME']
  346 |         }
  347 |       }
  348 |     });
  349 | 
  350 |     const reportData = await createResponse.json();
  351 |     createdReportIds.push(reportData.id);
  352 | 
  353 |     // Create snapshot that expires immediately
  354 |     const snapshotResponse = await page.request.post(`${STAGING_URL}/api/reports/${reportData.id}/snapshots`, {
  355 |       data: {
  356 |         expiresAt: new Date(Date.now() - 1000).toISOString() // Already expired
  357 |       }
  358 |     });
  359 | 
  360 |     const snapshotData = await snapshotResponse.json();
  361 |     const publicToken = snapshotData.publicToken;
  362 |     const publicUrl = `${STAGING_URL}/public/reports/${publicToken}`;
  363 | 
  364 |     // Try to access expired link
  365 |     const incognitoContext = await context.browser()!.newContext();
  366 |     const incognitoPage = await incognitoContext.newPage();
  367 | 
  368 |     try {
  369 |       const response = await incognitoPage.goto(publicUrl);
  370 | 
```