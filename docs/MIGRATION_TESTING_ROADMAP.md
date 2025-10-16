# Migration System Testing Roadmap

**Status**: PR #129 merged with basic configuration tests
**Priority**: High - Integration tests needed for production confidence
**Owner**: TBD
**Target**: v0.3.0

## Current Test Coverage

### ✅ Implemented (11 tests)
- Configuration validation (drizzle.config.ts structure)
- Package.json script existence
- Migration file safety patterns
- Workflow backup step verification
- Migration validation script existence

### ❌ Missing Critical Coverage (54 tests identified)

## Priority 1: Core Migration Functionality (12 tests)

### Advisory Lock Behavior
```typescript
describe('Advisory Lock Concurrency', () => {
  it('should block concurrent migrations with advisory locks', async () => {
    const migration1 = runMigrations(testDb);
    const migration2 = runMigrations(testDb);

    const results = await Promise.allSettled([migration1, migration2]);

    // One succeeds, one fails with lock error
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r =>
      r.status === 'rejected' &&
      r.reason.message.includes('Another migration is in progress')
    )).toHaveLength(1);
  });

  it('should release advisory lock after successful migration', async () => {
    await runMigrations(testDb);

    const locks = await testDb.query(`
      SELECT * FROM pg_locks WHERE locktype = 'advisory' AND classid = 2024
    `);
    expect(locks.rows).toHaveLength(0);
  });

  it('should release advisory lock after migration failure', async () => {
    const badMigration = 'INVALID SQL SYNTAX;';
    fs.writeFileSync('migrations/9999_bad.sql', badMigration);

    await expect(runMigrations(testDb)).rejects.toThrow();

    const locks = await testDb.query(`
      SELECT * FROM pg_locks WHERE locktype = 'advisory' AND classid = 2024
    `);
    expect(locks.rows).toHaveLength(0);
  });

  it('should use environment-specific lock IDs', async () => {
    process.env.NODE_ENV = 'production';
    const prodLockId = getLockId();

    process.env.NODE_ENV = 'development';
    const devLockId = getLockId();

    expect(prodLockId).not.toBe(devLockId);
  });
});

describe('Migration Execution', () => {
  it('should successfully apply migration to empty database', async () => {
    const result = await runMigrations(testDb);
    expect(result.success).toBe(true);
  });

  it('should skip already-applied migrations', async () => {
    await runMigrations(testDb);
    const result = await runMigrations(testDb);

    expect(result.migrationsApplied).toBe(0);
  });

  it('should apply multiple pending migrations in order', async () => {
    fs.writeFileSync('migrations/0001_first.sql', 'CREATE TABLE test1 (id INT);');
    fs.writeFileSync('migrations/0002_second.sql', 'CREATE TABLE test2 (id INT);');

    const result = await runMigrations(testDb);

    expect(result.migrationsApplied).toBe(2);
    expect(await tableExists(testDb, 'test1')).toBe(true);
    expect(await tableExists(testDb, 'test2')).toBe(true);
  });

  it('should rollback transaction on migration failure', async () => {
    fs.writeFileSync('migrations/0001_good.sql', 'CREATE TABLE test (id INT);');
    fs.writeFileSync('migrations/0002_bad.sql', 'INVALID SQL;');

    await expect(runMigrations(testDb)).rejects.toThrow();

    // First migration should be rolled back
    expect(await tableExists(testDb, 'test')).toBe(false);
  });
});
```

## Priority 2: Timeout Behavior (8 tests)

```typescript
describe('Migration Timeouts', () => {
  it('should respect statement_timeout in production', async () => {
    process.env.NODE_ENV = 'production';
    const longRunning = 'SELECT pg_sleep(300);'; // 5 min

    await expect(runMigration(longRunning)).rejects.toThrow('statement timeout');
  });

  it('should respect lock_timeout when acquiring locks', async () => {
    // Hold lock in another connection
    const conn1 = await acquireLock(testDb);

    process.env.NODE_ENV = 'production';
    const start = Date.now();
    await expect(runMigrations(testDb)).rejects.toThrow();
    const elapsed = Date.now() - start;

    // Should fail around 5 min (production lock_timeout)
    expect(elapsed).toBeGreaterThan(4.5 * 60 * 1000);
    expect(elapsed).toBeLessThan(5.5 * 60 * 1000);
  });

  it('should use shorter timeouts in development', async () => {
    process.env.NODE_ENV = 'development';
    const longRunning = 'SELECT pg_sleep(60);'; // 1 min

    await expect(runMigration(longRunning)).rejects.toThrow('statement timeout');
  });

  it('should handle connection loss during migration', async () => {
    // Simulate connection drop
    await testDb.query('SELECT pg_terminate_backend(pg_backend_pid());');

    await expect(runMigrations(testDb)).rejects.toThrow('connection');
  });
});
```

