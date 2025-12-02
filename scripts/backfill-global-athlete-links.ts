/**
 * Backfill global athlete links for existing athletes
 *
 * This script processes all existing athletes with real email addresses
 * and creates global athlete identities, linking athletes who share emails.
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/backfill-global-athlete-links.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users, userOrganizations, globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog, measurements } from '../packages/shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

interface BackfillStats {
  processed: number;
  linked: number;
  created: number;
  skipped: number;
  errors: string[];
}

function isPlaceholderEmail(email: string): boolean {
  return !email ||
    email.endsWith('@temp.local') ||
    email.endsWith('@ocr-import.local') ||
    email.includes('@placeholder.');
}

async function backfillAthleteLinks(): Promise<BackfillStats> {
  const stats: BackfillStats = {
    processed: 0,
    linked: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };

  console.log('🔍 Fetching all athletes...');

  // Get all athletes (users who have role='athlete' in any organization)
  // Use a subquery to find distinct user IDs with athlete role
  const athleteUserIds = db
    .selectDistinct({ userId: userOrganizations.userId })
    .from(userOrganizations)
    .where(eq(userOrganizations.role, 'athlete'));

  const athletes = await db.select({
    id: users.id,
    emails: users.emails,
    firstName: users.firstName,
    lastName: users.lastName,
    fullName: users.fullName,
    birthDate: users.birthDate,
  })
    .from(users)
    .where(inArray(users.id, athleteUserIds));

  console.log(`📊 Found ${athletes.length} athletes to process`);

  // Get existing links to skip already-linked athletes
  const existingLinks = await db.select({
    userId: userGlobalAthleteLinks.userId,
  }).from(userGlobalAthleteLinks);

  const linkedUserIds = new Set(existingLinks.map(l => l.userId));
  console.log(`ℹ️  ${linkedUserIds.size} athletes already have global athlete links`);

  // Group athletes by email for efficient processing
  const emailToAthletes = new Map<string, typeof athletes>();

  for (const athlete of athletes) {
    stats.processed++;

    // Skip already linked
    if (linkedUserIds.has(athlete.id)) {
      stats.skipped++;
      continue;
    }

    // Get primary email
    const email = athlete.emails?.[0];
    if (!email || isPlaceholderEmail(email)) {
      stats.skipped++;
      continue;
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!emailToAthletes.has(normalizedEmail)) {
      emailToAthletes.set(normalizedEmail, []);
    }
    emailToAthletes.get(normalizedEmail)!.push(athlete);
  }

  console.log(`📧 Found ${emailToAthletes.size} unique email addresses`);

  // Process each email group
  for (const [email, athletesWithEmail] of emailToAthletes) {
    try {
      // Check if a global athlete already exists for this email
      const [existingGlobalAthlete] = await db.select()
        .from(globalAthletes)
        .where(eq(globalAthletes.primaryEmail, email));

      let globalAthleteId: string;

      if (existingGlobalAthlete) {
        // Use existing global athlete
        globalAthleteId = existingGlobalAthlete.id;
        console.log(`  ✓ Found existing global athlete for ${email}`);
      } else {
        // Create new global athlete using first athlete's info
        const firstAthlete = athletesWithEmail[0];
        const [newGlobalAthlete] = await db.insert(globalAthletes).values({
          verifiedEmails: [email],
          primaryEmail: email,
          canonicalFirstName: firstAthlete.firstName,
          canonicalLastName: firstAthlete.lastName,
          canonicalFullName: firstAthlete.fullName || `${firstAthlete.firstName} ${firstAthlete.lastName}`,
          birthDate: firstAthlete.birthDate,
          allowCrossOrgLinking: true,
          createdBy: firstAthlete.id,
        }).returning();

        globalAthleteId = newGlobalAthlete.id;

        // Audit log
        await db.insert(globalAthleteAuditLog).values({
          globalAthleteId,
          action: 'created',
          actorId: firstAthlete.id,
          actorType: 'system',
          details: { email, source: 'backfill', linkType: 'auto_import' },
        });

        console.log(`  + Created new global athlete for ${email}`);
        stats.created++;
      }

      // Link all athletes to this global athlete
      for (const athlete of athletesWithEmail) {
        // Use INSERT ... ON CONFLICT to handle race conditions safely
        // The unique index on (user_id, global_athlete_id) will prevent duplicates
        try {
          await db.insert(userGlobalAthleteLinks).values({
            userId: athlete.id,
            globalAthleteId,
            linkStatus: 'confirmed',
            linkType: 'auto_import',
            proposedBy: athlete.id,
            confirmedBy: athlete.id,
            confirmedAt: new Date(),
            shareMeasurements: true,
          }).onConflictDoNothing(); // Silently skip if link already exists
        } catch (error) {
          // If constraint violation despite onConflict, log and continue
          console.warn(`  ⚠️  Failed to link athlete ${athlete.id}:`, error);
          continue;
        }

        // Audit log
        await db.insert(globalAthleteAuditLog).values({
          globalAthleteId,
          action: 'link_confirmed',
          actorId: athlete.id,
          actorType: 'system',
          details: {
            email,
            linkType: 'auto_import',
            source: 'backfill',
            userId: athlete.id,
          },
        });

        // Backfill measurements with global athlete ID
        await db.update(measurements)
          .set({ globalAthleteId })
          .where(eq(measurements.userId, athlete.id));

        stats.linked++;
        console.log(`    → Linked athlete ${athlete.firstName} ${athlete.lastName} (${athlete.id})`);
      }
    } catch (error) {
      const errorMsg = `Failed to process email ${email}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`  ❌ ${errorMsg}`);
      stats.errors.push(errorMsg);
    }
  }

  return stats;
}

async function main() {
  console.log('🚀 Starting global athlete link backfill...\n');

  try {
    const stats = await backfillAthleteLinks();

    console.log('\n📊 Backfill Summary:');
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Created:   ${stats.created} new global athletes`);
    console.log(`   Linked:    ${stats.linked} athlete links created`);
    console.log(`   Skipped:   ${stats.skipped} (already linked or no real email)`);
    console.log(`   Errors:    ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      stats.errors.forEach(e => console.log(`   - ${e}`));
    }

    console.log('\n✅ Backfill complete!');
    process.exit(stats.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Fatal error during backfill:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
