# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: athlete-crud.spec.ts >> Athlete CRUD Tests >> should show validation error for invalid email format
- Location: tests/e2e/athlete-crud.spec.ts:269:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('text=/invalid.*email|valid email|email.*format/i') to be visible

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
        - generic:
          - generic:
            - paragraph: Organization Context
            - paragraph: E2E Test Organization 2
            - button: ← Back to Site View
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
              - heading [level=1]: Athletes Management
              - generic:
                - button:
                  - img
                  - text: Refresh
                - button:
                  - img
                  - text: Import CSV
                - button:
                  - img
                  - text: Add Athlete
                - button:
                  - img
                  - text: Invite Athlete
            - generic:
              - generic:
                - generic:
                  - generic:
                    - generic: Team
                    - combobox:
                      - generic:
                        - generic: All Teams
                      - img
                  - generic:
                    - generic: Gender
                    - combobox:
                      - generic: All Genders
                      - img
                  - generic:
                    - generic: Birth Year From
                    - combobox:
                      - generic: Any
                      - img
                  - generic:
                    - generic: Birth Year To
                    - combobox:
                      - generic: Any
                      - img
                  - generic:
                    - checkbox
                    - generic: Include athletes with unknown birth year
                  - generic:
                    - generic: Search
                    - generic:
                      - textbox:
                        - /placeholder: Search athletes...
                      - img
                - generic:
                  - generic:
                    - generic: "Applied filters:"
                  - button: Clear all filters
            - generic:
              - generic:
                - generic:
                  - generic:
                    - heading [level=3]: All Athletes
                    - generic:
                      - combobox:
                        - generic: "25"
                        - img
                      - generic: 2 athletes
                - generic:
                  - table:
                    - rowgroup:
                      - row:
                        - columnheader:
                          - checkbox
                        - columnheader:
                          - generic:
                            - text: Athlete
                            - img
                        - columnheader:
                          - generic:
                            - text: Team
                            - img
                        - columnheader:
                          - generic:
                            - text: Birth Year
                            - img
                        - columnheader:
                          - generic:
                            - text: Gender
                            - img
                        - columnheader:
                          - generic:
                            - text: Position(s)
                            - img
                        - columnheader:
                          - generic:
                            - text: Sport
                            - img
                        - columnheader:
                          - generic:
                            - text: Status
                            - img
                        - columnheader: Invitation
                        - columnheader: Actions
                    - rowgroup:
                      - row:
                        - cell:
                          - checkbox
                        - cell:
                          - generic:
                            - generic:
                              - generic: TT
                            - generic:
                              - button: TestFirst_mo1tay04ru5gbh4ok4n TestLast_mo1tay04ru5gbh4ok4n
                              - paragraph: "ID: #c0359676"
                        - cell: Independent
                        - cell: "2005"
                        - cell: Not Specified
                        - cell: N/A
                        - cell: N/A
                        - cell:
                          - generic: Inactive
                        - cell: —
                        - cell:
                          - generic:
                            - button:
                              - img
                            - button:
                              - img
                            - button:
                              - img
                            - button:
                              - img
                            - button:
                              - img
                      - row:
                        - cell:
                          - checkbox
                        - cell:
                          - generic:
                            - generic:
                              - generic: TT
                            - generic:
                              - button: TestFirst_mo1tay0k4dzpev29dgm TestLast_mo1tay0k4dzpev29dgm
                              - paragraph: "ID: #235fbfe3"
                        - cell: Independent
                        - cell: "2005"
                        - cell: Not Specified
                        - cell: N/A
                        - cell: N/A
                        - cell:
                          - generic: Inactive
                        - cell: —
                        - cell:
                          - generic:
                            - button:
                              - img
                            - button:
                              - img
                            - button:
                              - img
                            - button:
                              - img
                            - button:
                              - img
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
  - dialog "Add New Athlete" [ref=e2]:
    - generic [ref=e4]:
      - heading "Add New Athlete" [level=2] [ref=e5]
      - paragraph [ref=e6]: Add a new athlete to your team by filling out the form below.
    - generic [ref=e7]:
      - generic [ref=e12]:
        - generic [ref=e13]:
          - generic [ref=e14]:
            - generic [ref=e15]: First Name *
            - textbox "First Name *" [ref=e16]:
              - /placeholder: First name
              - text: TestFirst_mo1tb3lw6ghy9b4ktlx
          - generic [ref=e17]:
            - generic [ref=e18]: Last Name *
            - textbox "Last Name *" [ref=e19]:
              - /placeholder: Last name
              - text: TestLast_mo1tb3lw6ghy9b4ktlx
        - generic [ref=e20]:
          - generic [ref=e21]:
            - generic [ref=e22]: Birth Date *
            - textbox "Birth Date *" [ref=e23]:
              - /placeholder: YYYY-MM-DD
          - generic [ref=e24]:
            - text: Graduation Year
            - spinbutton "Graduation Year" [ref=e25]: "2029"
          - generic [ref=e26]:
            - text: Gender
            - combobox "Select athlete gender" [ref=e27] [cursor=pointer]:
              - generic [ref=e28]: Select gender...
              - img [ref=e29]
            - combobox [ref=e31]
        - generic [ref=e32]:
          - text: School
          - textbox "School" [ref=e33]:
            - /placeholder: School name (optional)
        - generic [ref=e34]:
          - generic [ref=e35]:
            - img [ref=e36]
            - text: Sports
          - button "Add Sport" [ref=e43] [cursor=pointer]:
            - img
            - text: Add Sport
        - generic [ref=e44]:
          - generic [ref=e45]:
            - img [ref=e46]
            - text: Email Addresses
            - generic [ref=e49]: "*"
          - generic [ref=e50]:
            - generic [ref=e51]:
              - textbox "Enter email address" [active] [ref=e53]: invalid-email-format
              - button [ref=e54] [cursor=pointer]:
                - img
            - button "Add Email" [ref=e55] [cursor=pointer]:
              - img
              - text: Add Email
        - generic [ref=e56]:
          - generic [ref=e57]:
            - img [ref=e58]
            - text: Phone Numbers
          - button "Add Phone" [ref=e61] [cursor=pointer]:
            - img
            - text: Add Phone
        - generic [ref=e62]:
          - text: Parent/Guardian Email
          - paragraph [ref=e63]: Optional. If provided, the parent will be notified and can create an account to monitor this athlete.
          - textbox "Parent/Guardian Email" [ref=e64]:
            - /placeholder: parent@example.com
        - generic [ref=e65]:
          - generic [ref=e66]:
            - img [ref=e67]
            - text: Team Assignment
          - generic [ref=e72]:
            - paragraph [ref=e74]: No teams available
            - button "Create New Team" [ref=e75] [cursor=pointer]:
              - img
              - text: Create New Team
      - generic [ref=e77]:
        - button "Cancel" [ref=e78] [cursor=pointer]
        - button "Add Athlete" [ref=e79] [cursor=pointer]
    - button "Close" [ref=e80] [cursor=pointer]:
      - img [ref=e81]
      - generic [ref=e84]: Close