## Priority 3: Backup System (10 tests)

```typescript
describe('Backup Creation', () => {
  it('should create backup file before migration', async () => {
    const beforeCount = countBackups();
    await runBackup();
    const afterCount = countBackups();

    expect(afterCount).toBe(beforeCount + 1);
  });

  it('should verify backup checksum matches file', async () => {
    await runBackup();
    const backup = findLatestBackup();

    const actualChecksum = crypto.createHash('sha256')
      .update(fs.readFileSync(backup))
      .digest('hex');

    const storedChecksum = fs.readFileSync(`${backup}.sha256`, 'utf-8')
      .split(' ')[0];

    expect(storedChecksum).toBe(actualChecksum);
  });

  it('should include all tables in backup', async () => {
    await seedDatabase(testDb);
    const backup = await runBackup();
    const content = fs.readFileSync(backup, 'utf-8');

    expect(content).toContain('CREATE TABLE users');
    expect(content).toContain('CREATE TABLE teams');
    expect(content).toContain('CREATE TABLE measurements');
  });

  it('should fail if backup directory not writable', async () => {
    fs.chmodSync('backups/', 0o444); // Read-only

    await expect(runBackup()).rejects.toThrow('permission denied');

    fs.chmodSync('backups/', 0o755); // Restore
  });

  it('should clean up old backups based on retention', async () => {
    // Create 10 old backups
    for (let i = 0; i < 10; i++) {
      createOldBackup(Date.now() - (i + 8) * 24 * 60 * 60 * 1000);
    }

    process.env.BACKUP_RETENTION_DAYS = '7';
    await runBackup();

    const backups = listBackups();
    expect(backups.length).toBe(8); // 7 days + today
  });
});

describe('Backup Restoration', () => {
  it('should successfully restore from backup', async () => {
    await seedDatabase(testDb);
    const backup = await runBackup();

    await dropAllTables(testDb);
    await restoreBackup(testDb, backup);

    const tables = await listTables(testDb);
    expect(tables).toContain('users');
  });

  it('should validate backup before restoration', async () => {
    const corruptBackup = 'backups/corrupt.sql';
    fs.writeFileSync(corruptBackup, 'INVALID SQL DUMP');

    await expect(restoreBackup(testDb, corruptBackup))
      .rejects.toThrow('invalid backup');
  });
});
```

## Priority 4: Signal Handling (6 tests)

```typescript
describe('Graceful Shutdown', () => {
  it('should release lock on SIGTERM', async () => {
    const migration = runMigrations(testDb);

    await delay(100);
    process.emit('SIGTERM');

    await migration;

    const locks = await testDb.query(`
      SELECT * FROM pg_locks WHERE locktype = 'advisory'
    `);
    expect(locks.rows).toHaveLength(0);
  });

  it('should release lock on SIGINT', async () => {
    const migration = runMigrations(testDb);

    await delay(100);
    process.emit('SIGINT');

    await migration;

    const locks = await testDb.query(`
      SELECT * FROM pg_locks WHERE locktype = 'advisory'
    `);
    expect(locks.rows).toHaveLength(0);
  });

  it('should not leave partial migrations on interruption', async () => {
    const migration = runMigrations(testDb);

    await delay(100);
    process.kill(process.pid, 'SIGTERM');

    // All or nothing - no partial tables
    const tables = await listTables(testDb);
    expect(tables).toHaveLength(0);
  });
});
```

## Priority 5: Validation System (10 tests)

