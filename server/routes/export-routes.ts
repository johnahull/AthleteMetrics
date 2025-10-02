/**
 * Data export routes
 */

import type { Express } from "express";
import { requireAuth, asyncHandler } from "../middleware";
import { storage } from "../storage";

export function registerExportRoutes(app: Express) {
  /**
   * Export athletes to CSV
   */
  app.get("/api/export/athletes", requireAuth, asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    const filters = { organizationId: organizationId as string | undefined };
    const athletes = await storage.getAthletes(filters);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=athletes.csv');

    // Simple CSV generation
    const headers = ['ID', 'First Name', 'Last Name', 'Email', 'Birthdate', 'Gender'].join(',');
    const rows = athletes.map(a =>
      [a.id, a.firstName, a.lastName, a.emails?.[0] || '', a.birthDate || '', a.gender || ''].join(',')
    );

    res.send([headers, ...rows].join('\n'));
  }));

  /**
   * Export measurements to CSV
   */
  app.get("/api/export/measurements", requireAuth, asyncHandler(async (req, res) => {
    const { organizationId, athleteId, metric } = req.query;

    const filters = {
      organizationId: organizationId as string | undefined,
      athleteId: athleteId as string | undefined,
      metric: metric as string | undefined
    };

    const measurements = await storage.getMeasurements(filters);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=measurements.csv');

    const headers = ['Date', 'Athlete', 'Metric', 'Value', 'Units', 'Verified'].join(',');
    const rows = measurements.map(m =>
      [m.date, `${m.user?.firstName} ${m.user?.lastName}`, m.metric, m.value, m.units || '', m.isVerified || 'false'].join(',')
    );

    res.send([headers, ...rows].join('\n'));
  }));

  /**
   * Export teams to CSV
   */
  app.get("/api/export/teams", requireAuth, asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    const teams = await storage.getTeams(organizationId as string | undefined);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=teams.csv');

    const headers = ['ID', 'Name', 'Level', 'Season', 'Is Archived'].join(',');
    const rows = teams.map(t =>
      [t.id, t.name, t.level || '', t.season || '', t.isArchived || 'false'].join(',')
    );

    res.send([headers, ...rows].join('\n'));
  }));
}
