import { db } from './server/db';
import { users } from './shared/schema';
import { eq } from 'drizzle-orm';

async function checkUsers() {
  try {
    console.log('Checking for users with email aiden.castillo20@inbox.com...\n');

    const allUsers = await db.select().from(users);

    const aidenUsers = allUsers.filter(u =>
      u.emails && u.emails.includes('aiden.castillo20@inbox.com')
    );

    console.log(`Found ${aidenUsers.length} user(s) with that email:\n`);

    aidenUsers.forEach((user, index) => {
      console.log(`User ${index + 1}:`);
      console.log(`  ID: ${user.id}`);
      console.log(`  Username: ${user.username}`);
      console.log(`  Name: ${user.firstName} ${user.lastName}`);
      console.log(`  Emails: ${JSON.stringify(user.emails)}`);
      console.log(`  Password: ${user.password === 'INVITATION_PENDING' ? 'INVITATION_PENDING' : 'SET'}`);
      console.log(`  Created: ${user.createdAt}`);
      console.log('');
    });

    // Check for alexander too
    console.log('\nChecking for users with email alexander.castillo19@mail.com...\n');

    const alexUsers = allUsers.filter(u =>
      u.emails && u.emails.includes('alexander.castillo19@mail.com')
    );

    console.log(`Found ${alexUsers.length} user(s) with that email:\n`);

    alexUsers.forEach((user, index) => {
      console.log(`User ${index + 1}:`);
      console.log(`  ID: ${user.id}`);
      console.log(`  Username: ${user.username}`);
      console.log(`  Name: ${user.firstName} ${user.lastName}`);
      console.log(`  Emails: ${JSON.stringify(user.emails)}`);
      console.log(`  Password: ${user.password === 'INVITATION_PENDING' ? 'INVITATION_PENDING' : 'SET'}`);
      console.log(`  Created: ${user.createdAt}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error checking users:', error);
    process.exit(1);
  }
}

checkUsers();
