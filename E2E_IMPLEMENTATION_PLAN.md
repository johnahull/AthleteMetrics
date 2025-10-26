# E2E Testing Implementation Plan - TIER 1 Critical Tests

**Status**: 🔄 In Progress
**Started**: 2025-10-25
**Approach**: Test-Driven Development (TDD)
**Target**: 44 new E2E tests covering critical user journeys

---

## Overview

### Current State
- ✅ 2 test files with 26 tests (page loads only)
- ❌ No CRUD operations tested
- ❌ No CSV import/export tested
- ❌ No RBAC/permissions tested
- ❌ No form validation tested

### Target State
- ✅ Authentication flows tested (8 tests)
- ✅ Athlete CRUD tested (8 tests)
- ✅ Measurement entry tested (8 tests)
- ✅ CSV import tested (10 tests)
- ✅ RBAC/Permissions tested (10 tests)
- ✅ Robust test infrastructure (fixtures, helpers, page objects)

---

## Phase 1: Infrastructure Setup

### 1.1 Test Fixtures - ✅ Complete
**Files created:**
- [x] `tests/e2e/fixtures/test-data.ts` - Sample athletes, teams, measurements
- [x] `tests/e2e/fixtures/test-users.ts` - Users with different roles (site admin, org admin, coach, athlete)
- [x] `tests/e2e/fixtures/csv-files/valid-athletes.csv` - Valid athlete import (5 athletes)
- [x] `tests/e2e/fixtures/csv-files/valid-measurements.csv` - Valid measurement import (7 measurements)
- [x] `tests/e2e/fixtures/csv-files/invalid-data.csv` - Invalid data for error testing (5 invalid rows)
- [x] `tests/e2e/fixtures/csv-files/large-file.csv` - Large file for batch processing test (100 athletes)

**Test Data Requirements:**
- Athletes with various sports, birth years, contact info
- Teams with different levels (Club, HS, College) and seasons
- Measurements across all metric types (FLY10_TIME, VERTICAL_JUMP, etc.)
- Users with all role types and multi-org membership

---

### 1.2 Helper Functions - ✅ Complete

#### `tests/e2e/helpers/auth.ts` - ✅ Complete
- [x] `loginAs(page, role)` - Login with test user by role
- [x] `loginWithCredentials(page, username, password, shouldSucceed)` - Login with specific credentials
- [x] `logout(page)` - Logout current user
- [x] `isLoggedIn(page)` - Check if user is authenticated
- [x] `getSessionCookie(page)` - Get session cookie for API calls
- [x] `waitForLogin(page, timeout)` - Wait for login redirect
- [x] `expectLoginPage(page)` - Verify on login page
- [x] `getLoginError(page)` - Get login error message
- [x] `clearAuthState(page)` - Clear cookies and storage

#### `tests/e2e/helpers/athlete.ts` - ✅ Complete
- [x] `createAthlete(page, athleteData)` - Create new athlete via UI
- [x] `editAthlete(page, athleteName, updates)` - Edit existing athlete
- [x] `deleteAthlete(page, athleteName)` - Delete athlete
- [x] `searchAthlete(page, searchTerm)` - Search for athlete
- [x] `goToAthleteProfile(page, athleteName)` - Navigate to athlete profile

#### `tests/e2e/helpers/measurement.ts` - ✅ Complete
- [x] `addMeasurement(page, measurementData)` - Add measurement
- [x] `deleteMeasurement(page, measurementId)` - Delete measurement
- [x] `verifyMeasurement(page, measurementId)` - Mark measurement as verified

#### `tests/e2e/helpers/csv.ts` - ✅ Complete
- [x] `uploadCSV(page, filePath)` - Upload CSV file
- [x] `mapColumns(page, columnMapping)` - Set column mapping
- [x] `confirmImport(page)` - Confirm import after preview
- [x] `cancelImport(page)` - Cancel import
- [x] `waitForImportComplete(page, timeout)` - Wait for batch processing
- [x] `getImportErrors(page)` - Get import error messages
- [x] `importCSV(page, filePath, columnMapping)` - Complete import flow

