# Reports Feature - Visual Testing Checklist

## Prerequisites

1. Dev server running: `npm run dev`
2. Database seeded with test data
3. Login as coach/org admin user
4. At least 1 team and 5 athletes with measurements

## Test Scenarios

### Scenario 1: Empty State
**URL**: `/reports`

**Expected**:
- Empty state card with icon
- "No reports yet" message
- "Create Report" button
- Responsive layout (mobile/tablet/desktop)

**Visual Checks**:
- [ ] Icon displays correctly
- [ ] Text is centered
- [ ] Button is prominent
- [ ] Card has proper spacing
- [ ] Mobile view: stack layout
- [ ] Tablet view: centered card
- [ ] Desktop view: centered with max width

**Screenshots**:
- `reports-empty-desktop.png`
- `reports-empty-tablet.png`
- `reports-empty-mobile.png`

---

### Scenario 2: Reports List
**URL**: `/reports` (with existing reports)

**Expected**:
- Header with "Reports" title and description
- "Create Report" button in header
- Table with columns: Name, Type, Description, Created, Actions
- Report type badges (Coach/Individual)
- View and Delete action buttons
- Date formatting (MMM d, yyyy)

**Visual Checks**:
- [ ] Table is responsive
- [ ] Badges have correct colors (Coach=default, Individual=secondary)
- [ ] Action buttons have hover states
- [ ] Truncated long descriptions with ellipsis
- [ ] Mobile: Table scrolls horizontally or stacks
- [ ] Tablet: Full table visible
- [ ] Desktop: Optimal spacing

**Screenshots**:
- `reports-list-desktop.png`
- `reports-list-tablet.png`
- `reports-list-mobile.png`

---

### Scenario 3: Report Wizard - Step 1 (Report Type)
**Action**: Click "Create Report"

**Expected**:
- Dialog modal opens
- Title: "Create New Report"
- Subtitle: "Step 1 of 7"
- Progress bar at 14% (1/7)
- Two report type options:
  - Coach Report (card with description)
  - Individual Report (card with description)
- Cards have hover effect
- Selected card highlighted

**Visual Checks**:
- [ ] Modal centers on screen
- [ ] Progress bar animates smoothly
- [ ] Radio buttons are styled correctly
- [ ] Cards have border on hover
- [ ] Back button is disabled (Step 1)
- [ ] Next button is enabled
- [ ] Modal has proper z-index
- [ ] Close X button visible

**Screenshots**:
- `wizard-step1-coach-selected.png`
- `wizard-step1-individual-selected.png`

---

### Scenario 4: Report Wizard - Step 2 (Basic Details)
**Action**: Click "Next"

**Expected**:
- Progress bar at 29% (2/7)
- "Report Name" input (required)
- "Description" textarea (optional)
- Placeholder text in inputs
- Validation error if name is empty and "Next" clicked

**Visual Checks**:
- [ ] Inputs have proper spacing
- [ ] Labels are clear
- [ ] Required asterisk (*) on name
- [ ] Textarea expands properly
- [ ] Back button enabled
- [ ] Next button enabled
- [ ] Error message displays below input if validation fails

**Screenshots**:
- `wizard-step2-empty.png`
- `wizard-step2-filled.png`
- `wizard-step2-validation-error.png`

---

### Scenario 5: Report Wizard - Step 3 (Timeframe)
**Action**: Click "Next"

**Expected**:
- Progress bar at 43% (3/7)
- Radio group: "Preset" or "Custom"
- If Preset selected:
  - Dropdown with: Season, Year, All Time
- If Custom selected:
  - Two date inputs: Start Date, End Date

**Visual Checks**:
- [ ] Radio buttons toggle correctly
- [ ] Dropdown shows options
- [ ] Date inputs have calendar picker
- [ ] Layout switches smoothly between preset/custom
- [ ] Dates are validated (start < end)

**Screenshots**:
- `wizard-step3-preset.png`
- `wizard-step3-custom.png`

---

### Scenario 6: Report Wizard - Step 4 (Metrics)
**Action**: Click "Next"

**Expected**:
- Progress bar at 57% (4/7)
- Title: "Select Metrics *"
- Scrollable list of checkboxes
- Each metric shows: name, unit, category
- At least 1 metric must be selected
- Validation error if none selected

**Visual Checks**:
- [ ] Checkbox list is scrollable (max-height)
- [ ] Checkboxes have hover states
- [ ] Labels are clickable
- [ ] Selected metrics are highlighted
- [ ] Scroll indicator if list is long
- [ ] Error message if validation fails

**Screenshots**:
- `wizard-step4-metrics-list.png`
- `wizard-step4-metrics-selected.png`
- `wizard-step4-validation-error.png`

---

