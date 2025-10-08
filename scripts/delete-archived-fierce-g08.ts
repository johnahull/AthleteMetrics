/**
 * Delete the archived FIERCE G08 team
 */

import { db } from '../server/db';
import { teams } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function deleteArchivedTeam() {
  const teamId = 'f2e120af-393a-4238-b3b3-2256610908ab';

  console.log(`Deleting archived team: ${teamId}`);
  console.log('Team name: FIERCE G08');
  console.log('Organization: c0a14980-c605-4776-81f3-a328bb610865\n');

  // Delete the team
  await db.delete(teams).where(eq(teams.id, teamId));

  console.log('✓ Archived team deleted successfully\n');

  // Verify deletion
  const check = await db.select().from(teams).where(eq(teams.id, teamId));
  if (check.length === 0) {
    console.log('✓ Verified: Team no longer exists in database');
  } else {
    console.log('✗ Error: Team still exists!');
  }

  // Show remaining FIERCE G08 teams
  const remaining = await db.select().from(teams).where(eq(teams.name, 'FIERCE G08'));
  console.log(`\nRemaining teams with name "FIERCE G08": ${remaining.length}`);

  process.exit(0);
}

deleteArchivedTeam().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
