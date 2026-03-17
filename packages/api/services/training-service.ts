/**
 * Training Service
 *
 * Business logic for the training module:
 * - Exercise library (CRUD, soft-delete)
 * - Training programs (CRUD, workout day management)
 * - Program assignments to athletes
 * - Workout logging with per-exercise set data
 * - Compliance statistics
 * - Assessment context (reads from existing measurements/siteBenchmarks tables)
 */

import { BaseService } from "./base-service";
import { db } from "../db";
import {
  exercises,
  trainingPrograms,
  programWorkouts,
  programWorkoutExercises,
  athletePrograms,
  workoutLogs,
  workoutLogEntries,
  measurements,
  siteBenchmarks,
  users,
} from "@shared/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { workoutSetSchema } from "@shared/schema/validation";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export class TrainingError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'TrainingError';
  }
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

export interface WorkoutSet {
  setNumber: number;
  repsCompleted: number | null;
  weightLbs: number | null;
  notes?: string;
}

type LogStatus = 'completed' | 'partial' | 'skipped' | 'overdue' | 'upcoming';

// ---------------------------------------------------------------------------
// TrainingService
// ---------------------------------------------------------------------------

export class TrainingService extends BaseService {

  // -----------------------------------------------------------------------
  // Pure computation methods (no DB — easy to unit test)
  // -----------------------------------------------------------------------

  /**
   * Compute the scheduled date for a workout day.
   * scheduledDate = startDate + (dayNumber - 1) days
   */
  computeScheduledDate(startDate: string, dayNumber: number): string {
    const date = new Date(startDate + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + (dayNumber - 1));
    return date.toISOString().split('T')[0];
  }

  /**
   * Compute the log status for a scheduled workout.
   * If log exists: use the log's status.
   * If no log and date is past: 'overdue'.
   * If no log and date is future: 'upcoming'.
   */
  computeLogStatus(scheduledDate: string, log: { status: string } | null): LogStatus {
    if (log) {
      return log.status as LogStatus;
    }
    const scheduled = new Date(scheduledDate + 'T00:00:00Z');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (scheduled < today) {
      return 'overdue';
    }
    return 'upcoming';
  }

  /**
   * Compute compliance percent: (completed + skipped) / scheduled * 100.
   * Only considers past-due workouts (denominator passed in).
   */
  computeCompliancePercent(logs: Array<{ status: string }>, scheduledSoFar: number): number {
    if (scheduledSoFar === 0) return 0;
    const counted = logs.filter(l => l.status === 'completed' || l.status === 'skipped').length;
    return Math.round((counted / scheduledSoFar) * 100);
  }

