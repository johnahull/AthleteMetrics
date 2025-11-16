/**
 * Global search service for command palette functionality
 * Provides unified search across athletes (users), teams, and measurements
 */

import { BaseService } from "./base-service";
import { users, teams, measurements } from "@shared/schema";
import { sql, or, and, ilike, desc, asc } from "drizzle-orm";
import { db } from "../db";

export interface GlobalSearchResult {
  results: {
    athletes: AthleteSearchResult[];
    teams: TeamSearchResult[];
    measurements: MeasurementSearchResult[];
  };
  total: number;
}

export interface AthleteSearchResult {
  id: string;
  name: string;
  team: string | null;
  birthYear: number | null;
  gender: string | null;
}

export interface TeamSearchResult {
  id: string;
  name: string;
  level: string | null;
  athleteCount: number;
}

export interface MeasurementSearchResult {
  id: string;
  athleteName: string;
  metric: string;
  date: string;
  value: number;
}

export class GlobalSearchService extends BaseService {
  /**
   * Get user organizations (public access to storage method)
   */
  async getUserOrganizations(userId: string) {
    return this.storage.getUserOrganizations(userId);
  }

  /**
   * Perform global search across athletes, teams, and measurements
   */
  async globalSearch(
    query: string,
    userId: string,
    organizationId: string,
    options: {
      limit?: number;
      includeAthletes?: boolean;
      includeTeams?: boolean;
      includeMeasurements?: boolean;
    } = {}
  ): Promise<GlobalSearchResult> {
    const {
      limit = 20,
      includeAthletes = true,
      includeTeams = true,
      includeMeasurements = true,
    } = options;

    const resultsPerCategory = Math.ceil(limit / 3); // Distribute limit across categories

    // Execute searches in parallel
    const [athleteResults, teamResults, measurementResults] = await Promise.all([
      includeAthletes ? this.searchAthletes(query, organizationId, resultsPerCategory) : Promise.resolve([]),
      includeTeams ? this.searchTeams(query, organizationId, resultsPerCategory) : Promise.resolve([]),
      includeMeasurements ? this.searchMeasurements(query, organizationId, resultsPerCategory) : Promise.resolve([]),
    ]);

    const total = athleteResults.length + teamResults.length + measurementResults.length;

    return {
      results: {
        athletes: athleteResults,
        teams: teamResults,
        measurements: measurementResults,
      },
      total,
    };
  }

  /**
   * Search athletes (users) within an organization
   * Uses PostgreSQL full-text search for fuzzy matching
   */
  private async searchAthletes(
    query: string,
    organizationId: string,
    limit: number
  ): Promise<AthleteSearchResult[]> {
    try {
      // Use ILIKE for simple pattern matching (PostgreSQL case-insensitive)
      // For better fuzzy search, we'll use full-text search with indexes
      const searchPattern = `%${query}%`;

      const results = await db
        .select({
          id: users.id,
          name: users.fullName,
          birthYear: users.birthYear,
          gender: users.gender,
        })
        .from(users)
        .innerJoin(sql`user_organizations`, sql`user_organizations.user_id = ${users.id}`)
        .where(
          and(
            sql`user_organizations.organization_id = ${organizationId}`,
            sql`${users.deletedAt} IS NULL`, // Exclude soft-deleted users
            or(
              ilike(users.fullName, searchPattern),
              ilike(users.firstName, searchPattern),
              ilike(users.lastName, searchPattern),
              ilike(users.username, searchPattern)
            )
          )
        )
        .orderBy(asc(users.fullName))
        .limit(limit);

      // For each athlete, get their primary team (if any)
      const athletesWithTeams = await Promise.all(
        results.map(async (athlete) => {
          // Get athlete's first active team
          const userTeam = await db
            .select({
              teamName: teams.name,
            })
            .from(sql`user_teams`)
            .innerJoin(teams, sql`user_teams.team_id = ${teams.id}`)
            .where(
              and(
                sql`user_teams.user_id = ${athlete.id}`,
                sql`user_teams.is_active = true`,
                sql`user_teams.left_at IS NULL`
              )
            )
            .limit(1);

          return {
            id: athlete.id,
            name: athlete.name,
            team: userTeam[0]?.teamName || null,
            birthYear: athlete.birthYear,
            gender: athlete.gender,
          };
        })
      );

      return athletesWithTeams;
    } catch (error) {
      console.error("Error searching athletes:", error);
      return [];
    }
  }

