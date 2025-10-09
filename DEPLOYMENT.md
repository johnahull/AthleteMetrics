# AthleteMetrics Railway Deployment Guide

Complete guide for deploying AthleteMetrics to Railway with staging and production environments.

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Initial Setup](#initial-setup)
5. [Railway Configuration](#railway-configuration)
6. [GitHub Configuration](#github-configuration)
7. [Database Setup](#database-setup)
8. [Deployment Process](#deployment-process)
9. [Monitoring & Maintenance](#monitoring--maintenance)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This deployment uses a dual-environment setup:
- **Staging**: `develop` branch → automated deploys for testing
- **Production**: `main` branch → automated deploys after approval

**Key Features:**
- Zero-downtime deployments
- Automated CI/CD pipeline
- Pre-deploy validation
- Post-deploy health checks
- Database migration automation
- Environment variable validation

---

## Architecture

```
GitHub Repository
├── main (protected) → Railway Production Service
│   └── PostgreSQL Production DB
└── develop → Railway Staging Service
    └── PostgreSQL Staging DB

CI/CD Pipeline
├── PR Checks (all PRs)
│   ├── TypeScript type checking
│   ├── Unit tests
│   ├── Integration tests
│   └── Build verification
│
├── Staging Deploy (on push to develop)
│   ├── Run all checks
│   ├── Deploy to Railway staging
│   └── Health check verification
│
└── Production Deploy (on push to main)
    ├── Run all checks
    ├── Deploy to Railway production
    └── Health check verification
```

---

## Prerequisites

### Required Accounts
- [x] GitHub account with repository access
- [ ] Railway account (sign up at https://railway.app)
- [ ] SendGrid account (for email notifications)

### Local Development Tools
```bash
# Install Railway CLI
npm install -g @railway/cli

# Verify installation
railway --version
```

### Required Access
- Admin access to GitHub repository
- Railway project admin access
- Ability to add GitHub secrets

---

## Initial Setup

### Step 1: Create Railway Account

1. Go to https://railway.app
2. Click "Login with GitHub"
3. Authorize Railway to access your repositories
4. Complete account setup

### Step 2: Install Railway CLI Locally

```bash
# Install globally
npm install -g @railway/cli

# Login to Railway
railway login

# This will open browser for authentication
```

---

## Railway Configuration

### Step 3: Create Railway Project

1. **In Railway Dashboard:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose `AthleteMetrics` repository
   - Name the project: `AthleteMetrics`

### Step 4: Create PostgreSQL Databases

**Create Production Database:**
1. In Railway project, click "+ New"
2. Select "Database" → "PostgreSQL"
3. Name it: `production-db`
4. Railway auto-generates `DATABASE_URL`

**Create Staging Database:**
1. Click "+ New" again
2. Select "Database" → "PostgreSQL"
3. Name it: `staging-db`
4. Railway auto-generates `DATABASE_URL`

### Step 5: Create Two Services

**Production Service:**
1. Click "+ New" → "GitHub Repo"
2. Select `AthleteMetrics` repository
3. Configure:
   - **Service Name:** `athletemetrics-production`
   - **Branch:** `main`
   - **Root Directory:** `/` (default)
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run start`

**Staging Service:**
1. Click "+ New" → "GitHub Repo"
2. Select same `AthleteMetrics` repository
3. Configure:
   - **Service Name:** `athletemetrics-staging`
   - **Branch:** `develop`
   - **Root Directory:** `/` (default)
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run start`

### Step 6: Configure Environment Variables

**Production Service Variables:**
```bash
# Navigate to Production Service → Variables tab
NODE_ENV=production
PORT=5000
SESSION_SECRET=[generate strong 32+ char random string]
ADMIN_USER=[your-admin-username]
ADMIN_PASS=[your-secure-password]
SENDGRID_API_KEY=[your-sendgrid-api-key]
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=AthleteMetrics
APP_URL=https://athletemetrics-production.up.railway.app
INVITATION_EXPIRY_DAYS=7

# Optional: Rate limiting configuration
ANALYTICS_RATE_WINDOW_MS=900000
ANALYTICS_RATE_LIMIT=50
UPLOAD_RATE_LIMIT=20
MAX_CSV_FILE_SIZE=5242880
MAX_IMAGE_FILE_SIZE=10485760
MAX_CSV_ROWS=10000
```

**Link Production Database:**
1. In Production Service → Variables
2. Click "Add Reference"
3. Select `production-db` → `DATABASE_URL`

**Staging Service Variables:**
```bash
# Navigate to Staging Service → Variables tab
NODE_ENV=staging
PORT=5000
SESSION_SECRET=[different-random-string-than-production]
ADMIN_USER=admin
ADMIN_PASS=[staging-password]
SENDGRID_API_KEY=[can-reuse-or-separate]
SENDGRID_FROM_EMAIL=staging@yourdomain.com
SENDGRID_FROM_NAME=AthleteMetrics Staging
APP_URL=https://athletemetrics-staging.up.railway.app
INVITATION_EXPIRY_DAYS=7
ENABLE_DEBUG_LOGGING=true

# Same optional rate limiting configs as production
```

**Link Staging Database:**
1. In Staging Service → Variables
2. Click "Add Reference"
3. Select `staging-db` → `DATABASE_URL`

### Step 7: Get Railway IDs for GitHub Actions

**Get Railway Token:**
1. Railway Dashboard → Account Settings (top right)
2. Click "Tokens" tab
3. Click "Create Token"
4. Name: `GitHub Actions`
5. Copy the token (save for later - only shown once!)

**Get Project ID:**
1. Railway Dashboard → Your Project
2. Click Settings (gear icon)
3. Copy the **Project ID**

**Get Service IDs:**
1. Click on **Production Service**
2. Click Settings → Copy **Service ID**
3. Save as `RAILWAY_PRODUCTION_SERVICE_ID`

4. Click on **Staging Service**
5. Click Settings → Copy **Service ID**
6. Save as `RAILWAY_STAGING_SERVICE_ID`

---

## GitHub Configuration

### Step 8: Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click "New repository secret" for each:

```bash
# Railway Authentication
Name: RAILWAY_TOKEN
Value: [token from Step 7]

Name: RAILWAY_PROJECT_ID
Value: [project ID from Step 7]

Name: RAILWAY_STAGING_SERVICE_ID
Value: [staging service ID from Step 7]

Name: RAILWAY_PRODUCTION_SERVICE_ID
Value: [production service ID from Step 7]
```

### Step 9: Configure Branch Protection Rules

**Protect `main` branch:**
1. GitHub → Settings → Branches
2. Click "Add branch protection rule"
3. Branch name pattern: `main`
4. Enable:
   - [x] Require a pull request before merging
   - [x] Require approvals (at least 1)
   - [x] Require status checks to pass before merging
   - [x] Require branches to be up to date before merging
   - Select status checks:
     - `type-check`
     - `unit-tests`
     - `integration-tests`
     - `build`
5. Save changes

**Protect `develop` branch:**
1. Add another branch protection rule
2. Branch name pattern: `develop`
3. Enable:
   - [x] Require a pull request before merging
   - [x] Require status checks to pass before merging
4. Save changes

---

## Database Setup

### Step 10: Initialize Database Schema

**For Production:**
```bash
# Link to Railway project
railway link

# Select your production service
railway service

# Push database schema
railway run --service athletemetrics-production npm run db:push
```

**For Staging:**
```bash
# Push schema to staging
railway run --service athletemetrics-staging npm run db:push
```

**Verify Schema:**
```bash
# Connect to production database
railway run --service athletemetrics-production psql $DATABASE_URL

# List tables
\dt

# Exit
\q
```

---

## Deployment Process

### Development Workflow

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes, commit
git add .
git commit -m "feat: add new feature"

# 3. Push and create PR to develop
git push origin feature/my-feature
# Open PR to develop branch on GitHub

# 4. CI runs automatically:
#    - TypeScript checks
#    - Unit tests
#    - Integration tests
#    - Build verification

# 5. After PR approval and merge to develop:
#    - Automatic deploy to STAGING
#    - Health checks run
#    - Test on staging: https://athletemetrics-staging.up.railway.app

# 6. Create PR from develop to main
# Open PR: develop → main on GitHub

# 7. After approval and merge to main:
#    - Automatic deploy to PRODUCTION
#    - Health checks run
#    - Live on: https://athletemetrics-production.up.railway.app
```

### Manual Deploy (Emergency)

```bash
# Deploy specific branch to production
railway up --service athletemetrics-production

# Deploy to staging
railway up --service athletemetrics-staging
```

### Rollback

**Option 1: Via Railway Dashboard**
1. Go to Service → Deployments
2. Find previous working deployment
3. Click "Redeploy"

**Option 2: Via Git**
```bash
# Revert last commit on main
git checkout main
git revert HEAD
git push origin main
# Triggers automatic redeployment
```

---

## Monitoring & Maintenance

### View Logs

**Via Railway Dashboard:**
1. Click on Service
2. Click "Logs" tab
3. Real-time logs appear

**Via CLI:**
```bash
# Production logs
railway logs --service athletemetrics-production

# Staging logs
railway logs --service athletemetrics-staging
```

### Health Checks

Both environments expose health check endpoints:
- **Production:** `https://athletemetrics-production.up.railway.app/api/health`
- **Staging:** `https://athletemetrics-staging.up.railway.app/api/health`

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-09T12:00:00Z",
  "database": "connected",
  "version": "0.2.0"
}
```

### Database Backups

**Railway Auto-Backups:**
- Railway PostgreSQL includes daily automated backups
- Accessible in Database → Backups tab
- 7-day retention on Hobby plan

**Manual Backup:**
```bash
# Export production database
railway run --service athletemetrics-production pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore from backup
railway run --service athletemetrics-production psql $DATABASE_URL < backup-20251009.sql
```

### Monitoring Checklist

**Daily:**
- [ ] Check deployment status in Railway dashboard
- [ ] Review error logs for any issues
- [ ] Verify health check endpoints respond

**Weekly:**
- [ ] Review database performance metrics
- [ ] Check disk space usage
- [ ] Review rate limiting metrics

**Monthly:**
- [ ] Audit environment variables
- [ ] Review and rotate SESSION_SECRET if needed
- [ ] Update dependencies (`npm update`)
- [ ] Review Railway usage and costs

---

## Troubleshooting

### Common Issues

**Build Fails with "Out of Memory"**
```bash
# Solution: Increase Node.js memory limit in railway.json
# Already configured in this setup (NODE_OPTIONS=--max-old-space-size=4096)
```

**Database Connection Timeout**
```bash
# Check DATABASE_URL is correctly linked
railway variables --service athletemetrics-production

# Verify database is running
railway status
```

**Environment Variables Not Loading**
```bash
# Restart service to reload variables
railway restart --service athletemetrics-production
```

**Deployment Stuck at "Building"**
```bash
# Check build logs for errors
railway logs --service athletemetrics-production

# Common causes:
# - Missing dependencies in package.json
# - TypeScript errors
# - Build command incorrect
```

**Health Check Failing After Deploy**
```bash
# Check logs for startup errors
railway logs --service athletemetrics-production

# Verify all required env variables are set
railway variables
```

### Getting Help

1. **Railway Logs:** Always check logs first
2. **Railway Discord:** https://discord.gg/railway
3. **GitHub Issues:** Create issue in AthleteMetrics repo
4. **Railway Docs:** https://docs.railway.app

---

## Security Checklist

Before going live:
- [ ] Strong `SESSION_SECRET` generated (32+ characters)
- [ ] Strong `ADMIN_PASS` set
- [ ] `NODE_ENV=production` set
- [ ] Rate limiting configured
- [ ] HTTPS enabled (automatic on Railway)
- [ ] SendGrid API key is for production account
- [ ] Database credentials not exposed in logs
- [ ] Branch protection rules enabled
- [ ] Only necessary GitHub secrets added
- [ ] Railway token has minimal required permissions

---

## Cost Estimation

**Railway Hobby Plan ($5/month):**
- 500 execution hours included
- $0.000231/GB-hour for RAM
- $0.25/GB for disk

**Estimated Monthly Cost for Both Environments:**
- 2 Services × $5 = $10 (base)
- 2 PostgreSQL databases × $5 = $10 (estimate)
- Total: ~$20-30/month depending on usage

**Cost Optimization Tips:**
- Use shared database with schema isolation
- Enable Railway sleep mode for staging (auto-sleep after inactivity)
- Monitor usage in Railway dashboard

---

## Next Steps

After deployment is complete:

1. **Configure Custom Domain** (Optional)
   - Railway Dashboard → Service → Settings → Domains
   - Add custom domain and update DNS records

2. **Set Up Monitoring**
   - Consider adding: Sentry, LogRocket, or similar
   - Configure uptime monitoring (UptimeRobot, Pingdom)

3. **Enable Backups**
   - Verify Railway auto-backups are enabled
   - Set up additional backup strategy if needed

4. **Documentation**
   - Update README.md with production URLs
   - Document any environment-specific configurations
   - Create runbook for common operations

5. **Team Onboarding**
   - Share Railway access with team
   - Review deployment process with team
   - Set up on-call rotation if needed

---

## Support

For questions or issues:
- Check Railway logs first
- Review this guide
- Check Railway documentation
- Contact team lead
- Create GitHub issue for code-related problems

---

**Last Updated:** 2025-10-09
**Version:** 1.0.0
