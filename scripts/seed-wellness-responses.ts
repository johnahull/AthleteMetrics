#!/usr/bin/env tsx
/**
 * Wellness Response Data Seeder
 *
 * Seeds realistic wellness response data for testing dashboards, analytics, and trends.
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/seed-wellness-responses.ts <organization-id>
 *
 * Features:
 *   - 90 days of historical data
 *   - Realistic score patterns (athlete personality, day-of-week effects, random variation)
 *   - 70-80% completion rate (not every athlete every day)
 *   - All question types supported (scale, text, boolean, body_map, multiple_choice)
 *   - Idempotent (safe to run multiple times)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, or, isNull } from 'drizzle-orm';
import {
  organizations,
  users,
  teams,
  userOrganizations,
  userTeams,
  wellnessTemplates,
  wellnessResponses,
} from '../packages/shared/schema';
import type { WellnessTemplateConfig, QuestionConfig, WellnessResponseData } from '../packages/shared/wellness-types';

// ====================
// Configuration
// ====================

const DAYS_OF_DATA = 90;
const COMPLETION_RATE = 0.75; // 75% of athletes respond on any given day
const BAD_DAY_CHANCE = 0.15; // 15% chance of a "bad day" with lower scores
const INJURY_CHANCE = 0.05; // 5% chance of reporting pain/injury

// Text response options for various contexts
const TEXT_RESPONSES = {
  positive: [
    'Feeling great today!',
    'Good recovery overnight',
    'Ready to train hard',
    'Slept well, feeling refreshed',
    '',
  ],
  neutral: [
    'Normal day',
    'Nothing to report',
    'Feeling okay',
    '',
    '',
  ],
  negative: [
    'A bit tired today',
    'Didn\'t sleep well',
    'Feeling some fatigue',
    'Could use more rest',
    '',
  ],
};

const SESSION_TYPES = [
  'Conditioning',
  'Technical Skills',
  'Tactical',
  'Strength Training',
  'Match/Game',
  'Recovery Session',
];

// Body map pain locations (x, y coordinates on body diagram)
const PAIN_LOCATIONS = [
  { x: 45, y: 65, label: 'left knee' },
  { x: 55, y: 65, label: 'right knee' },
  { x: 45, y: 45, label: 'left hip' },
  { x: 55, y: 45, label: 'right hip' },
  { x: 50, y: 30, label: 'lower back' },
  { x: 45, y: 75, label: 'left ankle' },
  { x: 55, y: 75, label: 'right ankle' },
  { x: 40, y: 35, label: 'left shoulder' },
  { x: 60, y: 35, label: 'right shoulder' },
  { x: 45, y: 55, label: 'left quad' },
  { x: 55, y: 55, label: 'right quad' },
  { x: 45, y: 60, label: 'left hamstring' },
  { x: 55, y: 60, label: 'right hamstring' },
];

// ====================
// Helper Functions
// ====================

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSubset<T>(arr: T[], minCount: number, maxCount: number): T[] {
  const count = randomInt(minCount, maxCount);
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Generate a base score modifier for an athlete (personality variance)
 * Some athletes consistently score higher/lower than average
 */
function getAthleteBaseModifier(athleteId: string): number {
  // Use athlete ID hash for consistent personality per athlete
  let hash = 0;
  for (let i = 0; i < athleteId.length; i++) {
    hash = ((hash << 5) - hash) + athleteId.charCodeAt(i);
    hash = hash & hash;
  }
  // Return modifier between -0.5 and +0.5
  return ((Math.abs(hash) % 100) - 50) / 100;
}

/**
 * Get day-of-week modifier (Monday fatigue, weekend recovery)
 */
function getDayOfWeekModifier(date: Date): number {
  const day = date.getDay();
  switch (day) {
    case 1: return -0.3; // Monday - post-weekend fatigue
    case 5: return -0.1; // Friday - end of week fatigue
    case 0: return 0.2;  // Sunday - well rested
    case 6: return 0.1;  // Saturday - weekend recovery
    default: return 0;
  }
}

