# AthleteMetrics E2E Testing Guide

## Overview

This directory contains end-to-end (E2E) tests for the AthleteMetrics application using Playwright. Tests are organized by feature area and follow Test-Driven Development (TDD) methodology.

## Prerequisites

### Environment Variables

E2E tests can run against **two environments**:
- **Staging Environment** - Pre-production environment for final testing
- **Testing Environment** - Continuous testing environment for integration testing

Set environment variables for the environment you want to test:

#### Staging Environment

```bash
# Required for all tests
export STAGING_URL="https://your-staging-environment.railway.app"
export STAGING_USERNAME="your-test-username"
export STAGING_PASSWORD="your-test-password"

# Optional: For test data setup (creates test org, users, teams in DB)
export DATABASE_URL="postgresql://user:password@host:port/dbname"

# Optional: Required for RBAC/Permissions tests (tests/e2e/permissions.spec.ts)
export E2E_SITE_ADMIN_USERNAME="test-site-admin"
export E2E_SITE_ADMIN_PASSWORD="your-site-admin-password"
export E2E_ORG_ADMIN_USERNAME="test-org-admin"
export E2E_ORG_ADMIN_PASSWORD="your-org-admin-password"
export E2E_COACH_USERNAME="test-coach"
export E2E_COACH_PASSWORD="your-coach-password"
export E2E_ATHLETE_USERNAME="test-athlete"
export E2E_ATHLETE_PASSWORD="your-athlete-password"
```

#### Testing Environment

```bash
# Required for all tests
export TESTING_URL="https://athletemetrics-testing.up.railway.app"
export TESTING_USERNAME="your-test-username"
export TESTING_PASSWORD="your-test-password"

# Optional: For test data setup (creates test org, users, teams in DB)
export TESTING_DATABASE_URL="postgresql://user:password@host:port/dbname"

# Optional: Required for RBAC/Permissions tests (same as staging)
export E2E_SITE_ADMIN_USERNAME="test-site-admin"
export E2E_SITE_ADMIN_PASSWORD="your-site-admin-password"
export E2E_ORG_ADMIN_USERNAME="test-org-admin"
export E2E_ORG_ADMIN_PASSWORD="your-org-admin-password"
export E2E_COACH_USERNAME="test-coach"
export E2E_COACH_PASSWORD="your-coach-password"
export E2E_ATHLETE_USERNAME="test-athlete"
export E2E_ATHLETE_PASSWORD="your-athlete-password"
```

**Environment Auto-Detection**:
The E2E framework automatically detects which environment to use based on which variables are set:
- If `TESTING_URL` or `TESTING_USERNAME` is set → uses **Testing** environment
- Otherwise → uses **Staging** environment

Alternatively, create environment files in the project root:

`.env.staging`:
```env
# Required for all tests
STAGING_URL=https://your-staging-environment.railway.app
STAGING_USERNAME=your-test-username
STAGING_PASSWORD=your-test-password
DATABASE_URL=postgresql://user:password@host:port/dbname

# Required for RBAC/Permissions tests
E2E_SITE_ADMIN_USERNAME=test-site-admin
E2E_SITE_ADMIN_PASSWORD=your-site-admin-password
E2E_ORG_ADMIN_USERNAME=test-org-admin
E2E_ORG_ADMIN_PASSWORD=your-org-admin-password
E2E_COACH_USERNAME=test-coach
E2E_COACH_PASSWORD=your-coach-password
E2E_ATHLETE_USERNAME=test-athlete
E2E_ATHLETE_PASSWORD=your-athlete-password
```

