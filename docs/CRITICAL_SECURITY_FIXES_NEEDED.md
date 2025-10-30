# Critical Security Fixes Needed

## Overview

This document outlines critical security issues that require manual fixes in GitHub repository settings and workflow files. These issues were identified during code review of PR #192.

**Status:** 🔴 **BLOCKING MERGE** - Must be addressed before merging E2E testing infrastructure

---

## Issue #3: Production Database Credentials Lack Scope Isolation

### Problem

Production credentials (`RAILWAY_PRODUCTION_PUBLIC_DATABASE_URL`, `PRODUCTION_URL`, etc.) are stored as repository-level secrets, making them accessible to **all workflows** without approval gates.

### Risk

- ❌ Accidental production data modification in development workflows
- ❌ No approval gates for production deployments
- ❌ Broad attack surface if any workflow is compromised
- ❌ Developers/bots can trigger production deployments without review

### Solution: Use GitHub Environments

GitHub Environments provide secret isolation and deployment protection rules.

#### Step 1: Create Production Environment

1. Navigate to repository **Settings** → **Environments**
2. Click **New environment**
3. Name: `production`
4. Configure protection rules:
   - ✅ **Required reviewers**: Minimum 1 (add senior developers)
   - ✅ **Wait timer**: 0 minutes (optional: add delay)
   - ✅ **Deployment branches**: Only `main` branch
   - ✅ **Deployment protection rules**: Enable

#### Step 2: Move Secrets to Environment

Move the following secrets from **Repository Secrets** to **Environment Secrets (production)**:

- `RAILWAY_PRODUCTION_PUBLIC_DATABASE_URL`
- `PRODUCTION_URL`
- `RAILWAY_TOKEN` (if production-specific)
- Any other production-only credentials

#### Step 3: Update Workflow File

**File:** `.github/workflows/production-deploy.yml`

**Change Required:**

```yaml
jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    # ADD THIS SECTION:
    environment:
      name: production
      url: ${{ secrets.PRODUCTION_URL }}
    steps:
      # ... existing steps
```

**Before:**
```yaml
jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Railway
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

**After:**
```yaml
jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: production  # ✅ Requires approval before deployment
      url: ${{ secrets.PRODUCTION_URL }}
    steps:
      - name: Deploy to Railway
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

#### Verification

After implementing:
1. Trigger a production deployment
2. Verify that GitHub shows "Waiting for approval" before deployment proceeds
3. Verify that only authorized reviewers can approve

---

## Issue #4: Hardcoded PostgreSQL Credentials in CI Workflows

### Problem

CI workflows use hardcoded PostgreSQL credentials for testing:

```yaml
postgres:
  env:
    POSTGRES_USER: postgres        # ❌ Hardcoded
    POSTGRES_PASSWORD: postgres    # ❌ Hardcoded
```

### Risk

- ❌ Known default credentials could be exploited if service is exposed
- ❌ Credentials visible in workflow file (public repository risk)
- ❌ No credential rotation capability
- ❌ Same credentials used across all branches/environments

### Solution: Use GitHub Secrets

#### Step 1: Create CI-Specific Credentials

Generate secure credentials for CI environments:

```bash
# Generate random password
openssl rand -base64 32
```

#### Step 2: Add GitHub Secrets

Add the following **Repository Secrets**:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `CI_POSTGRES_USER` | `ci_test_user` | Non-default username |
| `CI_POSTGRES_PASSWORD` | `<generated_password>` | Secure random password |

#### Step 3: Update Workflow Files

**Files to Update:**
- `.github/workflows/pr-checks.yml` (lines 42-43, 87-88)
- `.github/workflows/staging-deploy.yml` (lines 21-23)

**Change Required:**

**Before:**
```yaml
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_USER: postgres         # ❌ Hardcoded
      POSTGRES_PASSWORD: postgres     # ❌ Hardcoded
      POSTGRES_DB: postgres
```

**After:**
```yaml
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_USER: ${{ secrets.CI_POSTGRES_USER }}       # ✅ From secrets
      POSTGRES_PASSWORD: ${{ secrets.CI_POSTGRES_PASSWORD }} # ✅ From secrets
      POSTGRES_DB: postgres
```