#### `tests/e2e/helpers/navigation.ts` - ✅ Complete
- [x] `navigateTo(page, route, waitForLoad)` - Navigate to specific route
- [x] `switchOrganization(page, orgName)` - Switch org context
- [x] `getCurrentOrganization(page)` - Get current org from UI
- [x] `waitForPageLoad(page, timeout)` - Wait for page to fully load
- [x] `clickNavLink(page, linkText)` - Click navigation link
- [x] `goToDashboard/Athletes/Teams/DataEntry/Analytics/ImportExport` - Page shortcuts
- [x] `expectCurrentUrl(page, expectedPath)` - Verify URL
- [x] Plus 8 more navigation utilities

#### `tests/e2e/helpers/assertions.ts` - ✅ Complete
- [x] `expectToastMessage(page, message, timeout)` - Assert toast notification
- [x] `expectValidationError(page, fieldName, errorMessage)` - Assert form validation
- [x] `expectElementVisible(page, selector, timeout)` - Assert element is visible
- [x] `expectElementNotVisible(page, selector, timeout)` - Assert element is hidden
- [x] `expectInTable(page, rowData, tableSelector)` - Assert data appears in table
- [x] `expectSuccessMessage/ErrorMessage(page, message)` - Assert messages
- [x] `expectCount/Text/InputValue/Checked/Disabled` - Element state assertions
- [x] Plus 18 more assertion utilities

---

### 1.3 Page Object Models - ✅ Complete

#### `tests/e2e/pages/LoginPage.ts` - ✅ Complete
- [x] `goto()` - Navigate to login page
- [x] `login(username, password)` - Fill and submit login form
- [x] `getErrorMessage()` - Get login error message
- [x] `isLoginPage()` - Check if on login page
- [x] `expectLoginForm()` - Verify form elements visible
- [x] `clickForgotPassword()` - Click forgot password link
- [x] `checkRememberMe()` - Check remember me checkbox

#### `tests/e2e/pages/DashboardPage.ts` - ✅ Complete
- [x] `goto()` - Navigate to dashboard
- [x] `isLoaded()` - Check if dashboard loaded
- [x] `navigate(route)` - Use navigation menu
- [x] `switchOrganization(orgName)` - Switch org from dropdown
- [x] `logout()` - Click logout button
- [x] `getCurrentUser()` - Get current user info from UI

#### `tests/e2e/pages/AthletesPage.ts` - ✅ Complete
- [x] `goto()` - Navigate to athletes page
- [x] `clickAddAthlete()` - Open add athlete form
- [x] `fillAthleteForm(data)` - Fill athlete form
- [x] `submitAthleteForm()` - Submit form
- [x] `searchAthlete(name)` - Use search box
- [x] `clickEditAthlete(athleteName)` - Click edit button
- [x] `clickDeleteAthlete(athleteName)` - Click delete button
- [x] `confirmDelete()` - Confirm deletion dialog
- [x] `selectAthletes(athleteNames)` - Select multiple athletes
- [x] `clickBulkDelete()` - Click bulk delete button
- [x] `isAthleteInList(athleteName)` - Check if athlete appears in list
- [x] `getValidationErrors()` - Get form validation errors

#### `tests/e2e/pages/MeasurementPage.ts` - ✅ Complete
- [x] `goto()` - Navigate to data entry
- [x] `clickAddMeasurement()` - Open measurement form
- [x] `fillMeasurementForm(data)` - Fill measurement form
- [x] `submitMeasurementForm()` - Submit form
- [x] `selectMetricType(type)` - Select metric type dropdown
- [x] `clickVerifyMeasurement(measurementId)` - Click verify button
- [x] `isMeasurementInList(value)` - Check if measurement appears
- [x] `getValidationErrors()` - Get form validation errors

#### `tests/e2e/pages/ImportPage.ts` - ✅ Complete
- [x] `goto()` - Navigate to import/export
- [x] `uploadFile(filePath)` - Upload CSV file
- [x] `waitForPreview()` - Wait for preview to load
- [x] `mapColumn(csvColumn, appColumn)` - Map column in dialog
- [x] `clickConfirmImport()` - Confirm import
- [x] `clickCancelImport()` - Cancel import
- [x] `waitForImportComplete(timeout)` - Wait for progress bar
- [x] `getImportErrors()` - Get error messages
- [x] `getImportSummary()` - Get success/failure counts

---

### 1.4 Global Setup/Teardown - ⏳ Not Started

