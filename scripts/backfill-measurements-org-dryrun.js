#!/usr/bin/env node

/**
 * Dry-run script to preview measurements organization_id backfill
 *
 * This script analyzes measurements with NULL organization_id and shows:
 * 1. How many can be backfilled from teams
 * 2. How many can be backfilled from user_organizations
 * 3. How many are orphaned (cannot be backfilled)
 *
 * Usage:
 *   DATABASE_URL=<url> node scripts/backfill-measurements-org-dryrun.js
 *
 * No changes are made to the database - this is read-only.
 */

import postgres from 'postgres';

async function dryRun() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    console.error('Usage: DATABASE_URL=<url> node scripts/backfill-measurements-org-dryrun.js');
    process.exit(1);
  }

  // Extract host for display (hide credentials)
  const hostMatch = DATABASE_URL.match(/@([^/?]+)/);
  const dbHost = hostMatch ? hostMatch[1] : 'unknown';

  console.log('='.repeat(60));
  console.log('Measurements Organization Backfill - DRY RUN');
  console.log('='.repeat(60));
  console.log(`Database: ${dbHost}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const sql = postgres(DATABASE_URL, {
    max: 1,
    ssl: DATABASE_URL.includes('localhost') ? false : 'require'
  });

  try {
    // =========================================================================
    // 1. Total measurements and NULL count
    // =========================================================================
    console.log('--- Current State ---\n');

    const [stats] = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE organization_id IS NULL) as null_org,
        COUNT(*) FILTER (WHERE organization_id IS NOT NULL) as has_org
      FROM measurements
    `;

    console.log(`Total measurements:     ${stats.total}`);
    console.log(`With organization_id:   ${stats.has_org}`);
    console.log(`NULL organization_id:   ${stats.null_org}`);

    if (stats.null_org === '0') {
      console.log('\n✅ No measurements need backfilling!');
      await sql.end();
      return;
    }

    const nullPercent = ((parseInt(stats.null_org) / parseInt(stats.total)) * 100).toFixed(2);
    console.log(`Percentage NULL:        ${nullPercent}%\n`);

    // =========================================================================
    // 2. Backfill analysis
    // =========================================================================
    console.log('--- Backfill Analysis ---\n');

    // Can backfill from teams
    const [fromTeams] = await sql`
      SELECT COUNT(*) as count
      FROM measurements m
      INNER JOIN teams t ON m.team_id = t.id
      WHERE m.organization_id IS NULL
        AND t.organization_id IS NOT NULL
    `;
    console.log(`Can backfill from teams:              ${fromTeams.count}`);

    // Can backfill from user_organizations (for those without team)
    const [fromUserOrg] = await sql`
      SELECT COUNT(*) as count
      FROM measurements m
      WHERE m.organization_id IS NULL
        AND (m.team_id IS NULL OR NOT EXISTS (SELECT 1 FROM teams t WHERE t.id = m.team_id))
        AND EXISTS (
          SELECT 1 FROM user_organizations uo
          WHERE uo.user_id = m.user_id
        )
    `;
    console.log(`Can backfill from user_organizations: ${fromUserOrg.count}`);

    const totalBackfillable = parseInt(fromTeams.count) + parseInt(fromUserOrg.count);
    console.log(`Total backfillable:                   ${totalBackfillable}`);

    // =========================================================================
    // 3. Orphaned measurements analysis
    // =========================================================================
    console.log('\n--- Orphaned Measurements ---\n');

    // No user exists
    const [orphanedNoUser] = await sql`
      SELECT COUNT(*) as count
      FROM measurements m
      WHERE m.organization_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)
    `;
    console.log(`User deleted:           ${orphanedNoUser.count}`);

    // Team deleted (for measurements with team_id)
    const [orphanedNoTeam] = await sql`
      SELECT COUNT(*) as count
      FROM measurements m
      WHERE m.organization_id IS NULL
        AND m.team_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.id = m.team_id)
    `;
    console.log(`Team deleted:           ${orphanedNoTeam.count}`);

    // User exists but has no organization membership
    const [orphanedNoOrgMembership] = await sql`
      SELECT COUNT(*) as count
      FROM measurements m
      WHERE m.organization_id IS NULL
        AND EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)
        AND NOT EXISTS (SELECT 1 FROM user_organizations uo WHERE uo.user_id = m.user_id)
        AND (m.team_id IS NULL OR NOT EXISTS (SELECT 1 FROM teams t WHERE t.id = m.team_id AND t.organization_id IS NOT NULL))
    `;
    console.log(`User has no org:        ${orphanedNoOrgMembership.count}`);

    const totalOrphaned = parseInt(orphanedNoUser.count) + parseInt(orphanedNoTeam.count) + parseInt(orphanedNoOrgMembership.count);
    console.log(`Total orphaned:         ${totalOrphaned}`);

    // =========================================================================
    // 4. Summary
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    console.log(`\nNULL organization_id:   ${stats.null_org}`);
    console.log(`Can be backfilled:      ${totalBackfillable}`);
    console.log(`Orphaned (manual fix):  ${totalOrphaned}`);

    const accounted = totalBackfillable + totalOrphaned;
    if (accounted !== parseInt(stats.null_org)) {
      console.log(`\n⚠️  Warning: Numbers don't match (${accounted} vs ${stats.null_org})`);
      console.log('   Some measurements may be in overlapping categories.');
    }

    // =========================================================================
    // 5. Sample orphaned measurements (if any)
    // =========================================================================
    if (totalOrphaned > 0) {
      console.log('\n--- Sample Orphaned Measurements (first 10) ---\n');

      const samples = await sql`
        SELECT
          m.id,
          m.user_id,
          m.team_id,
          m.player_id,
          m.date,
          m.metric,
          CASE
            WHEN NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id) THEN 'user_deleted'
            WHEN m.team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.id = m.team_id) THEN 'team_deleted'
            ELSE 'no_org_membership'
          END as reason
        FROM measurements m
        WHERE m.organization_id IS NULL
          AND (
            NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)
            OR (m.team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.id = m.team_id))
            OR (
              EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id)
              AND NOT EXISTS (SELECT 1 FROM user_organizations uo WHERE uo.user_id = m.user_id)
            )
          )
        ORDER BY m.date DESC
        LIMIT 10
      `;

      if (samples.length > 0) {
        console.log('ID                                   | Date       | Metric      | Reason');
        console.log('-'.repeat(80));
        for (const m of samples) {
          const id = m.id.substring(0, 36);
          const date = m.date || 'N/A';
          const metric = (m.metric || 'N/A').padEnd(11);
          console.log(`${id} | ${date} | ${metric} | ${m.reason}`);
        }
      }
    }

    // =========================================================================
    // 6. Recommendations
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('RECOMMENDATIONS');
    console.log('='.repeat(60));

    if (totalBackfillable > 0) {
      console.log('\n1. Run the backfill migration to fix backfillable measurements');
      console.log('   npm run db:migrate:manual');
    }

    if (totalOrphaned > 0) {
      console.log('\n2. Handle orphaned measurements manually:');
      console.log('   - Option A: Delete them (if test/demo data)');
      console.log('   - Option B: Assign to a default organization');
      console.log('   - Option C: Archive to a separate table');
    }

    if (totalBackfillable === 0 && totalOrphaned === 0 && parseInt(stats.null_org) > 0) {
      console.log('\n⚠️  Some NULL measurements not categorized. Manual investigation needed.');
    }

    console.log('\n' + '='.repeat(60));
    console.log('DRY RUN COMPLETE - No changes made');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code) {
      console.error('   Code:', error.code);
    }
    process.exit(1);
  } finally {
    await sql.end();
  }
}

dryRun();
