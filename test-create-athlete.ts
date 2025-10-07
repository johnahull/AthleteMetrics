import { storage } from "./server/storage";

async function testCreateAthlete() {
  try {
    // Create a test athlete
    const athlete = await storage.createAthlete({
      firstName: "Test",
      lastName: "Inactive",
      emails: ["testinactive@example.com"],
      birthDate: "2005-01-01",
    });

    console.log('Created athlete:');
    console.log('ID:', athlete.id);
    console.log('Name:', athlete.firstName, athlete.lastName);
    console.log('isActive:', athlete.isActive);
    console.log('Password:', athlete.password);
    console.log('Username:', athlete.username);

    // Verify by fetching it back
    const fetched = await storage.getAthlete(athlete.id);
    console.log('\nFetched athlete:');
    console.log('isActive:', fetched?.isActive);

    // Cleanup
    await storage.deleteAthlete(athlete.id);
    console.log('\nCleaned up test athlete');

  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

testCreateAthlete();
