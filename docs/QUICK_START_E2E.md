# E2E Testing - Quick Start Guide

## 1. Configure Environment (30 seconds)

```bash
# Copy template
cp .env.staging.example .env.staging

# Edit with your staging credentials
nano .env.staging
```

Add your staging credentials:
```env
STAGING_URL=https://your-staging-app.railway.app
STAGING_USERNAME=your-username
STAGING_PASSWORD=your-password
```

## 2. Validate Staging Environment (Optional, 30 seconds)

```bash
# Quick validation to check staging is ready
npm run test:staging:validate
```

This runs 8 quick validation tests to ensure:
- Environment variables are set
- Staging URL is accessible
- Login page loads
- Credentials work
- Basic routes exist
- No major JavaScript errors
- API endpoints respond

## 3. Run Full Test Suite (2-5 minutes)

```bash
# Run all E2E tests
npm run test:staging
```

## 4. View Results

```bash
# View HTML report
npx playwright show-report

# Screenshots are in: screenshots/
# Test results in: test-results/
```

## What Gets Tested

✅ Login/Logout
✅ Dashboard
✅ Teams
✅ Athletes (list + individual profiles)
✅ Organizations
✅ User Management
✅ Data Entry
✅ Analytics (all 3 types)
✅ Import/Export
✅ Profile
✅ Admin (if site admin)
✅ Navigation flows
✅ Organization context switching
✅ Console error detection
✅ Network error detection

**Total: 18 tests covering 13+ pages**

## Advanced Usage

```bash
# See browser window during tests
PLAYWRIGHT_HEADED=true npm run test:staging

# Debug mode (step through tests)
PWDEBUG=1 npm run test:staging

# Interactive UI mode
npx playwright test --ui --config=playwright.staging.config.ts

# Run specific test
npx playwright test -g "should load Dashboard" --config=playwright.staging.config.ts
```

## Troubleshooting

### Login fails?
- Check credentials in `.env.staging`
- Verify test account exists in staging

### Tests timeout?
- Check staging is running and accessible
- Check your network connection

### Need help?
- See full docs: `tests/e2e/README.md`
- See summary: `E2E_TEST_SUMMARY.md`

## That's it!

Your E2E test suite is ready to use. Tests are:
- **Idempotent** (safe to run multiple times)
- **Non-destructive** (only read data)
- **Comprehensive** (covers all major pages)
- **Smart** (detects errors, captures screenshots)
