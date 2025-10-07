import { storage } from "./server/storage";

async function fixChristianActiveStatus() {
  try {
    const allAthletes = await storage.getAthletes({});

    const christianHulls = allAthletes.filter(a =>
      a.firstName.toLowerCase().includes('christian') &&
      a.lastName.toLowerCase().includes('hull')
    );

    console.log('Found Christian Hull entries:', christianHulls.length);

    for (const athlete of christianHulls) {
      console.log('\n=== Processing Athlete ===');
      console.log('ID:', athlete.id);
      console.log('Name:', athlete.firstName, athlete.lastName);
      console.log('Current isActive:', athlete.isActive);
      console.log('Password:', (athlete as any).password);

      // Only update if they have INVITATION_PENDING password (not registered yet)
      if ((athlete as any).password === 'INVITATION_PENDING' && athlete.isActive) {
        console.log('\nUpdating to isActive: false...');
        await storage.updateUser(athlete.id, { isActive: false });
        console.log('✅ Updated successfully');

        // Verify the change
        const updated = await storage.getAthlete(athlete.id);
        console.log('Verified isActive:', updated?.isActive);
      } else if ((athlete as any).password === 'INVITATION_PENDING') {
        console.log('Already has correct isActive status');
      } else {
        console.log('Athlete has registered (password is not INVITATION_PENDING), skipping');
      }
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

fixChristianActiveStatus();
