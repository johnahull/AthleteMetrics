import { storage } from "./server/storage";

async function fixChristianHull() {
  try {
    const allUsers = await storage.getUsers();

    // Find all Christian Hull entries
    const christianHulls = allUsers.filter(u =>
      u.firstName === 'Christian' && u.lastName === 'Hull'
    );

    console.log('Found Christian Hull entries:', christianHulls.length);

    // Find Big Time Athletes org
    const orgs = await storage.getOrganizations();
    const btaOrg = orgs.find(o => o.name === 'Big Time Athletes');

    if (!btaOrg) {
      console.error('Big Time Athletes org not found');
      return;
    }

    console.log('Big Time Athletes org ID:', btaOrg.id);

    // Keep the first active one, delete the rest
    let kept: any = null;

    for (const user of christianHulls) {
      if (!kept && user.isActive) {
        kept = user;
        console.log('\nKeeping athlete:', user.id);

        // Assign to organization
        try {
          await storage.addUserToOrganization(user.id, btaOrg.id, "athlete");
          console.log('✅ Assigned to Big Time Athletes organization');
        } catch (error) {
          console.error('Failed to assign to org:', error);
        }

        // Check if there are any teams in the org to assign to
        const btaTeams = await storage.getTeams(btaOrg.id);
        if (btaTeams.length > 0) {
          console.log('Available teams:', btaTeams.map(t => t.name));
        } else {
          console.log('No teams available in Big Time Athletes org');
        }
      } else {
        console.log('\nDeleting duplicate/inactive athlete:', user.id);
        try {
          await storage.deleteAthlete(user.id);
          console.log('✅ Deleted');
        } catch (error) {
          console.error('Failed to delete:', error);
        }
      }
    }

    if (kept) {
      console.log('\n✅ Final result: Christian Hull is now properly assigned');
      console.log('Athlete ID:', kept.id);
      console.log('Email:', kept.emails[0]);
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

fixChristianHull();
