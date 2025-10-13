# Testing Guide

This document describes how to safely run tests for the AthleteMetrics application.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Database Setup](#test-database-setup)
3. [Running Tests](#running-tests)
4. [Safety Features](#safety-features)
5. [CI/CD Testing](#cicd-testing)
6. [Cleaning Up Test Data](#cleaning-up-test-data)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Create local test database
createdb athletemetrics_test

# 2. Set up test environment
cp .env.test.example .env.test
# Edit .env.test with your local test database credentials

# 3. Run tests
npm test                  # All tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
```

---

## Test Database Setup

### Local Development

**CRITICAL**: Never run tests against production or staging databases!

#### Option 1: Local PostgreSQL (Recommended)

```bash
# Install PostgreSQL (if not already installed)
# macOS
brew install postgresql@15

# Ubuntu/Debian
sudo apt-get install postgresql-15

# Start PostgreSQL service
brew services start postgresql@15  # macOS
sudo service postgresql start      # Linux

# Create test database
createdb athletemetrics_test
```

#### Option 2: Docker PostgreSQL

```bash
# Start PostgreSQL container
docker run -d \
  --name athletemetrics-test-db \
  -e POSTGRES_DB=athletemetrics_test \
  -e POSTGRES_PASSWORD=test_password \
  -p 5432:5432 \
  postgres:15

# DATABASE_URL: postgresql://postgres:test_password@localhost:5432/athletemetrics_test
```

### Environment Configuration

Copy the example environment file:

```bash
cp .env.test.example .env.test
```

Edit `.env.test`:

```bash
# Use localhost test database
DATABASE_URL=postgresql://localhost:5432/athletemetrics_test

NODE_ENV=test
SESSION_SECRET=test-secret-only
ADMIN_USER=test-admin
ADMIN_PASSWORD=TestPassword123!
```

⚠️ **NEVER commit `.env.test` to git!** It's already in `.gitignore`.

---

## Running Tests

### All Tests

```bash
npm test
```

### Unit Tests

Tests that don't require a database (React components, utilities, pure logic):

```bash
npm run test:unit
```

**Note**: Unit tests do NOT require `DATABASE_URL` to be set. They test client-side code, utilities, and server logic with mocked dependencies.

### Integration Tests

Tests that require a PostgreSQL database (API endpoints, database operations):

```bash
npm run test:integration
```

**Note**: Integration tests REQUIRE `DATABASE_URL` to be set and will fail if:
- `DATABASE_URL` is not set
- `DATABASE_URL` contains forbidden patterns (railway.app, neon.tech, prod, staging, etc.)

### Watch Mode

Run tests in watch mode (re-runs on file changes):

```bash
npm test -- --watch
```

### Test UI

Interactive test UI with Vitest:

```bash
npm run test:ui
```

---

## Safety Features

The application has multiple layers of protection to prevent running integration tests against production databases:

### 1. Pre-Test Validation (`tests/setup/integration-setup.ts`)

Before ANY integration test runs, the setup file validates:

- ✅ `DATABASE_URL` is set
- ✅ `DATABASE_URL` doesn't contain: `railway.app`, `neon.tech`, `prod`, `staging`
- ✅ `DATABASE_URL` includes: `localhost` or `test`

**If validation fails, tests will not run!**

### 2. Environment Variable Enforcement

All test scripts in `package.json` automatically set `NODE_ENV=test`:

```json
{
  "test": "NODE_ENV=test vitest",
  "test:integration": "NODE_ENV=test vitest run --config vitest.integration.config.ts"
}
```

### 3. CI/CD Isolation

GitHub Actions (`pr-checks.yml`) uses:

- Ephemeral PostgreSQL container (destroyed after tests)
- Isolated test database: `athletemetrics_test`
- No access to production/staging credentials

---

## CI/CD Testing

### GitHub Actions

Tests run automatically on:

- ✅ Pull requests to `main` or `develop`
- ✅ Pushes to `develop` branch

Workflow: `.github/workflows/pr-checks.yml`

**Database Setup:**
- PostgreSQL 15 service container
- Database name: `athletemetrics_test`
- Credentials: `postgres:postgres`
- Destroyed after test completion

**No configuration needed** - tests run automatically in CI!

---

## Cleaning Up Test Data

### If Test Data Leaked to Production 🚨

If tests were accidentally run against production/staging, use these scripts to clean up:

#### 1. Audit Test Data

Identify test data without deleting:

```bash
tsx scripts/audit-test-data.ts
```

This script finds:
- Organizations with "Test" in name
- Users with `test-*` usernames
- Email addresses with `@example.com` or `@test.com`

#### 2. Backup Database

**ALWAYS backup before cleanup!**

```bash
# Export full database backup
pg_dump $DATABASE_URL > backup-before-cleanup-$(date +%Y%m%d).sql

# Or use Railway CLI
railway run pg_dump > backup-before-cleanup-$(date +%Y%m%d).sql
```

#### 3. Run Cleanup Script

**⚠️ This PERMANENTLY DELETES data!**

```bash
# Preview what will be deleted
tsx scripts/audit-test-data.ts

# Run cleanup (requires explicit confirmation)
CONFIRM_CLEANUP=yes tsx scripts/cleanup-test-data.ts
```

The cleanup script:
1. Shows preview of data to be deleted
2. Requires typing "DELETE" to confirm
3. Deletes in correct order (respects foreign keys)
4. Provides detailed progress output

---

## Troubleshooting

### Error: "DATABASE_URL contains forbidden pattern: railway.app"

**Cause:** Tests are trying to run against production/staging database.

**Solution:**
```bash
# Use local test database instead
export DATABASE_URL=postgresql://localhost:5432/athletemetrics_test

# Or create .env.test file
cp .env.test.example .env.test
```

### Error: "DATABASE_URL must be set"

**Cause:** No database connection string configured.

**Solution:**
```bash
# Create test database
createdb athletemetrics_test

# Set DATABASE_URL
export DATABASE_URL=postgresql://localhost:5432/athletemetrics_test
```

### Error: "connection refused" or "database does not exist"

**Cause:** PostgreSQL is not running or test database doesn't exist.

**Solution:**
```bash
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL (if not running)
brew services start postgresql@15  # macOS
sudo service postgresql start      # Linux

# Create test database (if it doesn't exist)
createdb athletemetrics_test
```

### Error: "role 'username' does not exist"

**Cause:** Database user doesn't exist.

**Solution:**
```bash
# Create database user
createuser -s postgres  # Or your username

# Update DATABASE_URL with correct username
DATABASE_URL=postgresql://postgres:@localhost:5432/athletemetrics_test
```

### Tests Pass Locally but Fail in CI

**Possible Causes:**
1. Tests depend on environment-specific data
2. Tests are not isolated (sharing state)
3. Race conditions in parallel tests

**Solution:**
- Ensure each test creates its own test data
- Use `afterAll()` / `afterEach()` to clean up
- Check test isolation with `npm run test:integration -- --reporter=verbose`

### Memory Issues During Tests

**Symptoms:** Tests crash with "JavaScript heap out of memory"

**Solution:**
```bash
# Increase Node.js memory (already configured in package.json)
TEST_HEAP_SIZE=6144 npm test

# Or reduce parallel test execution
npm test -- --poolOptions.forks.maxForks=2
```

---

## Best Practices

### ✅ DO:

- Use local test database for development
- Run `npm test` before committing
- Clean up test data in `afterAll()` hooks
- Use unique timestamps in test data names
- Export database backups before cleanup

### ❌ DON'T:

- Run tests with production `DATABASE_URL`
- Commit `.env.test` to git
- Skip test database validation
- Share test data between test files
- Use hardcoded test data (use factories/fixtures)

---

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Railway CLI Documentation](https://docs.railway.app/reference/cli-api)

---

## Support

If you encounter issues:

1. Check this troubleshooting guide
2. Review test output for specific errors
3. Check CI/CD workflow logs in GitHub Actions
4. Create an issue in the repository

---

## Summary

- **Local Tests**: Use `postgresql://localhost:5432/athletemetrics_test`
- **CI/CD Tests**: Automatic with ephemeral PostgreSQL containers
- **Safety**: Multiple layers prevent production database access
- **Cleanup**: Scripts available if test data leaks to production

**Remember**: Tests should NEVER touch production data! 🛡️