  /**
   * Search teams within an organization
   */
  private async searchTeams(
    query: string,
    organizationId: string,
    limit: number
  ): Promise<TeamSearchResult[]> {
    try {
      const searchPattern = `%${query}%`;

      const results = await db
        .select({
          id: teams.id,
          name: teams.name,
          level: teams.level,
        })
        .from(teams)
        .where(
          and(
            sql`${teams.organizationId} = ${organizationId}`,
            sql`${teams.isArchived} = false`, // Only active teams
            ilike(teams.name, searchPattern)
          )
        )
        .orderBy(asc(teams.name))
        .limit(limit);

      // Get athlete count for each team
      const teamsWithCounts = await Promise.all(
        results.map(async (team) => {
          const countResult = await db
            .select({
              count: sql<number>`COUNT(DISTINCT user_teams.user_id)`,
            })
            .from(sql`user_teams`)
            .where(
              and(
                sql`user_teams.team_id = ${team.id}`,
                sql`user_teams.is_active = true`,
                sql`user_teams.left_at IS NULL`
              )
            );

          return {
            id: team.id,
            name: team.name,
            level: team.level,
            athleteCount: Number(countResult[0]?.count || 0),
          };
        })
      );

      return teamsWithCounts;
    } catch (error) {
      console.error("Error searching teams:", error);
      return [];
    }
  }

  /**
   * Search measurements within an organization
   * Searches by athlete name or metric type
   */
  private async searchMeasurements(
    query: string,
    organizationId: string,
    limit: number
  ): Promise<MeasurementSearchResult[]> {
    try {
      const searchPattern = `%${query}%`;

      // Search measurements by athlete name or metric type
      const results = await db
        .select({
          id: measurements.id,
          athleteName: users.fullName,
          metric: measurements.metric,
          date: measurements.date,
          value: measurements.value,
        })
        .from(measurements)
        .innerJoin(users, sql`${measurements.userId} = ${users.id}`)
        .innerJoin(sql`user_organizations`, sql`user_organizations.user_id = ${users.id}`)
        .where(
          and(
            sql`user_organizations.organization_id = ${organizationId}`,
            or(
              ilike(users.fullName, searchPattern),
              ilike(measurements.metric, searchPattern)
            )
          )
        )
        .orderBy(desc(measurements.date))
        .limit(limit);

      return results.map((row) => ({
        id: row.id,
        athleteName: row.athleteName,
        metric: row.metric,
        date: row.date,
        value: Number(row.value),
      }));
    } catch (error) {
      console.error("Error searching measurements:", error);
      return [];
    }
  }

  /**
   * Get suggested actions based on query
   * This will be used for command palette quick actions filtering
   */
  async getSuggestedActions(query: string): Promise<string[]> {
    const lowerQuery = query.toLowerCase();

    const actionKeywords: Record<string, string[]> = {
      'add-athlete': ['add', 'create', 'new', 'athlete', 'player'],
      'add-measurement': ['add', 'record', 'test', 'measurement', 'performance'],
      'batch-entry': ['batch', 'bulk', 'multiple', 'entry', 'import'],
      'add-team': ['add', 'create', 'team', 'group'],
      'import-csv': ['import', 'csv', 'upload', 'file'],
      'analytics': ['analytics', 'dashboard', 'stats', 'reports', 'chart'],
      'settings': ['settings', 'preferences', 'config'],
    };

    const matchedActions: string[] = [];

    for (const [actionId, keywords] of Object.entries(actionKeywords)) {
      const matches = keywords.some((keyword) => keyword.includes(lowerQuery) || lowerQuery.includes(keyword));
      if (matches) {
        matchedActions.push(actionId);
      }
    }

    return matchedActions;
  }
}
