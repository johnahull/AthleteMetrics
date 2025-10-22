# Manual Workflow Fixes Required

This document describes manual changes needed for workflow files that cannot be automatically modified due to GitHub App permissions restrictions.

## Critical Issue #7: Backup Verification After Migration Failure

**Impact:** HIGH - Without this verification, a corrupted backup could go undetected until a restore is attempted during an emergency.

**Files to modify:**
- `.github/workflows/staging-deploy.yml`
- `.github/workflows/production-deploy.yml`

### Required Changes

Add a backup verification step that runs after migration failures to ensure the backup is valid and restorable.

#### For Staging Workflow

**File:** `.github/workflows/staging-deploy.yml`

**Location:** After the "Handle migration failure" step (around line 110)

**Add this step:**

```yaml
- name: Verify backup after migration failure
  if: failure() && steps.migrate.outcome == 'failure'
  run: |
    echo "🔍 Verifying backup integrity after migration failure..."

    # Find the most recent backup
    BACKUP_FILE=$(ls -t backups/*.sql 2>/dev/null | head -1)

    if [ -z "$BACKUP_FILE" ]; then
      echo "❌ CRITICAL: No backup file found!"
      echo "Manual intervention required - database may be in inconsistent state"
      exit 1
    fi

    echo "Checking backup: $BACKUP_FILE"

    # Verify SHA-256 checksum if available
    if [ -f "${BACKUP_FILE}.sha256" ]; then
      if sha256sum -c "${BACKUP_FILE}.sha256"; then
        echo "✅ Backup checksum verified"
      else
        echo "❌ CRITICAL: BACKUP CORRUPTED! Checksum verification failed"
        echo "Manual intervention required immediately"
        exit 1
      fi
    else
      echo "⚠️  Warning: No checksum file found for verification"
    fi

    # Verify backup has completion marker
    if ! grep -q "PostgreSQL database dump complete" "$BACKUP_FILE"; then
      echo "❌ CRITICAL: BACKUP INCOMPLETE! Missing completion marker"
      echo "Backup may have been interrupted during creation"
      echo "Manual intervention required - restore from Railway backups"
      exit 1
    fi

    # Verify backup contains essential structures
    if ! grep -q "CREATE TABLE" "$BACKUP_FILE"; then
      echo "⚠️  Warning: No CREATE TABLE statements found in backup"
      echo "Backup may only contain data, not schema"
    fi

    echo "✅ Backup verified - safe to restore if needed"
    echo ""
    echo "📋 Backup details:"
    echo "   File: $BACKUP_FILE"
    echo "   Size: $(du -h "$BACKUP_FILE" | cut -f1)"
    echo ""
    echo "🔧 To restore this backup:"
    echo "   1. Download backup artifact from this workflow run"
    echo "   2. Follow procedures in docs/database-migration-rollback.md"
```

#### For Production Workflow

**File:** `.github/workflows/production-deploy.yml`

**Location:** After the "Handle migration failure" step (around line 156)

**Add the same step as staging (identical content)**

### Why This Is Critical

1. **Early Detection:** Detects corrupted backups immediately rather than during emergency restore
2. **Data Integrity:** Verifies backup completeness using PostgreSQL's completion marker
3. **Cryptographic Verification:** SHA-256 checksum ensures backup wasn't corrupted during creation or storage
4. **Actionable Guidance:** Provides clear next steps for operators during incidents

### Testing the Changes

After adding these steps:

1. **Test successful migration:**
   - Verify backup verification step is skipped
   - Check deployment completes normally

2. **Test failed migration:**
   - Intentionally create an invalid migration (e.g., syntax error)
   - Verify backup verification step runs
   - Confirm backup is validated successfully
   - Check error messages are clear and actionable

3. **Test corrupted backup scenario (in staging only):**
   - Manually corrupt a backup file after creation
   - Trigger migration failure
   - Verify verification step detects corruption
   - Confirm workflow fails with clear error

### Alternative Approach

If you cannot modify workflow files directly, consider:

1. **Create composite action:** Extract verification logic to `.github/actions/verify-backup/action.yml`
2. **Post-deployment monitoring:** Add a separate job that runs after deployment and checks backup integrity
3. **Manual verification script:** Document manual verification steps in runbook

### Related Documentation

- Migration rollback procedures: `docs/database-migration-rollback.md`
- Migration quick start: `docs/MIGRATION_QUICK_START.md`
- Backup script implementation: `scripts/backup-database.js`

---

**Last Updated:** 2025-10-15
**Related PR:** #129
**Code Review Issue:** Critical Issue #7
