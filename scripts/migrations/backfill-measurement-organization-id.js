/**
 * Backfill organization_id for existing measurements
 *
 * This migration populates the organization_id field for measurements that were
 * created before the column was added. It uses the user_organizations table to
 * determine which organization the athlete belonged to at the time of measurement.
 *
 * Safe to run multiple times - only updates measurements where organization_id is NULL
 */

import { db } from '../packages/api/db.js';
import { sql } from 'drizzle-orm';

async function backfillMeasurementOrganizationId() {
  console.log('Starting organization_id backfill for measurements...');

  try {
    // Check how many measurements need updating
    const [countResult] = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(organization_id) as with_org_id
      FROM measurements
    `);

    const total = Number(countResult.total);
    const withOrgId = Number(countResult.with_org_id);
    const needsUpdate = total - withOrgId;

    console.log(`Total measurements: ${total}`);
    console.log(`Already have organization_id: ${withOrgId}`);
    console.log(`Need to backfill: ${needsUpdate}`);

    if (needsUpdate === 0) {
      console.log('✅ No measurements need updating - all have organization_id');
      return;
    }

    // Perform the backfill
    // For each measurement without organization_id, find the athlete's organization
    // from user_organizations table
    console.log('Updating measurements...');

    const result = await db.execute(sql`
      UPDATE measurements m
      SET organization_id = (
        SELECT uo.organization_id
        FROM user_organizations uo
        WHERE uo.user_id = m.user_id
        LIMIT 1
      )
      WHERE organization_id IS NULL
    `);

    console.log(`✅ Successfully updated ${result.rowCount || needsUpdate} measurements`);

    // Verify the update
    const [verifyResult] = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(organization_id) as with_org_id
      FROM measurements
    `);

    const afterTotal = Number(verifyResult.total);
    const afterWithOrgId = Number(verifyResult.with_org_id);
    const stillMissing = afterTotal - afterWithOrgId;

    console.log('\nVerification:');
    console.log(`Total measurements: ${afterTotal}`);
    console.log(`With organization_id: ${afterWithOrgId}`);
    console.log(`Still missing: ${stillMissing}`);

    if (stillMissing > 0) {
      console.warn(`⚠️  Warning: ${stillMissing} measurements still don't have organization_id`);
      console.warn('   These may be orphaned measurements for deleted users');
    } else {
      console.log('✅ All measurements now have organization_id');
    }

  } catch (error) {
    console.error('❌ Error during backfill:', error);
    throw error;
  }
}

// Run the migration
backfillMeasurementOrganizationId()
  .then(() => {
    console.log('\n✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
