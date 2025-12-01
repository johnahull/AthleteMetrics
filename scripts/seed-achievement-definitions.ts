/**
 * Seed achievement definitions
 * Creates the initial 17 achievement badges across 4 categories
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { achievementDefinitions } from '../packages/shared/schema';
import { eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function seedAchievements() {
  try {
    console.log('🌱 Seeding achievement definitions...');

    const achievements = [
      // Performance Badges (5)
      {
        code: 'FIRST_PR',
        name: 'First PR',
        description: 'Set your first personal record in any metric',
        category: 'performance' as const,
        icon: 'Trophy',
        color: 'yellow',
        rarity: 'common' as const,
        isActive: true,
      },
      {
        code: 'SPEED_DEMON',
        name: 'Speed Demon',
        description: 'Run 10-yard fly time under 1.0 second',
        category: 'performance' as const,
        icon: 'Zap',
        color: 'blue',
        rarity: 'rare' as const,
        isActive: true,
      },
      {
        code: 'SKY_HIGH',
        name: 'Sky High',
        description: 'Achieve vertical jump over 30 inches',
        category: 'performance' as const,
        icon: 'ArrowUp',
        color: 'purple',
        rarity: 'rare' as const,
        isActive: true,
      },
      {
        code: 'SUB_5_FORTY',
        name: 'Sub-5 Forty',
        description: 'Complete 40-yard dash under 5.0 seconds',
        category: 'performance' as const,
        icon: 'Rocket',
        color: 'red',
        rarity: 'epic' as const,
        isActive: true,
      },
      {
        code: 'ELITE_ATHLETE',
        name: 'Elite Athlete',
        description: 'Reach top 10% in any metric organization-wide',
        category: 'performance' as const,
        icon: 'Star',
        color: 'gold',
        rarity: 'legendary' as const,
        isActive: true,
      },

      // Consistency Badges (5)
      {
        code: 'FIRST_MEASUREMENT',
        name: 'Getting Started',
        description: 'Record your first measurement',
        category: 'consistency' as const,
        icon: 'Play',
        color: 'green',
        rarity: 'common' as const,
        isActive: true,
      },
      {
        code: 'STREAK_5',
        name: 'Committed',
        description: 'Record 5 measurements in a single month',
        category: 'consistency' as const,
        icon: 'Flame',
        color: 'orange',
        rarity: 'common' as const,
        isActive: true,
      },
      {
        code: 'STREAK_10',
        name: 'Dedicated',
        description: 'Record 10 measurements in a single month',
        category: 'consistency' as const,
        icon: 'Flame',
        color: 'orange',
        rarity: 'rare' as const,
        isActive: true,
      },
      {
        code: 'STREAK_3_MONTHS',
        name: 'Iron Will',
        description: 'Record at least one measurement every month for 3 consecutive months',
        category: 'consistency' as const,
        icon: 'Target',
        color: 'indigo',
        rarity: 'epic' as const,
        isActive: true,
      },
      {
        code: 'CENTURY_CLUB',
        name: 'Century Club',
        description: 'Reach 100 total measurements',
        category: 'consistency' as const,
        icon: 'Award',
        color: 'gold',
        rarity: 'legendary' as const,
        isActive: true,
      },

      // Improvement Badges (4)
      {
        code: 'RISING_STAR',
        name: 'Rising Star',
        description: 'Improve any metric by 10% or more over 3 months',
        category: 'improvement' as const,
        icon: 'TrendingUp',
        color: 'green',
        rarity: 'rare' as const,
        isActive: true,
      },
      {
        code: 'PR_STREAK_3',
        name: 'PR Streak',
        description: 'Set 3 consecutive personal records in the same metric',
        category: 'improvement' as const,
        icon: 'BarChart',
        color: 'blue',
        rarity: 'rare' as const,
        isActive: true,
      },
      {
        code: 'COMEBACK_KID',
        name: 'Comeback Kid',
        description: 'Set a new PR after 3 declining measurements',
        category: 'improvement' as const,
        icon: 'RefreshCw',
        color: 'purple',
        rarity: 'epic' as const,
        isActive: true,
      },
      {
        code: 'ALL_AROUND_PR',
        name: 'All-Around Athlete',
        description: 'Set personal records in all 8 metrics',
        category: 'improvement' as const,
        icon: 'Crown',
        color: 'gold',
        rarity: 'legendary' as const,
        isActive: true,
      },

      // Goal Badges (3)
      {
        code: 'FIRST_GOAL',
        name: 'Goal Setter',
        description: 'Set your first goal',
        category: 'goal' as const,
        icon: 'Target',
        color: 'blue',
        rarity: 'common' as const,
        isActive: true,
      },
      {
        code: 'GOAL_ACHIEVED',
        name: 'Goal Crusher',
        description: 'Achieve a goal',
        category: 'goal' as const,
        icon: 'CheckCircle',
        color: 'green',
        rarity: 'rare' as const,
        isActive: true,
      },
      {
        code: 'GOAL_EARLY',
        name: 'Overachiever',
        description: 'Achieve a goal before the target date',
        category: 'goal' as const,
        icon: 'Sparkles',
        color: 'purple',
        rarity: 'epic' as const,
        isActive: true,
      },
    ];

    // Insert achievements (upsert to avoid duplicates)
    for (const achievement of achievements) {
      const existing = await db.select()
        .from(achievementDefinitions)
        .where(eq(achievementDefinitions.code, achievement.code))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(achievementDefinitions).values(achievement);
        console.log(`✅ Created achievement: ${achievement.code} (${achievement.name})`);
      } else {
        console.log(`⏭️  Skipped (already exists): ${achievement.code}`);
      }
    }

    console.log('✅ Achievement definitions seeded successfully');
    console.log(`📊 Total achievements: ${achievements.length}`);
    console.log(`   - Performance: 5`);
    console.log(`   - Consistency: 5`);
    console.log(`   - Improvement: 4`);
    console.log(`   - Goal: 3`);

  } catch (error) {
    console.error('❌ Error seeding achievement definitions:', error);
    throw error;
  } finally {
    await client.end();
  }
}

seedAchievements();