### Scenario 7: Report Wizard - Step 5 (Benchmarks - Optional)
**Action**: Click "Next"

**Expected**:
- Progress bar at 71% (5/7)
- Title: "Benchmarks (Optional)"
- Two sections:
  - Site Benchmarks (if available)
  - Custom Benchmarks (if available)
- Each section has scrollable checkbox list
- "Skip" button visible

**Visual Checks**:
- [ ] Sections are collapsible or clearly separated
- [ ] Empty state if no benchmarks available
- [ ] Checkboxes work independently
- [ ] Scroll works in each section
- [ ] Skip button is prominent

**Screenshots**:
- `wizard-step5-benchmarks.png`
- `wizard-step5-no-benchmarks.png`

---

### Scenario 8: Report Wizard - Step 6 (Filters - Optional)
**Action**: Click "Next"

**Expected**:
- Progress bar at 86% (6/7)
- Title: "Filters (Optional)"
- Teams checkbox list (scrollable)
- Gender dropdown (All, Male, Female)
- Positions multi-select (if applicable)

**Visual Checks**:
- [ ] Team list scrolls properly
- [ ] Dropdown shows all options
- [ ] No teams selected = all teams included
- [ ] Clear visual separation between filters

**Screenshots**:
- `wizard-step6-filters.png`
- `wizard-step6-filters-selected.png`

---

### Scenario 9: Report Wizard - Step 7 (Composite Index - Coach Only)
**Action**: Click "Next"

**Expected** (Coach Report):
- Progress bar at 100% (7/7)
- Checkbox: "Enable Composite Index"
- If enabled:
  - Weight sliders for each selected metric
  - Sum must equal 1.0
  - Validation if sum != 1.0
- "Create Report" button (not "Next")

**Expected** (Individual Report):
- Progress bar at 100% (7/7)
- Review summary
- "Create Report" button

**Visual Checks**:
- [ ] Checkbox toggles weight UI
- [ ] Sliders display correctly
- [ ] Metric labels align with sliders
- [ ] Sum validation displays
- [ ] Create button is prominent
- [ ] Loading spinner on submit

**Screenshots**:
- `wizard-step7-composite-disabled.png`
- `wizard-step7-composite-enabled.png`
- `wizard-step7-individual-summary.png`

---

### Scenario 10: Coach Report View
**URL**: `/reports/[REPORT_ID]`

**Expected**:
- Back button to /reports
- Report header card:
  - Report name (large)
  - Description
  - Generated date
  - "Export PDF" button
  - "Share" button
- Performance Snapshot table:
  - Test, Team Avg, Benchmarks, Top Performer, Range
