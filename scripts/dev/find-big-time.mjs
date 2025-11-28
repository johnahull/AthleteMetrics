import postgres from 'postgres';

const DATABASE_URL = process.env.TESTING_DATABASE_URL;
const sql = postgres(DATABASE_URL);

try {
  const orgs = await sql`
    SELECT id, name, org_type 
    FROM organizations 
    WHERE name ILIKE '%big%time%' OR name ILIKE '%athlete%'
    ORDER BY created_at DESC
  `;
  
  console.log(`Found ${orgs.length} matching organization(s):\n`);
  orgs.forEach(org => {
    console.log(`Name: ${org.name}`);
    console.log(`ID: ${org.id}`);
    console.log(`Type: ${org.org_type}\n`);
  });
  
  await sql.end();
} catch (error) {
  console.error('Error:', error.message);
  await sql.end();
  process.exit(1);
}
