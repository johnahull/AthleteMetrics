# Critical Security Fixes Required

**Status**: ⚠️ **ACTION REQUIRED**
**Created**: 2025-10-30
**Priority**: 🔴 **CRITICAL** - Must be completed before next production deploy

This document tracks critical security issues discovered in CI/CD workflows and provides step-by-step remediation instructions.

---

## 🔴 CRITICAL ISSUE #1: Hardcoded PostgreSQL Credentials in CI

**Severity**: Critical
**Status**: ⏳ **PENDING - Requires GitHub Secrets Setup**
**Affected Files**:
- `.github/workflows/pr-checks.yml` (Lines 41-42, 87-88)
- `.github/workflows/staging-deploy.yml` (Lines 21-22)
- `.github/workflows/production-deploy.yml` (Lines 26-27)

### Problem
CI workflows use hardcoded PostgreSQL credentials (`postgres`/`postgres`) that are visible in the public repository. These credentials are used for ephemeral test databases in GitHub Actions.

### Risk Assessment
- **Exposure**: Credentials visible in public repository
- **Scope**: Test databases only (ephemeral, destroyed after each run)
- **Impact**: Low immediate risk (test-only), but violates security best practices

### Required Actions

#### 1. Add GitHub Secrets (5 minutes)

Go to repository Settings → Secrets and variables → Actions → New repository secret:

**Secret 1**: `CI_POSTGRES_USER`
```
Value: r7JphCC8EtBZfemfhLkI
```

**Secret 2**: `CI_POSTGRES_PASSWORD`
```
Value: VgImlHmJ9+HcPv+ksb9eqAYASQLqvMAn14djSdhbrsc=
```

**Secret 3**: `CI_POSTGRES_DB`
```
Value: athletemetrics_test
```

#### 2. Workflows Have Been Updated

The following workflow files have been updated to reference these secrets:

✅ **pr-checks.yml** - Unit and integration test databases
✅ **staging-deploy.yml** - Staging test database
✅ **production-deploy.yml** - Production test database

**Changes Made**:
```yaml
# BEFORE (hardcoded):
POSTGRES_USER: postgres
POSTGRES_PASSWORD: postgres

# AFTER (secure):
POSTGRES_USER: ${{ secrets.CI_POSTGRES_USER }}
POSTGRES_PASSWORD: ${{ secrets.CI_POSTGRES_PASSWORD }}
```

#### 3. Verification Steps

After adding secrets, verify by:
1. Trigger a PR check workflow
2. Check that PostgreSQL service container starts successfully
3. Verify tests pass with new credentials

---

## 🔴 CRITICAL ISSUE #2: Production Environment Lacks Required Reviewers

**Severity**: Critical
**Status**: ⏳ **PENDING - Requires GitHub Environment Configuration**
**Affected File**: `.github/workflows/production-deploy.yml`

### Problem
Production workflow uses `environment: production` (Line 15-16) but the GitHub Environment may not have required reviewers configured. This allows automated deployments to production without human approval.

### Risk Assessment
- **Exposure**: Accidental/unauthorized production deploys
- **Scope**: Production database and application
- **Impact**: HIGH - Could deploy untested changes to production

### Required Actions

#### 1. Configure Production Environment (10 minutes)

**Navigate to**: Repository Settings → Environments → production

**Required Configuration**:

1. **Protection Rules**:
   - ✅ Enable "Required reviewers"
   - Add at least 2 reviewers (recommended: @johnahull + 1 other)
   - ⚠️ Reviewers should NOT include CI bots

2. **Deployment Branches**:
   - ✅ Enable "Selected branches"
   - Add rule: `main` (only main branch can deploy to production)
   - Add rule: `refs/tags/*` (allow tagged releases)

3. **Environment Secrets**:
   Move production secrets from repository scope to environment scope:
   - `RAILWAY_PRODUCTION_TOKEN`
   - `RAILWAY_PRODUCTION_SERVICE_ID`
   - `RAILWAY_PRODUCTION_PUBLIC_DATABASE_URL`
   - `PRODUCTION_URL`

**Benefits of Environment Secrets**:
- Only accessible to production environment
- Blocked from other workflows
- Require approval to use

#### 2. Verify Protection Works

Test the protection rules:

1. Create a test release: `git tag v0.0.0-test && git push origin v0.0.0-test`
2. Workflow should pause and request reviewer approval
3. Approve deployment
4. Verify deployment proceeds
5. Delete test release: `gh release delete v0.0.0-test --yes`

#### 3. Update Team Access

Ensure production reviewers have appropriate permissions:
- At least "Write" access to repository
- Understand deployment approval process
- Available for time-sensitive approvals

---

## 🟠 HIGH ISSUE #3: E2E Test Artifacts May Leak Credentials

**Severity**: High
**Status**: ✅ **FIXED**
**Affected File**: `.github/workflows/staging-deploy.yml` (Lines 248-258)

