/**
 * Event Report routes
 * Handles report generation specifically for events with event percentiles support
 */

import type { Express, Response } from "express";
import rateLimit from "express-rate-limit";
import { ReportService } from "../services/report-service";
import { EventService, type IEventStorage } from "../services/event-service";
import { EventMetricsService, type IMetricsStorage } from "../services/event-metrics-service";
import { EventRegistrationService, type IRegistrationStorage } from "../services/event-registration-service";
import { requireAuth, type AuthenticatedRequest } from "../middleware";
import { storage } from "../storage";
import { db } from "../db";
import { reports, insertReportSchema, events, measurements } from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getOrgRole, isMeasurementWriterRole } from "../permissions/measurement-helpers";
import { isSiteAdmin } from "../permissions/helpers";
import {
  EvalReportInputError,
  buildEvalReportModel,
  computeEvalDefaults,
  evalInputErrorResponse,
  loadEvalReportInputs,
} from "../services/eval-report-service";
import { EVAL_REPORT_TYPE, evalReportConfigSchema, evalReportRequestSchema } from "@shared/eval-report-config";
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "../constants/rate-limits";
import { z, ZodError } from "zod";

// Lighter limit for the eval report preview and defaults (reads; nothing is saved)
const evalReadLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.STANDARD,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Rate limiting for report generation (expensive operation)
const reportGenerationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.MUTATION,
  message: { message: "Too many report generation requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Check if user can access event reports
 */
async function canAccessEventReports(
  userId: string,
  eventId: string,
  eventService: EventService
): Promise<boolean> {
  // getEvent throws for a non-member; that is "no access", not a server error
  const event = await eventService.getEvent(eventId, userId).catch(() => null);
  if (!event) return false;

  // Site admins can access all
  const user = await storage.getUser(userId);
  if (user?.isSiteAdmin) return true;

  // If event has an organization, check org membership
  if (event.organizationId) {
    const roles = await storage.getUserRoles(userId, event.organizationId);
    return roles.includes('org_admin') || roles.includes('coach');
  }

  // Public events - creator can access
  return event.createdBy === userId;
}

const uuidParam = z.string().uuid();

/**
 * Resolve the event and athlete of an eval report request, or send the error and return null.
 * Authorization uses the role in the EVENT's organization (not the session's primary role). Anyone who may
 * not see the event, and an athlete who is not part of it, gets 404 so the response reveals nothing.
 */
async function resolveEvalTarget(req: AuthenticatedRequest, res: Response) {
  const { eventId, athleteId } = req.params;
  // A malformed id would reach Postgres as an invalid uuid and surface as a 500. A well-formed but unknown id
  // still falls through to the 404 below, so inaccessible and nonexistent rows stay indistinguishable.
  if (!uuidParam.safeParse(eventId).success || !uuidParam.safeParse(athleteId).success) {
    res.status(400).json({ message: "Invalid id" });
    return null;
  }
  const notFound = () => {
    res.status(404).json({ message: "Not found" });
    return null;
  };

  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return notFound();
  if (event.organizationId === null) {
    // No organization to authorize against: only a site admin learns why (409), everyone else gets the 404
    if (!isSiteAdmin(req.user)) return notFound();
    res.status(409).json({ message: "Event has no organization" });
    return null;
  }
  const role = await getOrgRole(req.user!, event.organizationId);
  if (!isMeasurementWriterRole(role)) return notFound();

  // The athlete must have verified measurements in this event (in the event's organization), as loadEvalReportInputs reads.
  // Deliberately less strict than loadEvalReportInputs, which also requires an active, not-deleted user: a
  // deactivated athlete passes this check but the service then refuses, so the caller gets a 404 from the service
  // (the UI explains it).
  const [measured] = await db
    .select({ id: measurements.id })
    .from(measurements)
    .where(and(eq(measurements.eventId, eventId), eq(measurements.userId, athleteId), eq(measurements.organizationId, event.organizationId), eq(measurements.isVerified, true)))
    .limit(1);
  if (!measured) return notFound();
  return { event, organizationId: event.organizationId, eventId, athleteId };
}

function sendEvalError(res: Response, error: unknown, fallback: string) {
  if (error instanceof ZodError) return res.status(400).json({ message: "Invalid request", errors: error.errors });
  if (error instanceof EvalReportInputError) {
    const { status, message } = evalInputErrorResponse(error.code);
    return res.status(status).json({ message });
  }
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
}

export function registerEventReportRoutes(app: Express) {
  const reportService = new ReportService();
  const eventService = new EventService(storage as IEventStorage);
  const eventMetricsService = new EventMetricsService(storage as IMetricsStorage);
  const eventRegistrationService = new EventRegistrationService(storage as IRegistrationStorage);

  /**
   * GET /api/events/:eventId/reports
   * List all reports associated with an event
   */
  app.get(
    "/api/events/:eventId/reports",
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        const userId = req.user!.id;

        // Check access
        const canAccess = await canAccessEventReports(userId, eventId, eventService);
        if (!canAccess) {
          return res.status(403).json({ message: "Not authorized to view event reports" });
        }

        // Get event to get organizationId
        const event = await eventService.getEvent(eventId, userId);
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }

        // Scope in SQL: this event's reports, in the event's organization when it has one
        const eventReports = await db
          .select()
          .from(reports)
          .where(
            and(
              sql`${reports.config}->>'eventId' = ${eventId}`,
              event.organizationId ? eq(reports.organizationId, event.organizationId) : undefined,
            ),
          )
          .orderBy(desc(reports.createdAt));

        // The list does not need an eval row's frozen model; keep its event date
        const payload = eventReports.map((report) => {
          if (report.reportType !== EVAL_REPORT_TYPE) return report;
          const { model, ...rest } = (report.config ?? {}) as Record<string, unknown> & { model?: { eventDate?: string } };
          return { ...report, config: { ...rest, eventDate: model?.eventDate } };
        });

        return res.json(payload);
      } catch (error: unknown) {
        console.error("Error fetching event reports:", error);
        const message = error instanceof Error ? error.message : "Failed to fetch event reports";
        return res.status(500).json({ message });
      }
    }
  );

  /**
   * POST /api/events/:eventId/reports
   * Create a new report for an event
   */
  app.post(
    "/api/events/:eventId/reports",
    requireAuth,
    reportGenerationLimiter,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        const userId = req.user!.id;
        const { name, reportType, athleteIds, includeEventPercentiles, metrics } = req.body;

        // Check access
        const canAccess = await canAccessEventReports(userId, eventId, eventService);
        if (!canAccess) {
          return res.status(403).json({ message: "Not authorized to create event reports" });
        }

        // Get event details
        const event = await eventService.getEvent(eventId, userId);
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }

        // Build report config with eventId
        const config: Record<string, unknown> = {
          eventId,
          includeEventPercentiles: includeEventPercentiles ?? true,
          timeframe: {
            type: 'custom',
            customStart: event.startDate ? new Date(event.startDate).toISOString().split('T')[0] : undefined,
            customEnd: event.endDate ? new Date(event.endDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          },
          metrics: metrics || [],
        };

        if (reportType === 'individual' && athleteIds) {
          config.athleteIds = athleteIds;
          // Store first athlete for individual report generation
          if (Array.isArray(athleteIds) && athleteIds.length > 0) {
            config.athleteId = athleteIds[0];
          }
        }

        // Validate and create report
        const reportData = {
          name: name || `${event.name} - ${reportType === 'team' ? 'Team Report' : 'Individual Report'}`,
          organizationId: event.organizationId,
          reportType,
          config,
          createdBy: userId,
        };

        const validated = insertReportSchema.parse(reportData);

        const [newReport] = await db
          .insert(reports)
          .values({
            ...validated,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return res.status(201).json(newReport);
      } catch (error: unknown) {
        console.error("Error creating event report:", error);
        if (error instanceof ZodError) {
          return res.status(400).json({ message: "Invalid report data", errors: error.errors });
        }
        const message = error instanceof Error ? error.message : "Failed to create event report";
        return res.status(500).json({ message });
      }
    }
  );

  /**
   * POST /api/events/:eventId/quick-report
   * Generate a quick one-click report for an event
   */
  app.post(
    "/api/events/:eventId/quick-report",
    requireAuth,
    reportGenerationLimiter,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { eventId } = req.params;
        const userId = req.user!.id;
        const { reportType = 'team' } = req.body;

        // Check access
        const canAccess = await canAccessEventReports(userId, eventId, eventService);
        if (!canAccess) {
          return res.status(403).json({ message: "Not authorized to generate event reports" });
        }

        // Get event details
        const event = await eventService.getEvent(eventId, userId);
        if (!event) {
          return res.status(404).json({ message: "Event not found" });
        }

        // Get event metrics using the dedicated service
        const eventMetrics = await eventMetricsService.listEventMetrics(eventId);
        const metricCodes = eventMetrics.map((m) => m.metricCode);

        if (metricCodes.length === 0) {
          return res.status(400).json({ message: "No metrics configured for this event" });
        }

        // Build report config
        const config: Record<string, unknown> = {
          eventId,
          includeEventPercentiles: true,
          timeframe: {
            type: 'custom',
            customStart: event.startDate ? new Date(event.startDate).toISOString().split('T')[0] : undefined,
            customEnd: event.endDate ? new Date(event.endDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          },
          metrics: metricCodes,
        };

        // For individual reports, get athlete from registrations
        let athleteId: string | undefined;
        if (reportType === 'individual') {
          const registrations = await eventRegistrationService.listRegistrations(eventId, userId);
          const approvedRegistrations = registrations.filter(
            (r) => r.status === 'approved' || r.status === 'checked_in'
          );

          if (approvedRegistrations.length === 0) {
            return res.status(400).json({ message: "No athletes registered for this event" });
          }

          athleteId = approvedRegistrations[0].userId;
          config.athleteId = athleteId;
        }

        // Create report record
        const reportData = {
          name: `${event.name} - ${reportType === 'team' ? 'Team Summary' : 'Individual Report'}`,
          organizationId: event.organizationId,
          reportType,
          config,
          createdBy: userId,
        };

        const validated = insertReportSchema.parse(reportData);

        const [newReport] = await db
          .insert(reports)
          .values({
            ...validated,
            id: crypto.randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        // Generate report data using the correct service method signatures
        let generatedData;
        if (reportType === 'team') {
          generatedData = await reportService.generateTeamReport(newReport.id, userId);
        } else {
          if (!athleteId) {
            return res.status(400).json({ message: "Athlete ID required for individual report" });
          }
          generatedData = await reportService.generateIndividualReport(newReport.id, userId, athleteId);
        }

        return res.status(201).json({
          report: newReport,
          data: generatedData,
          generatedAt: new Date().toISOString(),
        });
      } catch (error: unknown) {
        console.error("Error generating quick event report:", error);
        if (error instanceof ZodError) {
          return res.status(400).json({ message: "Invalid report data", errors: error.errors });
        }
        const message = error instanceof Error ? error.message : "Failed to generate quick report";
        return res.status(500).json({ message });
      }
    }
  );

  /**
   * POST /api/events/:eventId/athletes/:athleteId/eval-report/preview
   * Returns the eval report model as JSON. Saves nothing.
   */
  app.post(
    "/api/events/:eventId/athletes/:athleteId/eval-report/preview",
    requireAuth,
    evalReadLimiter,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const target = await resolveEvalTarget(req, res);
        if (!target) return;
        const body = evalReportRequestSchema.parse(req.body ?? {});
        const model = await buildEvalReportModel(db, {
          event: target.event,
          athleteId: target.athleteId,
          selection: body.selection ?? {},
          load: body.load ?? null,
          coachNote: body.coachNote ?? null,
          overrides: { strengths: body.strengthsOverride, developmentAreas: body.developmentAreasOverride, limiter: body.limiterOverride },
        });
        return res.json({ model });
      } catch (error: unknown) {
        return sendEvalError(res, error, "Failed to preview eval report");
      }
    }
  );

  /**
   * POST /api/events/:eventId/athletes/:athleteId/eval-report
   * Builds the eval report model and saves it as a new reports row (every generation is a new row).
   */
  app.post(
    "/api/events/:eventId/athletes/:athleteId/eval-report",
    requireAuth,
    reportGenerationLimiter,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const target = await resolveEvalTarget(req, res);
        if (!target) return;
        const body = evalReportRequestSchema.parse(req.body ?? {});
        const selection = body.selection ?? {};
        const model = await buildEvalReportModel(db, {
          event: target.event,
          athleteId: target.athleteId,
          selection,
          load: body.load ?? null,
          coachNote: body.coachNote ?? null,
          overrides: { strengths: body.strengthsOverride, developmentAreas: body.developmentAreasOverride, limiter: body.limiterOverride },
        });
        const parsedConfig = evalReportConfigSchema.safeParse({
          eventId: target.eventId,
          athleteId: target.athleteId,
          metrics: model.metrics.map((m) => m.code),
          selection,
          load: body.load ?? null,
          coachNote: body.coachNote ?? null,
          strengthsOverride: body.strengthsOverride,
          developmentAreasOverride: body.developmentAreasOverride,
          limiterOverride: body.limiterOverride,
          model,
        });
        // The model is built by the server: a config that does not validate is a server fault, not a bad request
        if (!parsedConfig.success) {
          console.error("Eval report config failed validation", parsedConfig.error.errors);
          return res.status(500).json({ message: "Failed to save eval report" });
        }
        const config = parsedConfig.data;

        const [report] = await db
          .insert(reports)
          .values({
            id: crypto.randomUUID(),
            organizationId: target.organizationId,
            // The legacy session admin (id "admin") has no users row, so createdBy must be null (FK to users)
            createdBy: req.user!.id === "admin" ? null : req.user!.id,
            name: `${model.athlete.name} - Eval Report - ${model.eventDate}`.slice(0, 200),
            reportType: EVAL_REPORT_TYPE,
            config,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return res.status(201).json({ report, model });
      } catch (error: unknown) {
        return sendEvalError(res, error, "Failed to save eval report");
      }
    }
  );

  /**
   * GET /api/events/:eventId/athletes/:athleteId/eval-report/defaults
   * Pre-fill for the selection screen: the latest saved eval report for this event and athlete, else computed defaults.
   */
  app.get(
    "/api/events/:eventId/athletes/:athleteId/eval-report/defaults",
    requireAuth,
    evalReadLimiter,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const target = await resolveEvalTarget(req, res);
        if (!target) return;
        const [inputs, [latest]] = await Promise.all([
          loadEvalReportInputs(db, { event: target.event, athleteId: target.athleteId }),
          db
            .select()
            .from(reports)
            .where(
              and(
                eq(reports.organizationId, target.organizationId),
                eq(reports.reportType, EVAL_REPORT_TYPE),
                sql`${reports.config}->>'eventId' = ${target.eventId}`,
                sql`${reports.config}->>'athleteId' = ${target.athleteId}`,
              ),
            )
            .orderBy(desc(reports.createdAt))
            .limit(1),
        ]);
        // Deliberately returns only selection, load and coachNote from the saved config: the strengths, development
        // and limiter overrides are per-report edits and are not restored onto a new report.
        const computed = computeEvalDefaults({ ...inputs, selection: {}, load: null, coachNote: null, overrides: {} });
        const saved = latest ? evalReportConfigSchema.safeParse(latest.config) : null;
        if (latest && saved?.success) {
          const { selection, load, coachNote } = saved.data;
          return res.json({ source: "saved", reportId: latest.id, selection, load, coachNote, offered: computed.offered });
        }
        return res.json({ source: "computed", ...computed });
      } catch (error: unknown) {
        return sendEvalError(res, error, "Failed to load eval report defaults");
      }
    }
  );
}
