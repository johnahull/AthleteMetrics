# Wellness Dashboard E2E Tests

## Overview

Comprehensive end-to-end tests for the Wellness Team Dashboard feature using Playwright.

## Test File

**Location**: `tests/e2e/wellness-dashboard.spec.ts`

**Total Tests**: 39 test scenarios covering complete user workflows

## Test Coverage

### 1. Dashboard Navigation & Default View (5 tests)
- Navigate to wellness page successfully
- Dashboard tab is default active tab
- All tabs visible (Dashboard, Templates, Requests, Analytics)
- Filters section renders with date picker
- Default date is today

### 2. Team Status Cards Display (6 tests)
- Team cards visible when data exists
- Status badge displays with correct color
- Athlete counts (red/yellow/green) display
- Completion rate percentage shown
- Trend indicator (Improving/Declining/Stable) visible
- Common injuries section displays

### 3. Expandable Team Cards (5 tests)
- "View Athletes" button visible on cards
- Card expands to show athlete table on click
- Table has all columns (Status, Athlete, Score, Injuries, Last Submission)
- "Hide Athletes" button appears after expanding
- List collapses when "Hide Athletes" clicked

### 4. Date Filtering (3 tests)
- Date filter can be changed
- Dashboard refetches data when date changes
- Empty state shown when no data for selected date

### 5. Team Filtering (4 tests)
- Team selector dropdown visible
- Displays "All teams" or team count placeholder
- Clear Filters button present
- Filters reset when Clear Filters clicked

### 6. Status Color Coding (2 tests)
- Status dots with colors (red/yellow/green) display
- Status badges with appropriate labels (At Risk/Caution/Good)

### 7. Template Configuration UI (5 tests)
- Navigate to Templates tab
- "Team Status Configuration" section in template builder
- Scale orientation selector (higher/lower is better)
- Red and Yellow threshold inputs
- Injury override checkbox

### 8. Empty States (2 tests)
- Empty state message when no teams have data
- Helpful message in empty state

### 9. Loading States (1 test)
- Loading skeletons appear while data loads

### 10. Error Handling (2 tests)
- Refresh button visible in filters
- Data refetches when Refresh button clicked

### 11. Responsive Design (4 tests)
- Mobile viewport (375px) rendering
- Tablet viewport (768px) rendering
- Desktop viewport (1920px) rendering
- Horizontally scrollable athlete table on mobile

## Running the Tests

### Against Staging Environment

```bash
# Set environment variables
export STAGING_URL="http://localhost:5000"
export STAGING_USERNAME="your-coach-username"
export STAGING_PASSWORD="your-password"

# Run all wellness dashboard tests
npx playwright test tests/e2e/wellness-dashboard.spec.ts --config=playwright.staging.config.ts

# Run with UI mode (debugging)
npx playwright test tests/e2e/wellness-dashboard.spec.ts --config=playwright.staging.config.ts --ui

# Run specific test suite
npx playwright test tests/e2e/wellness-dashboard.spec.ts --config=playwright.staging.config.ts --grep "Team Status Cards"

# Run on specific browser
npx playwright test tests/e2e/wellness-dashboard.spec.ts --config=playwright.staging.config.ts --project=chromium
```

### Against Testing Environment

```bash
# Set environment variables
export TESTING_URL="https://athletemetrics-testing.up.railway.app"
export TESTING_USERNAME="your-coach-username"
export TESTING_PASSWORD="your-password"

# Run tests
npx playwright test tests/e2e/wellness-dashboard.spec.ts --config=playwright.testing.config.ts
```

### Against Local Development

```bash
# Start local dev server first
npm run dev

# In another terminal
export STAGING_URL="http://localhost:5000"
export STAGING_USERNAME="admin"
export STAGING_PASSWORD="password"

npx playwright test tests/e2e/wellness-dashboard.spec.ts --config=playwright.staging.config.ts
```

## Test Data Requirements

These tests are designed to work with **any organization** and gracefully handle various data states:

### Minimal Requirements
- Organization with at least one team
- At least one coach user with access to the organization
- Authentication credentials (username/password)

### Optimal Test Data (for full coverage)
- Organization with 2+ teams
- Teams with 3+ athletes each
- Wellness templates with status configuration
- Recent wellness responses (within last 7 days)
- Varied wellness data (red/yellow/green statuses)
- Some responses with injuries (body_map data)

### Test Behavior with Different Data States

**No Data**:
- Tests verify empty states display correctly
- No errors or crashes
- Helpful messages guide users

**Partial Data**:
- Tests gracefully handle teams without responses
- Verify completion rates with partial submissions
- Empty injury sections when no injuries reported

