# AthleteMetrics E2E Testing Guide

## Overview

This directory contains end-to-end (E2E) tests for the AthleteMetrics application using Playwright. Tests are organized by feature area and follow Test-Driven Development (TDD) methodology.

## Prerequisites

### Environment Variables

Before running E2E tests, set the following environment variables:

```bash
export STAGING_URL="https://your-staging-environment.railway.app"
export STAGING_USERNAME="your-test-username"
export STAGING_PASSWORD="your-test-password"
```

Alternatively, create a `.env.staging` file in the project root:

```env
STAGING_URL=https://your-staging-environment.railway.app
STAGING_USERNAME=your-test-username
STAGING_PASSWORD=your-test-password
```

### Staging Environment Setup

1. Ensure the staging environment is deployed and accessible
2. Create a test user account with the credentials above
3. Verify the staging environment is healthy by running validation tests:

```bash
npm run test:staging:validate
```

## Running Tests

### All E2E Tests

```bash
npm run test:staging
```

### Specific Test Suite

```bash
npm run test:staging -- tests/e2e/auth-flows.spec.ts
npm run test:staging -- tests/e2e/athlete-crud.spec.ts
npm run test:staging -- tests/e2e/measurement-entry.spec.ts
npm run test:staging -- tests/e2e/csv-import.spec.ts
npm run test:staging -- tests/e2e/permissions.spec.ts
```

### Debug Mode

Run tests with headed browser (visible):

```bash
npx playwright test --config=playwright.staging.config.ts --headed
```

### UI Mode (Interactive)

```bash
npx playwright test --config=playwright.staging.config.ts --ui
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
