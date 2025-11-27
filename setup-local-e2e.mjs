import postgres from 'postgres';
import bcrypt from 'bcrypt';

const sql = postgres(process.env.DATABASE_URL);

try {
  // Create test organization
  console.log('Creating test organization...');
  const [org] = await sql`
    INSERT INTO organizations (name, description, is_active)
    VALUES ('Local E2E Test Org', 'Organization for local E2E testing', true)
    ON CONFLICT DO NOTHING
    RETURNING id, name
  `;
  
  let orgId;
  if (org) {
    console.log(`✅ Created organization: ${org.name} (${org.id})`);
    orgId = org.id;
  } else {
    const [existingOrg] = await sql`
      SELECT id, name FROM organizations WHERE name = 'Local E2E Test Org'
    `;
    console.log(`✅ Organization already exists: ${existingOrg.name} (${existingOrg.id})`);
    orgId = existingOrg.id;
  }
  
  // Create test user
  console.log('\nCreating test user...');
  const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
  
  const [user] = await sql`
    INSERT INTO users (username, password, first_name, last_name, full_name, emails, is_site_admin, is_active)
    VALUES ('testuser', ${hashedPassword}, 'Test', 'User', 'Test User', ARRAY['test@example.com'], false, true)
    ON CONFLICT (username) DO UPDATE
    SET password = ${hashedPassword}, is_active = true
    RETURNING id, username
  `;
  
  console.log(`✅ User ready: ${user.username} (${user.id})`);
  
  // Assign user to organization (check if exists first)
  console.log('\nAssigning user to organization...');
  const existing = await sql`
    SELECT * FROM user_organizations WHERE user_id = ${user.id} AND organization_id = ${orgId}
  `;
  
  if (existing.length === 0) {
    await sql`
      INSERT INTO user_organizations (user_id, organization_id, role)
      VALUES (${user.id}, ${orgId}, 'org_admin')
    `;
    console.log('✅ User assigned to organization as org_admin');
  } else {
    console.log('✅ User already assigned to organization');
  }
  
  console.log('\n✅ Local E2E setup complete!');
  console.log(`\nTest with these credentials:`);
  console.log(`  Username: testuser`);
  console.log(`  Password: TestPassword123!`);
  console.log(`  Organization ID: ${orgId}`);
  
  // Write config file
  const config = {
    organizationId: orgId,
    organizationName: 'Local E2E Test Org',
    timestamp: new Date().toISOString()
  };
  
  const fs = await import('fs');
  fs.writeFileSync('tests/e2e/.local-e2e-config.json', JSON.stringify(config, null, 2));
  console.log(`\n✅ Config written to tests/e2e/.local-e2e-config.json`);
  
} catch (err) {
  console.error('❌ Error:', err);
} finally {
  await sql.end();
}