  /**
   * Compute current consecutive-completed streak.
   * Traverses logs from most recent to oldest; resets on any non-completed.
   */
  computeCurrentStreak(logs: Array<{ status: string }>): number {
    let streak = 0;
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].status === 'completed') {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  /**
   * Validate an array of WorkoutSet objects against the Zod schema.
   * Throws ZodError if invalid.
   */
  validateWorkoutSets(sets: unknown[]): WorkoutSet[] {
    return z.array(workoutSetSchema).parse(sets);
  }

  /**
   * Compute new dayNumber assignments for workout days given an ordered array of IDs.
   * Throws if any ID in the order array is not present in the days array.
   */
  computeReorderedDayNumbers(
    days: Array<{ id: string; dayNumber: number }>,
    order: string[]
  ): Array<{ id: string; dayNumber: number }> {
    const dayMap = new Map(days.map(d => [d.id, d]));
    for (const id of order) {
      if (!dayMap.has(id)) {
        throw new TrainingError(`Workout day ID ${id} not found in program`, 400, 'NOT_FOUND');
      }
    }
    return order.map((id, index) => ({ id, dayNumber: index + 1 }));
  }

  /**
   * Compute new displayOrder assignments for exercises given an ordered array of IDs.
   */
  computeReorderedExerciseDisplayOrders(
    exercises: Array<{ id: string; displayOrder: number }>,
    order: string[]
  ): Array<{ id: string; displayOrder: number }> {
    const exMap = new Map(exercises.map(e => [e.id, e]));
    for (const id of order) {
      if (!exMap.has(id)) {
        throw new TrainingError(`Exercise ID ${id} not found in workout`, 400, 'NOT_FOUND');
      }
    }
    return order.map((id, index) => ({ id, displayOrder: index + 1 }));
  }

  // -----------------------------------------------------------------------
  // DB methods
  // -----------------------------------------------------------------------

  /**
   * Check that an athlete has no active assignment in the given org.
   * Throws 409 if one exists.
   */
  async checkNoActiveAssignment(athleteId: string, organizationId: string): Promise<void> {
    const existing = await db
      .select()
      .from(athletePrograms)
      .where(
        and(
          eq(athletePrograms.athleteId, athleteId),
          eq(athletePrograms.organizationId, organizationId),
          eq(athletePrograms.status, 'active')
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new TrainingError(
        `Athlete already has an active training program assigned in this organization`,
        409,
        'DUPLICATE_ACTIVE_ASSIGNMENT'
      );
    }
  }

  // -----------------------------------------------------------------------
  // Exercise CRUD
  // -----------------------------------------------------------------------

  async listExercises(organizationId: string) {
    return db
      .select()
      .from(exercises)
      .where(eq(exercises.organizationId, organizationId))
      .orderBy(exercises.name);
  }

  async getExercise(exerciseId: string, organizationId: string) {
    const rows = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, exerciseId), eq(exercises.organizationId, organizationId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async createExercise(data: {
    organizationId: string;
    name: string;
    description?: string;
    category?: string;
    exerciseType: string;
    defaultSets?: number;
    defaultReps?: string;
    defaultWeightLbs?: number;
    defaultDurationSeconds?: number;
    videoUrl?: string;
    notes?: string;
    createdBy?: string;
  }) {
    // Drizzle decimal columns expect string | null in insert, not number
    const { defaultWeightLbs, ...rest } = data;
    const [created] = await db.insert(exercises).values({
      ...rest,
      ...(defaultWeightLbs !== undefined ? { defaultWeightLbs: String(defaultWeightLbs) } : {}),
    }).returning();
    return created;
  }

  async updateExercise(exerciseId: string, organizationId: string, data: Partial<{
    name: string;
    description: string;
    category: string;
    exerciseType: string;
    defaultSets: number;
    defaultReps: string;
    defaultWeightLbs: number;
    defaultDurationSeconds: number;
    videoUrl: string;
    notes: string;
  }>) {
    const { defaultWeightLbs, ...rest } = data;
    const rows = await db
      .update(exercises)
      .set({
        ...rest,
        ...(defaultWeightLbs !== undefined ? { defaultWeightLbs: String(defaultWeightLbs) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(exercises.id, exerciseId), eq(exercises.organizationId, organizationId)))
      .returning();
    return rows[0] ?? null;
  }

  async archiveExercise(exerciseId: string, organizationId: string) {
    // Wrap check + update in a transaction to eliminate TOCTOU race between check and update
    return db.transaction(async (tx) => {
      const refs = await tx
        .select({ id: programWorkoutExercises.id })
        .from(programWorkoutExercises)
        .where(eq(programWorkoutExercises.exerciseId, exerciseId))
        .limit(1);

      if (refs.length > 0) {
        throw new TrainingError(
          'Exercise is referenced by one or more program workouts and cannot be archived',
          409,
          'EXERCISE_IN_USE'
        );
      }

      const rows = await tx
        .update(exercises)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(exercises.id, exerciseId), eq(exercises.organizationId, organizationId)))
        .returning();
      return rows[0] ?? null;
    });
  }

  // -----------------------------------------------------------------------
  // Training Programs CRUD
  // -----------------------------------------------------------------------

  async listPrograms(organizationId: string) {
    return db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.organizationId, organizationId))
      .orderBy(trainingPrograms.name);
  }

  async getProgram(programId: string, organizationId: string) {
    const rows = await db
      .select()
      .from(trainingPrograms)
      .where(and(eq(trainingPrograms.id, programId), eq(trainingPrograms.organizationId, organizationId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async getProgramWithWorkouts(programId: string, organizationId: string) {
    const program = await this.getProgram(programId, organizationId);
    if (!program) return null;

    const workoutDays = await db
      .select()
      .from(programWorkouts)
      .where(eq(programWorkouts.programId, programId))
      .orderBy(programWorkouts.dayNumber);

    const workoutsWithExercises = await Promise.all(
      workoutDays.map(async (workout) => {
        const prescriptions = await db
          .select()
          .from(programWorkoutExercises)
          .where(eq(programWorkoutExercises.programWorkoutId, workout.id))
          .orderBy(programWorkoutExercises.displayOrder);

        // Enrich with exercise details
        const enriched = await Promise.all(
          prescriptions.map(async (p) => {
            const exerciseRows = await db
              .select()
              .from(exercises)
              .where(eq(exercises.id, p.exerciseId))
              .limit(1);
            return { ...p, exercise: exerciseRows[0] ?? null };
          })
        );

        return { ...workout, exercises: enriched };
      })
    );

    return { ...program, workouts: workoutsWithExercises };
  }

  async createProgram(data: {
    organizationId: string;
    name: string;
    description?: string;
    sport?: string;
    durationWeeks: number;
    createdBy?: string;
  }) {
    const [created] = await db.insert(trainingPrograms).values(data).returning();
    return created;
  }

  async updateProgram(programId: string, organizationId: string, data: Partial<{
    name: string;
    description: string;
    sport: string;
    durationWeeks: number;
  }>) {
    const rows = await db
      .update(trainingPrograms)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(trainingPrograms.id, programId), eq(trainingPrograms.organizationId, organizationId)))
      .returning();
    return rows[0] ?? null;
  }

  async archiveProgram(programId: string, organizationId: string) {
    // Check for active athlete assignments
    const activeAssignments = await db
      .select({ id: athletePrograms.id })
      .from(athletePrograms)
      .where(and(
        eq(athletePrograms.programId, programId),
        eq(athletePrograms.status, 'active')
      ))
      .limit(1);

    if (activeAssignments.length > 0) {
      throw new TrainingError(
        'Program has active athlete assignments and cannot be archived',
        409,
        'PROGRAM_HAS_ACTIVE_ASSIGNMENTS'
      );
    }

    const rows = await db
      .update(trainingPrograms)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(trainingPrograms.id, programId), eq(trainingPrograms.organizationId, organizationId)))
      .returning();
    return rows[0] ?? null;
  }

  // -----------------------------------------------------------------------
  // Program Workout Days
  // -----------------------------------------------------------------------

  async addWorkoutDay(data: {
    programId: string;
    name?: string;
    notes?: string;
  }) {
    // Use MAX+1 inside a transaction to prevent race conditions when two concurrent
    // requests both read count=N and then both try to insert dayNumber=N+1
    return db.transaction(async (tx) => {
      const maxResult = await tx
        .select({ max: sql<number>`COALESCE(MAX(${programWorkouts.dayNumber}), 0)` })
        .from(programWorkouts)
        .where(eq(programWorkouts.programId, data.programId));
      const nextDayNumber = (maxResult[0]?.max ?? 0) + 1;

      const [created] = await tx
        .insert(programWorkouts)
        .values({ ...data, dayNumber: nextDayNumber })
        .returning();
      return created;
    });
  }

  async updateWorkoutDay(workoutId: string, programId: string, data: Partial<{ name: string; notes: string }>) {
    // Scope by programId to prevent cross-program mutation (Critical fix)
    const rows = await db
      .update(programWorkouts)
      .set(data)
      .where(and(eq(programWorkouts.id, workoutId), eq(programWorkouts.programId, programId)))
      .returning();
    return rows[0] ?? null;
  }

  async deleteWorkoutDay(workoutId: string, programId: string) {
    // Scope by programId to prevent cross-program deletion (Critical fix)
    const rows = await db
      .delete(programWorkouts)
      .where(and(eq(programWorkouts.id, workoutId), eq(programWorkouts.programId, programId)))
      .returning();
    return rows[0] ?? null;
  }

  async reorderWorkoutDays(programId: string, order: string[]) {
    const days = await db
      .select()
      .from(programWorkouts)
      .where(eq(programWorkouts.programId, programId));

    const reordered = this.computeReorderedDayNumbers(days, order);

    await db.transaction(async (tx) => {
      for (const { id, dayNumber } of reordered) {
        await tx
          .update(programWorkouts)
          .set({ dayNumber })
          .where(eq(programWorkouts.id, id));
      }
    });

    return reordered;
  }

  // -----------------------------------------------------------------------
  // Program Workout Exercises (Prescriptions)
  // -----------------------------------------------------------------------

  async addExerciseToWorkout(data: {
    programWorkoutId: string;
    exerciseId: string;
    prescribedSets?: number;
    prescribedReps?: string;
    prescribedWeightLbs?: number;
    prescribedDurationSeconds?: number;
    restSeconds?: number;
    notes?: string;
  }) {
    // Find next displayOrder
    const existing = await db
      .select()
      .from(programWorkoutExercises)
      .where(eq(programWorkoutExercises.programWorkoutId, data.programWorkoutId));
    const nextOrder = existing.length;

    const { prescribedWeightLbs, ...rest } = data;
    const [created] = await db
      .insert(programWorkoutExercises)
      .values({
        ...rest,
        displayOrder: nextOrder,
        ...(prescribedWeightLbs !== undefined ? { prescribedWeightLbs: String(prescribedWeightLbs) } : {}),
      })
      .returning();
    return created;
  }

  async updatePrescription(prescriptionId: string, programWorkoutId: string, data: Partial<{
    prescribedSets: number;
    prescribedReps: string;
    prescribedWeightLbs: number;
    prescribedDurationSeconds: number;
    restSeconds: number;
    notes: string;
  }>) {
    // Scope by programWorkoutId to prevent cross-workout prescription mutation (Critical fix)
    const { prescribedWeightLbs, ...rest } = data;
    const rows = await db
      .update(programWorkoutExercises)
      .set({
        ...rest,
        ...(prescribedWeightLbs !== undefined ? { prescribedWeightLbs: String(prescribedWeightLbs) } : {}),
      })
      .where(and(
        eq(programWorkoutExercises.id, prescriptionId),
        eq(programWorkoutExercises.programWorkoutId, programWorkoutId),
      ))
      .returning();
    return rows[0] ?? null;
  }

  async removeExerciseFromWorkout(prescriptionId: string, programWorkoutId: string) {
    // Scope by programWorkoutId to prevent cross-workout prescription deletion (Critical fix)
    const rows = await db
      .delete(programWorkoutExercises)
      .where(and(
        eq(programWorkoutExercises.id, prescriptionId),
        eq(programWorkoutExercises.programWorkoutId, programWorkoutId),
      ))
      .returning();
    return rows[0] ?? null;
  }

  async reorderExercises(workoutId: string, order: string[]) {
    const existing = await db
      .select()
      .from(programWorkoutExercises)
      .where(eq(programWorkoutExercises.programWorkoutId, workoutId));

    const reordered = this.computeReorderedExerciseDisplayOrders(existing, order);

    await db.transaction(async (tx) => {
      for (const { id, displayOrder } of reordered) {
        await tx
          .update(programWorkoutExercises)
          .set({ displayOrder })
          .where(eq(programWorkoutExercises.id, id));
      }
    });

    return reordered;
  }

  // -----------------------------------------------------------------------
  // Program Assignments
  // -----------------------------------------------------------------------

  async assignProgram(data: {
    athleteId: string;
    programId: string;
    organizationId: string;
    assignedBy: string;
    startDate: string;
    notes?: string;
    athleteNameSnapshot?: string;
  }) {
    // Enforce one-active-per-athlete at app layer
    await this.checkNoActiveAssignment(data.athleteId, data.organizationId);

    try {
      const [created] = await db.insert(athletePrograms).values(data).returning();
      return created;
    } catch (error: any) {
      // Translate DB unique violation (partial index) to 409
      if (error.code === '23505' || error.message?.includes('unique')) {
        throw new TrainingError(
          'Athlete already has an active training program (concurrent request conflict)',
          409,
          'DUPLICATE_ACTIVE_ASSIGNMENT'
        );
      }
      throw error;
    }
  }

  async listAssignments(organizationId: string) {
    return db
      .select()
      .from(athletePrograms)
      .where(eq(athletePrograms.organizationId, organizationId))
      .orderBy(desc(athletePrograms.createdAt));
  }

  async getAssignment(assignmentId: string) {
    const rows = await db
      .select()
      .from(athletePrograms)
      .where(eq(athletePrograms.id, assignmentId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getAthleteSchedule(assignmentId: string) {
    const assignment = await this.getAssignment(assignmentId);
    if (!assignment) return null;

    const program = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.id, assignment.programId))
      .limit(1);

    if (!program[0]) return null;

    const workoutDays = await db
      .select()
      .from(programWorkouts)
      .where(eq(programWorkouts.programId, assignment.programId))
      .orderBy(programWorkouts.dayNumber);

    // Fetch all logs for this assignment
    const logs = await db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.athleteProgramId, assignmentId));

    const logMap = new Map(logs.map(l => [l.programWorkoutId, l]));

    const schedule = workoutDays.map((day) => {
      const scheduledDate = this.computeScheduledDate(
        typeof assignment.startDate === 'string' ? assignment.startDate : (assignment.startDate as Date).toISOString().split('T')[0],
        day.dayNumber
      );
      const log = logMap.get(day.id) ?? null;
      return {
        ...day,
        scheduledDate,
        logStatus: this.computeLogStatus(scheduledDate, log),
        log,
      };
    });

    return { assignment, program: program[0], schedule };
  }

  async updateAssignmentStatus(assignmentId: string, organizationId: string, status: 'active' | 'completed' | 'cancelled') {
    // Scope by organizationId to prevent cross-org assignment manipulation (Critical fix)
    const updateData: any = { status, updatedAt: new Date() };
    if (status === 'completed') updateData.completedAt = new Date();
    if (status === 'cancelled') updateData.cancelledAt = new Date();

    const rows = await db
      .update(athletePrograms)
      .set(updateData)
      .where(and(
        eq(athletePrograms.id, assignmentId),
        eq(athletePrograms.organizationId, organizationId),
      ))
      .returning();
    return rows[0] ?? null;
  }

  // -----------------------------------------------------------------------
  // Athlete Self-Service
  // -----------------------------------------------------------------------

  async getMyProgram(athleteId: string, organizationId: string) {
    const rows = await db
      .select()
      .from(athletePrograms)
      .where(and(
        eq(athletePrograms.athleteId, athleteId),
        eq(athletePrograms.organizationId, organizationId),
        eq(athletePrograms.status, 'active')
      ))
      .limit(1);

    if (!rows[0]) return null;
    return this.getAthleteSchedule(rows[0].id);
  }

  async getMyProgramToday(athleteId: string, organizationId: string) {
    const schedule = await this.getMyProgram(athleteId, organizationId);
    if (!schedule) return null;

    const today = new Date().toISOString().split('T')[0];
    const todayWorkout = schedule.schedule.find(s => s.scheduledDate === today);
    return todayWorkout ?? null;
  }

  // -----------------------------------------------------------------------
  // Workout Logging
  // -----------------------------------------------------------------------

  async logWorkout(data: {
    athleteProgramId: string;
    programWorkoutId: string;
    loggedBy: string;
    status: 'completed' | 'partial' | 'skipped';
    notes?: string;
    athleteNameSnapshot?: string;
    programWorkoutNameSnapshot?: string;
    loggedByNameSnapshot?: string;
    entries: Array<{
      exerciseId: string;
      exerciseNameSnapshot: string;
      exerciseType: string;
      sets: unknown[];
      qualityRating?: number;
      durationSeconds?: number;
      notes?: string;
    }>;
  }) {
    // Validate all sets before inserting
    const validatedEntries = data.entries.map(entry => ({
      ...entry,
      sets: this.validateWorkoutSets(entry.sets),
    }));

    return db.transaction(async (tx) => {
      // Check for duplicate log
      const existing = await tx
        .select()
        .from(workoutLogs)
        .where(and(
          eq(workoutLogs.athleteProgramId, data.athleteProgramId),
          eq(workoutLogs.programWorkoutId, data.programWorkoutId)
        ))
        .limit(1);

      if (existing.length > 0) {
        throw new TrainingError(
          'A workout log already exists for this assignment and workout day',
          409,
          'DUPLICATE_LOG'
        );
      }

      const [log] = await tx
        .insert(workoutLogs)
        .values({
          athleteProgramId: data.athleteProgramId,
          programWorkoutId: data.programWorkoutId,
          loggedBy: data.loggedBy,
          status: data.status,
          notes: data.notes,
          athleteNameSnapshot: data.athleteNameSnapshot ?? null,
          programWorkoutNameSnapshot: data.programWorkoutNameSnapshot ?? null,
          loggedByNameSnapshot: data.loggedByNameSnapshot ?? null,
        })
        .returning();

      if (validatedEntries.length > 0) {
        await tx
          .insert(workoutLogEntries)
          .values(
            validatedEntries.map(entry => ({
              workoutLogId: log.id,
              exerciseId: entry.exerciseId,
              exerciseNameSnapshot: entry.exerciseNameSnapshot,
              exerciseType: entry.exerciseType,
              sets: entry.sets,
              qualityRating: entry.qualityRating ?? null,
              durationSeconds: entry.durationSeconds ?? null,
              notes: entry.notes ?? null,
            }))
          );
      }

      return log;
    }).catch((error: any) => {
      if (error.code === '23505' || error.message?.includes('unique')) {
        throw new TrainingError(
          'A workout log already exists for this assignment and workout day',
          409,
          'DUPLICATE_LOG'
        );
      }
      throw error;
    });
  }

  async getWorkoutLog(logId: string) {
    const rows = await db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.id, logId))
      .limit(1);

    if (!rows[0]) return null;

    const entries = await db
      .select()
      .from(workoutLogEntries)
      .where(eq(workoutLogEntries.workoutLogId, logId));

    return { ...rows[0], entries };
  }

  async updateWorkoutLog(logId: string, data: Partial<{
    status: string;
    notes: string;
  }>) {
    const rows = await db
      .update(workoutLogs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(workoutLogs.id, logId))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Replace all entries for a log in a single transaction.
   * If insert fails, the transaction rolls back and original entries are preserved.
   */
  async upsertWorkoutLogEntries(logId: string, entries: Array<{
    exerciseId: string;
    exerciseNameSnapshot: string;
    exerciseType: string;
    sets: unknown[];
    qualityRating?: number;
    durationSeconds?: number;
    notes?: string;
  }>) {
    // Validate all sets before touching the DB
    const validatedEntries = entries.map(entry => ({
      ...entry,
      sets: this.validateWorkoutSets(entry.sets),
    }));

    return db.transaction(async (tx) => {
      // Delete all existing entries for this log only
      await tx
        .delete(workoutLogEntries)
        .where(eq(workoutLogEntries.workoutLogId, logId));

      // Insert new entries (if any)
      if (validatedEntries.length > 0) {
        await tx
          .insert(workoutLogEntries)
          .values(
            validatedEntries.map(entry => ({
              workoutLogId: logId,
              exerciseId: entry.exerciseId,
              exerciseNameSnapshot: entry.exerciseNameSnapshot,
              exerciseType: entry.exerciseType,
              sets: entry.sets,
              qualityRating: entry.qualityRating ?? null,
              durationSeconds: entry.durationSeconds ?? null,
              notes: entry.notes ?? null,
            }))
          );
      }

      return validatedEntries.length;
    });
  }

  // -----------------------------------------------------------------------
  // Compliance
  // -----------------------------------------------------------------------

  async getComplianceStats(organizationId: string) {
    const assignments = await db
      .select()
      .from(athletePrograms)
      .where(and(
        eq(athletePrograms.organizationId, organizationId),
        eq(athletePrograms.status, 'active')
      ));

    const today = new Date().toISOString().split('T')[0];

    const stats = await Promise.all(
      assignments.map(async (assignment) => {
        const program = await db
          .select()
          .from(trainingPrograms)
          .where(eq(trainingPrograms.id, assignment.programId))
          .limit(1);

        const workoutDays = await db
          .select()
          .from(programWorkouts)
          .where(eq(programWorkouts.programId, assignment.programId));

        const logs = await db
          .select()
          .from(workoutLogs)
          .where(eq(workoutLogs.athleteProgramId, assignment.id));

        const startDate = typeof assignment.startDate === 'string'
          ? assignment.startDate
          : (assignment.startDate as Date).toISOString().split('T')[0];

        // Count scheduled-so-far (past and today)
        const scheduledSoFar = workoutDays.filter(day => {
          const scheduled = this.computeScheduledDate(startDate, day.dayNumber);
          return scheduled <= today;
        });

        const percent = this.computeCompliancePercent(logs, scheduledSoFar.length);
        const lastLog = logs.slice().sort((a, b) =>
          new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
        )[0] ?? null;

        // Build scheduledDate map for each workoutDay so streak is ordered by
        // the calendar date of each workout, not when it was logged (Medium fix)
        const workoutDateMap = new Map(
          workoutDays.map(day => [day.id, this.computeScheduledDate(startDate, day.dayNumber)])
        );
        const logsSortedBySchedule = logs.slice().sort((a, b) => {
          const dateA = workoutDateMap.get(a.programWorkoutId) ?? '';
          const dateB = workoutDateMap.get(b.programWorkoutId) ?? '';
          return dateA.localeCompare(dateB);
        });
        const streak = this.computeCurrentStreak(logsSortedBySchedule);

        return {
          athleteId: assignment.athleteId,
          assignmentId: assignment.id,
          programName: program[0]?.name ?? 'Unknown',
          compliancePercent: percent,
          lastLoggedAt: lastLog?.loggedAt ?? null,
          currentStreak: streak,
          milestoneTrigger: streak >= 5,
        };
      })
    );

    return stats;
  }

  // -----------------------------------------------------------------------
  // Assessment Context
  // -----------------------------------------------------------------------

  /** Metadata for each tracked metric: display label, unit, sort direction. */
  private readonly METRIC_META: Record<string, { label: string; unit: string; higherIsBetter: boolean }> = {
    FLY10_TIME: { label: '10-Yard Fly', unit: 's', higherIsBetter: false },
    VERTICAL_JUMP: { label: 'Vertical Jump', unit: 'in', higherIsBetter: true },
  };

  /**
   * Reads latest measurement + D1 benchmark for key metrics (FLY10_TIME, VERTICAL_JUMP).
   * Returns data in the AssessmentContext shape expected by the frontend component.
   * Returns null when the athlete has no measurement history for these metrics.
   */
  async getAssessmentContext(athleteId: string, organizationId: string): Promise<{
    metrics: Array<{
      metricKey: string;
      metricLabel: string;
      latestValue: number;
      unit: string;
      d1Threshold: number | null;
      gap: number | null;
      higherIsBetter: boolean;
    }>;
    lastMeasuredAt: string | null;
  } | null> {
    const KEY_METRICS = ['FLY10_TIME', 'VERTICAL_JUMP'] as const;

    const rawContexts = await Promise.all(
      KEY_METRICS.map(async (metricType) => {
        // Get latest measurement for this metric
        const measurementRows = await db
          .select()
          .from(measurements)
          .where(and(
            eq(measurements.userId, athleteId),
            eq(measurements.organizationId, organizationId),
            eq(measurements.metric, metricType)
          ))
          .orderBy(desc(measurements.createdAt))
          .limit(1);

        if (!measurementRows[0]) return null;

        const latestMeasurement = measurementRows[0];
        const latestValue = latestMeasurement.value;

        // Get D1 benchmark for this metric
        const benchmarkRows = await db
          .select()
          .from(siteBenchmarks)
          .where(and(
            eq(siteBenchmarks.metricCode, metricType),
            eq(siteBenchmarks.tierName, 'D1')
          ))
          .limit(1);

        const benchmark = benchmarkRows[0] ?? null;
        const d1Threshold = benchmark?.benchmarkValue ?? null;
        const gap = d1Threshold !== null && latestValue !== null
          ? Number(latestValue) - Number(d1Threshold)
          : null;

        return {
          metricType,
          latestValue: Number(latestValue),
          d1Threshold: d1Threshold !== null ? Number(d1Threshold) : null,
          gap,
          measurementDate: latestMeasurement.createdAt,
        };
      })
    );

    const validContexts = rawContexts.filter(Boolean) as Array<{
      metricType: string;
      latestValue: number;
      d1Threshold: number | null;
      gap: number | null;
      measurementDate: Date | string | null;
    }>;

    if (validContexts.length === 0) return null;

    // Transform to AssessmentContext shape expected by the frontend hook/component
    const metrics = validContexts.map(c => {
      const meta = this.METRIC_META[c.metricType] ?? { label: c.metricType, unit: '', higherIsBetter: true };
      return {
        metricKey: c.metricType,
        metricLabel: meta.label,
        latestValue: c.latestValue,
        unit: meta.unit,
        d1Threshold: c.d1Threshold,
        gap: c.gap,
        higherIsBetter: meta.higherIsBetter,
      };
    });

    const lastMeasuredAt = validContexts.reduce((latest, c) => {
      const dateStr = c.measurementDate ? new Date(c.measurementDate as any).toISOString() : null;
      if (!latest || (dateStr && dateStr > latest)) return dateStr;
      return latest;
    }, null as string | null);

    return { metrics, lastMeasuredAt };
  }

  /** Look up a user by ID for name snapshot resolution. Returns null if not found. */
  async getUserById(userId: string) {
    const [user] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user ?? null;
  }

  /** Look up a single workout day by ID. Returns null if not found. */
  async getWorkoutDay(workoutId: string) {
    const [workout] = await db
      .select()
      .from(programWorkouts)
      .where(eq(programWorkouts.id, workoutId))
      .limit(1);
    return workout ?? null;
  }
}
