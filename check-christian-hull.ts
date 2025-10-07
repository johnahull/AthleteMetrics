import { storage } from "./server/storage";

async function checkChristianHull() {
  try {
    // Get all athletes
    const allAthletes = await storage.getAthletes({});

    // Find Christian Hull
    const christianHulls = allAthletes.filter(a =>
      a.firstName.toLowerCase().includes('christian') &&
      a.lastName.toLowerCase().includes('hull')
    );

    console.log('Found Christian Hull entries:', christianHulls.length);

    for (const athlete of christianHulls) {
      console.log('\n=== Athlete Details ===');
      console.log('ID:', athlete.id);
      console.log('Name:', athlete.firstName, athlete.lastName);
      console.log('Emails:', athlete.emails);
      console.log('Birth Date:', athlete.birthDate);
      console.log('Teams:', athlete.teams?.map(t => ({
        id: t.id,
        name: t.name,
        orgId: t.organization?.id,
        orgName: t.organization?.name
      })));
    }

    // Get Big Time Athletes org
    const orgs = await storage.getOrganizations();
    const btaOrg = orgs.find(o => o.name.toLowerCase().includes('big time'));

    if (btaOrg) {
      console.log('\n=== Big Time Athletes Org ===');
      console.log('ID:', btaOrg.id);
      console.log('Name:', btaOrg.name);

      // Get athletes filtered by this org
      const btaAthletes = await storage.getAthletes({ organizationId: btaOrg.id });
      console.log('\nTotal athletes in BTA org:', btaAthletes.length);

      const btaChristian = btaAthletes.filter(a =>
        a.firstName.toLowerCase().includes('christian') &&
        a.lastName.toLowerCase().includes('hull')
      );
      console.log('Christian Hull entries in BTA org:', btaChristian.length);
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

checkChristianHull();
