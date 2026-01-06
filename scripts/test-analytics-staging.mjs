/**
 * Test analytics endpoints against staging database
 * This helps reproduce the 500 errors seen on staging
 *
 * Usage: DATABASE_URL="your-connection-string" node scripts/test-analytics-staging.mjs
 */

import pg from 'pg';
const { Client } = pg;

// Get database URL from environment variable
const STAGING_DB_URL = process.env.DATABASE_URL;
if (!STAGING_DB_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="postgresql://..." node scripts/test-analytics-staging.mjs');
  process.exit(1);
}

// Get org ID from command line or use a test value
const ORG_ID = process.argv[2] || '7ea312df-d815-47bf-8945-fefe710747d5';

async function testAthleteIdsQuery() {
  const client = new Client({ connectionString: STAGING_DB_URL });

  try {
    await client.connect();
    console.log('✓ Connected to staging database\n');

    // Test 1: Get athlete IDs for organization (mimics getAthleteIdsForScope)
    console.log('Test 1: Get athlete IDs for organization');
    console.log('=========================================');
    const athleteIdsResult = await client.query(`
      SELECT DISTINCT ut.user_id
      FROM user_teams ut
      INNER JOIN teams t ON ut.team_id = t.id
      WHERE t.organization_id = $1
        AND ut.is_active = true
      LIMIT 10
    `, [ORG_ID]);

    console.log(`Found ${athleteIdsResult.rows.length} athletes`);
    const athleteIds = athleteIdsResult.rows.map(r => r.user_id);
    console.log('Sample athlete IDs:', athleteIds.slice(0, 3));
    console.log('');

    if (athleteIds.length === 0) {
      console.log('❌ No athletes found - this would cause empty array issues\n');
      return;
    }

    // Test 2: Most Improved Query (mimics getMostImproved)
    console.log('Test 2: Most Improved Query');
    console.log('============================');
    try {
      const mostImprovedResult = await client.query(`
        WITH ordered_measurements AS (
          SELECT
            user_id as athlete_id,
            CAST(value AS NUMERIC) as value,
            date,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date ASC) as first_row,
            ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date DESC) as last_row
          FROM measurements
          WHERE user_id = ANY($1::text[])
            AND metric = $2
            AND is_verified = true
        ),
        athlete_stats AS (
          SELECT
            athlete_id,
            MIN(CASE WHEN first_row = 1 THEN value END) as first_value,
            MIN(value) as best_value,
            COUNT(*) as measurement_count
          FROM ordered_measurements
          GROUP BY athlete_id
          HAVING COUNT(*) >= 2
        )
        SELECT
          athlete_id::text as "athleteId",
          first_value::float as "previousValue",
          best_value::float as "currentValue",
          ((first_value - best_value) / NULLIF(first_value, 0)) * 100 as "improvementPercent",
          measurement_count::int as "measurementCount"
        FROM athlete_stats
        WHERE first_value > 0
          AND ((first_value - best_value) / first_value) * 100 > 0
        ORDER BY "improvementPercent" DESC
        LIMIT 5
      `, [athleteIds, 'FLY10_TIME']);

      console.log(`✓ Query succeeded, found ${mostImprovedResult.rows.length} improved athletes`);
      console.log('Sample result:', mostImprovedResult.rows[0]);
      console.log('');
    } catch (error) {
      console.error('❌ Most Improved Query Failed:');
      console.error('Error:', error.message);
      console.error('Code:', error.code);
      console.error('Detail:', error.detail);
      console.log('');
    }

    // Test 3: At-Risk Query (mimics getAtRiskAthletes - declining performance)
    console.log('Test 3: At-Risk Declining Performance Query');
    console.log('============================================');
    try {
      const decliningResult = await client.query(`
        WITH ranked_measurements AS (
          SELECT
            user_id as athlete_id,
            metric,
            CAST(value AS NUMERIC) as value,
            date,
            ROW_NUMBER() OVER (PARTITION BY user_id, metric ORDER BY date DESC) as row_num
          FROM measurements
          WHERE user_id = ANY($1::text[])
            AND is_verified = true
        ),
        recent_measurements AS (
          SELECT
            athlete_id,
            metric,
            value,
            row_num
          FROM ranked_measurements
          WHERE row_num <= 6
        ),
        averaged_measurements AS (
          SELECT
            athlete_id,
            metric,
            AVG(CASE WHEN row_num <= 3 THEN value END) as current_avg,
            AVG(CASE WHEN row_num BETWEEN 4 AND 6 THEN value END) as previous_avg,
            COUNT(DISTINCT row_num) as total_measurements
          FROM recent_measurements
          GROUP BY athlete_id, metric
          HAVING COUNT(DISTINCT row_num) >= 6
        )
        SELECT
          athlete_id::text as "athleteId",
          metric,
          CASE
            WHEN metric IN ('FLY10_TIME', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD')
              THEN ((current_avg - previous_avg) / NULLIF(previous_avg, 0)) * 100
            ELSE ((previous_avg - current_avg) / NULLIF(previous_avg, 0)) * 100
          END as "declinePercent",
          previous_avg::float as "previousValue",
          current_avg::float as "currentValue"
        FROM averaged_measurements
        WHERE
          previous_avg > 0
          AND (
            CASE
              WHEN metric IN ('FLY10_TIME', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD')
                THEN ((current_avg - previous_avg) / previous_avg) * 100
              ELSE ((previous_avg - current_avg) / previous_avg) * 100
            END
          ) > 5
        LIMIT 5
      `, [athleteIds]);

      console.log(`✓ Query succeeded, found ${decliningResult.rows.length} declining athletes`);
      console.log('Sample result:', decliningResult.rows[0]);
      console.log('');
    } catch (error) {
      console.error('❌ Declining Performance Query Failed:');
      console.error('Error:', error.message);
      console.error('Code:', error.code);
      console.error('Detail:', error.detail);
      console.log('');
    }

    // Test 4: At-Risk Query (inactive athletes) - FIXED VERSION
    console.log('Test 4: At-Risk Inactive Athletes Query (FIXED)');
    console.log('================================================');
    try {
      const inactiveResult = await client.query(`
        WITH athlete_last_measurement AS (
          SELECT
            user_id as athlete_id,
            MAX(date) as last_date,
            (CURRENT_DATE - MAX(date))::int as days_since
          FROM measurements
          WHERE user_id = ANY($1::text[])
            AND is_verified = true
          GROUP BY user_id
        )
        SELECT
          athlete_id::text as "athleteId",
          COALESCE(last_date::text, '') as "lastMeasurementDate",
          COALESCE(days_since, 999) as "daysSinceLastMeasurement"
        FROM athlete_last_measurement
        WHERE COALESCE(days_since, 999) >= $2
        LIMIT 5
      `, [athleteIds, 14]);

      console.log(`✓ Query succeeded, found ${inactiveResult.rows.length} inactive athletes`);
      console.log('Sample result:', inactiveResult.rows[0]);
      console.log('');
    } catch (error) {
      console.error('❌ Inactive Athletes Query Failed:');
      console.error('Error:', error.message);
      console.error('Code:', error.code);
      console.error('Detail:', error.detail);
      console.log('');
    }

    console.log('✓ All tests completed');

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await client.end();
  }
}

testAthleteIdsQuery().catch(console.error);
