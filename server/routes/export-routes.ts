/**
 * Data export routes
 */

import type { Express } from "express";
import { requireAuth } from "../middleware";
import { asyncHandler } from "../utils/errors";
import { ExportService } from "../services/export-service";

const exportService = new ExportService();

export function registerExportRoutes(app: Express) {
  /**
   * Export athletes to CSV
   */
  app.get("/api/export/athletes", requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId } = req.query;

    const csv = await exportService.exportAthletes(
      organizationId as string | undefined,
      req.session.user!.id
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=athletes.csv');
    res.send(csv);
  }));

  /**
   * Export measurements to CSV
   */
  app.get("/api/export/measurements", requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId, athleteId, metric } = req.query;

    const csv = await exportService.exportMeasurements(
      {
        organizationId: organizationId as string | undefined,
        athleteId: athleteId as string | undefined,
        metric: metric as string | undefined
      },
      req.session.user!.id
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=measurements.csv');
    res.send(csv);
  }));

  /**
   * Export teams to CSV
   */
  app.get("/api/export/teams", requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId } = req.query;

    const csv = await exportService.exportTeams(
      organizationId as string | undefined,
      req.session.user!.id
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=teams.csv');
    res.send(csv);
  }));
}
