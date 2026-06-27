# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: coaching-insights.spec.ts >> Coaching Insights - Generation and Editing >> should regenerate coaching insights
- Location: tests/e2e/coaching-insights.spec.ts:237:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
=========================== logs ===========================
waiting for navigation to "/" until "load"
  navigated to "http://localhost:5000/admin"
============================================================
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
  57  |     await expect(page.locator('text=GPT-5 Nano')).toBeVisible();
  58  |     await expect(page.locator('text=Gemini 2.0 Flash Lite')).toBeVisible();
  59  |     await expect(page.locator('text=Gemini 2.5 Flash Lite')).toBeVisible();
  60  |     await expect(page.locator('text=Claude Haiku 3')).toBeVisible();
  61  |     await expect(page.locator('text=Claude Haiku 4.5')).toBeVisible();
  62  |     await expect(page.locator('text=Gemini 2.5 Pro')).toBeVisible();
  63  |     await expect(page.locator('text=Claude Sonnet 4.5')).toBeVisible();
  64  | 
  65  |     // Select a premium model
  66  |     await page.click('text=Claude Sonnet 4.5');
  67  | 
  68  |     // Verify selection saved
  69  |     await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
  70  |   });
  71  | 
  72  |   test('should allow site admin to enable AI for specific organization', async ({ page }) => {
  73  |     // Navigate to organizations page
  74  |     await page.click('a[href="/organizations"]');
  75  |     await page.waitForURL('/organizations');
  76  | 
  77  |     // Click settings button for first organization
  78  |     const settingsButton = page.locator('[data-testid^="settings-org-"]').first();
  79  |     await settingsButton.click();
  80  | 
  81  |     // Wait for organization settings page
  82  |     await expect(page.locator('text=Organization Settings')).toBeVisible();
  83  | 
  84  |     // Find Coaching Insights toggle
  85  |     const aiToggle = page.locator('button[role="switch"]').filter({ hasText: /Enable Coaching Insights/i }).first();
  86  | 
  87  |     // Enable AI for this organization
  88  |     const isEnabled = await aiToggle.getAttribute('data-state');
  89  |     if (isEnabled !== 'checked') {
  90  |       await aiToggle.click();
  91  |       await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
  92  |     }
  93  | 
  94  |     // Verify toggle is now enabled
  95  |     await expect(aiToggle).toHaveAttribute('data-state', 'checked');
  96  |   });
  97  | });
  98  | 
  99  | test.describe('Coaching Insights - Org Admin Configuration', () => {
  100 |   test.beforeEach(async ({ page }) => {
  101 |     // Login as org admin
  102 |     await page.goto('/login');
  103 |     await page.fill('#username, input[name="username"]', process.env.E2E_ORG_ADMIN_USERNAME || 'orgadmin');
  104 |     await page.fill('#password, input[name="password"]', process.env.E2E_ORG_ADMIN_PASSWORD || 'password');
  105 |     await page.click('button[type="submit"]');
  106 |     await page.waitForURL('/');
  107 |   });
  108 | 
  109 |   test('should show disabled state when site admin has not enabled AI', async ({ page }) => {
  110 |     // Navigate to org admin settings
  111 |     await page.click('a[href*="/settings"]');
  112 | 
  113 |     // Wait for settings page
  114 |     await expect(page.locator('text=Coaching Insights')).toBeVisible();
  115 | 
  116 |     // Check if AI is enabled by site admin
  117 |     const alert = page.locator('text=Feature must be enabled by site administrator');
  118 |     const isDisabled = await alert.isVisible();
  119 | 
  120 |     if (isDisabled) {
  121 |       // Verify toggle is disabled
  122 |       const aiToggle = page.locator('button[role="switch"]').filter({ hasText: /Enable Coaching Insights/i }).first();
  123 |       await expect(aiToggle).toBeDisabled();
  124 |     }
  125 |   });
  126 | 
  127 |   test('should allow org admin to enable AI when site admin allows', async ({ page }) => {
  128 |     // First, ensure site admin has enabled AI for this org
  129 |     // (This would be done in a separate test or setup)
  130 | 
  131 |     // Navigate to org admin settings
  132 |     await page.click('a[href*="/settings"]');
  133 |     await expect(page.locator('text=Coaching Insights')).toBeVisible();
  134 | 
  135 |     // Find AI toggle
  136 |     const aiToggle = page.locator('button[role="switch"]').filter({ hasText: /Enable Coaching Insights/i }).first();
  137 | 
  138 |     // If toggle is not disabled, enable it
  139 |     const isDisabled = await aiToggle.isDisabled();
  140 |     if (!isDisabled) {
  141 |       const isEnabled = await aiToggle.getAttribute('data-state');
  142 |       if (isEnabled !== 'checked') {
  143 |         await aiToggle.click();
  144 |         await expect(page.locator('text=Settings updated')).toBeVisible({ timeout: 5000 });
  145 |       }
  146 |     }
  147 |   });
  148 | });
  149 | 
  150 | test.describe('Coaching Insights - Generation and Editing', () => {
  151 |   test.beforeEach(async ({ page }) => {
  152 |     // Login as coach or org admin
  153 |     await page.goto('/login');
  154 |     await page.fill('#username, input[name="username"]', process.env.E2E_ORG_ADMIN_USERNAME || 'orgadmin');
  155 |     await page.fill('#password, input[name="password"]', process.env.E2E_ORG_ADMIN_PASSWORD || 'password');
  156 |     await page.click('button[type="submit"]');
> 157 |     await page.waitForURL('/');
      |                ^ TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
  158 |   });
  159 | 
  160 |   test('should generate coaching insights for team report', async ({ page }) => {
  161 |     // Navigate to reports page
  162 |     await page.click('a[href="/reports"]');
  163 |     await page.waitForURL('/reports');
  164 | 
  165 |     // Click on first team report
  166 |     const firstReport = page.locator('[data-testid^="team-report-"]').first();
  167 |     await firstReport.click();
  168 | 
  169 |     // Wait for report to load
  170 |     await expect(page.locator('text=Report Summary')).toBeVisible();
  171 | 
  172 |     // Find Coaching Insights card
  173 |     const insightsCard = page.locator('text=Coaching Insights').first();
  174 |     await expect(insightsCard).toBeVisible();
  175 | 
  176 |     // Check if "Generate Insights" button exists
  177 |     const generateButton = page.locator('button:has-text("Generate Insights")');
  178 |     const hasButton = await generateButton.isVisible();
  179 | 
  180 |     if (hasButton) {
  181 |       // Click generate button
  182 |       await generateButton.click();
  183 | 
  184 |       // Wait for generation to complete (spinner should appear then disappear)
  185 |       await expect(page.locator('text=Generating insights')).toBeVisible({ timeout: 5000 });
  186 |       await expect(page.locator('text=Generating insights')).not.toBeVisible({ timeout: 30000 });
  187 | 
  188 |       // Verify insights are displayed
  189 |       await expect(page.locator('[data-testid="insights-display"]')).toBeVisible();
  190 | 
  191 |       // Verify Edit and Regenerate buttons appear
  192 |       await expect(page.locator('button:has-text("Edit")')).toBeVisible();
  193 |       await expect(page.locator('button:has-text("Regenerate")')).toBeVisible();
  194 |     }
  195 |   });
  196 | 
  197 |   test('should allow editing coaching insights', async ({ page }) => {
  198 |     // Navigate to reports page
  199 |     await page.click('a[href="/reports"]');
  200 |     await page.waitForURL('/reports');
  201 | 
  202 |     // Click on a report that has insights
  203 |     const firstReport = page.locator('[data-testid^="team-report-"]').first();
  204 |     await firstReport.click();
  205 | 
  206 |     // Wait for insights to be visible
  207 |     const editButton = page.locator('button:has-text("Edit")');
  208 |     const hasEditButton = await editButton.isVisible();
  209 | 
  210 |     if (hasEditButton) {
  211 |       // Click Edit button
  212 |       await editButton.click();
  213 | 
  214 |       // Verify textarea appears
  215 |       const textarea = page.locator('textarea[data-testid="insights-editor"]');
  216 |       await expect(textarea).toBeVisible();
  217 | 
  218 |       // Get current text
  219 |       const originalText = await textarea.inputValue();
  220 | 
  221 |       // Modify text
  222 |       const newText = originalText + '\n\nEdited via E2E test.';
  223 |       await textarea.fill(newText);
  224 | 
  225 |       // Click Save button
  226 |       await page.click('button:has-text("Save")');
  227 | 
  228 |       // Verify save success message
  229 |       await expect(page.locator('text=Insights updated')).toBeVisible({ timeout: 5000 });
  230 | 
  231 |       // Verify text is displayed (not in edit mode)
  232 |       await expect(textarea).not.toBeVisible();
  233 |       await expect(page.locator('text=Edited via E2E test')).toBeVisible();
  234 |     }
  235 |   });
  236 | 
  237 |   test('should regenerate coaching insights', async ({ page }) => {
  238 |     // Navigate to reports page
  239 |     await page.click('a[href="/reports"]');
  240 |     await page.waitForURL('/reports');
  241 | 
  242 |     // Click on a report that has insights
  243 |     const firstReport = page.locator('[data-testid^="team-report-"]').first();
  244 |     await firstReport.click();
  245 | 
  246 |     // Find Regenerate button
  247 |     const regenerateButton = page.locator('button:has-text("Regenerate")');
  248 |     const hasRegenerateButton = await regenerateButton.isVisible();
  249 | 
  250 |     if (hasRegenerateButton) {
  251 |       // Get current insights text
  252 |       const currentInsights = await page.locator('[data-testid="insights-display"]').textContent();
  253 | 
  254 |       // Click Regenerate
  255 |       await regenerateButton.click();
  256 | 
  257 |       // Wait for regeneration
```