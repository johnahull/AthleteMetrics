/**
 * Global search service for command palette functionality
 * Provides unified search across athletes (users), teams, and measurements
 */

import { BaseService } from "./base-service";
import { users, teams, measurements, userOrganizations, userTeams } from "@shared/schema";
import { sql, or, and, ilike, desc, asc, eq, isNull } from "drizzle-orm";
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
   * Uses PostgreSQL ILIKE with trigram indexes for fast fuzzy matching
   * Optimized with single query using subquery for team names (no N+1)
   */
  private async searchAthletes(
    query: string,
    organizationId: string,
    limit: number
  ): Promise<AthleteSearchResult[]> {
    try {
      // Use ILIKE for pattern matching with trigram GIN indexes
      // Migration 0035 creates gin_trgm_ops indexes for fast ILIKE searches
      const searchPattern = `%${query}%`;

      // Single query with subquery for team name - avoids N+1 problem
      const results = await db
        .select({
          id: users.id,
          name: users.fullName,
          birthYear: users.birthYear,
          gender: users.gender,
          team: sql<string | null>`(
            SELECT t.name
            FROM user_teams ut
            INNER JOIN teams t ON ut.team_id = t.id
            WHERE ut.user_id = ${users.id}
              AND ut.is_active = true
              AND ut.left_at IS NULL
            ORDER BY ut.joined_at DESC
            LIMIT 1
          )`,
        })
        .from(users)
        .innerJoin(userOrganizations, eq(userOrganizations.userId, users.id))
        .where(
          and(
            eq(userOrganizations.organizationId, organizationId),
            isNull(users.deletedAt), // Exclude soft-deleted users
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

      return results.map(result => ({
        id: result.id,
        name: result.name,
        team: result.team,
        birthYear: result.birthYear,
        gender: result.gender,
      }));
    } catch (error) {
      console.error("Error searching athletes:", error);
      return [];
    }
  }

  /**
   * Search teams within an organization
   * Optimized with single query using subquery for athlete counts (no N+1)
   */
  private async searchTeams(
    query: string,
    organizationId: string,
    limit: number
  ): Promise<TeamSearchResult[]> {
    try {
      const searchPattern = `%${query}%`;

      // Single query with subquery for athlete count - avoids N+1 problem
      const results = await db
        .select({
          id: teams.id,
          name: teams.name,
          level: teams.level,
          athleteCount: sql<number>`(
            SELECT COUNT(DISTINCT ut.user_id)
            FROM user_teams ut
            WHERE ut.team_id = ${teams.id}
              AND ut.is_active = true
              AND ut.left_at IS NULL
          )`,
        })
        .from(teams)
        .where(
          and(
            eq(teams.organizationId, organizationId),
            eq(teams.isArchived, false), // Only active teams
            ilike(teams.name, searchPattern)
          )
        )
        .orderBy(asc(teams.name))
        .limit(limit);

      return results.map(result => ({
        id: result.id,
        name: result.name,
        level: result.level,
        athleteCount: Number(result.athleteCount || 0),
      }));
    } catch (error) {
      console.error("Error searching teams:", error);
      return [];
    }
  }

  /**
   * Search measurements within an organization
   * Searches by athlete name or metric type
   * Uses Drizzle schema for type-safe joins (consistent with athlete/team searches)
   */
  private async searchMeasurements(
    query: string,
    organizationId: string,
    limit: number
  ): Promise<MeasurementSearchResult[]> {
    try {
      const searchPattern = `%${query}%`;

      // Search measurements by athlete name or metric type
      // Uses proper Drizzle schema joins for type safety and consistency
      const results = await db
        .select({
          id: measurements.id,
          athleteName: users.fullName,
          metric: measurements.metric,
          date: measurements.date,
          value: measurements.value,
        })
        .from(measurements)
        .innerJoin(users, eq(measurements.userId, users.id))
        .innerJoin(userOrganizations, eq(userOrganizations.userId, users.id))
        .where(
          and(
            eq(userOrganizations.organizationId, organizationId),
            isNull(users.deletedAt), // Exclude soft-deleted users
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