/**
 * Generate a scale response value with realistic patterns
 */
function generateScaleValue(
  scaleMin: number,
  scaleMax: number,
  athleteId: string,
  date: Date,
  isBadDay: boolean,
  lowerIsBetter: boolean = false
): number {
  const range = scaleMax - scaleMin;
  const midpoint = scaleMin + range / 2;

  // Base value (slightly above average for most athletes)
  let baseValue = midpoint + range * 0.15;

  // Apply athlete personality modifier
  baseValue += range * getAthleteBaseModifier(athleteId) * 0.3;

  // Apply day-of-week modifier
  baseValue += range * getDayOfWeekModifier(date) * 0.2;

  // Random daily variation
  baseValue += range * (Math.random() - 0.5) * 0.2;

  // Bad day penalty
  if (isBadDay) {
    baseValue -= range * 0.3;
  }

  // Clamp to valid range
  let value = Math.round(Math.max(scaleMin, Math.min(scaleMax, baseValue)));

  // For lower_is_better scales, invert the logic
  if (lowerIsBetter) {
    // Higher values mean worse condition for lower_is_better
    value = scaleMax - (value - scaleMin);
    if (isBadDay) {
      value = Math.min(scaleMax, value + Math.round(range * 0.3));
    }
  }

  return value;
}

/**
 * Generate response value for a question
 */
function generateQuestionResponse(
  question: QuestionConfig,
  athleteId: string,
  date: Date,
  isBadDay: boolean,
  hasInjury: boolean,
  lowerIsBetter: boolean = false
): { value: any; label: string } {
  switch (question.type) {
    case 'scale': {
      const value = generateScaleValue(
        question.scaleMin,
        question.scaleMax,
        athleteId,
        date,
        isBadDay,
        lowerIsBetter
      );
      return { value, label: question.label };
    }

    case 'text': {
      const category = isBadDay ? 'negative' : (Math.random() > 0.3 ? 'positive' : 'neutral');
      const value = randomChoice(TEXT_RESPONSES[category]);
      return { value, label: question.label };
    }

    case 'boolean': {
      // For injury-related questions, use hasInjury flag
      const isInjuryQuestion = question.label.toLowerCase().includes('injur');
      const value = isInjuryQuestion ? hasInjury : (Math.random() > 0.8);
      return { value, label: question.label };
    }

    case 'body_map': {
      // Return pain locations only if athlete has injury
      const value = hasInjury ? randomSubset(PAIN_LOCATIONS, 1, 2) : [];
      return { value, label: question.label };
    }

    case 'multiple_choice': {
      if (question.allowMultiple) {
        // Multi-select: pick 1-3 options
        const selected = randomSubset(question.options, 1, Math.min(3, question.options.length));
        return { value: selected, label: question.label };
      } else {
        // Single select
        return { value: randomChoice(question.options), label: question.label };
      }
    }

    default:
      return { value: null, label: (question as any).label || 'Unknown' };
  }
}

/**
 * Generate wellness responses for a template
 */
