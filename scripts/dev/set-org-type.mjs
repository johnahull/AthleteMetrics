#!/usr/bin/env node
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || process.env.TESTING_DATABASE_URL;
const ORG_ID = process.argv[2];
const ORG_TYPE = process.argv[3] || 'private_facility';

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL or TESTING_DATABASE_URL must be set');
  process.exit(1);
}

if (!ORG_ID) {
  console.error('Usage: node scripts/set-org-type.mjs <organization-id> [org-type]');
  console.error('');
  console.error('Valid org types: youth, high_school, college, club, private_facility, elite_academy');
  console.error('');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

try {
  // Check if org exists
  const [org] = await sql`
    SELECT id, name, org_type 
    FROM organizations 
    WHERE id = ${ORG_ID}
  `;
  
  if (!org) {
    console.error(`❌ Organization with ID ${ORG_ID} not found`);
    process.exit(1);
  }
  
  console.log(`📋 Current organization:`);
  console.log(`   Name: ${org.name}`);
  console.log(`   Current type: ${org.org_type}`);
  console.log(`   New type: ${ORG_TYPE}\n`);
  
  // Update org type
  await sql`
    UPDATE organizations 
    SET org_type = ${ORG_TYPE}
    WHERE id = ${ORG_ID}
  `;
  
  console.log(`✅ Successfully updated "${org.name}" to org_type="${ORG_TYPE}"`);
  
  await sql.end();
} catch (error) {
  console.error('❌ Error:', error.message);
  await sql.end();
  process.exit(1);
}
