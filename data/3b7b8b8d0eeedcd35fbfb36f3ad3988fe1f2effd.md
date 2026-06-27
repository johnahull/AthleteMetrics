# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: batch-measurement-entry.spec.ts >> Quick Setup Wizard Tests >> should pre-populate athleteId and metric in generated rows
- Location: tests/e2e/batch-measurement-entry.spec.ts:700:3

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid="team-checkbox"]').first()

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
              - generic:
                - heading [level=1]: Data Entry
              - generic:
                - tablist:
                  - tab: Single Entry
                  - tab [selected]: Batch Entry
                  - tab: Import/Export
                  - tab: Device Import
                - tabpanel:
                  - generic:
                    - generic:
                      - generic: Batch Measurement Entry
                      - generic: Enter measurements for multiple athletes at once
                    - generic:
                      - generic:
                        - button:
                          - img
                          - text: Quick Setup
                        - button:
                          - img
                          - text: Add Row
                        - button [disabled]:
                          - img
                          - text: Copy Previous Row
                        - button [disabled]:
                          - img
                          - text: Clear All
                        - generic:
                          - button [disabled]:
                            - img
                            - text: Save All
                      - generic:
                        - paragraph: No measurements yet. Click "Add Row" to start adding measurements.
              - generic:
                - generic:
                  - heading [level=3]: Recent Entries
                  - generic:
                    - generic:
                      - paragraph: No recent measurements found.
                      - paragraph: Start by adding a new measurement above.
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
  - dialog "Quick Setup Wizard" [ref=e2]:
    - generic [ref=e3]:
      - heading "Quick Setup Wizard" [level=2] [ref=e4]:
        - img [ref=e5]
        - text: Quick Setup Wizard
      - paragraph [ref=e8]: Pre-configure your batch entry grid with teams, metrics, and settings
    - generic [ref=e9]:
      - generic [ref=e10]:
        - generic [ref=e11]: Step 1 of 4
        - generic [ref=e12]: 25%
      - progressbar [ref=e13]
    - generic [ref=e16]:
      - 'heading "Step 1: Select Athletes" [level=3] [ref=e17]'
      - paragraph [ref=e18]: Choose teams or individual athletes for batch data entry
      - generic [ref=e19]:
        - generic [ref=e20]:
          - generic [ref=e22]:
            - img [ref=e23]
            - text: Select by Team or Individual
          - generic [ref=e28]:
            - generic [ref=e29]:
              - generic [ref=e30]:
                - img [ref=e31]
                - textbox "Search athletes or teams..." [active] [ref=e34]
              - generic [ref=e35]:
                - button "Select All" [disabled]
                - button "Clear All" [disabled]
            - generic [ref=e40]:
              - img [ref=e41]
              - paragraph [ref=e46]: No athletes available
        - generic [ref=e47]:
          - generic [ref=e49]:
            - generic [ref=e50]:
              - img [ref=e51]
              - text: Selected Athletes
            - generic [ref=e54]: "0"
          - generic [ref=e59]:
            - img [ref=e61]
            - paragraph [ref=e64]: No athletes selected
            - paragraph [ref=e65]: Select teams or individual athletes from the left panel
    - generic [ref=e66]:
      - button "Cancel" [ref=e67] [cursor=pointer]
      - generic [ref=e68]:
        - button "Next" [disabled]
    - button "Close" [ref=e69] [cursor=pointer]:
      - img [ref=e70]
      - generic [ref=e73]: Close
