import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users } from './shared/schema.js';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

(async () => {
  const allUsers = await db.select().from(users);
  console.log('Total users:', allUsers.length);
  console.log('\nUser details:');
  allUsers.forEach(u => {
    console.log(`\nUsername: ${u.username}`);
    console.log(`  ID: ${u.id}`);
    console.log(`  isActive: ${u.isActive} (type: ${typeof u.isActive})`);
    console.log(`  isSiteAdmin: ${u.isSiteAdmin} (type: ${typeof u.isSiteAdmin})`);
    console.log(`  Full Name: ${u.fullName}`);
  });
  await client.end();
})();
