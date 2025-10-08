/**
 * Script to find teams with name "FIERCE G08" in the database
 */

import { db } from '../server/db';
import { teams } from '../shared/schema';
import { like, eq } from 'drizzle-orm';

async function findTeams() {
  console.log('Searching for teams with name "FIERCE G08"...\n');

  // Search for exact match
  const exactMatch = await db.select().from(teams).where(eq(teams.name, 'FIERCE G08'));
  console.log('=== Exact matches for "FIERCE G08" ===');
  console.log(JSON.stringify(exactMatch, null, 2));
  console.log(`Found ${exactMatch.length} exact match(es)\n`);

  // Search for case-insensitive variations
  const caseInsensitive = await db.select().from(teams).where(like(teams.name, '%FIERCE G08%'));
  console.log('=== Case-insensitive matches (LIKE %FIERCE G08%) ===');
  console.log(JSON.stringify(caseInsensitive, null, 2));
  console.log(`Found ${caseInsensitive.length} case-insensitive match(es)\n`);

  // Get all teams to manually inspect
  const allTeams = await db.select().from(teams);
  const fierceg08Teams = allTeams.filter(t =>
    t.name.toLowerCase().includes('fierce') && t.name.toLowerCase().includes('g08')
  );
  console.log('=== All teams containing "fierce" and "g08" ===');
  fierceg08Teams.forEach(team => {
    console.log(`ID: ${team.id}`);
    console.log(`Name: "${team.name}"`);
    console.log(`Name Length: ${team.name.length}`);
    console.log(`Organization: ${team.organizationId}`);
    console.log(`Archived: ${team.isArchived}`);
    console.log(`Created: ${team.createdAt}`);
    console.log('---');
  });
  console.log(`Found ${fierceg08Teams.length} team(s) with "fierce" and "g08"\n`);

  process.exit(0);
}

findTeams().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