```

# Test source

```ts
  606 | 
  607 |     // Should show 3 selected
  608 |     const selectedCount = page.locator('text=/3.*metrics.*selected|selected.*3/i');
  609 |     await expect(selectedCount).toBeVisible();
  610 |   });
  611 | 
  612 |   test('should configure date and measurements per athlete in Step 3', async ({ page }) => {
  613 |     // Open wizard and navigate to Step 3
  614 |     const wizardButton = page.locator('[data-testid="batch-quick-setup"], button:has-text("Quick Setup")');
  615 |     await wizardButton.click();
  616 | 
  617 |     const teamCheckbox = page.locator('[data-testid="team-checkbox"]').first();
  618 |     await teamCheckbox.click();
  619 | 
  620 |     const nextButton = page.locator('button:has-text("Next")');
  621 |     await nextButton.click();
  622 | 
  623 |     const metricCheckbox = page.locator('[data-testid="metric-checkbox"]').first();
  624 |     await metricCheckbox.click();
  625 |     await nextButton.click();
  626 | 
  627 |     // Should show date picker with default value
  628 |     const dateInput = page.locator('[data-testid="wizard-date"], input[type="date"]');
  629 |     await expect(dateInput).toBeVisible();
  630 | 
  631 |     // Should show measurements per athlete input
  632 |     const measurementsInput = page.locator('[data-testid="wizard-measurements-per-athlete"], input[type="number"]');
  633 |     await expect(measurementsInput).toBeVisible();
  634 | 
  635 |     // Change measurements per athlete to 2
  636 |     await measurementsInput.fill('2');
  637 |     await expect(measurementsInput).toHaveValue('2');
  638 |   });
  639 | 
  640 |   test('should display review summary with correct totals in Step 4', async ({ page }) => {
  641 |     // Open wizard and go through all steps
  642 |     const wizardButton = page.locator('[data-testid="batch-quick-setup"], button:has-text("Quick Setup")');
  643 |     await wizardButton.click();
  644 | 
  645 |     const teamCheckbox = page.locator('[data-testid="team-checkbox"]').first();
  646 |     await teamCheckbox.click();
  647 | 
  648 |     const nextButton = page.locator('button:has-text("Next")');
  649 |     await nextButton.click();
  650 | 
  651 |     // Select 2 metrics
  652 |     const metricCheckboxes = page.locator('[data-testid="metric-checkbox"]');
  653 |     await metricCheckboxes.nth(0).click();
  654 |     await metricCheckboxes.nth(1).click();
  655 |     await nextButton.click();
  656 | 
  657 |     // Set measurements per athlete to 2
  658 |     const measurementsInput = page.locator('[data-testid="wizard-measurements-per-athlete"], input[type="number"]');
  659 |     await measurementsInput.fill('2');
  660 |     await nextButton.click();
  661 | 
  662 |     // Should show review summary
  663 |     await expect(page.locator('text=/total.*rows|rows.*to.*generate/i')).toBeVisible();
  664 | 
  665 |     // Should show calculation (e.g., "10 athletes × 2 metrics × 2 = 40 rows")
  666 |     const summaryText = page.locator('[data-testid="wizard-summary"]');
  667 |     await expect(summaryText).toBeVisible();
  668 |   });
  669 | 
  670 |   test('should generate grid rows when wizard is completed', async ({ page }) => {
  671 |     // Open wizard
  672 |     const wizardButton = page.locator('[data-testid="batch-quick-setup"], button:has-text("Quick Setup")');
  673 |     await wizardButton.click();
  674 | 
  675 |     // Complete wizard
  676 |     const teamCheckbox = page.locator('[data-testid="team-checkbox"]').first();
  677 |     await teamCheckbox.click();
  678 | 
  679 |     const nextButton = page.locator('button:has-text("Next")');
  680 |     await nextButton.click();
  681 | 
  682 |     const metricCheckbox = page.locator('[data-testid="metric-checkbox"]').first();
  683 |     await metricCheckbox.click();
  684 |     await nextButton.click();
  685 |     await nextButton.click();
  686 | 
  687 |     // Click Generate Grid
  688 |     const generateButton = page.locator('button:has-text("Generate Grid")');
  689 |     await generateButton.click();
  690 | 
  691 |     // Wizard should close
  692 |     await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  693 | 
  694 |     // Grid should have rows
  695 |     const rows = page.locator('[data-testid^="batch-row-"]');
  696 |     const rowCount = await rows.count();
  697 |     expect(rowCount).toBeGreaterThan(0);
  698 |   });
  699 | 
  700 |   test('should pre-populate athleteId and metric in generated rows', async ({ page }) => {
  701 |     // Open wizard and generate grid
  702 |     const wizardButton = page.locator('[data-testid="batch-quick-setup"], button:has-text("Quick Setup")');
  703 |     await wizardButton.click();
  704 | 
  705 |     const teamCheckbox = page.locator('[data-testid="team-checkbox"]').first();
> 706 |     await teamCheckbox.click();
      |                        ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  707 | 
  708 |     const nextButton = page.locator('button:has-text("Next")');
  709 |     await nextButton.click();
  710 | 
  711 |     const metricCheckbox = page.locator('[data-testid="metric-checkbox"]').first();
  712 |     await metricCheckbox.click();
  713 |     await nextButton.click();
  714 |     await nextButton.click();
  715 | 
  716 |     const generateButton = page.locator('button:has-text("Generate Grid")');
  717 |     await generateButton.click();
  718 | 
  719 |     // Check first row has pre-populated athlete
  720 |     const firstRow = page.locator('[data-testid^="batch-row-"]').first();
  721 |     const athleteSelect = firstRow.locator('select').first();
  722 |     const athleteValue = await athleteSelect.inputValue();
  723 |     expect(athleteValue).not.toBe('');
  724 | 
  725 |     // Check first row has pre-populated metric
  726 |     const metricSelect = firstRow.locator('select').nth(1);
  727 |     const metricValue = await metricSelect.inputValue();
  728 |     expect(metricValue).not.toBe('');
  729 |   });
  730 | 
  731 |   test('should close wizard when Cancel is clicked', async ({ page }) => {
  732 |     // Open wizard
  733 |     const wizardButton = page.locator('[data-testid="batch-quick-setup"], button:has-text("Quick Setup")');
  734 |     await wizardButton.click();
  735 | 
  736 |     // Click Cancel
  737 |     const cancelButton = page.locator('button:has-text("Cancel")');
  738 |     await cancelButton.click();
  739 | 
  740 |     // Wizard should close
  741 |     await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  742 | 
  743 |     // No rows should be generated
  744 |     const rows = page.locator('[data-testid^="batch-row-"]');
  745 |     const rowCount = await rows.count();
  746 |     expect(rowCount).toBe(0);
  747 |   });
  748 | 
  749 |   test('should require at least one athlete to proceed from Step 1', async ({ page }) => {
  750 |     // Open wizard
  751 |     const wizardButton = page.locator('[data-testid="batch-quick-setup"], button:has-text("Quick Setup")');
  752 |     await wizardButton.click();
  753 | 
  754 |     // Try to click Next without selecting athletes
  755 |     const nextButton = page.locator('button:has-text("Next")');
  756 | 
  757 |     // Next button should be disabled or show error
  758 |     const isDisabled = await nextButton.isDisabled();
  759 |     if (!isDisabled) {
  760 |       await nextButton.click();
  761 |       // Should show validation error
  762 |       await expect(page.locator('text=/select.*athlete|athlete.*required/i')).toBeVisible();
  763 |     }
  764 |   });
  765 | 
  766 |   test('should require at least one metric to proceed from Step 2', async ({ page }) => {
  767 |     // Open wizard and navigate to Step 2
  768 |     const wizardButton = page.locator('[data-testid="batch-quick-setup"], button:has-text("Quick Setup")');
  769 |     await wizardButton.click();
  770 | 
  771 |     const teamCheckbox = page.locator('[data-testid="team-checkbox"]').first();
  772 |     await teamCheckbox.click();
  773 | 
  774 |     const nextButton = page.locator('button:has-text("Next")');
  775 |     await nextButton.click();
  776 | 
  777 |     // Try to proceed without selecting metrics
  778 |     const isDisabled = await nextButton.isDisabled();
  779 |     if (!isDisabled) {
  780 |       await nextButton.click();
  781 |       // Should show validation error
  782 |       await expect(page.locator('text=/select.*metric|metric.*required/i')).toBeVisible();
  783 |     }
  784 |   });
  785 | });
  786 | 
  787 | test.describe('Batch Measurement Entry Summary', () => {
  788 |   test('print batch measurement entry test summary', async () => {
  789 |     console.log('\n═══════════════════════════════════════════════════');
  790 |     console.log('Batch Measurement Entry Tests Summary');
  791 |     console.log('═══════════════════════════════════════════════════');
  792 |     console.log('✅ Navigate to batch entry tab from data entry page');
  793 |     console.log('✅ Display empty grid with add row button');
  794 |     console.log('✅ Add multiple rows to grid');
  795 |     console.log('✅ Fill out complete batch entry row');
  796 |     console.log('✅ Copy previous row data except athlete');
  797 |     console.log('✅ Delete row from grid');
  798 |     console.log('✅ Save batch of measurements successfully');
  799 |     console.log('✅ Auto-save draft to localStorage');
  800 |     console.log('✅ Restore draft from localStorage after reload');
  801 |     console.log('✅ Support keyboard navigation with Tab');
  802 |     console.log('✅ Show validation errors for incomplete rows');
  803 |     console.log('✅ Clear all rows when requested');
  804 |     console.log('✅ Display mobile card view on small screens');
  805 |     console.log('✅ Handle batch save errors gracefully');
  806 |     console.log('✅ Show row-specific errors after failed save');
```