**Full Data**:
- All features tested comprehensively
- Status calculations verified
- Trend indicators validated
- Filtering and sorting tested

## Test Approach

### Philosophy
- **Real User Workflows**: Tests simulate actual coach usage patterns
- **Graceful Degradation**: No hardcoded assumptions about data existence
- **Accessibility-First**: Uses semantic selectors (roles, labels) over brittle CSS classes
- **Responsive**: Verifies behavior across mobile, tablet, and desktop viewports
- **Resilient**: Includes timeouts and fallbacks for varying network conditions

### Selector Strategy
1. **Preferred**: Playwright role selectors (`getByRole`, `getByLabel`)
2. **Fallback**: Text content matchers (`getByText`, regex patterns)
3. **Last Resort**: CSS classes (only for visual elements like color dots)

### Assertions
- **Existence**: Verify elements are visible/present
- **Content**: Check text content matches expected patterns
- **State**: Validate active tabs, expanded sections, filter values
- **Behavior**: Confirm interactions trigger expected changes

## Debugging Failed Tests

### Common Issues

**1. Test Timeout**
```
Error: Test timeout of 60000ms exceeded
```
**Solution**: Increase timeout or check network connectivity
```bash
# Increase timeout
npx playwright test --timeout=120000
```

**2. Element Not Found**
```
Error: Locator not visible
```
**Solution**: Check if data exists, increase wait times, or verify selectors
```typescript
// Add explicit wait
await page.waitForSelector('selector', { timeout: 10000 });
```

**3. Authentication Failed**
```
Error: Login credentials are invalid
```
**Solution**: Verify environment variables are set correctly
```bash
echo $STAGING_USERNAME
echo $STAGING_PASSWORD
```

**4. No Data in Dashboard**
```
Warning: Empty state shown for old date
```
**Solution**: This is expected behavior when no wellness data exists for the selected date. Create test data or use a date with existing data.

### Debug Mode

Run tests in headed mode to see browser interactions:
```bash
npx playwright test tests/e2e/wellness-dashboard.spec.ts --headed --config=playwright.staging.config.ts
```

Use Playwright Inspector for step-by-step debugging:
```bash
PWDEBUG=1 npx playwright test tests/e2e/wellness-dashboard.spec.ts --config=playwright.staging.config.ts
```

### Screenshots and Videos

On test failure, Playwright automatically captures:
- **Screenshots**: `test-results/*/test-failed-1.png`
- **Videos**: `test-results/*/video.webm`
- **Traces**: `test-results/*/trace.zip` (open with `npx playwright show-trace`)

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Wellness Dashboard E2E Tests

on:
  push:
    branches: [main, feature/wellness-*]
  pull_request:
    branches: [main]

jobs:
  e2e-wellness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run wellness dashboard E2E tests
        env:
          STAGING_URL: ${{ secrets.STAGING_URL }}
          STAGING_USERNAME: ${{ secrets.STAGING_USERNAME }}
          STAGING_PASSWORD: ${{ secrets.STAGING_PASSWORD }}
        run: |
          npx playwright test tests/e2e/wellness-dashboard.spec.ts \
            --config=playwright.staging.config.ts \
            --reporter=html

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: wellness-dashboard-test-results
          path: playwright-report/
```

## Performance Benchmarks

**Expected Test Duration** (against staging with good network):
- Full suite (39 tests): ~3-5 minutes
- Single test suite: ~15-45 seconds
- Single test: ~5-15 seconds

**Factors Affecting Speed**:
- Network latency to staging environment
- Database query performance (number of teams/athletes)
- Browser startup time
- Number of parallel workers

## Maintenance

### Updating Tests

When the UI changes, update selectors in priority order:
1. Role-based selectors (most stable)
2. Text content matchers
3. CSS class selectors (least stable)

### Adding New Tests

Follow the existing test structure:
```typescript
test.describe('Feature Category', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    await page.goto(`${BASE_URL}/wellness`);
    await page.waitForLoadState('networkidle');
  });

  test('should [specific behavior]', async ({ page }) => {
    // Arrange
    // Act
    // Assert
    console.log('✓ Test passed with details');
  });
});
```

## Related Documentation

- **TDD Plan**: `/docs/wellness-dashboard-tdd-plan.md`
- **Playwright Config**: `/playwright.staging.config.ts`
- **Auth Helpers**: `/tests/e2e/helpers/auth.ts`
- **Testing Environment Setup**: `/TESTING_ENV_SETUP.md`

## Support

For issues or questions about these tests:
1. Check debug output in test results
2. Review Playwright traces
3. Verify test data exists in staging
4. Consult TDD plan for expected behavior
5. Check recent git commits for breaking changes
