/**
 * Export service handling data exports to CSV
 */

import { BaseService } from "./base-service";
import type { User, Team, Measurement } from "@shared/schema";

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
        [a.id, a.firstName, a.lastName, a.emails?.[0] || '', a.birthDate || '', a.gender || ''].join(',')
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
        [m.date, `${m.user?.firstName} ${m.user?.lastName}`, m.metric, m.value, m.units || '', m.isVerified || 'false'].join(',')
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
        [t.id, t.name, t.level || '', t.season || '', t.isArchived || 'false'].join(',')
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
