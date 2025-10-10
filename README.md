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

- **`NODE_ENV=production`** - **REQUIRED** for production deployments
  - Enables production error handling (prevents sensitive error details from being exposed)
  - Activates rate limiting protections
  - Optimizes performance settings
  - **Note:** The `npm start` script does NOT set this automatically - your deployment environment must provide it

- **`DATABASE_URL`** - PostgreSQL connection string (SQLite is no longer supported)
- **`SESSION_SECRET`** - Secure random string for session encryption
- **`ADMIN_USER`** and **`ADMIN_PASS`** - Admin credentials

### Deployment Examples

**Heroku:**
```bash
heroku config:set NODE_ENV=production
heroku config:set DATABASE_URL="postgresql://..."
heroku config:set SESSION_SECRET="..."
```

**Docker:**
```dockerfile
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://..."
```

**Replit:**
Set environment variables in the Secrets tab:
- `NODE_ENV` = `production`
- `DATABASE_URL` = `postgresql://...`

**Other platforms:** Consult your platform's documentation for setting environment variables.

### Build and Start

```bash
npm run build
npm start
```

## Running Tests

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests

Integration tests require a PostgreSQL database. Set the following environment variables before running:

- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://user:pass@localhost:5432/testdb`)
- `NODE_ENV` - Set to `test` (automatically set by test scripts)
- `SESSION_SECRET` - Any test value (has default in test setup)

```bash
npm run test:integration
```

### CI/CD Setup

For continuous integration pipelines (GitHub Actions, CircleCI, etc.), you'll need to:

1. **Provision a PostgreSQL service** in your CI configuration
2. **Set environment variables:**
   - `DATABASE_URL` - Connection string to CI PostgreSQL instance
   - `NODE_ENV=test`
   - `SESSION_SECRET` - Test secret value

**Example GitHub Actions:**
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
      NODE_ENV: test
      SESSION_SECRET: test-secret
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run db:push
      - run: npm run test:integration
```