`.env.testing`:
```env
# Required for all tests
TESTING_URL=https://athletemetrics-testing.up.railway.app
TESTING_USERNAME=your-test-username
TESTING_PASSWORD=your-test-password
TESTING_DATABASE_URL=postgresql://user:password@host:port/dbname

# Required for RBAC/Permissions tests
E2E_SITE_ADMIN_USERNAME=test-site-admin
E2E_SITE_ADMIN_PASSWORD=your-site-admin-password
E2E_ORG_ADMIN_USERNAME=test-org-admin
E2E_ORG_ADMIN_PASSWORD=your-org-admin-password
E2E_COACH_USERNAME=test-coach
E2E_COACH_PASSWORD=your-coach-password
E2E_ATHLETE_USERNAME=test-athlete
E2E_ATHLETE_PASSWORD=your-athlete-password
```

### Staging Environment Setup

1. Ensure the staging environment is deployed and accessible
2. Create test user accounts with the credentials above:
   - **Primary test account**: Used for most E2E tests (STAGING_USERNAME/STAGING_PASSWORD)
   - **RBAC test accounts**: Required for permissions testing (16 RBAC tests)
     - Site Admin: Full system access
     - Org Admin: Organization-scoped access
     - Coach: Team-scoped access
     - Athlete: Self-scoped access only
3. Verify the staging environment is healthy by running validation tests:

```bash
npm run test:staging:validate
```

**Note**: RBAC tests (16 tests in `permissions.spec.ts`) will be skipped if the role-based environment variables are not set. This allows running the other 63 tests without RBAC test accounts.

## Running Tests

### All E2E Tests

#### Against Staging Environment
```bash
npm run test:staging
```

#### Against Testing Environment
```bash
npm run test:testing
```

### Validation Tests Only

Quick validation tests to verify environment is working:

```bash
# Staging
npm run test:staging:validate

# Testing
npm run test:testing:validate
```

### Specific Test Suite

```bash
# Staging
npm run test:staging -- tests/e2e/auth-flows.spec.ts
npm run test:staging -- tests/e2e/athlete-crud.spec.ts
npm run test:staging -- tests/e2e/measurement-entry.spec.ts
npm run test:staging -- tests/e2e/csv-import.spec.ts
npm run test:staging -- tests/e2e/permissions.spec.ts

# Testing
npm run test:testing -- tests/e2e/auth-flows.spec.ts
npm run test:testing -- tests/e2e/athlete-crud.spec.ts
npm run test:testing -- tests/e2e/measurement-entry.spec.ts
npm run test:testing -- tests/e2e/csv-import.spec.ts
npm run test:testing -- tests/e2e/permissions.spec.ts
```

### Debug Mode

Run tests with headed browser (visible):

```bash
# Staging
npx playwright test --config=playwright.staging.config.ts --headed

# Testing
npx playwright test --config=playwright.testing.config.ts --headed
```

### UI Mode (Interactive)

```bash
# Staging
npx playwright test --config=playwright.staging.config.ts --ui

# Testing
npx playwright test --config=playwright.testing.config.ts --ui
```

## Test Structure

```
tests/e2e/
├── fixtures/              # Test data and CSV files
│   ├── test-data.ts      # Athlete, team, measurement fixtures
│   ├── test-users.ts     # User fixtures with different roles
│   └── csv-files/        # CSV test files
├── helpers/               # Reusable helper functions
│   ├── auth.ts           # Login, logout, session helpers
│   ├── athlete.ts        # Create, edit, delete athletes
│   ├── measurement.ts    # Add, verify measurements
│   ├── csv.ts            # CSV upload and import helpers
│   ├── navigation.ts     # Navigation utilities
│   └── assertions.ts     # Custom assertions
├── pages/                 # Page Object Models
│   ├── LoginPage.ts      # Login page interactions
│   ├── DashboardPage.ts  # Dashboard page
│   ├── AthletesPage.ts   # Athletes list/management
│   ├── MeasurementPage.ts # Measurement entry
│   └── ImportPage.ts     # CSV import page
├── global-setup.ts        # Test environment setup
├── global-teardown.ts     # Test environment cleanup
├── auth-flows.spec.ts     # Authentication tests (8 tests)
├── athlete-crud.spec.ts   # Athlete CRUD tests (8 tests)
├── measurement-entry.spec.ts # Measurement tests (8 tests)
├── csv-import.spec.ts     # CSV import tests (10 tests)
└── permissions.spec.ts    # RBAC/permissions tests (10 tests)
```

