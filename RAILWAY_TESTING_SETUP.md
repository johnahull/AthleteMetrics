# Railway Testing Environment Setup Guide

## Overview
This guide will help you complete the setup of your Railway testing environment for rapid feature testing and deployment.

## Prerequisites
✅ Railway CLI installed (v4.10.0)
✅ Testing environment created in Railway dashboard
✅ `railway.json` configured with testing environment
✅ Convenience scripts added to `package.json`

## Setup Steps

### 1. Link to Railway Project (if not already linked)

```bash
railway link
# Select your AthleteMetrics project when prompted
```

### 2. Switch to Testing Environment

```bash
railway environment testing
```

### 3. Add a PostgreSQL Database to Testing Environment

**Option A: Create New Database (Recommended)**
```bash
# While in testing environment
railway add
# Select "PostgreSQL" from the list
# Railway will automatically set DATABASE_URL variable
```

**Option B: Use Existing Database with Different Schema**
```bash
# Manually set DATABASE_URL to use a different database name
railway variables set DATABASE_URL="postgresql://user:pass@host:port/athletemetrics_testing"
```

### 4. Set Required Environment Variables

```bash
# Generate a secure session secret
SESSION_SECRET=$(openssl rand -hex 32)

# Set all required variables
railway variables set SESSION_SECRET="$SESSION_SECRET"
railway variables set ADMIN_USER="admin"
railway variables set ADMIN_PASSWORD="TestingPass123!"
railway variables set ADMIN_EMAIL="testing@example.com"

# Optional: Set Neon tier (if using Neon PostgreSQL)
railway variables set NEON_TIER="free"

# Optional: Email configuration (can skip for testing)
railway variables set SENDGRID_API_KEY="your-key-here"
railway variables set SENDGRID_FROM_EMAIL="noreply@testing.com"
railway variables set SENDGRID_FROM_NAME="AthleteMetrics Testing"

# Optional: Set application URL (Railway will auto-generate if not set)
railway variables set APP_URL="https://your-testing-url.up.railway.app"
railway variables set INVITATION_EXPIRY_DAYS="7"
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
- ✅ `ADMIN_PASSWORD`
- ✅ `ADMIN_EMAIL`
- ✅ `NODE_ENV` (auto-set to "testing" from railway.json)
- ✅ `NODE_OPTIONS` (auto-set from railway.json)

### 6. Deploy to Testing Environment

```bash
# Deploy using the convenience script
npm run deploy:testing

# Or manually
railway environment testing
railway up
```

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

## Troubleshooting

### "Unauthorized" Error
```bash
railway login
# Follow browser authentication flow
```

### "No linked project" Error
```bash
railway link
# Select AthleteMetrics project
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

```bash
# Deploy to testing
npm run deploy:testing

# View logs
npm run logs:testing

# Check variables
npm run vars:testing

# Access database shell
npm run shell:testing

# Switch environments
railway environment production
railway environment staging
railway environment testing
```