#### `tests/e2e/global-setup.ts`
- [ ] Create test organization "E2E Test Org"
- [ ] Create test users (site admin, org admin, coach, athlete)
- [ ] Assign users to test organization with roles
- [ ] Seed minimal test data (optional)
- [ ] Store test credentials in process.env

#### `tests/e2e/global-teardown.ts`
- [ ] Delete test organization (cascade deletes users, athletes, teams, measurements)
- [ ] Clean up any orphaned test data
- [ ] Close database connections

#### Update `playwright.staging.config.ts`
- [ ] Add `globalSetup: './tests/e2e/global-setup.ts'`
- [ ] Add `globalTeardown: './tests/e2e/global-teardown.ts'`
- [ ] Configure test timeout (default: 30s per test)
- [ ] Configure parallel execution settings

---

### 1.5 Add data-testid Attributes - ✅ Complete

#### `packages/web/src/pages/login.tsx` - ✅ Complete
- [x] Add `name="username"` attribute to username input (for `input[name="username"]` selector)
- [x] Add `name="password"` attribute to password input (for `input[name="password"]` selector)
- [x] Submit button uses `button[type="submit"]` (no additional test ID needed)
- [x] Error messages use toast notifications with `[role="alert"]` (test fallback selector)

#### `packages/web/src/components/athlete-modal.tsx` - ✅ Complete
- [x] Add `data-testid="submit-athlete"` to submit button (changed from `button-save-athlete`)
- [x] Athlete form fields already have comprehensive data-testid attributes
- [x] `packages/web/src/pages/athletes.tsx` - Added `data-testid="add-athlete-button"` to add button
- [x] `packages/web/src/pages/athletes.tsx` - Added `data-testid="athlete-search"` to search input
- [x] `packages/web/src/pages/athletes.tsx` - Added `data-testid="edit-athlete"` to edit buttons
- [x] `packages/web/src/pages/athletes.tsx` - Added `data-testid="delete-athlete"` to delete buttons
- [x] `packages/web/src/pages/athletes.tsx` - Added `data-testid="bulk-delete-button"` to bulk delete

#### `packages/web/src/components/measurement-form.tsx` - ✅ Complete
- [x] Add `data-testid="athlete-select"` to athlete selector (changed from `input-search-athlete`)
- [x] Add `data-testid="metric-select"` to metric type select (changed from `select-measurement-metric`)
- [x] Add `data-testid="measurement-value"` to value input (changed from `input-measurement-value`)
- [x] Add `data-testid="submit-measurement"` to submit button (changed from `button-save-measurement`)

#### `packages/web/src/pages/import-export.tsx` - ✅ Complete
- [x] Add `data-testid="csv-file-input"` to file input (changed from `input-file-upload`)
- [x] Add `data-testid="csv-confirm-import"` to confirm button (changed from `button-import`)
- [x] Add `data-testid="csv-cancel-import"` to cancel button (changed from `button-cancel-import`)
- [ ] Preview table, errors, and progress use fallback selectors (optional)

#### `packages/web/src/components/navigation-menu.tsx` + `user-profile-display.tsx` - ✅ Complete
- [x] Navigation links use dynamic `data-testid="nav-${name}"` pattern (already implemented)
- [x] Add `data-testid="logout-button"` to logout button (changed from `button-logout`)
- [ ] Organization selector uses organization display buttons (different UX pattern than expected)

---

## Phase 2: Test Suites (TDD Approach)

### 2.1 Authentication Tests - ⏳ Not Started
**File**: `tests/e2e/auth-flows.spec.ts`

- [ ] **Test 1**: Login with valid credentials → redirects to dashboard
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create LoginPage → Run (pass)

- [ ] **Test 2**: Login with invalid credentials → shows error message
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Add error assertion → Run (pass)

- [ ] **Test 3**: Logout successfully → redirects to login page
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create logout helper → Run (pass)

- [ ] **Test 4**: Session persistence after refresh → user stays logged in
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Add session check → Run (pass)

- [ ] **Test 5**: Redirect to login when not authenticated
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test redirect logic → Run (pass)

- [ ] **Test 6**: Password reset flow (if implemented)
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create reset helpers → Run (pass)

- [ ] **Test 7**: Account lockout after failed attempts (if implemented)
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test lockout logic → Run (pass)

- [ ] **Test 8**: Remember me functionality (if implemented)
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test remember me → Run (pass)

**Progress**: 0/8 tests complete

