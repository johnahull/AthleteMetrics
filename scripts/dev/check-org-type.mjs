import postgres from 'postgres';

const sql = postgres(process.env.TESTING_DATABASE_URL);

try {
  console.log('Checking organizations...\n');
  
  const orgs = await sql`
    SELECT id, name, org_type, created_at 
    FROM organizations 
    ORDER BY created_at DESC
  `;
  
  console.log('All organizations:');
  orgs.forEach(org => {
    console.log(`  - ${org.name}: org_type="${org.org_type}" (ID: ${org.id})`);
  });
  
  await sql.end();
} catch (error) {
  console.error('Error:', error.message);
  await sql.end();
  process.exit(1);
}