- Per-metric ranking tables:
  - Rank (#1, #2, #3 highlighted), Athlete, Team, Score
- Composite Index table (if enabled):
  - Rank, Athlete, Team, Composite Score

**Visual Checks**:
- [ ] Header card is prominent
- [ ] Action buttons are accessible
- [ ] Tables are responsive
- [ ] Top 3 ranks have badges
- [ ] Data aligns correctly
- [ ] Mobile: Tables scroll horizontally
- [ ] Loading spinner during generation

**Screenshots**:
- `coach-report-header.png`
- `coach-report-snapshot-table.png`
- `coach-report-rankings.png`
- `coach-report-composite.png`
- `coach-report-full-desktop.png`
- `coach-report-mobile.png`

---

### Scenario 11: Individual Report View
**URL**: `/reports/[REPORT_ID]`

**Expected**:
- Back button
- Report header card:
  - Report name
  - Athlete name (large)
  - Team name
  - Generated date
  - Actions: Export PDF, Share
- Performance Summary table:
  - Metric, Best Result, Team Rank (#badge), Percentile (Xth), Benchmarks
- Test History section:
  - Per-metric history (most recent 5 tests)
  - Date, Value

**Visual Checks**:
- [ ] Athlete name is prominent
- [ ] Rank badges display correctly
- [ ] Percentiles formatted (50th, 75th, 90th)
- [ ] Benchmark comparison badges (above/below)
- [ ] Test history sorted newest first
- [ ] Responsive layout

**Screenshots**:
- `individual-report-header.png`
- `individual-report-performance.png`
- `individual-report-history.png`
- `individual-report-full.png`

---

### Scenario 12: Share Dialog
**Action**: Click "Share" button on report

**Expected**:
- Dialog modal opens
- Title: "Share Report"
- Section 1: Create New Link
  - Expiration dropdown (1/7/30 days, Custom)
  - Custom date picker (if Custom)
  - "Create Link" button
  - Generated URL (readonly input)
  - "Copy" button
- Section 2: Active Links
  - Table: Created, Expires, Views, Actions
  - Copy and Revoke buttons per link

**Visual Checks**:
- [ ] Modal is scrollable
- [ ] Sections are clearly separated
- [ ] Date picker appears for custom
- [ ] Generated URL is copyable
- [ ] Active links table is responsive
- [ ] Clock and eye icons display
- [ ] Copy confirmation toast appears
- [ ] Revoke confirmation dialog

**Screenshots**:
- `share-dialog-initial.png`
- `share-dialog-custom-date.png`
- `share-dialog-link-generated.png`
- `share-dialog-active-links.png`

---

### Scenario 13: Public Report View
**URL**: `/public/reports/[TOKEN]` (no auth)

**Expected**:
- Full-page layout (no sidebar/nav)
- Watermark bar: "Shared Report", Generated date, "Read-Only" badge
- Same report content as private view
- NO edit/delete buttons
- NO share button

**Visual Checks**:
- [ ] No authentication required
- [ ] Read-only badge is prominent
- [ ] Generated date is visible
- [ ] All report data displays
- [ ] No action buttons
- [ ] Clean, shareable design
- [ ] Responsive layout

**Screenshots**:
- `public-report-watermark.png`
- `public-report-coach.png`
- `public-report-individual.png`
- `public-report-mobile.png`

---

### Scenario 14: Public Report - Expired Link
**URL**: `/public/reports/[EXPIRED_TOKEN]`

**Expected**:
- Centered card
- Lock icon
- "Access Denied" title
- Message: "This report link is invalid, expired, or has been revoked."

**Visual Checks**:
- [ ] Error message is clear
- [ ] Lock icon displays
- [ ] Card is centered
- [ ] No layout shift

**Screenshots**:
- `public-report-expired.png`

---

### Scenario 15: Delete Report Confirmation
**Action**: Click delete icon on report in list

**Expected**:
- Alert dialog appears
- Title: "Delete Report"
- Message: "Are you sure you want to delete this report? This action cannot be undone."
- Buttons: "Cancel", "Delete"

**Visual Checks**:
- [ ] Dialog centers on screen
- [ ] Warning text is red/destructive
- [ ] Cancel button is secondary
- [ ] Delete button is destructive style
- [ ] Keyboard navigation works (Tab, Enter, Esc)

**Screenshots**:
- `delete-report-dialog.png`

---

### Scenario 16: Dark Mode (if supported)
**Action**: Toggle dark mode

**Expected**:
- All components support dark theme
- Text contrast meets WCAG AA
- Cards have proper background
- Borders are visible
- Hover states work

**Visual Checks**:
- [ ] Reports list in dark mode
- [ ] Wizard in dark mode
- [ ] Report view in dark mode
- [ ] Share dialog in dark mode
- [ ] Public report in dark mode

**Screenshots**:
- `reports-list-dark.png`
- `wizard-dark.png`
- `coach-report-dark.png`

---

### Scenario 17: Accessibility Testing
**Tools**: Axe DevTools, Keyboard navigation

**Visual Checks**:
- [ ] All interactive elements focusable
- [ ] Focus ring visible
- [ ] Tab order logical
- [ ] ARIA labels on icons
- [ ] Form labels associated with inputs
- [ ] Error messages announced
- [ ] Modals trap focus
- [ ] Escape closes dialogs
- [ ] Enter submits forms

**Test Flow**:
1. Tab through reports list
2. Open wizard with keyboard
3. Navigate wizard with Tab/Shift+Tab
4. Submit form with Enter
5. Close dialogs with Escape

---

## Responsive Breakpoints

- **Mobile**: 375px - 767px
- **Tablet**: 768px - 1023px
- **Desktop**: 1024px+

## Browser Testing

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

## Performance Testing

- [ ] Page load time < 3s
- [ ] Wizard opens instantly
- [ ] Report generation shows loading state
- [ ] Tables render smoothly with 50+ rows
- [ ] Smooth scrolling in lists
- [ ] No layout shift during loading

## Success Criteria

- All 17 scenarios pass visual inspection
- All responsive breakpoints work
- All accessibility checks pass
- All browsers render correctly
- All 34 E2E tests pass
- No console errors
- No TypeScript errors
- No React warnings

## Screenshot Deliverables

Total: ~50 screenshots documenting entire feature
- Empty states: 3
- Reports list: 3
- Wizard (7 steps x 2 states): 14
- Coach report: 6
- Individual report: 4
- Share dialog: 4
- Public reports: 4
- Delete confirmation: 1
- Dark mode: 5
- Accessibility: 5

## Next Steps After Visual Testing

1. Fix any visual bugs found
2. Adjust spacing/alignment issues
3. Improve mobile responsiveness if needed
4. Add missing hover states
5. Enhance loading states
6. Run E2E tests to validate functionality
7. Create PR with screenshots
