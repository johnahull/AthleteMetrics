import { db } from './server/db';
import { users } from './shared/schema';

async function checkJosephUsers() {
  const allUsers = await db.select().from(users);

  const josephUsers = allUsers.filter(u =>
    u.firstName === 'Joseph' && u.lastName === 'Castillo'
  );

  console.log(`Found ${josephUsers.length} Joseph Castillo users:\n`);

  josephUsers.forEach((user, i) => {
    console.log(`User ${i + 1}:`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Username: ${user.username}`);
    console.log(`  Emails: ${JSON.stringify(user.emails)}`);
    console.log(`  Password: ${user.password === 'INVITATION_PENDING' ? 'INVITATION_PENDING' : 'SET'}`);
    console.log(`  isActive: ${user.isActive}`);
    console.log(`  Created: ${user.createdAt}`);
    console.log('');
  });

  process.exit(0);
}

checkJosephUsers();
