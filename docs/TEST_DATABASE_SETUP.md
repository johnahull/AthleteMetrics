# Test Database Setup

## Overview
The AthleteMetrics test suite requires a PostgreSQL database for integration and unit tests that interact with the database layer.

## Quick Setup

### Option 1: Local PostgreSQL (Recommended for Development)

1. **Install PostgreSQL** (if not already installed):
   ```bash
   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib

   # macOS
   brew install postgresql@14
   brew services start postgresql@14
   ```

2. **Create test database and user**:
   ```bash
   # Connect to PostgreSQL as superuser
   sudo -u postgres psql

   # Create test database and user
   CREATE DATABASE athletemetrics_test;
   CREATE USER test_user WITH PASSWORD 'test_password';
   GRANT ALL PRIVILEGES ON DATABASE athletemetrics_test TO test_user;

   # Exit psql
   \q
   ```

3. **Set environment variable**:
   ```bash
   # Add to your ~/.bashrc or ~/.zshrc
   export DATABASE_URL="postgresql://test_user:test_password@localhost:5432/athletemetrics_test"
   ```

4. **Run migrations**:
   ```bash
   npm run db:push
   ```

5. **Run tests**:
   ```bash
   npm run test:unit
   npm run test:integration
   ```

### Option 2: Docker PostgreSQL (Isolated Environment)

1. **Start PostgreSQL container**:
   ```bash
   docker run --name athlete-test-db \
     -e POSTGRES_DB=athletemetrics_test \
     -e POSTGRES_USER=test_user \
     -e POSTGRES_PASSWORD=test_password \
     -p 5432:5432 \
     -d postgres:14
   ```

2. **Set environment variable**:
   ```bash
   export DATABASE_URL="postgresql://test_user:test_password@localhost:5432/athletemetrics_test"
   ```

3. **Run migrations and tests** (same as Option 1 steps 4-5)

### Option 3: CI/CD (GitHub Actions)

The project's GitHub Actions workflow automatically provisions a PostgreSQL service container. No manual setup needed for CI/CD.

## Troubleshooting

### "password authentication failed for user"
- Verify DATABASE_URL is set correctly
- Ensure PostgreSQL is running: `sudo systemctl status postgresql`
- Check user permissions in PostgreSQL

### "database does not exist"
- Create the database: `createdb athletemetrics_test`
- Or use the SQL command in Option 1

### Tests timeout or hang
- Check PostgreSQL connection: `psql $DATABASE_URL`
- Verify no other process is blocking the test database
- Clear test data: `npm run db:push` (resets schema)

## Test Database Best Practices

1. **Isolation**: Each test should clean up its own data (see `afterEach` in test files)
2. **Speed**: Use transactions for faster test execution
3. **Safety**: NEVER point `DATABASE_URL` to production database
4. **Cleanup**: Test setup creates unique IDs using timestamps to avoid conflicts

## Current Status

### Test Files Requiring Database
- `packages/api/services/__tests__/team-service.test.ts` ✅ (NEW - TDD refactoring)
- `packages/api/__tests__/measurement-team-snapshot.test.ts`
- Integration tests in `packages/api/__tests__/`

### Test Configuration
- Setup file: `vitest.setup.ts`
- Default test DB: `postgresql://localhost:5432/athletemetrics_test`
- Override via: `DATABASE_URL` environment variable
