import { db } from './server/db';
import { invitations } from './shared/schema';
import { eq } from 'drizzle-orm';

async function checkInvitations() {
  try {
    console.log('Fetching all invitations...');

    const allInvitations = await db.select().from(invitations);

    console.log(`\nFound ${allInvitations.length} invitations:\n`);

    allInvitations.forEach((inv, index) => {
      console.log(`Invitation ${index + 1}:`);
      console.log(`  ID: ${inv.id}`);
      console.log(`  Email: ${inv.email}`);
      console.log(`  Role: ${inv.role}`);
      console.log(`  Player ID (existing athlete): ${inv.playerId || 'NOT SET ❌'}`);
      console.log(`  Organization: ${inv.organizationId}`);
      console.log(`  Is Used: ${inv.isUsed}`);
      console.log(`  Status: ${inv.status || 'N/A'}`);
      console.log(`  Created: ${inv.createdAt}`);
      console.log('');
    });

    // Check specifically for athlete invitations
    const athleteInvitations = allInvitations.filter(inv => inv.role === 'athlete');
    console.log(`\n=== ATHLETE INVITATIONS (${athleteInvitations.length}) ===`);

    athleteInvitations.forEach(inv => {
      console.log(`Email: ${inv.email}`);
      console.log(`  Has playerId: ${inv.playerId ? '✅ YES' : '❌ NO - This is the problem!'}`);
      console.log(`  PlayerId value: ${inv.playerId || 'null'}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error checking invitations:', error);
    process.exit(1);
  }
}

checkInvitations();
