#!/usr/bin/env node
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || process.env.TESTING_DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL or TESTING_DATABASE_URL must be set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

try {
  console.log('🔍 Checking organizations...\n');
  
  const orgs = await sql`
    SELECT id, name, org_type 
    FROM organizations 
    ORDER BY created_at DESC
  `;
  
  console.log(`Found ${orgs.length} organization(s):\n`);
  orgs.forEach((org, i) => {
    console.log(`${i + 1}. ${org.name}`);
    console.log(`   ID: ${org.id}`);
    console.log(`   Type: ${org.org_type || '(not set)'}\n`);
  });
  
  // Find training facility organizations
  const trainingFacilities = orgs.filter(org => 
    org.name.toLowerCase().includes('training') || 
    org.name.toLowerCase().includes('facility') ||
    org.name.toLowerCase().includes('gym')
  );
  
  if (trainingFacilities.length > 0) {
    console.log('\n📝 Found potential training facilities:\n');
    
    for (const org of trainingFacilities) {
      if (org.org_type !== 'private_facility') {
        console.log(`Updating "${org.name}" to org_type="private_facility"...`);
        
        await sql`
          UPDATE organizations 
          SET org_type = 'private_facility'
          WHERE id = ${org.id}
        `;
        
        console.log(`✅ Updated successfully!\n`);
      } else {
        console.log(`"${org.name}" already has org_type="private_facility"\n`);
      }
    }
  } else {
    console.log('\n⚠️  No training facilities found automatically.');
    console.log('Please specify which organization should be updated.\n');
  }
  
  await sql.end();
  console.log('✅ Done!');
} catch (error) {
  console.error('❌ Error:', error.message);
  await sql.end();
  process.exit(1);
}