## Test Coverage

### TIER 1 CRITICAL Tests (44 total)

#### Authentication (8 tests)
- Login with valid credentials
- Login with invalid credentials
- Logout functionality
- Session persistence
- Unauthorized access protection
- Form validation
- Loading states
- Login redirects

#### Athlete CRUD (8 tests)
- Create new athlete
- Edit athlete
- Delete athlete
- Form validation (required fields)
- Form validation (email format)
- View athlete profile
- Bulk delete
- Search/filter athletes

#### Measurements (8 tests)
- Add measurement for athlete
- Measurement appears in profile
- Validation errors
- Verify measurement
- Edit measurement
- Delete measurement
- Multiple measurement types
- Measurement history

#### CSV Import (10 tests)
- Upload CSV and show preview
- Column mapping workflow
- Confirm import creates athletes
- Import error handling
- Large file handling
- Auto-create teams during import
- Import measurements from CSV
- Duplicate athlete handling
- Cancel import flow
- Import progress tracking

#### RBAC/Permissions (10 tests)
- Athlete role: own data only
- Coach role: team athletes only
- Org admin: org-scoped access
- Site admin: full access
- Unauthorized access → 403
- Organization context switching
- Data filtered by organization
- Cross-org data isolation
- Permission-based navigation
- Role inheritance

## TDD Workflow

These tests were created using Test-Driven Development:

1. **Write Test First** - Define expected behavior
2. **Run Test** - Watch it fail (Red)
3. **Build Infrastructure** - Create helpers/pages needed
4. **Run Test Again** - Watch it pass (Green)
5. **Refactor** - Improve code quality
6. **Commit** - Save working test

## Best Practices

### Test Independence
- Each test should be runnable in isolation
- Tests create their own test data
- Tests clean up after themselves
- No dependencies between tests

### Selectors
- Prefer `data-testid` attributes over text/CSS selectors
- Use semantic selectors when possible
- Avoid brittle selectors (nth-child, specific classes)

### Reliability
- Use `waitForLoadState('networkidle')` after navigation
- Use explicit waits over arbitrary timeouts
- Handle race conditions properly
- Retry flaky network operations

### Data Management
- Use fixtures for realistic test data
- Clean up test data after each test
- Avoid polluting production-like environments
- Use unique identifiers (timestamps, UUIDs)

## Debugging Failed Tests

### View Test Report

```bash
npx playwright show-report
```

### View Trace

```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

### Screenshots

Screenshots are automatically captured on test failure and saved to `test-results/`

### Videos

Videos are recorded for failed tests and saved to `test-results/`

## CI/CD Integration

These tests are designed to run in GitHub Actions. See `.github/workflows/` for the CI configuration.

## Troubleshooting

### Tests Failing with Connection Refused

Ensure `STAGING_URL` is set correctly and the staging environment is running.

### Tests Failing with Invalid Credentials

Ensure `STAGING_USERNAME` and `STAGING_PASSWORD` match a valid test account in the staging environment.

### Tests Timing Out

Increase timeout in `playwright.staging.config.ts` or use `--timeout` flag:

```bash
npx playwright test --config=playwright.staging.config.ts --timeout=90000
```

### Rate Limiting Issues

If tests fail due to rate limiting, ensure the staging environment has appropriate rate limit settings for testing.

## Contributing

When adding new E2E tests:

1. Follow TDD methodology (test-first)
2. Add tests to appropriate spec file
3. Create/update helpers and page objects as needed
4. Add `data-testid` attributes to components
5. Document any new environment variables
6. Ensure tests pass locally before committing
7. Update this README if adding new test categories

## Support

For issues with E2E tests, check:
- Playwright documentation: https://playwright.dev
- AthleteMetrics repository issues
- Team Slack channel
