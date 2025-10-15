# Workflow Manual Fixes Required

Due to GitHub App permissions, the workflow files in `.github/workflows/` cannot be automatically modified. The following changes must be applied manually.

## Critical Fix: Increase Migration Timeout

Both workflow files need increased timeouts to accommodate large table operations.

### Files to Modify:
- `.github/workflows/staging-deploy.yml`
- `.github/workflows/production-deploy.yml`

### Changes Required:

#### Staging Workflow (staging-deploy.yml)

**Location:** Line ~97 (in the "Run database migrations" step)

**Change from:**
```yaml
- name: Run database migrations
  timeout-minutes: 10
  id: migrate
```

**Change to:**
```yaml
- name: Run database migrations
  timeout-minutes: 30
  id: migrate
```

**Reason:** Large table operations (adding indexes to 1M+ rows, data transformations) can exceed 10 minutes. The 30-minute timeout provides adequate buffer while still preventing indefinite hangs.

---

#### Production Workflow (production-deploy.yml)

**Location:** Line ~143 (in the "Run database migrations" step)

**Change from:**
```yaml
- name: Run database migrations
  timeout-minutes: 10
  id: migrate
```

**Change to:**
```yaml
- name: Run database migrations
  timeout-minutes: 30
  id: migrate
```

**Reason:** Same as staging - production databases are larger and require more time for complex migrations.

---

## Recommended Improvements

### Add Workflow Dependencies

While migrations will still run, adding explicit dependencies makes the workflow more robust.

#### In Both Workflows:

**Add to "Validate database migrations" step:**
```yaml
- name: Validate database migrations
  if: steps.backup.outcome == 'success'  # Add this line
  timeout-minutes: 2
  run: npm run db:validate
```

**Add to "Run database migrations" step:**
```yaml
- name: Run database migrations
  if: steps.backup.outcome == 'success'  # Add this line
  timeout-minutes: 30
  id: migrate
```

This ensures migrations only run if backup succeeded.

---

## Testing After Changes

1. **Verify syntax:** Check YAML syntax with `yamllint .github/workflows/*.yml`
2. **Test in staging first:** Let a staging deployment run with the new timeout
3. **Monitor logs:** Watch for timeout issues or early termination
4. **Validate backup/migration order:** Ensure backup runs before migrations

---

## Why These Changes Are Needed

### Migration Timeout Issue
The current 10-minute timeout was too aggressive for production databases. Real-world scenarios that exceed 10 minutes:

- Adding index to `measurements` table with 1M+ rows: ~15-20 minutes
- Data migration/transformation on large tables: ~20-30 minutes
- Complex schema changes with multiple operations: ~10-15 minutes

The 30-minute timeout accommodates these scenarios while still preventing indefinite hangs.

### Best Practice Alignment
- PostgreSQL statement timeout in run-migrations.js: Production 3min, Development 30s
- PostgreSQL lock timeout in run-migrations.js: Production 5min, Development 1min
- Workflow timeout should exceed statement + lock timeout with buffer: 30 minutes provides 22 minutes of buffer

---

## Summary of All Code Review Fixes

### ✅ Fixed in Code (Automatically)
1. Command injection vulnerability - UUID validation added
2. SQL injection in dollar-quote regex - backreference implemented
3. DELETE/UPDATE false positives - USING/FROM clauses accounted for
4. Backup checksum cleanup - .sha256 files now deleted with .sql files
5. SIGINT exit code - corrected to 130 (128+2)
6. Missing dangerous SQL patterns - DROP FUNCTION, DROP TRIGGER, ALTER TABLE RENAME added
7. CREATE INDEX CONCURRENTLY - false positive fixed
8. Advisory lock verification - type comparison fixed
9. Minimum backup size - increased to 5KB

### ⚠️ Requires Manual Action (This Document)
10. Migration timeout - increase from 10 to 30 minutes in both workflows

---

**Implementation Priority:** HIGH - Apply before next deployment to prevent migration timeout failures.