**Also update connection strings:**

**Before:**
```yaml
env:
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres"
```

**After:**
```yaml
env:
  DATABASE_URL: "postgresql://${{ secrets.CI_POSTGRES_USER }}:${{ secrets.CI_POSTGRES_PASSWORD }}@localhost:5432/postgres"
```

#### Files Requiring Updates

##### 1. `.github/workflows/pr-checks.yml`

**Line 42-43** (first postgres service):
```yaml
postgres:
  image: postgres:15
  env:
    POSTGRES_USER: ${{ secrets.CI_POSTGRES_USER }}
    POSTGRES_PASSWORD: ${{ secrets.CI_POSTGRES_PASSWORD }}
    POSTGRES_DB: postgres
```

**Line 87-88** (second postgres service):
```yaml
postgres:
  image: postgres:15
  env:
    POSTGRES_USER: ${{ secrets.CI_POSTGRES_USER }}
    POSTGRES_PASSWORD: ${{ secrets.CI_POSTGRES_PASSWORD }}
    POSTGRES_DB: postgres
```

**Line 67, 112** (DATABASE_URL environment variables):
```yaml
env:
  DATABASE_URL: "postgresql://${{ secrets.CI_POSTGRES_USER }}:${{ secrets.CI_POSTGRES_PASSWORD }}@localhost:5432/postgres"
```

##### 2. `.github/workflows/staging-deploy.yml`

**Line 21-23** (postgres service):
```yaml
postgres:
  image: postgres:15
  env:
    POSTGRES_USER: ${{ secrets.CI_POSTGRES_USER }}
    POSTGRES_PASSWORD: ${{ secrets.CI_POSTGRES_PASSWORD }}
    POSTGRES_DB: postgres
```

**Line 46** (DATABASE_URL):
```yaml
DATABASE_URL: "postgresql://${{ secrets.CI_POSTGRES_USER }}:${{ secrets.CI_POSTGRES_PASSWORD }}@localhost:5432/postgres"
```

#### Verification

After implementing:
1. Run a PR check workflow
2. Verify PostgreSQL service starts successfully with new credentials
3. Verify tests pass with secure connection string
4. Check workflow logs to ensure credentials are masked (`***`)

---

## Implementation Checklist

### Issue #3: Production Environment Isolation
- [ ] Create `production` GitHub Environment
- [ ] Configure required reviewers (minimum 1)
- [ ] Set deployment branch to `main` only
- [ ] Move production secrets to environment
- [ ] Update `.github/workflows/production-deploy.yml`
- [ ] Test deployment approval workflow

### Issue #4: CI Credential Security
- [ ] Generate secure CI credentials (`openssl rand -base64 32`)
- [ ] Add `CI_POSTGRES_USER` secret
- [ ] Add `CI_POSTGRES_PASSWORD` secret
- [ ] Update `.github/workflows/pr-checks.yml` (lines 42-43, 67, 87-88, 112)
- [ ] Update `.github/workflows/staging-deploy.yml` (lines 21-23, 46)
- [ ] Verify PR checks pass with new credentials
- [ ] Document credential rotation schedule (90 days recommended)

---

## Security Impact Assessment

### Before Fixes

| Vulnerability | Severity | Exploitability |
|---------------|----------|----------------|
| Production access without approval | 🔴 High | Medium |
| Hardcoded CI credentials | 🟡 Medium | Low (CI environment only) |

### After Fixes

| Control | Effectiveness |
|---------|---------------|
| GitHub Environment protection | 🟢 High - Prevents unauthorized production deployments |
| CI credential secrets | 🟢 High - Eliminates credential exposure |

---

## References

- [GitHub Environments Documentation](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [GitHub Secrets Best Practices](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/auth-password.html)

---

## Timeline

**Estimated Time to Implement:** 30-45 minutes

1. Issue #3 (Production environments): 20-30 minutes
2. Issue #4 (CI credentials): 10-15 minutes

**Recommended Priority:** 🔴 **IMMEDIATE** - Block merge until complete

---

**Last Updated:** 2025-10-30
**Status:** Awaiting Implementation
**Blocking:** PR #192 merge
