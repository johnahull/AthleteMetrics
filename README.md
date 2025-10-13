# Athlete Performance Hub

A full-stack web application for tracking and analyzing athlete performance data, specifically focused on 10-yard fly time and vertical jump measurements.

## Features

- **Dashboard**: Overview of key performance metrics and recent activity
- **Team Management**: Create and manage teams with different levels (Club, HS, College)
- **Player Management**: Add players with team assignments and personal details
- **Data Entry**: Record measurements with validation and quick-add functionality
- **Analytics**: Advanced filtering, leaderboards, percentile analysis, and interactive charts
- **Import/Export**: CSV import with validation and preview, plus data export functionality
- **Authentication**: Simple admin login system

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **shadcn/ui** component library
- **Chart.js** via react-chartjs-2 for data visualization
- **React Query** for data fetching and caching
- **Wouter** for routing
- **React Hook Form** with Zod validation

### Backend
- **Node.js** with Express
- **TypeScript** throughout
- **Drizzle ORM** with PostgreSQL
- **Session-based authentication**
- **CSV parsing and generation**
- **Comprehensive REST API**

### Database
- **PostgreSQL** (required for all environments)
- **Drizzle ORM** for type-safe database access
- **Schema validation** with Zod

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run database migrations:**
   ```bash
   npm run db:push
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

## Production Deployment

### Required Environment Variables

When deploying to production, you **must** set the following environment variables:

- **`NODE_ENV=production`** - **RECOMMENDED** for production deployments
  - Enables production error handling (prevents sensitive error details from being exposed)
  - Activates rate limiting protections
  - Optimizes performance settings
  - **Note:** If not set, the application defaults to `production` mode for safety. However, explicitly setting it is recommended for clarity.

- **`DATABASE_URL`** - PostgreSQL connection string (SQLite is no longer supported)
- **`NEON_TIER`** - **IMPORTANT** for Neon PostgreSQL deployments
  - Options: `"free"`, `"pro"`, or `"scale"`
  - Default: `"pro"` if not set
  - **Free tier**: 1 connection limit - set `NEON_TIER=free` to prevent connection exhaustion
  - **Pro tier**: Up to 20 connections - set `NEON_TIER=pro` (default)
  - **Scale tier**: Up to 100+ connections - set `NEON_TIER=scale`
  - This optimizes connection pooling for your Neon plan and prevents unexpected costs
  - See [Neon connection pooling docs](https://neon.tech/docs/connect/connection-pooling)
- **`SESSION_SECRET`** - Secure random string for session encryption
- **`ADMIN_USER`** and **`ADMIN_PASS`** - Admin credentials

### Deployment Examples

**Heroku:**
```bash
heroku config:set NODE_ENV=production
heroku config:set DATABASE_URL="postgresql://..."
heroku config:set NEON_TIER="pro"  # Set to match your Neon plan
heroku config:set SESSION_SECRET="..."
```

**Docker:**
```dockerfile
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://..."
ENV NEON_TIER="pro"
```

**Replit:**
Set environment variables in the Secrets tab:
- `NODE_ENV` = `production`
- `DATABASE_URL` = `postgresql://...`
- `NEON_TIER` = `pro` (or `free`/`scale` based on your Neon plan)

**Other platforms:** Consult your platform's documentation for setting environment variables.

### Build and Start

```bash
npm run build
npm start
```

## Running Tests

⚠️ **CRITICAL: NEVER RUN TESTS AGAINST PRODUCTION OR STAGING DATABASES!** ⚠️

The application has built-in safeguards to prevent this, but always double-check your `DATABASE_URL`.

### Quick Start

```bash
# Create local test database
createdb athletemetrics_test

# Copy test environment template
cp .env.test.example .env.test

# Run tests
npm test                  # All tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests (requires PostgreSQL)
```

### Safety Features

Tests include automatic validation that BLOCKS execution if:
- `DATABASE_URL` contains: `railway.app`, `neon.tech`, `prod`, `staging`
- `DATABASE_URL` doesn't include: `localhost` or `test`

**If tests were accidentally run against production:**
1. Run audit script: `tsx scripts/audit-test-data.ts`
2. Backup database: `pg_dump $DATABASE_URL > backup.sql`
3. Run cleanup: `CONFIRM_CLEANUP=yes tsx scripts/cleanup-test-data.ts`

### Detailed Testing Guide

For comprehensive testing documentation, see **[docs/TESTING.md](docs/TESTING.md)** which includes:
- Local test database setup
- Docker PostgreSQL configuration
- CI/CD integration
- Test data cleanup procedures
- Troubleshooting guide
- Best practices

### CI/CD

Tests run automatically in GitHub Actions with ephemeral PostgreSQL containers. No manual configuration needed for pull requests - see `.github/workflows/pr-checks.yml`.
