#!/usr/bin/env tsx
/**
 * Global Wellness Template Seeder
 *
 * Seeds the 6 pre-built wellness templates as GLOBAL system templates
 * (with organization_id = NULL)
 *
 * Usage:
 *   DATABASE_URL="..." tsx scripts/seed-global-wellness-templates.ts
 */

import { db } from '@shared/db';
import { wellnessTemplates } from '@shared/schema';
import { getSystemTemplates } from './seed-wellness-templates';

async function main() {
  console.log('🌱 Starting Global Wellness Template Seeder...\n');
  console.log(`Database: ${process.env.DATABASE_URL ? '✓ Connected' : '✗ Not configured'}\n`);

  const templates = getSystemTemplates();
  const seededTemplates = [];

  console.log(`Creating ${templates.length} global system templates...\n`);

  for (const template of templates) {
    try {
      const [seeded] = await db.insert(wellnessTemplates)
        .values({
          name: template.name,
          description: template.description,
          organizationId: null, // ← GLOBAL template (no org)
          isSystemSeeded: true,
          isActive: true,
          isDefault: false,
          category: template.category,
          tags: template.tags,
          config: template.config,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      seededTemplates.push(seeded);
      console.log(`✅ Seeded: ${template.name} (${template.category})`);
    } catch (error: any) {
      console.error(`❌ Failed to seed "${template.name}":`, error.message);
    }
  }

  console.log(`\n✨ Successfully seeded ${seededTemplates.length} global templates!\n`);
  console.log('Templates seeded:');
  seededTemplates.forEach((t: any, i: number) => {
    console.log(`  ${i + 1}. ${t.name} (${t.category})`);
  });

  console.log('\n🌐 Global templates are now available to ALL organizations!');
  console.log('   Site admins can manage them at /admin/wellness-templates\n');

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error seeding global templates:', error);
  process.exit(1);
});
