# Testing Environment E2E Setup Guide

## Quick Start

The testing environment is already configured and ready to use!

### 1. Environment File

Your testing credentials are already configured in `.env.testing`:

```bash
TESTING_URL=https://athletemetrics-testing.up.railway.app
TESTING_USERNAME=texasfcadmin1
TESTING_PASSWORD=Way2good@99?
TESTING_DATABASE_URL=postgresql://postgres:rdnrfZfXPiZWKbahqepvoYnYerNoLiRG@maglev.proxy.rlwy.net:29985/railway
```

**Note**: This file is gitignored and won't be committed to the repository.

### 2. Run E2E Tests

```bash
# Load testing environment variables
source .env.testing

# Run all E2E tests against testing environment
npm run test:testing

# Or run validation tests only (quick health check)
npm run test:testing:validate
```

### 3. Run Specific Test Suites

```bash
# Load testing environment
source .env.testing

# Run specific test files
npm run test:testing -- tests/e2e/auth-flows.spec.ts
npm run test:testing -- tests/e2e/athlete-crud.spec.ts
npm run test:testing -- tests/e2e/permissions.spec.ts
```

## How It Works

The E2E test framework **automatically detects** which environment to use:

- If `TESTING_URL` or `TESTING_USERNAME` is set → **Testing environment**
- Otherwise → **Staging environment**

This means:
1. When you run `npm run test:testing`, it uses `playwright.testing.config.ts`
2. Global setup/teardown automatically detect testing environment variables
3. Tests run against `https://athletemetrics-testing.up.railway.app`
4. Test data is created in the testing database (if `TESTING_DATABASE_URL` is set)

## Test Data Setup

With `TESTING_DATABASE_URL` configured, the global setup will:

1. ✅ Verify testing environment is accessible
2. ✅ Verify login credentials work (`texasfcadmin1` / `Way2good@99?`)
3. ✅ Create "E2E Test Organization" (idempotent - checks if exists)
4. ✅ Create test user with org admin role
5. ✅ Create "E2E Test Team" within the organization
6. ✅ Assign users to organization and team

**Teardown** cleans up:
- Test athletes created during tests (via API)
- Test users, teams, organizations (via database)

## Debug Mode

Run tests with visible browser:

```bash
source .env.testing
npx playwright test --config=playwright.testing.config.ts --headed
```

## UI Mode (Interactive)

Explore and debug tests interactively:

```bash
source .env.testing
npx playwright test --config=playwright.testing.config.ts --ui
```

## View Test Reports

After running tests:

```bash
# View HTML report
npx playwright show-report playwright-report-testing

# View trace for failed test
npx playwright show-trace test-results-testing/<test-name>/trace.zip
```

## Environment Comparison

| Feature | Staging | Testing |
|---------|---------|---------|
| **URL** | Custom staging URL | `https://athletemetrics-testing.up.railway.app` |
| **Username** | `STAGING_USERNAME` | `texasfcadmin1` |
| **Database** | `DATABASE_URL` | `TESTING_DATABASE_URL` |
| **Config File** | `playwright.staging.config.ts` | `playwright.testing.config.ts` |
| **Run Command** | `npm run test:staging` | `npm run test:testing` |
| **Report Dir** | `playwright-report/` | `playwright-report-testing/` |
| **Results Dir** | `test-results/` | `test-results-testing/` |

## Troubleshooting

### Tests fail with "Connection Refused"

Verify the testing environment is running:
```bash
curl -I https://athletemetrics-testing.up.railway.app
```

### Tests fail with "Invalid Credentials"

Verify credentials in `.env.testing` match the testing environment:
- Username: `texasfcadmin1`
- Password: `Way2good@99?`

### Database connection fails

Verify `TESTING_DATABASE_URL` is correct:
```bash
echo $TESTING_DATABASE_URL
```

Should output:
```
postgresql://postgres:rdnrfZfXPiZWKbahqepvoYnYerNoLiRG@maglev.proxy.rlwy.net:29985/railway
```

### Clear test data manually

If test data isn't being cleaned up properly:

```bash
# Login to Railway
railway login

# Connect to testing database
railway run --environment testing bash
psql $DATABASE_URL

-- Delete E2E test organization and related data
DELETE FROM organizations WHERE name = 'E2E Test Organization';
```

## CI/CD Integration

To run these tests in GitHub Actions:

1. Add secrets to repository:
   - `TESTING_URL`
   - `TESTING_USERNAME`
   - `TESTING_PASSWORD`
   - `TESTING_DATABASE_URL`

2. Add to workflow:

```yaml
- name: Run E2E Tests (Testing Environment)
  env:
    TESTING_URL: ${{ secrets.TESTING_URL }}
    TESTING_USERNAME: ${{ secrets.TESTING_USERNAME }}
    TESTING_PASSWORD: ${{ secrets.TESTING_PASSWORD }}
    TESTING_DATABASE_URL: ${{ secrets.TESTING_DATABASE_URL }}
  run: npm run test:testing
```

## Next Steps

1. **Run validation**: `npm run test:testing:validate`
2. **Run full suite**: `npm run test:testing`
3. **Check results**: `npx playwright show-report playwright-report-testing`
4. **Set up RBAC tests** (optional): Add E2E_SITE_ADMIN_*, E2E_ORG_ADMIN_*, etc. to `.env.testing`

## Support

- Documentation: `tests/e2e/README.md`
- Playwright Docs: https://playwright.dev
- Implementation Plan: `E2E_IMPLEMENTATION_PLAN.md`
