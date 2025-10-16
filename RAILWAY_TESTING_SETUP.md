# Railway Testing Environment Setup Guide

## Overview
This guide will help you complete the setup of your Railway testing environment for rapid feature testing and deployment.

## Prerequisites
✅ Railway CLI installed (v4.10.0)
✅ Testing environment created in Railway dashboard
✅ `railway.json` configured with testing environment
✅ Convenience scripts added to `package.json`

## Understanding Railway's Structure

Railway organizes resources in a hierarchy:

```
Workspace (e.g., "AthleteMetrics Team")
  └── Project (e.g., "AthleteMetrics")
      └── Environment (e.g., "testing", "staging", "production")
          └── Service (e.g., "athletemetrics-web", "postgres")
```

**Important:** You must link to a specific **Service** within an **Environment** before you can deploy or manage variables.

## Setup Steps

### 1. Link to Railway Service

Railway requires you to link your local directory to a specific service in your testing environment.

**Option A: Interactive Linking (Recommended)**
```bash
railway link
# You'll be prompted to select:
# 1. Workspace → Select your workspace (e.g., "AthleteMetrics Team")
# 2. Project → Select "AthleteMetrics"
# 3. Environment → Select "testing"
# 4. Service → Select your web application service (e.g., "athletemetrics")
```

**Option B: Direct Linking (if you know the names)**
```bash
railway link --workspace "YourWorkspace" --project "AthleteMetrics" --environment testing --service "your-service-name"
```

