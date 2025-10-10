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

# SESSION_SECRET: Cryptographic key for session cookie encryption
# - Used by express-session to sign and encrypt session cookies
# - Prevents session hijacking and tampering
# - MUST be a strong, random string (32+ characters recommended)
# - MUST be different between staging and production
# - Should be rotated periodically (monthly recommended)
# - Generate with: openssl rand -base64 32
# - Never commit to version control or share publicly
SESSION_SECRET=[generate strong 32+ char random string]

# Admin Authentication (minimum 12 character password required)
ADMIN_EMAIL=[your-admin-email@domain.com]
ADMIN_PASSWORD=[your-secure-password-min-12-chars]
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

# SESSION_SECRET for staging - MUST be different from production
# Generate a separate secret: openssl rand -base64 32
SESSION_SECRET=[different-random-string-than-production]

# Admin Authentication (minimum 12 character password required)
ADMIN_EMAIL=admin@staging.yourdomain.com
ADMIN_PASSWORD=[staging-password-min-12-chars]
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
#    - Database migrations run
#    - Health checks run
#    - Test on staging: https://staging.athletemetrics.io

# 6. Create PR from develop to main
# Open PR: develop → main on GitHub

# 7. After approval and merge to main:
#    - Code is ready for production
#    - NO automatic deployment yet

# 8. Create a GitHub Release to deploy to production
```

### Creating a Production Release

Production deployments are triggered by creating GitHub releases, not by pushing to main.

**Option 1: Via GitHub UI**
1. Go to your repository on GitHub
2. Click "Releases" → "Create a new release"
3. Click "Choose a tag" → Enter version (e.g., `v1.0.0`)
4. Click "Create new tag on publish"
5. **Release title:** Version 1.0.0 (or descriptive title)
6. **Description:** Add release notes:
   ```markdown
   ## What's New
   - Feature: Added user dashboard
   - Fix: Resolved login issue
   - Improvement: Faster page load times

   ## Deployment Notes
   - Database migration included
   - No breaking changes
   ```
7. Click "Publish release"
8. **Production deployment starts automatically:**
   - ✅ Runs all tests
   - ✅ Backs up database
   - ✅ Runs migrations
   - ✅ Deploys to Railway
   - ✅ Runs health checks + smoke tests
   - ✅ Auto-rollback on failure

**Option 2: Via GitHub CLI**
```bash
# Create and publish a release
gh release create v1.0.0 \
  --title "Version 1.0.0" \
  --notes "Release notes here" \
  --target main

# View releases
gh release list

# View specific release
gh release view v1.0.0
```

**Option 3: Via Git Tags + GitHub UI**
```bash
# Create an annotated tag
git tag -a v1.0.0 -m "Version 1.0.0"

# Push tag to GitHub
git push origin v1.0.0

# Then create release from tag in GitHub UI
```

### Semantic Versioning

Follow semantic versioning for release tags:
- **Major** (v1.0.0 → v2.0.0): Breaking changes
- **Minor** (v1.0.0 → v1.1.0): New features, backwards compatible
- **Patch** (v1.0.0 → v1.0.1): Bug fixes, backwards compatible

### Deployment Approval

Production deployments require approval from authorized team members:
1. Release is created
2. Deployment workflow starts
3. **Waits for manual approval** (GitHub Environment protection)
4. Authorized reviewer approves
5. Deployment continues

**To configure approvers:**
1. GitHub → Repository → Settings → Environments
2. Click "production" environment
3. Enable "Required reviewers"
4. Add team members who can approve deployments

### Manual Deploy (Emergency)

If CI/CD is unavailable, deploy manually:

```bash
# Staging (develop branch)
git checkout develop
railway up --service athletemetrics-staging

# Production (main branch)
git checkout main
railway up --service athletemetrics-production

# IMPORTANT: Always run migrations after manual deploy
railway run --service athletemetrics-production npm run db:push
```

### Rollback

**Option 1: Automatic Rollback**
- If health checks or smoke tests fail, deployment automatically rolls back
- Previous deployment is restored
- Check GitHub Actions logs for details

**Option 2: Via Railway Dashboard**
1. Go to Service → Deployments
2. Find previous working deployment
3. Click "Redeploy"

**Option 3: Redeploy Previous Release**
```bash
# List releases
gh release list

# View specific release
gh release view v1.0.0

# Trigger redeployment by republishing release
gh release delete v1.0.1 --yes  # Delete broken release
gh release create v1.0.1 \
  --title "Version 1.0.1 (Hotfix)" \
  --notes "Rollback to stable version" \
  --target main
```

**Option 4: Emergency Hotfix Release**
```bash
# Create hotfix branch from last good release
git checkout -b hotfix/emergency-fix v1.0.0

# Make fixes
git add .
git commit -m "fix: emergency hotfix"

# Merge to main
git checkout main
git merge hotfix/emergency-fix
git push origin main

# Create new release
gh release create v1.0.1 \
  --title "Version 1.0.1 (Emergency Hotfix)" \
  --notes "Critical bug fix" \
  --target main
```

### Database Rollback

If database migration causes issues:

```bash
# Option 1: Restore from automatic backup
# 1. Railway Dashboard → Database → Backups
# 2. Select backup from before deployment
# 3. Click "Restore"

# Option 2: Restore from local backup
railway run --service athletemetrics-production psql $DATABASE_URL < backups/pre-deploy-backup-TIMESTAMP.sql
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

## Custom Domain Configuration

### Configure athletemetrics.io Domain

#### Step 1: Add Custom Domain in Railway

