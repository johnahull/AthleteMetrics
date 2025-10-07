import { db } from './server/db';
import { invitations } from './shared/schema';
import { eq } from 'drizzle-orm';

async function checkJosephInvitation() {
  try {
    const allInvitations = await db.select().from(invitations);

    const josephInvitations = allInvitations.filter(inv =>
      inv.email === 'joseph.castillo31@inbox.com'
    );

    console.log(`Found ${josephInvitations.length} invitations for joseph.castillo31@inbox.com\n`);

    josephInvitations.forEach((inv, index) => {
      console.log(`Invitation ${index + 1}:`);
      console.log(`  ID: ${inv.id}`);
      console.log(`  Token: ${inv.token.substring(0, 20)}...`);
      console.log(`  Player ID: ${inv.playerId || 'NULL'}`);
      console.log(`  Is Used: ${inv.isUsed}`);
      console.log(`  Status: ${inv.status}`);
      console.log(`  Created: ${inv.createdAt}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkJosephInvitation();
