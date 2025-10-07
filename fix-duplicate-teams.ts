import { db } from './server/db';
import { teams } from './shared/schema';
import { eq, and } from 'drizzle-orm';

async function fixDuplicateTeams() {
  try {
    console.log('Finding duplicate team: FIERCE G08...');

    const duplicateTeams = await db.select()
      .from(teams)
      .where(and(
        eq(teams.organizationId, 'c0a14980-c605-4776-81f3-a328bb610865'),
        eq(teams.name, 'FIERCE G08')
      ));

    console.log(`Found ${duplicateTeams.length} teams with name "FIERCE G08"`);

    if (duplicateTeams.length > 1) {
      // Rename all but the first one
      for (let i = 1; i < duplicateTeams.length; i++) {
        const team = duplicateTeams[i];
        const newName = `${team.name} (${i})`;
        console.log(`Renaming team ${team.id} from "${team.name}" to "${newName}"`);

        await db.update(teams)
          .set({ name: newName })
          .where(eq(teams.id, team.id));
      }

      console.log('✓ Fixed duplicate team names');
    } else {
      console.log('No duplicates found');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error fixing duplicates:', error);
    process.exit(1);
  }
}

fixDuplicateTeams();
