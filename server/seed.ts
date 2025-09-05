import { db } from "./db";
import { teams, users, measurements, organizations } from "@shared/schema";

async function seed() {
  try {
    console.log("🌱 Seeding database...");

    // Clear existing data
    await db.delete(measurements);
    await db.delete(users);
    await db.delete(teams);
    await db.delete(organizations);

    // Create organizations first
    console.log("Creating organizations...");
    const [organization] = await db.insert(organizations).values({
      name: "Athletic Performance Center",
      description: "Premier athletic training facility",
      location: "Dallas, TX"
    }).returning();

    // Create teams
    console.log("Creating teams...");
    const teamData = [
      { name: "Lonestar 09G Navy", level: "Club", notes: "Competitive club team focused on technical development", organizationId: organization.id },
      { name: "Thunder Elite", level: "HS", notes: "High school varsity program with college prep focus", organizationId: organization.id },
      { name: "Lightning 08G", level: "Club", notes: "Elite development program for younger athletes", organizationId: organization.id },
    ];

    const createdTeams = await db.insert(teams).values(teamData).returning();
    console.log(`✅ Created ${createdTeams.length} teams`);

    // Create players
    console.log("Creating players...");
    const playerData = [
      // Lonestar 09G Navy (2009 birth year)
      { firstName: "Emma", lastName: "Rodriguez", birthYear: 2009, school: "Westlake HS", teamId: createdTeams[0].id },
      { firstName: "Sophia", lastName: "Chen", birthYear: 2009, school: "Lake Travis HS", teamId: createdTeams[0].id },
      { firstName: "Isabella", lastName: "Martinez", birthYear: 2009, school: "Anderson HS", teamId: createdTeams[0].id },
      { firstName: "Ava", lastName: "Johnson", birthYear: 2009, school: "Westlake HS", teamId: createdTeams[0].id },
      
      // Thunder Elite (2008 birth year)
      { firstName: "Marcus", lastName: "Thompson", birthYear: 2008, school: "Anderson HS", teamId: createdTeams[1].id },
      { firstName: "Jackson", lastName: "Williams", birthYear: 2008, school: "Lake Travis HS", teamId: createdTeams[1].id },
      { firstName: "Aiden", lastName: "Brown", birthYear: 2008, school: "Westwood HS", teamId: createdTeams[1].id },
      { firstName: "Liam", lastName: "Davis", birthYear: 2008, school: "Anderson HS", teamId: createdTeams[1].id },
      
      // Lightning 08G (2008 birth year)
      { firstName: "Sofia", lastName: "Adams", birthYear: 2008, school: "Lake Travis HS", teamId: createdTeams[2].id },
      { firstName: "Olivia", lastName: "Wilson", birthYear: 2008, school: "Westlake HS", teamId: createdTeams[2].id },
      { firstName: "Maya", lastName: "Garcia", birthYear: 2008, school: "Anderson HS", teamId: createdTeams[2].id },
      { firstName: "Zoe", lastName: "Miller", birthYear: 2008, school: "Westwood HS", teamId: createdTeams[2].id },
    ];

    // Add fullName to each player
    const playersWithFullNames = playerData.map(player => ({
      ...player,
      fullName: `${player.firstName} ${player.lastName}`
    }));

    const createdPlayers = await db.insert(players).values(playersWithFullNames).returning();
    console.log(`✅ Created ${createdPlayers.length} players`);

    // Create measurements
    console.log("Creating measurements...");
    const measurementData = [];
    const today = new Date();
    
    for (const player of createdPlayers) {
      // Generate 3-5 measurements per player over the last 30 days
      const numMeasurements = Math.floor(Math.random() * 3) + 3; // 3-5 measurements
      
      for (let i = 0; i < numMeasurements; i++) {
        const daysAgo = Math.floor(Math.random() * 30); // Random day in last 30 days
        const measurementDate = new Date(today);
        measurementDate.setDate(today.getDate() - daysAgo);
        
        // Add both Fly-10 and Vertical measurements for some variety
        if (Math.random() > 0.3) { // 70% chance of Fly-10 measurement
          const baseFly10 = 1.0 + Math.random() * 0.8; // Base time between 1.0-1.8 seconds
          const variation = (Math.random() - 0.5) * 0.1; // +/- 0.05 variation
          const fly10Time = Math.max(0.9, baseFly10 + variation);
          
          measurementData.push({
            userId: player.id,
            submittedBy: player.id, // Self-submitted for seed data
            date: measurementDate.toISOString().split('T')[0],
            metric: "FLY10_TIME",
            value: fly10Time.toFixed(3),
            units: "s",
            age: new Date().getFullYear() - (player.birthYear || 2000),
            notes: Math.random() > 0.7 ? (Math.random() > 0.5 ? "Electronic gates" : "Manual timing") : "",
          });
        }
        
        if (Math.random() > 0.4) { // 60% chance of Vertical measurement  
          const baseVertical = 18 + Math.random() * 15; // Base jump between 18-33 inches
          const variation = (Math.random() - 0.5) * 2; // +/- 1 inch variation
          const verticalJump = Math.max(15, baseVertical + variation);
          
          measurementData.push({
            userId: player.id,
            submittedBy: player.id, // Self-submitted for seed data
            date: measurementDate.toISOString().split('T')[0],
            metric: "VERTICAL_JUMP", 
            value: verticalJump.toFixed(1),
            units: "in",
            age: new Date().getFullYear() - (player.birthYear || 2000),
            notes: Math.random() > 0.7 ? (Math.random() > 0.5 ? "Jump mat" : "Wall test") : "",
          });
        }
      }
    }

    const createdMeasurements = await db.insert(measurements).values(measurementData).returning();
    console.log(`✅ Created ${createdMeasurements.length} measurements`);

    console.log("🎉 Database seeded successfully!");
    console.log("\n📊 Summary:");
    console.log(`- ${createdTeams.length} teams`);
    console.log(`- ${createdPlayers.length} players`);
    console.log(`- ${createdMeasurements.length} measurements`);
    console.log("\n🔐 Admin Login:");
    console.log(`Username: ${process.env.ADMIN_USER || "admin"}`);
    console.log(`Password: ${process.env.ADMIN_PASS || "password"}`);

  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}

export { seed };
