import { storage } from "./server/storage";

async function checkFamilyTeam() {
  try {
    // Get all teams
    const orgs = await storage.getOrganizations();
    const btaOrg = orgs.find(o => o.name === 'Big Time Athletes');

    if (!btaOrg) {
      console.error('Big Time Athletes org not found');
      return;
    }

    const teams = await storage.getTeams(btaOrg.id);
    console.log('All teams in Big Time Athletes:');
    for (const team of teams) {
      console.log('  - Name:', team.name);
      console.log('    ID:', team.id);
      console.log('    Level:', team.level);
      console.log('    Archived:', team.isArchived);
      console.log();
    }

    const familyTeam = teams.find(t => t.name.toLowerCase().includes('family'));
    if (familyTeam) {
      console.log('\nFamily team found:');
      console.log('ID:', familyTeam.id);
      console.log('Name:', familyTeam.name);

      // Try to manually add Christian to the Family team
      const allAthletes = await storage.getAthletes({});
      const christian = allAthletes.find(a =>
        a.firstName.toLowerCase() === 'christian' &&
        a.lastName.toLowerCase() === 'hull'
      );

      if (christian) {
        console.log('\nAdding Christian Hull to Family team...');
        await storage.addUserToTeam(christian.id, familyTeam.id);
        console.log('✅ Added successfully');

        // Verify
        const teams = await storage.getUserTeams(christian.id);
        console.log('\nChristian Hull team assignments:', teams.length);
        for (const t of teams) {
          console.log('  - Team:', t.team.name);
        }
      }
    } else {
      console.log('\nNo Family team found');
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

checkFamilyTeam();