```typescript
describe('Migration Validation', () => {
  it('should detect DELETE without WHERE', () => {
    const sql = 'DELETE FROM users;';
    const result = validateMigration(sql);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('DELETE without WHERE');
  });

  it('should detect TRUNCATE TABLE', () => {
    const sql = 'TRUNCATE TABLE users;';
    const result = validateMigration(sql);

    expect(result.errors).toHaveLength(1);
  });

  it('should allow safe migrations', () => {
    const sql = 'ALTER TABLE users ADD COLUMN middle_name TEXT;';
    const result = validateMigration(sql);

    expect(result.errors).toHaveLength(0);
  });

  it('should detect dangerous patterns in comments', () => {
    const sql = `
      -- This is safe: DELETE FROM users;
      SELECT 1;
    `;
    const result = validateMigration(sql);

    // Should strip comments before validation
    expect(result.errors).toHaveLength(0);
  });

  it('should handle dollar-quoted strings', () => {
    const sql = `
      CREATE FUNCTION test() RETURNS void AS $$
      BEGIN
        DELETE FROM users;
      END;
      $$ LANGUAGE plpgsql;
    `;
    const result = validateMigration(sql);

    // Should strip function bodies before validation
    expect(result.errors).toHaveLength(0);
  });
});
```

## Priority 6: Error Handling (8 tests)

```typescript
describe('Error Reporting', () => {
  it('should include PostgreSQL error code', async () => {
    const sql = 'SELECT * FROM nonexistent_table;';

    try {
      await runMigration(sql);
      fail('Should have thrown');
    } catch (error) {
      expect(error.code).toBe('42P01'); // undefined_table
    }
  });

  it('should show migration file context on error', async () => {
    const sql = 'INVALID SQL;';
    fs.writeFileSync('migrations/0001_bad.sql', sql);

    try {
      await runMigrations(testDb);
      fail('Should have thrown');
    } catch (error) {
      expect(error.message).toContain('0001_bad.sql');
    }
  });
});
```

## Implementation Plan

### Phase 1: Core Functionality (Week 1)
- [ ] Set up test database infrastructure
- [ ] Implement advisory lock concurrency tests
- [ ] Implement migration execution tests
- [ ] **Goal**: Verify migration runner works correctly

### Phase 2: Timeout & Resilience (Week 2)
- [ ] Implement timeout behavior tests
- [ ] Implement connection loss tests
- [ ] Implement signal handling tests
- [ ] **Goal**: Verify system handles failures gracefully

### Phase 3: Backup System (Week 3)
- [ ] Implement backup creation tests
- [ ] Implement backup restoration tests
- [ ] Implement checksum validation tests
- [ ] **Goal**: Verify backup/restore procedures work

### Phase 4: Validation & Error Handling (Week 4)
- [ ] Implement validation system tests
- [ ] Implement error reporting tests
- [ ] **Goal**: Verify safety checks work correctly

## Test Infrastructure Needs

### Database Setup
```typescript
// tests/setup/migration-test-setup.ts
export async function createTestDatabase() {
  const testDb = postgres('postgresql://test:test@localhost:5432/test_migrations');
  await testDb`DROP DATABASE IF EXISTS test_migrations`;
  await testDb`CREATE DATABASE test_migrations`;
  return testDb;
}

export async function cleanupTestDatabase(db) {
  await db.end();
}
```

### Migration Runner Mock
```typescript
// tests/helpers/migration-runner.ts
export async function runMigrations(db, options = {}) {
  const runner = new MigrationRunner(db, options);
  return await runner.run();
}
```

## Success Criteria

- [ ] All 54 tests passing
- [ ] 100% code coverage of migration runner
- [ ] 100% code coverage of backup scripts
- [ ] 100% code coverage of validation logic
- [ ] Documented failure scenarios with recovery procedures
- [ ] Performance benchmarks (migration time, backup time)

## References

- PR #129: Initial migration system implementation
- `scripts/run-migrations.js`: Migration runner
- `scripts/backup-database.js`: Backup system
- `scripts/validate-migrations.js`: Validation logic
- `docs/database-migration-rollback.md`: Recovery procedures

---

**Note**: This roadmap should be implemented as a follow-up to PR #129. The current PR provides basic safety checks and configuration tests, but comprehensive integration testing is needed before relying on this system in production.