```

# Test source

```ts
  188 |     await page.click('[data-testid="button-add-email"]');
  189 |     await page.fill('[data-testid="input-email-0"]', testAthlete.email);
  190 | 
  191 |     // Capture athlete ID for cleanup (though this test deletes it anyway)
  192 |     const responsePromise = page.waitForResponse(response =>
  193 |       response.url().includes('/api/athletes') && response.request().method() === 'POST'
  194 |     );
  195 | 
  196 |     await page.click('[data-testid="submit-athlete"]');
  197 | 
  198 |     try {
  199 |       const response = await responsePromise;
  200 |       const athlete = await response.json();
  201 |       if (athlete?.id) createdAthleteIds.push(athlete.id);
  202 |     } catch (error) {
  203 |       console.warn('Failed to capture athlete ID for cleanup:', error);
  204 |     }
  205 | 
  206 |     await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });
  207 | 
  208 |     // Wait for athlete to appear in list
  209 |     await expect(async () => {
  210 |       const athleteCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
  211 |       expect(athleteCount).toBeGreaterThan(0);
  212 |     }).toPass({ timeout: 5000 });
  213 | 
  214 |     // Get initial athlete count
  215 |     const initialCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
  216 | 
  217 |     // Find and click delete button for the athlete (data-testid="delete-athlete")
  218 |     const deleteButton = page.locator('[data-testid="delete-athlete"]').first();
  219 |     await deleteButton.click();
  220 | 
  221 |     // Confirm deletion (if confirmation dialog appears)
  222 |     const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")');
  223 |     const confirmExists = await confirmButton.count();
  224 |     if (confirmExists > 0) {
  225 |       await confirmButton.first().click();
  226 |     }
  227 | 
  228 |     // Wait for deletion to complete
  229 |     await expect(async () => {
  230 |       const currentCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
  231 |       expect(currentCount).toBeLessThan(initialCount);
  232 |     }).toPass({ timeout: 5000 });
  233 | 
  234 |     // Verify athlete count decreased
  235 |     const finalCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
  236 |     expect(finalCount).toBeLessThan(initialCount);
  237 | 
  238 |     // Verify athlete no longer appears in list
  239 |     const deletedAthlete = await page.locator(`text=${testAthlete.firstName} ${testAthlete.lastName}`).count();
  240 |     expect(deletedAthlete).toBe(0);
  241 | 
  242 |     // Remove deleted athlete from cleanup tracker (already deleted by test)
  243 |     if (createdAthleteIds.length > 0) {
  244 |       createdAthleteIds.pop();
  245 |     }
  246 |   });
  247 | 
  248 |   test('should show validation errors for required fields', async ({ page }) => {
  249 |     // Click "Add Athlete" button
  250 |     await page.click('[data-testid="add-athlete-button"]');
  251 |     await page.waitForSelector('[role="dialog"], .modal', { timeout: 5000 });
  252 | 
  253 |     // Try to submit without filling required fields
  254 |     await page.click('[data-testid="submit-athlete"]');
  255 | 
  256 |     // Wait for validation errors to appear (use locator with .or() instead of waitForSelector which only accepts CSS)
  257 |     const errorLocator = page.locator('.error, [role="alert"]').or(page.locator('text=/required|must|invalid/i'));
  258 |     await errorLocator.first().waitFor({ timeout: 5000 });
  259 | 
  260 |     // Should still be on the form (modal visible)
  261 |     const modalVisible = await page.locator('[role="dialog"], .modal').count();
  262 |     expect(modalVisible).toBeGreaterThan(0);
  263 | 
  264 |     // Should show validation error messages
  265 |     const errorMessages = await errorLocator.count();
  266 |     expect(errorMessages).toBeGreaterThan(0);
  267 |   });
  268 | 
  269 |   test('should show validation error for invalid email format', async ({ page }) => {
  270 |     const testAthlete = generateTestAthlete();
  271 | 
  272 |     // Click "Add Athlete" button
  273 |     await page.click('[data-testid="add-athlete-button"]');
  274 |     await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  275 | 
  276 |     // Fill in fields with invalid email
  277 |     await page.fill('[data-testid="input-athlete-firstname"]', testAthlete.firstName);
  278 |     await page.fill('[data-testid="input-athlete-lastname"]', testAthlete.lastName);
  279 | 
  280 |     // Add email field and fill with invalid email
  281 |     await page.click('[data-testid="button-add-email"]');
  282 |     await page.fill('[data-testid="input-email-0"]', 'invalid-email-format');
  283 | 
  284 |     // Try to submit
  285 |     await page.click('[data-testid="submit-athlete"]');
  286 | 
  287 |     // Wait for email validation error to appear
> 288 |     await page.waitForSelector('text=/invalid.*email|valid email|email.*format/i', { timeout: 5000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
  289 | 
  290 |     // Should show email validation error
  291 |     const emailError = await page.locator('text=/invalid.*email|valid email|email.*format/i').count();
  292 |     expect(emailError).toBeGreaterThan(0);
  293 |   });
  294 | 
  295 |   test('should successfully view athlete profile', async ({ page }) => {
  296 |     const testAthlete = generateTestAthlete();
  297 | 
  298 |     // First, ensure there's at least one athlete
  299 |     const athleteCount = await page.locator('[data-testid^="button-view-athlete-"]').count();
  300 | 
  301 |     if (athleteCount === 0) {
  302 |       // Create an athlete first
  303 |       await page.click('[data-testid="add-athlete-button"]');
  304 |       await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  305 |       await page.fill('[data-testid="input-athlete-firstname"]', testAthlete.firstName);
  306 |       await page.fill('[data-testid="input-athlete-lastname"]', testAthlete.lastName);
  307 |       await page.fill('[data-testid="input-athlete-birthdate"]', testAthlete.birthDate);
  308 |       await page.click('[data-testid="button-add-email"]');
  309 |       await page.fill('[data-testid="input-email-0"]', testAthlete.email);
  310 | 
  311 |       // Capture athlete ID for cleanup
  312 |       const responsePromise = page.waitForResponse(response =>
  313 |         response.url().includes('/api/athletes') && response.request().method() === 'POST'
  314 |       );
  315 | 
  316 |       await page.click('[data-testid="submit-athlete"]');
  317 | 
  318 |       try {
  319 |         const response = await responsePromise;
  320 |         const athlete = await response.json();
  321 |         if (athlete?.id) createdAthleteIds.push(athlete.id);
  322 |       } catch (error) {
  323 |         console.warn('Failed to capture athlete ID for cleanup:', error);
  324 |       }
  325 | 
  326 |       await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });
  327 | 
  328 |       // Wait for athlete to appear in list
  329 |       await page.waitForSelector('[data-testid^="button-view-athlete-"]', { timeout: 10000 });
  330 |     }
  331 | 
  332 |     // Click "View" button for first athlete
  333 |     await page.click('[data-testid^="button-view-athlete-"]');
  334 | 
  335 |     // Wait for navigation to profile page - wait for URL change
  336 |     await page.waitForURL(/\/athlete\/[a-z0-9-]+/i, { timeout: 5000 });
  337 | 
  338 |     // Should be on athlete profile page
  339 |     expect(page.url()).toMatch(/\/athlete\/[a-z0-9-]+/i);
  340 | 
  341 |     // Profile page should show athlete information
  342 |     const profileContent = await page.locator('main, article, .profile').count();
  343 |     expect(profileContent).toBeGreaterThan(0);
  344 |   });
  345 | 
  346 |   test('should successfully perform bulk delete operation', async ({ page }) => {
  347 |     // First, create multiple athletes with unique data
  348 |     for (let i = 0; i < 2; i++) {
  349 |       const testAthlete = generateTestAthlete(); // Generate unique athlete per iteration
  350 |       await page.click('[data-testid="add-athlete-button"]');
  351 |       await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  352 |       await page.fill('[data-testid="input-athlete-firstname"]', testAthlete.firstName);
  353 |       await page.fill('[data-testid="input-athlete-lastname"]', testAthlete.lastName);
  354 |       await page.fill('[data-testid="input-athlete-birthdate"]', testAthlete.birthDate);
  355 |       await page.click('[data-testid="button-add-email"]');
  356 |       await page.fill('[data-testid="input-email-0"]', testAthlete.email);
  357 | 
  358 |       // Capture athlete ID for cleanup
  359 |       const responsePromise = page.waitForResponse(response =>
  360 |         response.url().includes('/api/athletes') && response.request().method() === 'POST'
  361 |       );
  362 | 
  363 |       await page.click('[data-testid="submit-athlete"]');
  364 | 
  365 |       try {
  366 |         const response = await responsePromise;
  367 |         const athlete = await response.json();
  368 |         if (athlete?.id) createdAthleteIds.push(athlete.id);
  369 |       } catch (error) {
  370 |         console.warn('Failed to capture athlete ID for cleanup:', error);
  371 |       }
  372 | 
  373 |       await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });
  374 | 
  375 |       // Wait for athlete to appear in list
  376 |       await page.waitForSelector('[data-testid^="checkbox-athlete-"]', { timeout: 5000 });
  377 |     }
  378 | 
  379 |     // Get initial count
  380 |     const initialCount = await page.locator('[data-testid^="checkbox-athlete-"]').count();
  381 | 
  382 |     // Select first two athletes
  383 |     const checkboxes = await page.locator('[data-testid^="checkbox-athlete-"]').all();
  384 |     if (checkboxes.length >= 2) {
  385 |       await checkboxes[0].click();
  386 |       await checkboxes[1].click();
  387 |     }
  388 | 
```