# Database Migration Quick Start Guide

## For Developers

### Creating a New Migration

When you modify `shared/schema.ts`, follow these steps:

```bash
# 1. Make changes to shared/schema.ts
# (Add columns, create tables, etc.)

# 2. Generate migration file
npm run db:generate

# 3. Review the generated migration
cat drizzle/migrations/XXXX_description.sql

# 4. Test locally (development database)
npm run db:migrate

# 5. Verify application works
npm run dev

# 6. Run tests
npm run test:integration

# 7. Commit migration file with your changes
git add drizzle/migrations/
git add shared/schema.ts
git commit -m "feat: add new table/column"
```

### Migration Safety Checklist

Before committing a migration:

- [ ] Generated migration using `npm run db:generate`
- [ ] Reviewed SQL in `drizzle/migrations/XXXX_*.sql`
- [ ] No `DROP TABLE` without `IF EXISTS`
- [ ] No `TRUNCATE` commands
- [ ] No `DROP DATABASE` commands
- [ ] Migration is backward compatible (if possible)
- [ ] Tested locally with `npm run db:migrate`
- [ ] Application works with new schema
- [ ] Tests pass: `npm run test:integration`

### Common Migration Patterns

#### ✅ Safe: Add Nullable Column
```sql
ALTER TABLE users ADD COLUMN middle_name TEXT;
```

#### ✅ Safe: Add Column with Default
```sql
ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT false;
```

#### ✅ Safe: Create New Table
```sql
CREATE TABLE user_preferences (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  ...
);
```

#### ⚠️ Warning: Drop Column (Data Loss!)
```sql
ALTER TABLE users DROP COLUMN old_field;
-- Only if you're sure data is backed up!
```

#### ❌ Unsafe: Drop Table
```sql
DROP TABLE old_table;  -- NEVER DO THIS
DROP TABLE IF EXISTS old_table;  -- OK if intentional
```

## Development Workflow

### Local Development

**Quick iteration** (no migration files needed):
```bash
npm run db:push
```

**Proper migrations** (recommended before committing):
```bash
npm run db:generate  # Create migration
npm run db:validate  # Validate safety
npm run db:migrate   # Apply migration
```

### Staging/Production

**Automatic via CI/CD**:
1. Backup database
2. Validate migrations (`npm run db:validate`)
3. Apply migrations (`npm run db:migrate`)
4. Deploy application
5. Health checks

## Troubleshooting

### "Migration validation failed"

Check the error message for dangerous patterns:
```bash
npm run db:validate
```

Common issues:
- `DROP TABLE` without `IF EXISTS` - Add `IF EXISTS`
- `TRUNCATE TABLE` - Consider safer alternatives
- `DELETE FROM table` without `WHERE` - Add `WHERE` clause

### "Migration failed to apply"

1. Check Railway logs for SQL errors
2. Database might be in inconsistent state
3. See rollback procedures: `docs/database-migration-rollback.md`

### "Schema out of sync with database"

```bash
# Generate migration to sync schema
npm run db:generate

# Review migration file
cat drizzle/migrations/XXXX_*.sql

# Apply to local database
npm run db:migrate
```

## Scripts Reference

| Command | Description | When to Use |
|---------|-------------|-------------|
| `npm run db:push` | Direct schema push (no migration files) | Local development only |
| `npm run db:generate` | Generate migration file | After changing schema |
| `npm run db:migrate` | Apply migrations | Local or CI/CD |
| `npm run db:validate` | Validate migration safety | Before committing |

## Emergency Rollback

If deployment breaks production:

1. **Check**: `docs/database-migration-rollback.md`
2. **Railway Dashboard**: Rollback to previous deployment
3. **Database Restore**: Use Railway backups (if needed)

## Need Help?

- Read: `docs/database-migration-rollback.md`
- Check: GitHub Actions logs
- Review: Railway deployment logs
- Contact: Team lead

## Recent Changes (v0.2.0)

- ✅ Staging/Production use safe `db:migrate` (not `db:push`)
- ✅ Automatic database backups before migrations
- ✅ Migration validation checks for dangerous patterns
- ✅ Comprehensive rollback documentation