1. **In Railway Dashboard:**
   - Navigate to **Production Service**
   - Click **Settings** → **Domains**
   - Click **+ Custom Domain**
   - Enter: `athletemetrics.io`
   - Railway will display DNS records you need to configure

#### Step 2: Configure DNS Records

**In your domain registrar (where you purchased athletemetrics.io):**

Railway will provide specific values, but the structure will be:

**Option A: Using CNAME (Recommended)**
```
Type: CNAME
Name: @ (or leave blank for root domain)
Value: [provided-by-railway].up.railway.app
TTL: 3600 (or Auto)

Type: CNAME
Name: www
Value: [provided-by-railway].up.railway.app
TTL: 3600 (or Auto)
```

**Option B: Using A/AAAA Records** (if CNAME not supported for root):
```
Type: A
Name: @
Value: [Railway IPv4 address]
TTL: 3600

Type: AAAA
Name: @
Value: [Railway IPv6 address]
TTL: 3600

Type: CNAME
Name: www
Value: [provided-by-railway].up.railway.app
TTL: 3600
```

#### Step 3: Wait for DNS Propagation

- DNS changes take 5 minutes to 48 hours (typically ~15-30 minutes)
- Check propagation status:
  ```bash
  # Check DNS resolution
  dig athletemetrics.io

  # Or use online tool
  # Visit: https://dnschecker.org
  ```

#### Step 4: Update Environment Variables

**In Railway Production Service → Variables:**
```bash
APP_URL=https://athletemetrics.io
```

**In GitHub Repository → Settings → Secrets:**
```bash
PRODUCTION_URL=https://athletemetrics.io
```

#### Step 5: SSL Certificate (Automatic)

Railway automatically:
- ✅ Provisions Let's Encrypt SSL certificate
- ✅ Enables HTTPS
- ✅ Redirects HTTP → HTTPS
- ✅ Auto-renews certificates before expiration

No manual SSL configuration required!

#### Step 6: Verify Domain Configuration

After DNS propagates:

1. **Visit your domain:**
   ```
   https://athletemetrics.io
   ```

2. **Check SSL certificate:**
   - Look for 🔒 padlock icon in browser
   - Click to view certificate details
   - Verify it's issued by Let's Encrypt

3. **Test health endpoint:**
   ```bash
   curl https://athletemetrics.io/api/health
   ```

4. **Verify redirects:**
   ```bash
   # HTTP should redirect to HTTPS
   curl -I http://athletemetrics.io
   # Should return 301 or 302 redirect to https://
   ```

### Optional: Configure Staging Subdomain

To access staging at `staging.athletemetrics.io`:

1. **In Railway Staging Service:**
   - Settings → Domains → + Custom Domain
   - Enter: `staging.athletemetrics.io`

2. **Add DNS Record:**
   ```
   Type: CNAME
   Name: staging
   Value: [staging-provided-by-railway].up.railway.app
   TTL: 3600
   ```

3. **Update Staging Environment Variables:**
   ```bash
   APP_URL=https://staging.athletemetrics.io
   ```

4. **Update GitHub Secrets:**
   ```bash
   STAGING_URL=https://staging.athletemetrics.io
   ```

### Domain Configuration Troubleshooting

**Issue: "Domain not verified" in Railway**
- **Solution:** Wait longer for DNS propagation (up to 48 hours)
- **Check:** Verify DNS records are correct using `dig` or dnschecker.org
- **Verify:** Ensure no typos in CNAME/A record values

**Issue: "SSL certificate not ready"**
- **Solution:** Railway provisions SSL automatically after DNS propagates
- **Wait:** Allow 5-10 minutes after DNS is fully propagated
- **Check:** Railway Dashboard → Service → Settings → Domains for status

**Issue: "Website not loading"**
- **Check:** Railway deployment logs for errors
- **Verify:** `APP_URL` environment variable is updated
- **Test:** Health check at railway.app subdomain first
- **Debug:** Use `curl -v https://athletemetrics.io` for verbose output

**Issue: "Mixed content" warnings**
- **Solution:** Ensure all internal links use HTTPS or relative URLs
- **Check:** Browser console for specific mixed content resources
- **Fix:** Update any hardcoded HTTP URLs to HTTPS

**Issue: DNS not propagating**
- **Wait:** Full propagation can take up to 48 hours
- **Check:** Different DNS servers may propagate at different rates
- **Test:** Use `dig @8.8.8.8 athletemetrics.io` to check Google's DNS
- **Verify:** Lower TTL values before making changes (optional)

**Issue: www subdomain not working**
- **Solution:** Ensure www CNAME is configured in DNS
- **Alternative:** Configure redirect in Railway (Settings → Domains)

---

## Next Steps

After deployment is complete:

1. **Configure Custom Domain** ✅
   - See "Custom Domain Configuration" section above
   - Configure athletemetrics.io for production
   - Optionally configure staging.athletemetrics.io

2. **Set Up Monitoring**
   - Consider adding: Sentry, LogRocket, or similar
   - Configure uptime monitoring (UptimeRobot, Pingdom)
   - Set up alerts for health check failures

3. **Enable Backups**
   - Verify Railway auto-backups are enabled
   - Set up additional backup strategy if needed
   - Test backup restoration process

4. **Documentation**
   - Update README.md with production URLs
   - Document any environment-specific configurations
   - Create runbook for common operations

5. **Team Onboarding**
   - Share Railway access with team
   - Review deployment process with team
   - Set up on-call rotation if needed

6. **Security Review**
   - Run security audit: `npm audit`
   - Review environment variables are secure
   - Verify rate limiting is properly configured
   - Test authentication flows on production domain

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
