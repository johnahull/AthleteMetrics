# AthleteMetrics E2E Test Suite

Comprehensive end-to-end testing for the AthleteMetrics application using Playwright.

## Overview

This test suite validates all major pages and features in the staging environment:

- **Authentication**: Login/logout flows
- **Navigation**: All major routes (Dashboard, Teams, Athletes, Organizations, User Management, Data Entry, Analytics, Import/Export, Profile, Admin)
- **Page Loading**: Verifies pages load without console errors or network failures
- **UI Elements**: Checks for critical UI components
- **Interactions**: Tests key user interactions (navigation, context switching)
- **Error Detection**: Monitors console errors and network failures

## Prerequisites

1. **Playwright Installation**:
   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Staging Environment**: A deployed staging environment with test data

3. **Test Account**: A test user account in the staging environment

## Configuration

### Environment Variables

Create a `.env.staging` file (copy from `.env.staging.example`):

```bash
cp .env.staging.example .env.staging
```

Then edit `.env.staging` with your actual staging credentials:

```env
STAGING_URL=https://your-staging-app.railway.app
STAGING_USERNAME=your-test-username
STAGING_PASSWORD=your-test-password
```

**IMPORTANT**: Never commit `.env.staging` to version control. It's already in `.gitignore`.

## Running Tests

### Basic Usage

```bash
# Run all E2E tests against staging
npm run test:staging
```

### Advanced Options

```bash
# Run tests in headed mode (see browser window)
PLAYWRIGHT_HEADED=true npm run test:staging

# Run specific test file
npx playwright test tests/e2e/staging-full-flow.spec.ts --config=playwright.staging.config.ts

# Run tests in debug mode
PWDEBUG=1 npm run test:staging

# Run tests with UI mode (interactive)
npx playwright test --ui --config=playwright.staging.config.ts
```

## Test Structure

### Test Files

- **`staging-full-flow.spec.ts`**: Comprehensive test suite covering all major pages and features

### Helper Functions

- **`login(page)`**: Logs into the application
- **`logout(page)`**: Logs out of the application
- **`checkConsoleErrors(page, context)`**: Monitors console for errors
- **`checkNetworkErrors(page)`**: Monitors network requests for failures

## What Gets Tested

### Pages Tested

- ✅ Login page
- ✅ Dashboard
- ✅ Teams page
- ✅ Athletes page (including individual athlete profiles)
- ✅ Organizations page
- ✅ User Management page (if user has access)
- ✅ Data Entry page
- ✅ Analytics page
- ✅ Coach Analytics page
- ✅ Athlete Analytics page
- ✅ Import/Export page
- ✅ Profile page
- ✅ Admin page (if user is site admin)

### Validations

For each page:
- Page loads successfully (no 404/500 errors)
- URL is correct
- Main content is visible
- No console errors
- Screenshot captured for visual verification

### Key Interactions

- Login/logout flow
- Navigation between pages
- Organization context switching (if available)
- Button clicks (non-destructive)
- Dropdown interactions

## Test Philosophy

### Idempotent Tests

All tests are **idempotent** - they only **read** data, never create/modify/delete. This ensures:
- Tests can run multiple times without side effects
- No cleanup required
- Safe to run against staging with real data

### Non-Destructive

Tests interact with the UI but:
- Never submit forms that modify data
- Never delete records
- Only verify existing functionality

## Output & Artifacts

### Test Reports

After running tests:

```bash
# View HTML report
npx playwright show-report
```

### Screenshots

Screenshots are saved to `screenshots/` directory:
- `dashboard.png`
- `teams.png`
- `athletes.png`
- `athlete-profile.png`
- `organizations.png`
- `user-management.png`
- `data-entry.png`
- `analytics.png`
- `coach-analytics.png`
- `athlete-analytics.png`
- `import-export.png`
- `profile.png`
- `admin.png`
- `org-context-switch.png`

### Test Results

Test results are saved to `test-results/` directory with:
- Video recordings (on failure)
- Trace files (on failure)
- Console logs

## Troubleshooting

### Common Issues

#### 1. "STAGING_USERNAME and STAGING_PASSWORD environment variables are required"

**Solution**: Create `.env.staging` file with valid credentials.

#### 2. Login fails

**Solutions**:
- Verify credentials are correct in `.env.staging`
- Check that test account exists in staging environment
- Ensure staging URL is correct and accessible

#### 3. Tests time out

**Solutions**:
- Check staging environment is running and accessible
- Increase timeout in `playwright.staging.config.ts`
- Check network connection

#### 4. Console errors detected

**Solution**: This is expected behavior - tests log console errors but may not fail. Review screenshots to determine if errors are critical.

#### 5. Page not found (404)

**Solutions**:
- Verify staging deployment is complete
- Check route exists in current version
- Ensure user has permission to access page

### Debug Mode

Run tests in debug mode to step through:

```bash
PWDEBUG=1 npm run test:staging
```

This opens Playwright Inspector where you can:
- Step through test actions
- Inspect page elements
- View console output
- Pause/resume execution

### Headed Mode

See browser window during test execution:

```bash
PLAYWRIGHT_HEADED=true npm run test:staging
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests - Staging

on:
  push:
    branches: [develop]
  schedule:
    - cron: '0 0 * * *' # Daily at midnight

jobs:
  e2e-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run test:staging
        env:
          STAGING_URL: ${{ secrets.STAGING_URL }}
          STAGING_USERNAME: ${{ secrets.STAGING_USERNAME }}
          STAGING_PASSWORD: ${{ secrets.STAGING_PASSWORD }}
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Best Practices

### When to Run

- **Before merging to main**: Validate staging environment
- **After deployment**: Smoke test production-like environment
- **Nightly**: Catch regressions early
- **Before releases**: Final validation

### Maintaining Tests

- Update selectors when UI changes
- Add tests for new pages/features
- Keep test data minimal but realistic
- Review and update screenshots periodically

### Performance

- Tests run sequentially (single worker) to avoid race conditions
- Each test is independent
- Total runtime: ~2-5 minutes for full suite

## Future Enhancements

Potential improvements:
- [ ] Visual regression testing
- [ ] Performance metrics tracking
- [ ] Multi-browser testing (Firefox, Safari)
- [ ] Mobile viewport testing
- [ ] Accessibility testing (WCAG compliance)
- [ ] API response validation
- [ ] Database state validation

## Support

For issues or questions:
- Check troubleshooting section above
- Review test logs in `test-results/`
- Inspect screenshots in `screenshots/`
- Run in debug mode: `PWDEBUG=1 npm run test:staging`
