/**
 * Export routes for CSV data exports
 *
 * Provides endpoints to export athletes, measurements, and teams data
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth } from "../middleware";
import { escapeCSVField } from "../utils/csv-utils";

// Extended measurement filters for export functionality
interface MeasurementFilters {
  userId?: string;
  athleteId?: string;
  playerId?: string;
  teamIds?: string[];
  organizationId?: string;
  metric?: string;
  dateFrom?: string;
  dateTo?: string;
  birthYearFrom?: number;
  birthYearTo?: number;
  ageFrom?: number;
  ageTo?: number;
  search?: string;
  sport?: string;
  gender?: string;
  position?: string;
  includeUnverified?: boolean;
}

export function registerExportRoutes(app: Express) {
  /**
   * Export athletes to CSV
   * GET /api/export/athletes
   */
  app.get("/api/export/athletes", requireAuth, async (req: Request, res: Response) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get all athletes with comprehensive data
      const athletes = await storage.getAthletes();

      // Transform to CSV format with all database fields
      const csvHeaders = [
        'id', 'firstName', 'lastName', 'fullName', 'username', 'emails', 'phoneNumbers',
        'birthDate', 'birthYear', 'graduationYear', 'school', 'sports', 'height', 'weight',
        'teams', 'isActive', 'createdAt'
      ];

      const csvRows = (athletes as any[]).map((athlete: any) => {
        const teams = athlete.teams ? athlete.teams.map((t: any) => t.name).join(';') : '';
        const emails = Array.isArray(athlete.emails) ? athlete.emails.join(';') : (athlete.emails || '');
        const phoneNumbers = Array.isArray(athlete.phoneNumbers) ? athlete.phoneNumbers.join(';') : (athlete.phoneNumbers || '');
        const sports = Array.isArray(athlete.sports) ? athlete.sports.join(';') : (athlete.sports || '');

        return [
          athlete.id,
          athlete.firstName,
          athlete.lastName,
          athlete.fullName,
          athlete.username,
          emails,
          phoneNumbers,
          athlete.birthDate || '',
          athlete.birthYear || '',
          athlete.graduationYear || '',
          athlete.school || '',
          sports,
          athlete.height || '',
          athlete.weight || '',
          teams,
          athlete.isActive,
          athlete.createdAt
        ].map(escapeCSVField).join(',');
      });

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="athletes.csv"');
      res.setHeader('X-Route-Source', 'export-routes');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting athletes:", error);
      res.status(500).json({ message: "Failed to export athletes" });
    }
  });

  /**
   * Export measurements to CSV
   * GET /api/export/measurements
   */
  app.get("/api/export/measurements", requireAuth, async (req: Request, res: Response) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Extract query parameters for filtering
      const {playerId, teamIds, metric, dateFrom, dateTo, birthYearFrom, birthYearTo, ageFrom, ageTo, search, sport, gender, organizationId } = req.query;

      const filters: MeasurementFilters = {
        playerId: playerId as string,
        teamIds: teamIds ? (teamIds as string).split(',') : undefined,
        metric: metric as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
        birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
        ageFrom: ageFrom ? parseInt(ageFrom as string) : undefined,
        ageTo: ageTo ? parseInt(ageTo as string) : undefined,
        search: search as string,
        sport: sport as string,
        gender: gender as string,
        organizationId: organizationId as string,
        includeUnverified: true
      };

      // Get measurements with filtering
      const measurements = await storage.getMeasurements(filters);

      // Transform to CSV format with all database fields including gender
      const csvHeaders = [
        'id', 'firstName', 'lastName', 'fullName', 'birthYear', 'gender', 'teams',
        'date', 'age', 'metric', 'value', 'units', 'flyInDistance', 'notes',
        'submittedBy', 'verifiedBy', 'isVerified', 'createdAt'
      ];

      const csvRows = measurements.map(measurement => {
        const user = measurement.user;
        const teams = user?.teams ? user.teams.map((t: any) => t.name).join(';') : '';
        const submittedBy = measurement.submittedBy || '';
        const verifiedBy = measurement.verifiedBy || '';

        return [
          measurement.id,
          user?.firstName || '',
          user?.lastName || '',
          user?.fullName || '',
          user?.birthYear || '',
          user?.gender || '',
          teams,
          measurement.date,
          measurement.age,
          measurement.metric,
          measurement.value,
          measurement.units,
          measurement.flyInDistance || '',
          measurement.notes || '',
          submittedBy,
          verifiedBy,
          measurement.isVerified,
          measurement.createdAt
        ].map(escapeCSVField).join(',');
      });

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="measurements.csv"');
      res.setHeader('X-Route-Source', 'export-routes');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting measurements:", error);
      res.status(500).json({ message: "Failed to export measurements" });
    }
  });

  /**
   * Export teams to CSV
   * GET /api/export/teams
   */
  app.get("/api/export/teams", requireAuth, async (req: Request, res: Response) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get all teams with comprehensive data
      const teams = await storage.getTeams();

      // Transform to CSV format with all database fields
      const csvHeaders = [
        'id', 'name', 'organizationId', 'organizationName', 'level', 'notes', 'createdAt'
      ];

      const csvRows = teams.map(team => {
        return [
          team.id,
          team.name,
          team.organizationId,
          team.organization?.name || '',
          team.level || '',
          team.notes || '',
          team.createdAt
        ].map(field => {
          // Escape commas and quotes for CSV (teams don't need formula sanitization)
          const value = String(field || '');
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',');
      });

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="teams.csv"');
      res.setHeader('X-Route-Source', 'export-routes');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting teams:", error);
      res.status(500).json({ message: "Failed to export teams" });
    }
  });
}
