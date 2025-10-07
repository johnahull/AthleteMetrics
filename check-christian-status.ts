import { storage } from "./server/storage";

async function checkChristianStatus() {
  try {
    const allAthletes = await storage.getAthletes({});

    const christianHulls = allAthletes.filter(a =>
      a.firstName.toLowerCase().includes('christian') &&
      a.lastName.toLowerCase().includes('hull')
    );

    console.log('Found Christian Hull entries:', christianHulls.length);

    for (const athlete of christianHulls) {
      console.log('\n=== Athlete Details ===');
      console.log('ID:', athlete.id);
      console.log('Name:', athlete.firstName, athlete.lastName);
      console.log('Username:', (athlete as any).username);
      console.log('Password:', (athlete as any).password);
      console.log('isActive:', athlete.isActive);
      console.log('Emails:', athlete.emails);

      // Check for invitations
      const allUsers = await storage.getUsers();
      const user = allUsers.find(u => u.id === athlete.id);
      console.log('Full user record:', {
        username: user?.username,
        password: user?.password,
        isActive: user?.isActive,
      });

      // Check team assignments
      const teams = await storage.getUserTeams(athlete.id);
      console.log('\nTeam assignments:', teams.length);
      for (const teamAssignment of teams) {
        console.log('  - Team:', teamAssignment.team.name, 'ID:', teamAssignment.team.id);
        console.log('    Active:', teamAssignment.isActive);
      }

      // Check organization assignments
      const orgs = await storage.getUserOrganizations(athlete.id);
      console.log('\nOrganization assignments:', orgs.length);
      for (const orgAssignment of orgs) {
        console.log('  - Org:', orgAssignment.organization.name, 'ID:', orgAssignment.organizationId);
        console.log('    Role:', orgAssignment.role);
      }
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

checkChristianStatus();
