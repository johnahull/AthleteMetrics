/**
 * Unit Tests: TrainingService
 *
 * RED-phase tests written before the service is implemented.
 * All DB calls are mocked via vi.mock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing the service
vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ op: 'eq', a, b })),
  and: vi.fn((...args) => ({ op: 'and', args })),
  inArray: vi.fn((a, b) => ({ op: 'inArray', a, b })),
  desc: vi.fn((a) => ({ op: 'desc', a })),
  asc: vi.fn((a) => ({ op: 'asc', a })),
  sql: vi.fn((a) => a),
  relations: vi.fn(),
}));

vi.mock('@shared/schema', () => ({
  exercises: { id: 'id', organizationId: 'organization_id', isActive: 'is_active' },
  trainingPrograms: { id: 'id', organizationId: 'organization_id', isActive: 'is_active' },
  programWorkouts: { id: 'id', programId: 'program_id', dayNumber: 'day_number' },
  programWorkoutExercises: { id: 'id', programWorkoutId: 'program_workout_id', exerciseId: 'exercise_id', displayOrder: 'display_order' },
  athletePrograms: { id: 'id', athleteId: 'athlete_id', organizationId: 'organization_id', status: 'status' },
  workoutLogs: { id: 'id', athleteProgramId: 'athlete_program_id', programWorkoutId: 'program_workout_id' },
  workoutLogEntries: { id: 'id', workoutLogId: 'workout_log_id' },
  measurements: { id: 'id', playerId: 'player_id', organizationId: 'organization_id', metricType: 'metric_type' },
  siteBenchmarks: { id: 'id', metricType: 'metric_type' },
}));

// Mock @shared/schema/validation to return real Zod schemas (avoids drizzle imports in schema-original)
import { z } from 'zod';

const realWorkoutSetSchema = z.object({
  setNumber: z.number().int().positive(),
  repsCompleted: z.number().int().positive().nullable(),
  weightLbs: z.number().positive().nullable(),
  notes: z.string().optional(),
});

vi.mock('@shared/schema/validation', () => ({
  workoutSetSchema: z.object({
    setNumber: z.number().int().positive(),
    repsCompleted: z.number().int().positive().nullable(),
    weightLbs: z.number().positive().nullable(),
    notes: z.string().optional(),
  }),
  exerciseTypeEnum: z.enum(['weighted', 'bodyweight', 'speed', 'plyometric', 'timed']),
}));

vi.mock('../storage', () => ({
  storage: {
    getUser: vi.fn(),
    getUserOrganizations: vi.fn().mockResolvedValue([]),
    createAuditLog: vi.fn().mockResolvedValue({}),
  },
}));

import { TrainingService } from './training-service';
import { db } from '../db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChain(results: any) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(Array.isArray(results) ? results : [results]),
    returning: vi.fn().mockResolvedValue(Array.isArray(results) ? results : [results]),
    orderBy: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(Array.isArray(results) ? results : [results]),
  };
  return chain;
}

let service: TrainingService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new TrainingService();
});

// ---------------------------------------------------------------------------
// Schedule computation
// ---------------------------------------------------------------------------

describe('TrainingService — schedule computation', () => {
  it('scheduledDate = startDate + (dayNumber - 1) days: day 1 → same date', () => {
    const startDate = '2025-01-01';
    const scheduledDate = service.computeScheduledDate(startDate, 1);
    expect(scheduledDate).toBe('2025-01-01');
  });

  it('scheduledDate = startDate + (dayNumber - 1) days: day 3 → +2 days', () => {
    const startDate = '2025-01-01';
    const scheduledDate = service.computeScheduledDate(startDate, 3);
    expect(scheduledDate).toBe('2025-01-03');
  });

  it('handles startDate at month boundary (Feb 28 + 3 days = Mar 2)', () => {
    const startDate = '2025-02-28';
    const scheduledDate = service.computeScheduledDate(startDate, 4); // +3 days
    expect(scheduledDate).toBe('2025-03-03');
  });

  it('marks logStatus "overdue" when scheduledDate is past and no log exists', () => {
    const status = service.computeLogStatus('2020-01-01', null);
    expect(status).toBe('overdue');
  });

  it('marks logStatus "upcoming" when scheduledDate is in the future', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const status = service.computeLogStatus(futureDate.toISOString().split('T')[0], null);
    expect(status).toBe('upcoming');
  });

  it('marks logStatus "completed" from workoutLog.status=completed', () => {
    const status = service.computeLogStatus('2020-01-01', { status: 'completed' });
    expect(status).toBe('completed');
  });

  it('marks logStatus "partial" from workoutLog.status=partial', () => {
    const status = service.computeLogStatus('2020-01-01', { status: 'partial' });
    expect(status).toBe('partial');
  });

  it('marks logStatus "skipped" from workoutLog.status=skipped', () => {
    const status = service.computeLogStatus('2020-01-01', { status: 'skipped' });
    expect(status).toBe('skipped');
  });
});

// ---------------------------------------------------------------------------
// Compliance calculation
// ---------------------------------------------------------------------------

describe('TrainingService — compliance calculation', () => {
  it('compliancePercent = (completed + skipped) / workoutsScheduledSoFar * 100', () => {
    const logs = [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'skipped' },
      { status: 'partial' },
    ];
    const percent = service.computeCompliancePercent(logs as any[], 4);
    expect(percent).toBe(75); // 3/4 * 100
  });

  it('includes skipped in numerator', () => {
    const logs = [{ status: 'skipped' }];
    const percent = service.computeCompliancePercent(logs as any[], 1);
    expect(percent).toBe(100);
  });

  it('returns 0 when no past-due workouts yet', () => {
    const percent = service.computeCompliancePercent([], 0);
    expect(percent).toBe(0);
  });

  it('does not count future workouts in denominator (denominator=0)', () => {
    const percent = service.computeCompliancePercent([], 0);
    expect(percent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Single-active assignment enforcement
// ---------------------------------------------------------------------------

describe('TrainingService — assignProgram enforcement', () => {
  it('throws 409-like error when athlete already has active assignment in same org', async () => {
    (db.select as any).mockReturnValue(makeChain([{ id: 'existing-assignment' }]));

    await expect(
      service.checkNoActiveAssignment('athlete-1', 'org-1')
    ).rejects.toThrow(/already has an active/i);
  });

  it('resolves when athlete has no active assignments', async () => {
    (db.select as any).mockReturnValue(makeChain([]));

    await expect(
      service.checkNoActiveAssignment('athlete-1', 'org-1')
    ).resolves.toBeUndefined();
  });

  it('resolves when previous assignment is cancelled', async () => {
    // Empty result = no active assignments
    (db.select as any).mockReturnValue(makeChain([]));

    await expect(
      service.checkNoActiveAssignment('athlete-1', 'org-1')
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// validateWorkoutSets
// ---------------------------------------------------------------------------

describe('TrainingService — validateWorkoutSets', () => {
  it('throws for invalid set with setNumber=0', () => {
    expect(() =>
      service.validateWorkoutSets([{ setNumber: 0, repsCompleted: 10, weightLbs: null }])
    ).toThrow();
  });

  it('accepts valid sets array', () => {
    expect(() =>
      service.validateWorkoutSets([{ setNumber: 1, repsCompleted: 10, weightLbs: 135 }])
    ).not.toThrow();
  });

  it('accepts empty array (valid for skipped exercise)', () => {
    expect(() => service.validateWorkoutSets([])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// reorderWorkoutDays
// ---------------------------------------------------------------------------

describe('TrainingService — reorderWorkoutDays', () => {
  it('reassigns dayNumber sequentially starting from 1 in provided order', () => {
    const days = [
      { id: 'day-3', dayNumber: 3 },
      { id: 'day-1', dayNumber: 1 },
      { id: 'day-2', dayNumber: 2 },
    ];
    const order = ['day-3', 'day-1', 'day-2'];
    const reordered = service.computeReorderedDayNumbers(days, order);
    expect(reordered).toEqual([
      { id: 'day-3', dayNumber: 1 },
      { id: 'day-1', dayNumber: 2 },
      { id: 'day-2', dayNumber: 3 },
    ]);
  });

  it('throws when order array contains IDs not belonging to the program', () => {
    const days = [{ id: 'day-1', dayNumber: 1 }];
    const order = ['day-1', 'day-UNKNOWN'];
    expect(() => service.computeReorderedDayNumbers(days, order)).toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// reorderExercises
// ---------------------------------------------------------------------------

describe('TrainingService — reorderExercises', () => {
  it('reassigns displayOrder sequentially for exercises', () => {
    const exercises = [
      { id: 'ex-2', displayOrder: 2 },
      { id: 'ex-1', displayOrder: 1 },
    ];
    const order = ['ex-2', 'ex-1'];
    const reordered = service.computeReorderedExerciseDisplayOrders(exercises, order);
    expect(reordered).toEqual([
      { id: 'ex-2', displayOrder: 1 },
      { id: 'ex-1', displayOrder: 2 },
    ]);
  });

  it('throws when exercise order array contains IDs not belonging to the workout', () => {
    const exercises = [{ id: 'ex-1', displayOrder: 1 }];
    const order = ['ex-1', 'ex-NOPE'];
    expect(() => service.computeReorderedExerciseDisplayOrders(exercises, order)).toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// MilestoneAlert streak
// ---------------------------------------------------------------------------

describe('TrainingService — streak computation', () => {
  it('streak >= 5 consecutive completed logs triggers milestone', () => {
    const logs = [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
    ];
    const streak = service.computeCurrentStreak(logs as any[]);
    expect(streak).toBeGreaterThanOrEqual(5);
  });

  it('4 completed, 1 skipped, 1 completed → streak resets, no milestone', () => {
    const logs = [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'skipped' },
      { status: 'completed' },
    ];
    const streak = service.computeCurrentStreak(logs as any[]);
    expect(streak).toBe(1); // Only the last completed counts
  });
});
