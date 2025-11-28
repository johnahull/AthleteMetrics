#!/usr/bin/env tsx
/**
 * Wellness Template Seeder Runner
 *
 * Run this script to seed the 6 pre-built wellness templates to an organization.
 *
 * Usage:
 *   # Seed to testing environment
 *   DATABASE_URL="testing-db-url" tsx scripts/run-wellness-seeder.ts <organization-id>
 *
 *   # Seed to staging/production
 *   DATABASE_URL="production-db-url" tsx scripts/run-wellness-seeder.ts <organization-id>
 */

import { db } from '@shared/db';
import { seedTemplates } from './seed-wellness-templates';
import { organizations } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const organizationId = process.argv[2];

  if (!organizationId) {
    console.error('❌ Error: Organization ID is required');
    console.log('\nUsage:');
    console.log('  tsx scripts/run-wellness-seeder.ts <organization-id>');
    console.log('\nExample:');
    console.log('  tsx scripts/run-wellness-seeder.ts 123e4567-e89b-12d3-a456-426614174000');
    console.log('\nTo find your organization ID:');
    console.log('  psql $DATABASE_URL -c "SELECT id, name FROM organizations;"');
    process.exit(1);
  }

  console.log('🌱 Starting Wellness Template Seeder...\n');
  console.log(`Organization ID: ${organizationId}`);
  console.log(`Database: ${process.env.DATABASE_URL ? '✓ Connected' : '✗ Not configured'}\n`);

  // Verify organization exists
  try {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });

    if (!org) {
      console.error(`❌ Error: Organization with ID "${organizationId}" not found`);
      console.log('\nAvailable organizations:');

      const allOrgs = await db.query.organizations.findMany({
        columns: { id: true, name: true },
      });

      allOrgs.forEach(o => {
        console.log(`  - ${o.name} (ID: ${o.id})`);
      });

      process.exit(1);
    }

    console.log(`✓ Found organization: ${org.name}\n`);

    // Create a simple storage wrapper for the seeder
    const storage = {
      createWellnessTemplate: async (template: any) => {
        const [created] = await db.insert(require('@shared/schema').wellnessTemplates)
          .values({
            ...template,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return created;
      }
    };

    // Run seeder
    console.log('🌱 Seeding templates...\n');
    const seededTemplates = await seedTemplates(organizationId, storage);

    console.log(`\n✅ Successfully seeded ${seededTemplates.length} templates!\n`);
    console.log('Templates seeded:');
    seededTemplates.forEach((t: any, i: number) => {
      console.log(`  ${i + 1}. ${t.name} (${t.category})`);
    });

    console.log('\n✨ Templates are now available in the Wellness Library!');
    console.log('   Navigate to /wellness → Library tab to view them.\n');

  } catch (error) {
    console.error('❌ Error seeding templates:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