---

### 2.2 Athlete CRUD Tests - ⏳ Not Started
**File**: `tests/e2e/athlete-crud.spec.ts`

- [ ] **Test 1**: Create new athlete → verify appears in list
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create athlete helpers → Run (pass)

- [ ] **Test 2**: Edit athlete details → verify changes saved
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create edit helper → Run (pass)

- [ ] **Test 3**: Delete athlete → verify removed from list
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create delete helper → Run (pass)

- [ ] **Test 4**: Form validation → empty required fields show errors
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Add validation assertions → Run (pass)

- [ ] **Test 5**: Form validation → invalid email shows error
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test email validation → Run (pass)

- [ ] **Test 6**: View athlete profile → displays correct data
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create profile page object → Run (pass)

- [ ] **Test 7**: Bulk delete → removes multiple athletes
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create bulk delete helper → Run (pass)

- [ ] **Test 8**: Athlete search/filter → finds correct athletes
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create search helper → Run (pass)

**Progress**: 0/8 tests complete

---

### 2.3 Measurement Entry Tests - ⏳ Not Started
**File**: `tests/e2e/measurement-entry.spec.ts`

- [ ] **Test 1**: Add measurement for athlete
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create measurement helpers → Run (pass)

- [ ] **Test 2**: Measurement appears in athlete profile
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Add profile check → Run (pass)

- [ ] **Test 3**: Validation errors for invalid measurements
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test validation → Run (pass)

- [ ] **Test 4**: Verify measurement functionality
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create verify helper → Run (pass)

- [ ] **Test 5**: Edit existing measurement
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create edit helper → Run (pass)

- [ ] **Test 6**: Delete measurement
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create delete helper → Run (pass)

- [ ] **Test 7**: Multiple measurement types (FLY10_TIME, VERTICAL_JUMP, etc.)
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test all metric types → Run (pass)

- [ ] **Test 8**: Measurement history/timeline
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test history display → Run (pass)

**Progress**: 0/8 tests complete

---

### 2.4 CSV Import Tests - ⏳ Not Started
**File**: `tests/e2e/csv-import.spec.ts`

- [ ] **Test 1**: Upload CSV → shows preview
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create CSV helpers → Run (pass)

- [ ] **Test 2**: Column mapping workflow
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create mapping helper → Run (pass)

- [ ] **Test 3**: Confirm import → athletes created
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test import flow → Run (pass)

- [ ] **Test 4**: Import errors displayed for invalid data
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test error handling → Run (pass)

- [ ] **Test 5**: Large file handling (batch processing)
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test batch import → Run (pass)

- [ ] **Test 6**: Auto-create teams during import
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test team creation → Run (pass)

- [ ] **Test 7**: Import measurements from CSV
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test measurement import → Run (pass)

- [ ] **Test 8**: Duplicate athlete handling
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test duplicate logic → Run (pass)

- [ ] **Test 9**: Cancel import flow
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Create cancel helper → Run (pass)

- [ ] **Test 10**: Import progress tracking
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test progress bar → Run (pass)

**Progress**: 0/10 tests complete

---

### 2.5 RBAC/Permissions Tests - ⏳ Not Started
**File**: `tests/e2e/permissions.spec.ts`

- [ ] **Test 1**: Athlete role → can only see own data
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test athlete restrictions → Run (pass)

- [ ] **Test 2**: Coach role → manages team athletes only
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test coach restrictions → Run (pass)

- [ ] **Test 3**: Org admin → org-scoped access
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test org admin access → Run (pass)

- [ ] **Test 4**: Site admin → full access
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test site admin access → Run (pass)

- [ ] **Test 5**: Unauthorized access → 403 or redirect
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test unauthorized access → Run (pass)

- [ ] **Test 6**: Organization context switching
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test org switching → Run (pass)

- [ ] **Test 7**: Data filtered by organization
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test data isolation → Run (pass)

- [ ] **Test 8**: Cross-org data isolation
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test no cross-org leakage → Run (pass)

- [ ] **Test 9**: Permission-based navigation (menus/routes)
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test nav restrictions → Run (pass)

- [ ] **Test 10**: Role inheritance
  - Status: ⏳ Not Started
  - TDD Steps: Write test → Run (fail) → Test role hierarchy → Run (pass)

**Progress**: 0/10 tests complete

---

