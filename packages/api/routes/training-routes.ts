/**
 * Training Module Routes
 *
 * All endpoints under /api/training, behind requireAuth + requireTrainingEnabled.
 * Implements:
 * - Exercise library CRUD
 * - Training program CRUD + workout day management + exercise prescriptions
 * - Program assignments
 * - Athlete self-service routes (my-program, my-program/today, my-assessment-context)
 * - Workout logging
 * - Compliance stats
 *
 * Cross-org isolation: every resource is validated against the session user's org.
 * Role enforcement: athletes cannot access coach routes; coaches cannot access athlete-only routes.
 */

import type { Express, Request, Response } from "express";
import { requireAuth, requireTrainingEnabled } from "../middleware";
import { TrainingService, TrainingError } from "../services/training-service";
import { storage } from "../storage";
import { exerciseTypeEnum, workoutSetSchema } from "@shared/schema/validation";
import { z } from "zod";

const trainingService = new TrainingService();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveUserOrg(req: Request): Promise<string | null> {
  const sessionUser = (req.session as any)?.user || req.user as any;
  if (!sessionUser?.id) return null;

  // Site admins have no primaryOrganizationId — they specify the org via route
  // param (:organizationId) or ?organizationId= query param (High fix)
  if (sessionUser.isSiteAdmin) {
    const orgFromRoute = req.params.organizationId;
    const orgFromQuery = req.query.organizationId as string | undefined;
    if (orgFromRoute || orgFromQuery) {
      return orgFromRoute || orgFromQuery!;
    }
  }

  const userOrgs = await storage.getUserOrganizations(sessionUser.id);
  return userOrgs[0]?.organizationId ?? null;
}

function handleTrainingError(error: unknown, res: Response) {
  if (error instanceof TrainingError) {
    return res.status(error.statusCode).json({ message: error.message, code: error.code });
  }

  const err = error as any;
  // Translate DB unique violations to 409
  if (err.code === '23505' || err.message?.includes('unique')) {
    return res.status(409).json({ message: 'Duplicate record', code: 'DUPLICATE' });
  }
  // Translate FK restrict violations to 409
  if (err.code === '23503' || err.message?.includes('foreign key')) {
    return res.status(409).json({ message: 'Resource is referenced by another record', code: 'FK_CONSTRAINT' });
  }

  console.error('Training route error:', error);
  return res.status(500).json({ message: 'Internal server error' });
}

/**
 * requireCoach — allows site_admin, org_admin, and coach roles.
 * Uses an explicit allowlist (High fix): previously only blocked 'athlete',
 * which would have allowed 'guest' through.
 */
function requireCoach(req: Request, res: Response): boolean {
  const user = (req.session as any)?.user || req.user as any;
  const coachRoles = ['site_admin', 'org_admin', 'coach'];
  if (!user?.role || !coachRoles.includes(user.role)) {
    res.status(403).json({ message: 'Coach or org_admin role required' });
    return false;
  }
  return true;
}

function requireAthlete(req: Request, res: Response): boolean {
  const user = (req.session as any)?.user || req.user as any;
  if (user?.role !== 'athlete') {
    res.status(403).json({ message: 'Athlete role required for this endpoint' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Validation schemas for request bodies
// ---------------------------------------------------------------------------

const createExerciseSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  exerciseType: exerciseTypeEnum,
  defaultSets: z.number().int().positive().optional(),
  defaultReps: z.number().int().positive().optional(),
  defaultWeightLbs: z.number().positive().optional(),
  defaultDurationSeconds: z.number().int().positive().optional(),
  videoUrl: z.string().url().max(500).optional(),
  notes: z.string().optional(),
});

const updateExerciseSchema = createExerciseSchema.partial();

const createProgramSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  sport: z.string().max(100).optional(),
  durationWeeks: z.number().int().positive(),
});

const updateProgramSchema = createProgramSchema.partial();

const addWorkoutDaySchema = z.object({
  name: z.string().max(200).optional(),
  notes: z.string().optional(),
});