function generateResponses(
  config: WellnessTemplateConfig,
  athleteId: string,
  date: Date
): WellnessResponseData | null {
  // Determine if this is a "bad day" for the athlete
  const isBadDay = Math.random() < BAD_DAY_CHANCE;
  const hasInjury = Math.random() < INJURY_CHANCE;

  // Determine scale orientation from status config
  const lowerIsBetter = config.statusConfig?.scaleOrientation === 'lower_is_better';

  const responses: WellnessResponseData = {};

  for (const question of config.questions) {
    const response = generateQuestionResponse(
      question,
      athleteId,
      date,
      isBadDay,
      hasInjury,
      lowerIsBetter
    );
    responses[question.id] = response;
  }

  return responses;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ====================
// Main Seeder
// ====================

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const organizationId = process.argv[2];
const templateId = process.argv[3] || undefined; // Optional: specific template ID
const teamIds = process.argv.slice(4); // Optional: specific team IDs

if (!organizationId) {
  console.error('Usage: npx tsx scripts/seed-wellness-responses.ts <org-id> [template-id] [team-id...]');
  console.error('');
  console.error('Examples:');
  console.error('  # Seed all templates, all teams:');
  console.error('  DATABASE_URL="..." npx tsx scripts/seed-wellness-responses.ts <org-id>');
  console.error('');
  console.error('  # Seed specific template, all teams:');
  console.error('  DATABASE_URL="..." npx tsx scripts/seed-wellness-responses.ts <org-id> <template-id>');
  console.error('');
  console.error('  # Seed specific template and specific teams:');
  console.error('  DATABASE_URL="..." npx tsx scripts/seed-wellness-responses.ts <org-id> <template-id> <team-id1> <team-id2>');
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function main() {
  console.log('');
  console.log('Wellness Response Seeder');
  console.log('========================');
  console.log('');

  try {
    // 1. Verify organization exists
    const org = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);

    if (org.length === 0) {
      console.error(`Organization with ID "${organizationId}" not found`);
      console.error('');
      console.error('Available organizations:');
      const allOrgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
      for (const o of allOrgs) {
        console.error(`  - ${o.name} (${o.id})`);
      }
      await client.end();
      process.exit(1);
    }

    console.log(`Organization: ${org[0].name}`);
    console.log(`ID: ${organizationId}`);
    console.log('');

    // 2. Get athletes in this organization (optionally filtered by teams)
    let athleteRecords;

    if (teamIds.length > 0) {
      // Get athletes from specific teams
      const { inArray } = await import('drizzle-orm');
      athleteRecords = await db
        .select({
          userId: userTeams.userId,
          fullName: users.fullName,
        })
        .from(userTeams)
        .innerJoin(users, eq(userTeams.userId, users.id))
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .where(
          and(
            eq(teams.organizationId, organizationId),
            inArray(userTeams.teamId, teamIds)
          )
        );

      console.log(`Filtering to ${teamIds.length} team(s)`);
    } else {
      // Get all athletes in org
      athleteRecords = await db
        .select({
          userId: userOrganizations.userId,
          fullName: users.fullName,
        })
        .from(userOrganizations)
        .innerJoin(users, eq(userOrganizations.userId, users.id))
        .where(
          and(
            eq(userOrganizations.organizationId, organizationId),
            eq(userOrganizations.role, 'athlete')
          )
        );
    }

    if (athleteRecords.length === 0) {
      console.error('No athletes found');
      await client.end();
      process.exit(1);
    }

    console.log(`Found ${athleteRecords.length} athletes`);

    // 3. Get athlete team assignments
    const teamRecords = await db
      .select({
        userId: userTeams.userId,
        teamId: userTeams.teamId,
        teamName: teams.name,
      })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .where(eq(teams.organizationId, organizationId));

    const athleteTeams = new Map<string, { teamId: string; teamName: string }>();
    for (const record of teamRecords) {
      // Use first team assignment for each athlete
      if (!athleteTeams.has(record.userId)) {
        athleteTeams.set(record.userId, { teamId: record.teamId, teamName: record.teamName });
      }
    }

    // 4. Get active wellness templates (org-specific + global, or specific template)
    let templateRecords;
    if (templateId) {
      // Specific template requested
      templateRecords = await db
        .select()
        .from(wellnessTemplates)
        .where(eq(wellnessTemplates.id, templateId));

      if (templateRecords.length === 0) {
        console.error(`Template with ID "${templateId}" not found`);
        await client.end();
        process.exit(1);
      }
    } else {
      // All active templates for this org
      templateRecords = await db
        .select()
        .from(wellnessTemplates)
        .where(
          and(
            eq(wellnessTemplates.isActive, true),
            or(
              eq(wellnessTemplates.organizationId, organizationId),
              isNull(wellnessTemplates.organizationId)
            )
          )
        );
    }

    if (templateRecords.length === 0) {
      console.error('No active wellness templates found');
      console.error('Run the template seeder first:');
      console.error('  DATABASE_URL="..." npx tsx scripts/seed-global-wellness-templates.ts');
      await client.end();
      process.exit(1);
    }

    console.log(`Found ${templateRecords.length} active templates`);
    console.log('');
    console.log(`Generating ${DAYS_OF_DATA} days of data...`);
    console.log('');

    // 5. Generate responses
    const today = new Date();
    const templateStats = new Map<string, { name: string; count: number }>();

    for (const template of templateRecords) {
      templateStats.set(template.id, { name: template.name, count: 0 });
    }

    let totalInserted = 0;
    let totalSkipped = 0;

    // Determine template frequencies (some templates used more often)
    const templateFrequencies = new Map<string, number>();
    for (const template of templateRecords) {
      const name = template.name.toLowerCase();
      if (name.includes('daily') || name.includes('check-in')) {
        templateFrequencies.set(template.id, 0.9); // 90% of days
      } else if (name.includes('weekly') || name.includes('screening')) {
        templateFrequencies.set(template.id, 0.15); // ~1x per week
      } else if (name.includes('post-training') || name.includes('rpe') || name.includes('session')) {
        templateFrequencies.set(template.id, 0.5); // ~3-4x per week
      } else {
        templateFrequencies.set(template.id, 0.7); // Default ~5x per week
      }
    }

    // Generate for each day
    for (let dayOffset = DAYS_OF_DATA; dayOffset >= 0; dayOffset--) {
      const date = new Date(today);
      date.setDate(date.getDate() - dayOffset);
      const dateStr = formatDate(date);

      // Generate submission time (random time during the day, weighted towards morning)
      const submittedAt = new Date(date);
      const hour = Math.random() < 0.7 ? randomInt(6, 10) : randomInt(11, 20);
      const minute = randomInt(0, 59);
      submittedAt.setHours(hour, minute, 0, 0);

      for (const athlete of athleteRecords) {
        // Determine if athlete responds today (base completion rate)
        if (Math.random() > COMPLETION_RATE) {
          continue;
        }

        // Pick templates for this athlete on this day
        for (const template of templateRecords) {
          const frequency = templateFrequencies.get(template.id) || 0.7;

          // Skip this template based on frequency
          if (Math.random() > frequency) {
            continue;
          }

          const config = template.config as WellnessTemplateConfig;
          const responses = generateResponses(config, athlete.userId, date);

          if (!responses) {
            continue;
          }

          // Get athlete's team info
          const teamInfo = athleteTeams.get(athlete.userId);

          // Insert response (skip if already exists)
          try {
            await db.insert(wellnessResponses).values({
              organizationId,
              templateId: template.id,
              userId: athlete.userId,
              userFullName: athlete.fullName || 'Unknown Athlete',
              teamId: teamInfo?.teamId || null,
              teamNameSnapshot: teamInfo?.teamName || null,
              date: dateStr,
              submittedAt,
              responses,
              accessMethod: 'athlete_account',
            }).onConflictDoNothing();

            const stats = templateStats.get(template.id)!;
            stats.count++;
            totalInserted++;
          } catch (error: any) {
            // Handle duplicate key errors gracefully
            if (error.code === '23505') {
              totalSkipped++;
            } else {
              throw error;
            }
          }
        }
      }
    }

    // 6. Print results
    console.log('Results:');
    for (const [_templateId, stats] of templateStats) {
      if (stats.count > 0) {
        console.log(`  ${stats.name}: ${stats.count} responses`);
      }
    }
    console.log('');
    console.log(`Successfully seeded ${totalInserted} wellness responses!`);
    if (totalSkipped > 0) {
      console.log(`(Skipped ${totalSkipped} existing responses)`);
    }
    console.log('');

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding wellness responses:', error);
    await client.end();
    process.exit(1);
  }
}

main();
