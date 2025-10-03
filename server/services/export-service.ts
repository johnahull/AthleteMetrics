/**
 * Export service handling data exports to CSV
 */

import { BaseService } from "./base-service";
import type { User, Team, Measurement } from "@shared/schema";

/**
 * Escape a CSV field value
 * - Wraps in quotes if it contains comma, quote, or newline
 * - Doubles any quotes inside the value
 */
function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // Check if value needs to be quoted (contains comma, quote, or newline)
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    // Escape quotes by doubling them and wrap in quotes
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

export class ExportService extends BaseService {
  /**
   * Export athletes to CSV
   */
  async exportAthletes(
    organizationId: string | undefined,
    userId: string
  ): Promise<string> {
    try {
      this.logger.info('Exporting athletes to CSV', { organizationId, userId });

      // Check access to organization if specified
      if (organizationId) {
        await this.requireOrganizationAccess(userId, organizationId);
      }

      const athletes = await this.executeQuery(
        'exportAthletes',
        () => this.storage.getAthletes({ organizationId }),
        { userId, organizationId }
      );

      // Generate CSV
      const headers = ['ID', 'First Name', 'Last Name', 'Email', 'Birthdate', 'Gender'].join(',');
      const rows = athletes.map(a =>
        [
          escapeCsvField(a.id),
          escapeCsvField(a.firstName),
          escapeCsvField(a.lastName),
          escapeCsvField(a.emails?.[0] || ''),
          escapeCsvField(a.birthDate || ''),
          escapeCsvField(a.gender || '')
        ].join(',')
      );

      const csv = [headers, ...rows].join('\n');

      this.logger.info('Athletes exported', {
        userId,
        count: athletes.length
      });

      return csv;
    } catch (error) {
      this.handleError(error, 'exportAthletes');
    }
  }

  /**
   * Export measurements to CSV
   */
  async exportMeasurements(
    filters: {
      organizationId?: string;
      athleteId?: string;
      metric?: string;
    },
    userId: string
  ): Promise<string> {
    try {
      this.logger.info('Exporting measurements to CSV', { filters, userId });

      // Check access to organization if specified
      if (filters.organizationId) {
        await this.requireOrganizationAccess(userId, filters.organizationId);
      }

      const measurements = await this.executeQuery(
        'exportMeasurements',
        () => this.storage.getMeasurements(filters),
        { userId, filters }
      );

      // Generate CSV
      const headers = ['Date', 'Athlete', 'Metric', 'Value', 'Units', 'Verified'].join(',');
      const rows = measurements.map(m =>
        [
          escapeCsvField(m.date),
          escapeCsvField(`${m.user?.firstName} ${m.user?.lastName}`),
          escapeCsvField(m.metric),
          escapeCsvField(m.value),
          escapeCsvField(m.units || ''),
          escapeCsvField(m.isVerified ? 'true' : 'false')
        ].join(',')
      );

      const csv = [headers, ...rows].join('\n');

      this.logger.info('Measurements exported', {
        userId,
        count: measurements.length
      });

      return csv;
    } catch (error) {
      this.handleError(error, 'exportMeasurements');
    }
  }

  /**
   * Export teams to CSV
   */
  async exportTeams(
    organizationId: string | undefined,
    userId: string
  ): Promise<string> {
    try {
      this.logger.info('Exporting teams to CSV', { organizationId, userId });

      // Check access to organization if specified
      if (organizationId) {
        await this.requireOrganizationAccess(userId, organizationId);
      }

      const teams = await this.executeQuery(
        'exportTeams',
        () => this.storage.getTeams(organizationId),
        { userId, organizationId }
      );

      // Generate CSV
      const headers = ['ID', 'Name', 'Level', 'Season', 'Is Archived'].join(',');
      const rows = teams.map(t =>
        [
          escapeCsvField(t.id),
          escapeCsvField(t.name),
          escapeCsvField(t.level || ''),
          escapeCsvField(t.season || ''),
          escapeCsvField(t.isArchived ? 'true' : 'false')
        ].join(',')
      );

      const csv = [headers, ...rows].join('\n');

      this.logger.info('Teams exported', {
        userId,
        count: teams.length
      });

      return csv;
    } catch (error) {
      this.handleError(error, 'exportTeams');
    }
  }
}