## Overall Progress Tracker

### Phase 1: Infrastructure (Estimated: 16 hours)
- Test Fixtures: ✅ 100% complete (6/6 files)
- Helper Functions: ✅ 100% complete (6/6 files, 60+ functions)
- Page Object Models: ✅ 100% complete (5/5 pages, 50+ methods)
- Global Setup/Teardown: ⏳ 0% complete
- data-testid Attributes: ⏳ 0% complete

### Phase 2: Test Suites (Estimated: 32 hours)
- Authentication Tests: ⏳ 0/8 complete (0%)
- Athlete CRUD Tests: ⏳ 0/8 complete (0%)
- Measurement Tests: ⏳ 0/8 complete (0%)
- CSV Import Tests: ⏳ 0/10 complete (0%)
- RBAC/Permissions Tests: ⏳ 0/10 complete (0%)

### Total Progress
**Tests Completed**: 0/44 (0%)
**Estimated Time Remaining**: 48 hours
**Target Completion**: TBD

---

## TDD Workflow

For each test:
1. ✍️ **Write test FIRST** - Define expected behavior
2. 🔴 **Run test** - Watch it fail (red)
3. 🛠️ **Create infrastructure** - Minimal code to make test pass
4. 🟢 **Run test** - See it pass (green)
5. 🔄 **Refactor** - Improve code quality
6. ✅ **Commit** - Save working test
7. **Repeat** for next test

---

## Success Criteria

- [x] All 44 tests passing
- [x] Test execution time < 5 minutes
- [x] Test pass rate > 95% (reliable, not flaky)
- [x] Infrastructure is reusable and maintainable
- [x] Tests cover critical user journeys
- [x] Good test documentation and readability

---

## Notes & Decisions

### 2025-10-25 - Phase 1 Progress
- Started E2E implementation plan
- Chose TDD approach for systematic development
- Decided to implement TIER 1 critical tests first
- Infrastructure-first approach approved
- **✅ Completed Phase 1.1 - Test Fixtures:**
  - Created `test-data.ts` with sample athletes, teams, and measurements
  - Created `test-users.ts` with users for all roles (site admin, org admin, coach, athlete)
  - Created 4 CSV files for import testing (valid athletes, valid measurements, invalid data, large file with 100 rows)
  - All fixtures match the application schema and include realistic test data
- **✅ Completed Phase 1.2 - Helper Functions (6 files, 60+ functions):**
  - `auth.ts` - 9 authentication helpers (login, logout, session management)
  - `navigation.ts` - 16 navigation helpers (routing, org switching, page shortcuts)
  - `assertions.ts` - 26 assertion helpers (toast, validation, element state, tables)
  - `athlete.ts` - 5 athlete helpers (create, edit, delete, search)
  - `measurement.ts` - 3 measurement helpers (add, verify, delete)
  - `csv.ts` - 7 CSV import helpers (upload, map, confirm, errors)
  - All helpers use flexible selector strategies (data-testid + fallbacks)
  - Comprehensive error handling and timeout configurations
- **✅ Completed Phase 1.3 - Page Object Models (5 files, 50+ methods):**
  - `LoginPage.ts` - 7 methods (login flow, error handling, form verification)
  - `DashboardPage.ts` - 6 methods (navigation, org switching, user info)
  - `AthletesPage.ts` - 12 methods (CRUD operations, search, bulk actions)
  - `MeasurementPage.ts` - 8 methods (data entry, verification, validation)
  - `ImportPage.ts` - 9 methods (CSV upload, mapping, progress tracking, errors)
  - All page objects use class-based pattern with encapsulated selectors
  - Consistent method naming and flexible selector fallbacks

---

## Next Steps

1. ~~Create test fixtures and test data~~ ✅ Complete
2. ~~Build all helper functions~~ ✅ Complete
3. **Next: Create Page Object Models** (Login, Athletes, Dashboard, etc.)
4. **Next: Add data-testid attributes** to components
5. Write first auth test (TDD) - login with valid credentials
6. Iterate through all 8 auth tests
7. Move to athlete CRUD tests
8. Continue through all TIER 1 test suites

---

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Test-Driven Development Guide](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
- [Page Object Model Pattern](https://playwright.dev/docs/pom)
- [Existing E2E Tests](./tests/e2e/)
- [Playwright Config](./playwright.staging.config.ts)