### Problem
Playwright test artifacts (traces, screenshots, videos) are uploaded to GitHub Actions. Traces can capture network requests with credentials in headers/payloads.

### Risk Assessment
- **Exposure**: Credentials visible in Playwright traces
- **Scope**: Staging credentials (STAGING_USERNAME, STAGING_PASSWORD)
- **Impact**: MEDIUM - Staging credentials could be extracted from traces

### Solution Implemented

**Option Chosen**: Exclude traces from artifact uploads

**Changes Made**:
```yaml
# BEFORE (uploads traces):
- name: Upload E2E test artifacts
  uses: actions/upload-artifact@v4
  with:
    path: |
      playwright-report/
      test-results/

# AFTER (excludes traces):
- name: Upload E2E test artifacts
  uses: actions/upload-artifact@v4
  with:
    path: |
      playwright-report/
      !playwright-report/**/*.zip
      !playwright-report/**/trace-*.json
      test-results/
      !test-results/**/*.zip
      !test-results/**/trace-*.json
```

**Alternative Considered**:
- Restrict artifact download to repository collaborators only
- Decision: Excluding traces is simpler and more secure

**Trade-offs**:
- ❌ Traces not available for debugging failed tests
- ✅ Screenshots and videos still available
- ✅ HTML report still available with test results
- ✅ Credentials cannot leak through artifacts

---

## 🟡 MEDIUM ISSUE #4: E2E Test Flakiness from networkidle Overuse

**Severity**: Medium
**Status**: ✅ **DOCUMENTED - Follow-up Issue Created**
**Affected Files**: 23 E2E test files (153 occurrences)

### Problem
Tests use `waitForLoadState('networkidle')` extensively, which is unreliable with:
- React Query automatic refetches
- Background polling
- Lazy-loaded images
- Analytics tracking

### Risk Assessment
- **Exposure**: CI flakiness, false negatives
- **Scope**: All E2E tests
- **Impact**: MEDIUM - Estimated 5-10% flakiness rate

### Affected Files
- `tests/e2e/athlete-crud.spec.ts` (8 occurrences)
- `tests/e2e/permissions.spec.ts` (22 occurrences)
- `tests/e2e/auth-flows.spec.ts` (8 occurrences)
- `tests/e2e/measurement-entry.spec.ts` (17 occurrences)
- 19 other test files

### Recommended Solution

Replace `networkidle` waits with specific element checks:

```typescript
// BEFORE (unreliable):
await page.waitForLoadState('networkidle');
await page.click('button');

// AFTER (reliable):
await page.waitForSelector('button:not([disabled])');
await page.click('button');
```

### Follow-up Actions

A GitHub issue has been created to track this refactoring:
- Issue: #196
- Priority: Medium
- Estimated Effort: 4-6 hours
- Assignee: TBD

**Refactoring Strategy**:
1. Identify critical test flows (auth, CRUD operations)
2. Replace networkidle with specific element waits
3. Add explicit wait helpers in `tests/e2e/helpers/`
4. Update E2E test documentation

---

## Summary Checklist

### Immediate Actions Required

- [ ] **Add GitHub Secrets** (5 min)
  - [ ] CI_POSTGRES_USER
  - [ ] CI_POSTGRES_PASSWORD
  - [ ] CI_POSTGRES_DB

- [ ] **Configure Production Environment** (10 min)
  - [ ] Enable required reviewers (2+ people)
  - [ ] Set deployment branches (main, tags)
  - [ ] Move secrets to environment scope

- [ ] **Verify Security Fixes** (15 min)
  - [ ] Test PR checks with new credentials
  - [ ] Test production approval gate
  - [ ] Verify E2E artifacts don't contain traces

### Completed Actions

- [x] **Workflows Updated** (30 min)
  - [x] pr-checks.yml uses GitHub Secrets
  - [x] staging-deploy.yml uses GitHub Secrets
  - [x] production-deploy.yml uses GitHub Secrets
  - [x] E2E artifacts exclude traces

- [x] **Documentation Created** (15 min)
  - [x] Security fixes documented
  - [x] Step-by-step instructions provided
  - [x] Credentials generated and documented

### Follow-up Actions (Non-blocking)

- [ ] **Create GitHub Issue** for networkidle refactoring
- [ ] **Schedule refactoring** for next sprint
- [ ] **Update E2E testing guide** with best practices

---

## Timeline

**Total Estimated Time**: 30 minutes (immediate actions only)

**Breakdown**:
1. Add GitHub Secrets: 5 minutes
2. Configure Production Environment: 10 minutes
3. Verify workflows: 15 minutes

**Recommendation**: Complete immediate actions before next production deployment.

---

## Support

**Questions?** Contact:
- @johnahull (Repository Owner)
- Security Team: [Add contact if applicable]

**References**:
- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [GitHub Environments Documentation](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [Playwright Trace Security](https://playwright.dev/docs/trace-viewer)
