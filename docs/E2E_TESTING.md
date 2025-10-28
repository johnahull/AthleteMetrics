# E2E Testing Guide

This guide covers end-to-end testing for AthleteMetrics, including setup, running tests, and debugging.

## Overview

E2E tests validate user workflows against a deployed environment using Playwright. Tests run:
- **Locally**: Against local dev server or staging environment
- **In CI**: Automatically after Railway deployment to staging (on `develop` branch)

## Quick Start

### Running Tests Locally

```bash
# Against local development server
npm run dev  # In one terminal
npm run test:e2e  # In another terminal

# Against staging environment
STAGING_URL='https://athletemetrics-staging.up.railway.app' \
STAGING_USERNAME='your-username' \
STAGING_PASSWORD='your-password' \
npm run test:staging
```

### Writing New Tests

1. **Use Templates** - Start with a template from `tests/e2e/templates/`:
   ```bash
   # CRUD operations
   cp tests/e2e/templates/crud-template.spec.ts tests/e2e/my-feature.spec.ts

   # Authentication/Authorization
   cp tests/e2e/templates/auth-template.spec.ts tests/e2e/my-auth.spec.ts

   # Form validation
   cp tests/e2e/templates/form-validation-template.spec.ts tests/e2e/my-form.spec.ts
   ```

2. **Follow the template's HOW TO USE instructions**

3. **Run tests locally** to verify they pass

4. **Commit and push** - E2E tests will run automatically on develop

## CI/CD Integration

### Automated E2E Testing on Develop

**Workflow:** `develop` → Railway deploy → Health check → **E2E tests**

When you merge a PR to `develop`:
1. GitHub Actions triggers "Deploy to Staging" workflow
2. Code builds and deploys to Railway staging environment
3. Health check confirms deployment is live
4. **E2E tests run against deployed staging**
5. Test results and artifacts are uploaded to GitHub

### Viewing Test Results

**In GitHub Actions:**
1. Go to: https://github.com/[your-repo]/actions/workflows/staging-deploy.yml
2. Click the latest workflow run
3. Scroll to "Run E2E tests against deployed staging" step
4. View logs and download artifacts (screenshots, videos, HTML report)

**Test Artifacts:**
- **HTML Report**: `playwright-report/index.html` - Visual test results
- **Screenshots**: Captured on test failure
- **Videos**: Full browser recordings on failure
- **Traces**: Detailed execution traces for debugging

Artifacts are retained for **7 days** and available in the workflow run summary.

## GitHub Secrets Setup (One-Time)

E2E tests in CI require GitHub Secrets to authenticate with staging. Repository admins should set these up once:

### Required Secrets

| Secret Name | Description | Example Value |
|------------|-------------|---------------|
| `STAGING_URL` | Staging environment URL | `https://athletemetrics-staging.up.railway.app` |
| `STAGING_USERNAME` | Test user username | `test-admin` |
| `STAGING_PASSWORD` | Test user password | `SecurePassword123!` |

### How to Add Secrets

**Via GitHub UI:**
1. Navigate to: **Repository → Settings → Secrets and variables → Actions**
2. Click **"New repository secret"**
3. Enter secret name and value
4. Click **"Add secret"**
5. Repeat for all required secrets

**Via GitHub CLI:**
```bash
# From repository root
gh secret set STAGING_URL --body "https://athletemetrics-staging.up.railway.app"
gh secret set STAGING_USERNAME --body "your-test-username"
gh secret set STAGING_PASSWORD --body "your-test-password"
```

**Security Notes:**
- Secrets are encrypted and never visible in logs
- Use a dedicated test user account (not your personal account)
- Rotate secrets periodically
- Limit secrets to repository scope (not organization-wide)

## Debugging Failed Tests

### Local Debugging

**Run tests in headed mode (see browser):**
```bash
npx playwright test --headed
```

**Run single test:**
```bash
npx playwright test tests/e2e/athlete-crud.spec.ts
```

**Debug mode (pause execution):**
```bash
npx playwright test --debug
```

**View HTML report:**
```bash
npx playwright show-report
```

### CI Debugging

When E2E tests fail in CI:

1. **Download artifacts** from workflow run
2. **Open HTML report**: `playwright-report/index.html`
3. **View screenshots** in `test-results/`
4. **Watch failure videos** in `test-results/`
5. **Check console logs** in test output

**Common CI Issues:**
- **Selector not found**: Element may not exist in staging
- **Timeout**: Staging deployment may be slow
- **Authentication failed**: Check GitHub Secrets are set correctly
- **Flaky test**: Add explicit waits or improve selectors

## Test Organization

```
tests/e2e/
├── templates/           # Reusable test templates
│   ├── crud-template.spec.ts
│   ├── auth-template.spec.ts
│   └── form-validation-template.spec.ts
├── helpers/             # Shared helper functions
│   ├── auth.ts         # Login helpers
│   └── navigation.ts   # Navigation helpers
├── athlete-crud.spec.ts # Example: Athlete CRUD tests
└── global-setup.ts     # Test environment setup
```

## Best Practices

### Writing Reliable Tests

1. **Use data-testid attributes** for stable selectors:
   ```typescript
   await page.click('[data-testid="add-athlete-button"]');
   ```

2. **Wait for explicit conditions**:
   ```typescript
   await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
   ```

3. **Generate unique test data** to avoid conflicts:
   ```typescript
   const timestamp = Date.now();
   const testData = { name: `TestAthlete${timestamp}` };
   ```

4. **Clean up test data** after tests (if needed)

5. **Avoid hard-coded delays** - use `waitForSelector` instead of `sleep`

### Test Maintenance

- **Update tests when UI changes** - E2E tests break when selectors change
- **Keep tests focused** - One test per workflow
- **Use templates** for consistency
- **Review failed tests promptly** - Don't let failures accumulate

## Configuration

### Playwright Config

Main config: `playwright.staging.config.ts`

**Key settings:**
- `timeout`: 60 seconds per test
- `retries`: 1 retry in CI (0 locally)
- `workers`: 1 (sequential execution to avoid race conditions)
- `baseURL`: From `STAGING_URL` environment variable

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `STAGING_URL` | Staging environment URL | `http://localhost:5000` |
| `STAGING_USERNAME` | Test user username | (required) |
| `STAGING_PASSWORD` | Test user password | (required) |
| `CI` | Enables CI-specific behavior | `false` |

## Troubleshooting

### "Tests are not running in CI"

**Check:**
1. GitHub Secrets are set correctly
2. Railway deployment succeeded
3. Health check passed
4. Workflow logs for error messages

### "Tests pass locally but fail in CI"

**Possible causes:**
- Environment differences (local vs staging data)
- Timing issues (CI may be slower)
- Network latency
- Browser version differences

**Solutions:**
- Increase timeouts in CI
- Add explicit waits
- Use `page.waitForLoadState('networkidle')`

### "Flaky tests"

**Indicators:**
- Tests pass sometimes, fail other times
- Failures due to timeouts or "element not found"

**Fixes:**
- Add explicit waits before interactions
- Use `waitForSelector` with specific selectors
- Avoid relying on page load timing
- Check for race conditions

## Additional Resources

- **Playwright Docs**: https://playwright.dev/docs/intro
- **E2E Test Maintenance Policy**: See `CLAUDE.md`
- **PR Template**: `.github/pull_request_template.md`
- **Test Templates**: `tests/e2e/templates/`

## Support

For E2E testing questions:
1. Check this documentation
2. Review existing test examples
3. Check Playwright documentation
4. Ask in team chat/issues
