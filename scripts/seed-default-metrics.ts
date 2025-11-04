/**
 * Seed default metrics for testing environments
 * This script seeds the 8 default metrics that are normally created by migration 0022
 * For CI/test environments that use db:push instead of migrations
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { siteMetrics } from '../packages/shared/schema';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function seedMetrics() {
  try {
    console.log('🌱 Seeding default metrics...');

    const metrics = [
      {
        code: 'FLY10_TIME',
        label: '10-Yard Fly Time',
        category: 'speed',
        unit: 's',
        lowerIsBetter: true,
        isSystemDefault: true,
        isActive: true,
        displayOrder: 1,
        description: 'Time to cover 10 yards after a flying start, measuring maximum velocity.',
        sportAssociations: ['Soccer'],
        decimalPrecision: 3,
        color: 'blue',
        icon: 'Clock',
      },
      {
        code: 'VERTICAL_JUMP',
        label: 'Vertical Jump',
        category: 'power',
        unit: 'in',
        lowerIsBetter: false,
        isSystemDefault: true,
        isActive: true,
        displayOrder: 2,
        description: 'Maximum vertical jump height in inches, measuring explosive leg power.',
        sportAssociations: ['Soccer'],
        decimalPrecision: 1,
        color: 'purple',
        icon: 'ArrowUp',
      },
      {
        code: 'AGILITY_505',
        label: '5-0-5 Agility',
        category: 'agility',
        unit: 's',
        lowerIsBetter: true,
        isSystemDefault: true,
        isActive: true,
        displayOrder: 3,
        description: '5-0-5 agility test: sprint 5 yards, turn 180 degrees, sprint 5 yards back.',
        sportAssociations: ['Soccer'],
        decimalPrecision: 3,
        color: 'green',
        icon: 'Zap',
      },
      {
        code: 'AGILITY_5105',
        label: '5-10-5 Agility',
        category: 'agility',
        unit: 's',
        lowerIsBetter: true,
        isSystemDefault: true,
        isActive: true,
        displayOrder: 4,
        description: '5-10-5 agility test (Pro Agility): sprint 5 yards, turn 180, sprint 10 yards, turn 180, sprint 5 yards.',
        sportAssociations: ['Soccer'],
        decimalPrecision: 3,
        color: 'yellow',
        icon: 'Zap',
      },
      {
        code: 'T_TEST',
        label: 'T-Test Agility',
        category: 'agility',
        unit: 's',
        lowerIsBetter: true,
        isSystemDefault: true,
        isActive: true,
        displayOrder: 5,
        description: 'T-test agility drill: forward sprint, lateral shuffles, and backward sprint in T-pattern.',
        sportAssociations: ['Soccer'],
        decimalPrecision: 3,
        color: 'red',
        icon: 'Move',
      },
      {
        code: 'DASH_40YD',
        label: '40-Yard Dash',
        category: 'speed',
        unit: 's',
        lowerIsBetter: true,
        isSystemDefault: true,
        isActive: true,
        displayOrder: 6,
        description: 'Time to sprint 40 yards from a stationary start, measuring acceleration and top-end speed.',
        sportAssociations: ['Soccer'],
        decimalPrecision: 3,
        color: 'indigo',
        icon: 'Timer',
      },
      {
        code: 'RSI',
        label: 'Reactive Strength Index',
        category: 'power',
        unit: '',
        lowerIsBetter: false,
        isSystemDefault: true,
        isActive: true,
        displayOrder: 7,
        description: 'Ratio of jump height to ground contact time, measuring elastic leg power and explosiveness.',
        sportAssociations: ['Soccer'],
        decimalPrecision: 2,
        color: 'orange',
        icon: 'TrendingUp',
      },
      {
        code: 'TOP_SPEED',
        label: 'Top Speed',
        category: 'speed',
        unit: 'mph',
        lowerIsBetter: false,
        isSystemDefault: true,
        isActive: true,
        displayOrder: 8,
        description: 'Maximum running velocity in miles per hour.',
        sportAssociations: ['Soccer'],
        decimalPrecision: 2,
        color: 'teal',
        icon: 'Gauge',
      },
    ];

    // Insert metrics with conflict handling (idempotent)
    for (const metric of metrics) {
      await db.insert(siteMetrics)
        .values(metric)
        .onConflictDoUpdate({
          target: siteMetrics.code,
          set: {
            label: metric.label,
            category: metric.category,
            unit: metric.unit,
            lowerIsBetter: metric.lowerIsBetter,
            isSystemDefault: metric.isSystemDefault,
            isActive: metric.isActive,
            displayOrder: metric.displayOrder,
            description: metric.description,
            sportAssociations: metric.sportAssociations,
            decimalPrecision: metric.decimalPrecision,
            color: metric.color,
            icon: metric.icon,
          },
        });
    }

    console.log('✅ Successfully seeded 8 default metrics');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding metrics:', error);
    await client.end();
    process.exit(1);
  }
}

seedMetrics();