const addExerciseToPrescriptionSchema = z.object({
  exerciseId: z.string(),
  prescribedSets: z.number().int().positive().optional(),
  prescribedReps: z.number().int().positive().optional(),
  prescribedWeightLbs: z.number().positive().optional(),
  prescribedDurationSeconds: z.number().int().positive().optional(),
  restSeconds: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

const assignProgramSchema = z.object({
  athleteId: z.string(),
  programId: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  notes: z.string().optional(),
});

const logWorkoutEntrySchema = z.object({
  exerciseId: z.string(),
  exerciseNameSnapshot: z.string().min(1).max(200),
  exerciseType: exerciseTypeEnum,
  sets: z.array(workoutSetSchema),
  qualityRating: z.number().int().min(1).max(5).optional(),
  durationSeconds: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

const logWorkoutSchema = z.object({
  programWorkoutId: z.string(),
  athleteProgramId: z.string().optional(),
  status: z.enum(['completed', 'partial', 'skipped']),
  notes: z.string().optional(),
  entries: z.array(logWorkoutEntrySchema),
});

/** Schema for updating an existing workout log (status/notes only) */
const updateLogSchema = z.object({
  status: z.enum(['completed', 'partial', 'skipped']).optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerTrainingRoutes(app: Express) {

  // -------------------------------------------------------------------------
  // Exercises
  // -------------------------------------------------------------------------

  app.get('/api/training/exercises', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const exerciseList = await trainingService.listExercises(orgId);
      res.json(exerciseList);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.post('/api/training/exercises', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const validated = createExerciseSchema.parse(req.body);
      const sessionUser = (req.session as any)?.user || req.user as any;

      const exercise = await trainingService.createExercise({
        ...validated,
        organizationId: orgId,
        createdBy: sessionUser?.id,
      });

      res.status(201).json(exercise);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      handleTrainingError(error, res);
    }
  });

  app.get('/api/training/exercises/:exerciseId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const exercise = await trainingService.getExercise(req.params.exerciseId, orgId);
      if (!exercise) return res.status(404).json({ message: 'Exercise not found' });

      res.json(exercise);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.put('/api/training/exercises/:exerciseId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const validated = updateExerciseSchema.parse(req.body);
      const updated = await trainingService.updateExercise(req.params.exerciseId, orgId, validated);
      if (!updated) return res.status(404).json({ message: 'Exercise not found' });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      handleTrainingError(error, res);
    }
  });

  app.delete('/api/training/exercises/:exerciseId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const archived = await trainingService.archiveExercise(req.params.exerciseId, orgId);
      if (!archived) return res.status(404).json({ message: 'Exercise not found' });

      res.json({ message: 'Exercise archived', exercise: archived });
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  // -------------------------------------------------------------------------
  // Programs
  // -------------------------------------------------------------------------

  app.get('/api/training/programs', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const programs = await trainingService.listPrograms(orgId);
      res.json(programs);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.post('/api/training/programs', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const validated = createProgramSchema.parse(req.body);
      const sessionUser = (req.session as any)?.user || req.user as any;

      const program = await trainingService.createProgram({
        ...validated,
        organizationId: orgId,
        createdBy: sessionUser?.id,
      });

      res.status(201).json(program);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      handleTrainingError(error, res);
    }
  });

  app.get('/api/training/programs/:programId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const program = await trainingService.getProgramWithWorkouts(req.params.programId, orgId);
      if (!program) return res.status(404).json({ message: 'Program not found' });

      res.json(program);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.put('/api/training/programs/:programId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const validated = updateProgramSchema.parse(req.body);
      const updated = await trainingService.updateProgram(req.params.programId, orgId, validated);
      if (!updated) return res.status(404).json({ message: 'Program not found' });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      handleTrainingError(error, res);
    }
  });

  app.delete('/api/training/programs/:programId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const archived = await trainingService.archiveProgram(req.params.programId, orgId);
      if (!archived) return res.status(404).json({ message: 'Program not found' });

      res.json({ message: 'Program archived', program: archived });
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  // -------------------------------------------------------------------------
  // Program Workout Days
  // NOTE: /workouts/reorder MUST be registered before /workouts/:workoutId
  // because Express matches routes top-to-bottom and ":workoutId" would
  // otherwise capture the literal string "reorder" (High fix)
  // -------------------------------------------------------------------------

  app.post('/api/training/programs/:programId/workouts', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const program = await trainingService.getProgram(req.params.programId, orgId);
      if (!program) return res.status(404).json({ message: 'Program not found' });

      const validated = addWorkoutDaySchema.parse(req.body);
      const workout = await trainingService.addWorkoutDay({
        programId: req.params.programId,
        ...validated,
      });

      res.status(201).json(workout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      handleTrainingError(error, res);
    }
  });

  // Static "reorder" route registered BEFORE the parameterized /:workoutId route
  app.put('/api/training/programs/:programId/workouts/reorder', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const program = await trainingService.getProgram(req.params.programId, orgId);
      if (!program) return res.status(404).json({ message: 'Program not found' });

      const { order } = req.body;
      if (!Array.isArray(order)) {
        return res.status(400).json({ message: 'order must be an array of workout day IDs' });
      }

      const reordered = await trainingService.reorderWorkoutDays(req.params.programId, order);
      res.json(reordered);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.put('/api/training/programs/:programId/workouts/:workoutId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const program = await trainingService.getProgram(req.params.programId, orgId);
      if (!program) return res.status(404).json({ message: 'Program not found' });

      const validated = addWorkoutDaySchema.partial().parse(req.body);
      // Pass programId so the service can scope the WHERE clause (Critical fix)
      const updated = await trainingService.updateWorkoutDay(req.params.workoutId, req.params.programId, validated);
      if (!updated) return res.status(404).json({ message: 'Workout day not found' });

      res.json(updated);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.delete('/api/training/programs/:programId/workouts/:workoutId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const program = await trainingService.getProgram(req.params.programId, orgId);
      if (!program) return res.status(404).json({ message: 'Program not found' });

      // Pass programId so the service can scope the WHERE clause (Critical fix)
      const deleted = await trainingService.deleteWorkoutDay(req.params.workoutId, req.params.programId);
      if (!deleted) return res.status(404).json({ message: 'Workout day not found' });

      res.json({ message: 'Workout day deleted' });
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  // -------------------------------------------------------------------------
  // Program Workout Exercises (Prescriptions)
  // NOTE: /exercises/reorder MUST be registered before /exercises/:prescriptionId
  // for the same reason as workouts/reorder above (High fix)
  // -------------------------------------------------------------------------

  app.post('/api/training/programs/:programId/workouts/:workoutId/exercises', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const program = await trainingService.getProgram(req.params.programId, orgId);
      if (!program) return res.status(404).json({ message: 'Program not found' });

      const validated = addExerciseToPrescriptionSchema.parse(req.body);
      const prescription = await trainingService.addExerciseToWorkout({
        programWorkoutId: req.params.workoutId,
        ...validated,
      });

      res.status(201).json(prescription);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      handleTrainingError(error, res);
    }
  });

  // Static "reorder" route registered BEFORE the parameterized /:prescriptionId route
  app.put('/api/training/programs/:programId/workouts/:workoutId/exercises/reorder', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      // Verify program belongs to org before allowing reorder (Critical fix)
      const program = await trainingService.getProgram(req.params.programId, orgId);
      if (!program) return res.status(404).json({ message: 'Program not found' });

      const { order } = req.body;
      if (!Array.isArray(order)) {
        return res.status(400).json({ message: 'order must be an array of prescription IDs' });
      }

      const reordered = await trainingService.reorderExercises(req.params.workoutId, order);
      res.json(reordered);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.put('/api/training/programs/:programId/workouts/:workoutId/exercises/:prescriptionId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      // Verify program belongs to org (Critical fix: was missing entirely)
      const program = await trainingService.getProgram(req.params.programId, orgId);
      if (!program) return res.status(404).json({ message: 'Program not found' });

      // Validate body (was previously passing raw req.body)
      const validated = addExerciseToPrescriptionSchema.partial().parse(req.body);
      // Pass workoutId so the service scopes the WHERE clause (Critical fix)
      const updated = await trainingService.updatePrescription(req.params.prescriptionId, req.params.workoutId, validated);
      if (!updated) return res.status(404).json({ message: 'Prescription not found' });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      handleTrainingError(error, res);
    }
  });

  app.delete('/api/training/programs/:programId/workouts/:workoutId/exercises/:prescriptionId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      // Verify program belongs to org (Critical fix: was missing entirely)
      const program = await trainingService.getProgram(req.params.programId, orgId);
      if (!program) return res.status(404).json({ message: 'Program not found' });

      // Pass workoutId so the service scopes the WHERE clause (Critical fix)
      const deleted = await trainingService.removeExerciseFromWorkout(req.params.prescriptionId, req.params.workoutId);
      if (!deleted) return res.status(404).json({ message: 'Prescription not found' });

      res.json({ message: 'Exercise removed from workout' });
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  // -------------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------------

  app.post('/api/training/assignments', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const validated = assignProgramSchema.parse(req.body);

      // Cross-org: verify program belongs to this org
      const program = await trainingService.getProgram(validated.programId, orgId);
      if (!program) return res.status(400).json({ message: 'Program not found or does not belong to your organization' });

      const sessionUser = (req.session as any)?.user || req.user as any;

      const assignment = await trainingService.assignProgram({
        ...validated,
        organizationId: orgId,
        assignedBy: sessionUser?.id,
      });

      res.status(201).json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      handleTrainingError(error, res);
    }
  });

  app.get('/api/training/assignments', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const assignments = await trainingService.listAssignments(orgId);
      res.json(assignments);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.get('/api/training/assignments/:assignmentId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      const sessionUser = (req.session as any)?.user || req.user as any;
      const orgId = await resolveUserOrg(req);

      const schedule = await trainingService.getAthleteSchedule(req.params.assignmentId);
      if (!schedule) return res.status(404).json({ message: 'Assignment not found' });

      // Cross-org isolation: athlete can only see their own, coach sees org's
      if (sessionUser?.role === 'athlete') {
        if (schedule.assignment.athleteId !== sessionUser.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
      } else if (orgId && schedule.assignment.organizationId !== orgId) {
        return res.status(404).json({ message: 'Assignment not found' });
      }

      res.json(schedule);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.put('/api/training/assignments/:assignmentId/status', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      // Resolve org to scope the DB update (Critical fix: was missing orgId entirely)
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const { status } = req.body;
      if (!['active', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ message: 'status must be active, completed, or cancelled' });
      }

      const updated = await trainingService.updateAssignmentStatus(req.params.assignmentId, orgId, status);
      if (!updated) return res.status(404).json({ message: 'Assignment not found' });

      res.json(updated);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  // -------------------------------------------------------------------------
  // Athlete-only routes (my-program, today, assessment-context)
  // NOTE: These MUST be registered BEFORE any parameterized routes that might
  // match "my-program" as an assignmentId
  // -------------------------------------------------------------------------

  app.get('/api/training/my-program', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      const sessionUser = (req.session as any)?.user || req.user as any;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      if (sessionUser?.role !== 'athlete') {
        return res.status(403).json({ message: 'This endpoint is for athletes only' });
      }

      const schedule = await trainingService.getMyProgram(sessionUser.id, orgId);
      res.json({ schedule });
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.get('/api/training/my-program/today', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      const sessionUser = (req.session as any)?.user || req.user as any;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      if (sessionUser?.role !== 'athlete') {
        return res.status(403).json({ message: 'This endpoint is for athletes only' });
      }

      const today = await trainingService.getMyProgramToday(sessionUser.id, orgId);
      res.json({ workout: today });
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.get('/api/training/my-assessment-context', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      const sessionUser = (req.session as any)?.user || req.user as any;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      if (sessionUser?.role !== 'athlete') {
        return res.status(403).json({ message: 'This endpoint is for athletes only' });
      }

      const context = await trainingService.getAssessmentContext(sessionUser.id, orgId);
      res.json({ assessmentContext: context });
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  // -------------------------------------------------------------------------
  // Workout Logs
  // -------------------------------------------------------------------------

  app.post('/api/training/logs', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      const sessionUser = (req.session as any)?.user || req.user as any;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const validated = logWorkoutSchema.parse(req.body);

      let athleteProgramId = validated.athleteProgramId;

      if (sessionUser?.role === 'athlete') {
        if (athleteProgramId) {
          const assignment = await trainingService.getAssignment(athleteProgramId);
          if (!assignment || assignment.athleteId !== sessionUser.id) {
            return res.status(403).json({ message: 'Access denied' });
          }
        } else {
          return res.status(400).json({ message: 'athleteProgramId is required' });
        }
      } else if (!athleteProgramId) {
        return res.status(400).json({ message: 'athleteProgramId is required' });
      } else {
        // Coaches: verify the assignment belongs to their org
        const assignment = await trainingService.getAssignment(athleteProgramId);
        if (!assignment || assignment.organizationId !== orgId) {
          return res.status(403).json({ message: 'Assignment not found or access denied' });
        }
      }

      const log = await trainingService.logWorkout({
        athleteProgramId: athleteProgramId!,
        programWorkoutId: validated.programWorkoutId,
        loggedBy: sessionUser?.id,
        status: validated.status,
        notes: validated.notes,
        entries: validated.entries,
      });

      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      handleTrainingError(error, res);
    }
  });

  app.get('/api/training/logs/:logId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      const sessionUser = (req.session as any)?.user || req.user as any;
      const orgId = await resolveUserOrg(req);

      const log = await trainingService.getWorkoutLog(req.params.logId);
      if (!log) return res.status(404).json({ message: 'Workout log not found' });

      // Ownership check — verify the log's assignment belongs to this user/org (Critical fix)
      const assignment = await trainingService.getAssignment(log.athleteProgramId);
      if (!assignment) return res.status(404).json({ message: 'Workout log not found' });

      if (sessionUser?.role === 'athlete') {
        if (assignment.athleteId !== sessionUser.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
      } else if (orgId && assignment.organizationId !== orgId) {
        return res.status(404).json({ message: 'Workout log not found' });
      }

      res.json(log);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  app.put('/api/training/logs/:logId', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      const sessionUser = (req.session as any)?.user || req.user as any;
      const orgId = await resolveUserOrg(req);

      // Validate body (Critical fix: was passing raw req.body with no validation)
      const validated = updateLogSchema.parse(req.body);

      // Ownership check before update (Critical fix)
      const log = await trainingService.getWorkoutLog(req.params.logId);
      if (!log) return res.status(404).json({ message: 'Workout log not found' });

      const assignment = await trainingService.getAssignment(log.athleteProgramId);
      if (!assignment) return res.status(404).json({ message: 'Workout log not found' });

      if (sessionUser?.role === 'athlete') {
        if (assignment.athleteId !== sessionUser.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
      } else {
        if (!requireCoach(req, res)) return;
        if (orgId && assignment.organizationId !== orgId) {
          return res.status(404).json({ message: 'Workout log not found' });
        }
      }

      const updated = await trainingService.updateWorkoutLog(req.params.logId, validated);
      if (!updated) return res.status(404).json({ message: 'Workout log not found' });

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      handleTrainingError(error, res);
    }
  });

  app.put('/api/training/logs/:logId/entries', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      const sessionUser = (req.session as any)?.user || req.user as any;
      const orgId = await resolveUserOrg(req);

      const { entries } = req.body;
      if (!Array.isArray(entries)) {
        return res.status(400).json({ message: 'entries must be an array' });
      }

      // Ownership check before replacing entries (Critical fix)
      const log = await trainingService.getWorkoutLog(req.params.logId);
      if (!log) return res.status(404).json({ message: 'Workout log not found' });

      const assignment = await trainingService.getAssignment(log.athleteProgramId);
      if (!assignment) return res.status(404).json({ message: 'Workout log not found' });

      if (sessionUser?.role === 'athlete') {
        if (assignment.athleteId !== sessionUser.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
      } else {
        if (!requireCoach(req, res)) return;
        if (orgId && assignment.organizationId !== orgId) {
          return res.status(404).json({ message: 'Workout log not found' });
        }
      }

      const count = await trainingService.upsertWorkoutLogEntries(req.params.logId, entries);
      res.json({ message: 'Entries updated', count });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      handleTrainingError(error, res);
    }
  });

  // -------------------------------------------------------------------------
  // Compliance
  // -------------------------------------------------------------------------

  app.get('/api/training/compliance', requireAuth, requireTrainingEnabled, async (req: Request, res: Response) => {
    try {
      if (!requireCoach(req, res)) return;
      const orgId = await resolveUserOrg(req);
      if (!orgId) return res.status(400).json({ message: 'Organization not found' });

      const stats = await trainingService.getComplianceStats(orgId);
      res.json(stats);
    } catch (error) {
      handleTrainingError(error, res);
    }
  });

  console.log('Training routes registered');
}
