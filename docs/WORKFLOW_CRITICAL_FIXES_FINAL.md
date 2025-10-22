# Workflow Critical Fixes - Manual Changes Required

This document describes the workflow changes that cannot be applied automatically due to GitHub App permissions restrictions. These changes address issues #8-10 and #16-19 from the final code review.

## Why Manual Changes Are Needed

The GitHub App does not have permission to modify `.github/workflows/` files. This is a security restriction to prevent unauthorized modification of CI/CD pipelines.

## Critical Changes (Must Apply Before Production)

### Issue #8: Reduce Workflow Timeout from 30min to 10min

**Files**: `.github/workflows/staging-deploy.yml` (line ~97), `.github/workflows/production-deploy.yml` (line ~143)

**Current**:
```yaml
- name: Run database migrations
  timeout-minutes: 30
  id: migrate
```

**Change to**:
```yaml
- name: Run database migrations
  timeout-minutes: 10
  id: migrate
```

**Rationale**: 30 minutes is excessively long. Production migrations with proper timeouts (5min lock, 3min statement) should complete within 10 minutes. This prevents hung workflows while still allowing adequate time.

---

### Issue #9: Remove Redundant Migration Failure Handlers

**Files**: `.github/workflows/staging-deploy.yml` (lines 107-118), `.github/workflows/production-deploy.yml` (lines 153-164)

**Current**: There are two migration failure handler steps

**Change**: Remove the duplicate/redundant "Handle migration failure" step. Keep only one handler that:
1. Checks `if: failure() && steps.migrate.outcome == 'failure'`
2. Provides clear rollback instructions
3. References `docs/database-migration-rollback.md`

---

### Issue #10: Add Health Check Timeout

**Files**: `.github/workflows/staging-deploy.yml` (line ~154), `.github/workflows/production-deploy.yml` (line ~192)

**Current**: No timeout on health check steps

**Add**:
```yaml
- name: Health check
  timeout-minutes: 3
  run: |
    # existing health check code
```

**Rationale**: Health checks should not run indefinitely. 3 minutes provides adequate time for the service to respond while preventing hung workflows.

---

## Important Changes (Should Apply)

### Issue #16: Environment Variable Injection Protection

**Files**: Both workflow files, test setup steps (lines ~44-47, 49-52)

**Current**:
```yaml
env:
  DATABASE_URL: ${{ secrets.TEST_DATABASE_URL || 'postgresql://localhost:5432/test?sslmode=disable' }}
```

**Add validation**:
```yaml
- name: Validate environment variables
  run: |
    # Sanitize DATABASE_URL to prevent injection
    if [[ "$DATABASE_URL" =~ [';`$(){}] ]]; then
      echo "❌ Invalid characters in DATABASE_URL"
      exit 1
    fi
  env:
    DATABASE_URL: ${{ secrets.TEST_DATABASE_URL || 'postgresql://localhost:5432/test?sslmode=disable' }}
```

---

### Issue #18: Add Retry Logic to Health Checks

**Files**: Both workflow files, health check steps

**Current**: Single health check attempt

**Improve with exponential backoff**:
```yaml
- name: Health check with retry
  timeout-minutes: 3
  run: |
    MAX_RETRIES=5
    RETRY_DELAY=5

    for i in $(seq 1 $MAX_RETRIES); do
      echo "Health check attempt $i/$MAX_RETRIES..."

      if curl -f -s "${{ secrets.STAGING_URL }}/health" > /dev/null; then
        echo "✅ Health check passed"
        exit 0
      fi

      if [ $i -lt $MAX_RETRIES ]; then
        echo "⚠️  Health check failed, retrying in ${RETRY_DELAY}s..."
        sleep $RETRY_DELAY
        RETRY_DELAY=$((RETRY_DELAY * 2))  # Exponential backoff
      fi
    done

    echo "❌ Health check failed after $MAX_RETRIES attempts"
    exit 1
```

---

### Issue #19: Move Service IDs to Variables (Not Secrets)

**Current**: `RAILWAY_STAGING_SERVICE_ID` and `RAILWAY_PRODUCTION_SERVICE_ID` are in GitHub Secrets

**Change**: Move to GitHub Variables (Settings → Secrets and variables → Actions → Variables tab)

**Rationale**:
- Service IDs are not sensitive (they're UUIDs, not credentials)
- GitHub Variables are visible in logs, making debugging easier
- Secrets should only contain actual secrets (tokens, passwords)

**Update workflow references**:
```yaml
# Change from:
${{ secrets.RAILWAY_STAGING_SERVICE_ID }}

# To:
${{ vars.RAILWAY_STAGING_SERVICE_ID }}
```

---

## Testing After Changes

After applying these changes:

1. **Test in Staging First**:
   ```bash
   # Push a commit to trigger staging deployment
   git push origin feature/database-backup-prevention
   ```

2. **Monitor Workflow**:
   - Verify migration timeout works (10min max)
   - Verify health check retry logic works
   - Verify no redundant error handlers trigger

3. **Test Timeout Behavior**:
   - Create a deliberately slow migration (with sleep) in a test branch
   - Verify it times out at 10 minutes
   - Verify rollback instructions appear

4. **Test Health Check Retry**:
   - Temporarily point health check to invalid URL
   - Verify retry logic with exponential backoff
   - Verify it fails after 5 attempts

---

## Summary of Changes

| Issue | Priority | File | Change |
|-------|----------|------|--------|
| #8 | Critical | Both workflows | Timeout: 30min → 10min |
| #9 | Critical | Both workflows | Remove redundant handler |
| #10 | Critical | Both workflows | Add health check timeout |
| #16 | Important | Both workflows | Validate env vars |
| #18 | Important | Both workflows | Add retry w/ backoff |
| #19 | Important | Settings + workflows | Secrets → Variables |

---

## Questions?

If you encounter issues applying these changes:

1. Check workflow syntax with GitHub Actions validator
2. Test in a separate branch first
3. Review existing workflow structure for conflicts
4. Consult `.github/workflows/` documentation

---

**Document created**: 2025-10-15
**Related PR**: #129 - Database Backup and Migration Safety
**Code review iteration**: Final (post-fix verification)
