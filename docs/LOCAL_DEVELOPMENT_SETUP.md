# Local Development Environment Setup

This guide explains how to set up and use environment files for local development.

## Environment File Hierarchy

The application uses a three-tier environment file system for maximum flexibility:

1. **`.env.development`** - Base development defaults (tracked in git)
2. **`.env.local`** - Local overrides (ignored by git) 
3. **`.env`** - Runtime overrides (ignored by git)

Files are loaded in order, with later files overriding earlier ones.

## Quick Start

1. **Copy the local template**:
   ```bash
   cp .env.local.template .env.local  # (if template exists)
   # OR modify .env.local directly
   ```

2. **Update your database connection** in `.env.local`:
   ```bash
   DATABASE_URL=postgresql://your_user:your_password@localhost:5432/your_database
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

## Environment Files Explained

### `.env.development` (Base Development Config)
Contains safe defaults for development. This file is tracked in git and provides:
- Default NODE_ENV=development
- Safe session secret for development
- Default admin credentials
- Relaxed rate limiting for development
- Development-friendly settings

### `.env.local` (Your Local Overrides)
Contains your personal local settings. This file is **not tracked in git** and can contain:
- Your specific database connection string
- Real API keys for testing (SendGrid, etc.)
- Your preferred admin credentials
- Any personal development preferences

Example `.env.local`:
```bash
# Override database for your local setup
DATABASE_URL=postgresql://myuser:mypass@localhost:5432/athletemetrics_dev

# Real SendGrid key for testing emails
SENDGRID_API_KEY=SG.your_real_key_here

# Your preferred admin credentials
ADMIN_USER=myuser
ADMIN_PASSWORD=MySecurePassword123!
```

### `.env` (Runtime Overrides)
Optional file for temporary runtime overrides. Not tracked in git.

## Available npm Scripts

### Development Scripts
- `npm run dev` - Start with full environment loading (recommended)
- `npm run dev:simple` - Start with just NODE_ENV=development (legacy)

### Test Scripts
- `npm run test` - Run tests with `.env.local`
- `npm run test:unit` - Run unit tests
- `npm run test:integration` - Run integration tests

## Environment Variables Reference

### Required Variables
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key (32+ chars)
- `ADMIN_USER` - Admin username
- `ADMIN_PASSWORD` - Admin password

### Optional Variables
- `SENDGRID_API_KEY` - Email service API key
- `SENDGRID_FROM_EMAIL` - From email address
- `SENDGRID_FROM_NAME` - From name
- `ANALYTICS_RATE_LIMIT` - Analytics API rate limit
- `UPLOAD_RATE_LIMIT` - File upload rate limit

## Security Notes

### Session Secrets
- Development: 32+ character random string
- Production: 64+ character random string
- Generate with: `openssl rand -hex 32` (dev) or `openssl rand -hex 64` (prod)

### API Keys
- Never commit real API keys to git
- Use `.env.local` for real keys during development
- Use empty values in `.env.development` for safe defaults

### Database Credentials
- Use separate test databases for development
- Never use production database URLs in environment files

## Troubleshooting

### "SESSION_SECRET not set" Error
- Check that your `.env.local` contains a valid SESSION_SECRET
- Generate a new one: `openssl rand -hex 32`

### "SESSION_SECRET contains weak pattern" Error
- The secret contains common words or predictable patterns
- Generate a cryptographically secure secret: `openssl rand -hex 32`

### Database Connection Issues
- Verify your DATABASE_URL in `.env.local`
- Ensure PostgreSQL is running locally
- Check database credentials and permissions

### Environment Not Loading
- Ensure you're using `npm run dev` (not `npm run dev:simple`)
- Check that `.env.local` exists and has correct syntax
- Verify no syntax errors in environment files

## Testing Environment Setup

For running tests, the system automatically uses `.env.local`:

```bash
# All test commands use .env.local automatically
npm run test
npm run test:unit
npm run test:integration
```

This ensures consistent test environment setup across different machines.