**How to find your service name:**
- Go to [railway.app](https://railway.app)
- Navigate to your AthleteMetrics project
- Switch to "testing" environment
- Your service names are listed (typically "athletemetrics" or similar for the web app)

### 2. Verify the Link

```bash
railway status
# Should show:
# - Environment: testing
# - Service: [your-service-name]
# - Project: AthleteMetrics
```

### 3. Add a PostgreSQL Database to Testing Environment

**Option A: Create New Database (Recommended)**
```bash
# While linked to testing environment service
railway add
# Select "PostgreSQL" from the list
# Railway will automatically set DATABASE_URL variable
```

**Option B: Use Existing Database with Different Schema**
```bash
# Manually set DATABASE_URL to use a different database name
railway variables --set "DATABASE_URL=postgresql://user:pass@host:port/athletemetrics_testing"
```

### 4. Set Required Environment Variables

```bash
# Generate a secure session secret
SESSION_SECRET=$(openssl rand -hex 32)

# Set all required variables (using --environment flag since you're linked to testing)
railway variables --set "SESSION_SECRET=$SESSION_SECRET"
railway variables --set "ADMIN_USER=admin"
railway variables --set "ADMIN_PASS=TestingPass123!"
railway variables --set "ADMIN_EMAIL=testing@example.com"

# Optional: Set Neon tier (if using Neon PostgreSQL)
railway variables --set "NEON_TIER=free"

# Optional: Email configuration (can skip for testing)
railway variables --set "SENDGRID_API_KEY=your-key-here"
railway variables --set "SENDGRID_FROM_EMAIL=noreply@testing.com"
railway variables --set "SENDGRID_FROM_NAME=AthleteMetrics Testing"

# Optional: Set application URL (Railway will auto-generate if not set)
railway variables --set "APP_URL=https://your-testing-url.up.railway.app"
railway variables --set "INVITATION_EXPIRY_DAYS=7"
```

### 5. Verify Environment Variables

```bash
# Check all variables are set
npm run vars:testing
```

Required variables you should see:
- ✅ `DATABASE_URL`
- ✅ `SESSION_SECRET`
- ✅ `ADMIN_USER`
- ✅ `ADMIN_PASS`
- ✅ `ADMIN_EMAIL`
- ✅ `NODE_ENV` (auto-set to "testing" from railway.json)
- ✅ `NODE_OPTIONS` (auto-set from railway.json)

### 6. Deploy to Testing Environment

```bash
# Deploy using the convenience script
npm run deploy:testing

# Or manually (if already linked to testing service)
railway up
```

**Note:** The convenience scripts automatically switch to the testing environment before deploying.

### 7. Monitor Deployment

```bash
# Watch deployment logs
npm run logs:testing

# Or manually
railway logs --follow
```

### 8. Get Testing Environment URL

```bash
railway status
# Look for the deployment URL
```

### 9. Test the Deployment

Visit your testing URL and verify:
- ✅ Health check endpoint: `https://your-testing-url.up.railway.app/api/health`
- ✅ Login page loads
- ✅ Can authenticate with ADMIN_USER/ADMIN_PASSWORD
- ✅ Database connection works

## Daily Workflow

### Deploy a Feature Branch for Testing

```bash
# 1. Create/switch to feature branch
git checkout -b feat/my-new-feature

# 2. Make changes and commit
git add .
git commit -m "feat: implement new feature"

# 3. Deploy to testing (one command!)
npm run deploy:testing

# 4. Test at your Railway testing URL
# No PR needed, no CI/CD pipeline, just instant deployment
```

### Check Logs

```bash
npm run logs:testing
```

### Access Testing Database Shell

```bash
npm run shell:testing
# Then run psql or other commands
```

### View Environment Variables

```bash
npm run vars:testing
```

## Environment Comparison

| Environment | Purpose | Deploy Method | Database |
|------------|---------|---------------|----------|
| **Production** | Live users | Merge to `main` | Production DB |
| **Staging** | Pre-release testing | Merge to `staging` | Staging DB |
| **Testing** | Rapid experiments | `npm run deploy:testing` | Testing DB |

## Cost Optimization

The testing environment uses reduced resources:
- Memory: 2GB (vs 4GB for production/staging)
- Database: Can use Railway's free tier PostgreSQL
- Rate limiting: Disabled for easier testing

Estimated cost: ~$5-15/month

## Security Considerations

### Database Isolation

**⚠️ CRITICAL: Always use a separate database for testing**

The testing environment MUST use a completely isolated database to prevent:
- Accidental data corruption in production/staging
- Data loss from experimental features
- Security vulnerabilities affecting real user data

**Validation:** The deployment script automatically validates database isolation before every deploy:
```bash
npm run deploy:testing
# Runs validation first, then deploys only if safe
```

The validation script checks for:
- ✅ Production database patterns (blocks deployment)
- ⚠️ Staging database patterns (shows warning)
- ✅ Testing-specific database names (allows deployment)

**To set up proper isolation:**
```bash
# Option 1: Create dedicated Railway PostgreSQL database
railway add --environment testing  # Select PostgreSQL

# Option 2: Use existing database with testing-specific name
railway variables --set "DATABASE_URL=postgresql://...athletemetrics_testing"
```

### Rate Limiting Bypass

The testing environment has rate limiting **disabled** for convenience:
```json
{
  "BYPASS_ANALYTICS_RATE_LIMIT": "true",
  "BYPASS_GENERAL_RATE_LIMIT": "true"
}
```

**Production Safeguards:**
- ✅ Rate limiting bypass is **hardcoded to be disabled** in production environments
- ✅ Server code checks `NODE_ENV === 'production'` and **always enforces** rate limits
- ✅ Environment variables **cannot override** production rate limiting

**Code Reference:** `server/routes.ts:2795-2804`
```typescript
// Production safeguard: Never bypass rate limiting in production environment
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  return false; // Always enforce rate limiting in production
}
```

**Why this is safe:**
- Testing environment uses `NODE_ENV=testing` (set automatically by `railway.json`)
- Production environment uses `NODE_ENV=production`
- Even if someone accidentally copies these variables to production, the code will ignore them

### Access Control

**Testing environment credentials should be:**
- ✅ Different from production/staging credentials
- ✅ Documented in your team's password manager
- ✅ Rotated regularly (at least quarterly)
- ✅ Limited to development team members

**Example secure setup:**
```bash
# Generate strong credentials
TESTING_ADMIN_PASS=$(openssl rand -base64 32)

# Set secure credentials
railway variables --set "ADMIN_USER=admin"
railway variables --set "ADMIN_PASS=$TESTING_ADMIN_PASS"
railway variables --set "ADMIN_EMAIL=testing@yourcompany.com"
```

### Data Privacy

**⚠️ Do not use real user data in testing environment**

Best practices:
- Use synthetic/anonymized data for testing
- Regularly reset testing database to remove accumulated test data
- Never import production database dumps without anonymization

**To reset testing database:**
```bash
# Connect to testing database
npm run shell:testing

# Inside the shell, drop and recreate database (example)
dropdb athletemetrics_testing
createdb athletemetrics_testing

# Re-run migrations
railway run --environment testing npm run db:push
```

## Troubleshooting

### "Unauthorized" Error
```bash
railway login
# Follow browser authentication flow
```

### "Need to link a service" Error
This means you haven't completed the full linking process. You need to link to a specific service within your environment:

```bash
railway link
# Follow the prompts to select:
# Workspace → Project → Environment (testing) → Service (your web app)
```

Verify the link worked:
```bash
railway status
# Should show environment: testing, service: [your-service-name]
```

### "No linked project" Error
```bash
railway link
# Complete the full linking process including service selection
```

### Database Connection Errors
```bash
# Verify DATABASE_URL is set
railway variables | grep DATABASE_URL

# If missing, add PostgreSQL database
railway add
# Select PostgreSQL
```

### Deployment Fails
```bash
# Check logs for errors
railway logs

# Verify all required env vars are set
npm run vars:testing
```

## Next Steps

After successful setup, you can:
1. Deploy any branch instantly with `npm run deploy:testing`
2. Test migrations on testing database before staging/production
3. Experiment with breaking changes safely
4. Share testing URL with team for feedback
5. Use for performance testing and benchmarking

## Quick Reference

### Initial Setup
```bash
# 1. Link to your service in testing environment
railway link  # Select: Workspace → Project → testing → your-service

# 2. Verify link
railway status

# 3. Add database (if needed)
railway add  # Select PostgreSQL

# 4. Set environment variables
railway variables --set "SESSION_SECRET=$(openssl rand -hex 32)"
railway variables --set "ADMIN_USER=admin"
railway variables --set "ADMIN_PASS=YourPassword123!"
railway variables --set "ADMIN_EMAIL=testing@example.com"

# 5. Deploy
npm run deploy:testing
```

### Daily Usage
```bash
# Deploy to testing
npm run deploy:testing

# View logs
npm run logs:testing

# Check variables
npm run vars:testing

# Access database shell
npm run shell:testing
```

### Switching Between Environments
**Important:** When you run `railway link`, you're linking to ONE service in ONE environment. To work with different environments, you need to either:

**Option A: Relink for each environment**
```bash
# Link to testing
railway link  # Select testing environment + service

# Link to staging
railway link  # Select staging environment + service
```

**Option B: Use the convenience scripts (recommended)**
The npm scripts automatically handle environment switching:
```bash
npm run deploy:testing  # Deploys to testing
npm run logs:testing    # Views testing logs
npm run vars:testing    # Views testing variables
```
