import { storage } from "./server/storage";

async function checkAllUsers() {
  try {
    const allUsers = await storage.getUsers();

    console.log('Total users in database:', allUsers.length);

    // Find Christian Hull
    const christianUsers = allUsers.filter(u =>
      (u.firstName?.toLowerCase() || '').includes('christian') ||
      (u.lastName?.toLowerCase() || '').includes('hull') ||
      (u.username?.toLowerCase() || '').includes('christian') ||
      (u.username?.toLowerCase() || '').includes('hull')
    );

    console.log('\nUsers with "Christian" or "Hull":', christianUsers.length);

    for (const user of christianUsers) {
      console.log('\n---');
      console.log('ID:', user.id);
      console.log('Username:', user.username);
      console.log('Name:', user.firstName, user.lastName);
      console.log('Emails:', user.emails);
      console.log('Role:', (user as any).role);
      console.log('IsActive:', user.isActive);
      console.log('IsSiteAdmin:', user.isSiteAdmin);

      // Check organizations
      const userOrgs = await storage.getUserOrganizations(user.id);
      console.log('Organizations:', userOrgs.map(uo => ({
        orgId: uo.organizationId,
        orgName: uo.organization.name,
        role: uo.role
      })));

      // Check teams
      const userTeams = await storage.getUserTeams(user.id);
      console.log('Teams:', userTeams.map(ut => ({
        teamId: ut.team.id,
        teamName: ut.team.name,
        isActive: ut.isActive
      })));
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

checkAllUsers();
