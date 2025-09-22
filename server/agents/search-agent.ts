/**
 * Search Agent - Provides advanced search capabilities across entities
 */

import { AbstractBaseAgent } from '@shared/agents/base-agent';
import { SearchAgent, SearchResults, AthleteSearchResults, TeamSearchResults, AthleteSearchFilters, TeamSearchFilters, SearchCriteria } from '@shared/agents/contracts';
import { AgentContext, AgentResult, AgentHealth } from '@shared/agents/types';
import { getDatabaseAgent } from './database-agent';
import { getSecurityAgent } from './security-agent';

export class SearchAgentImpl extends AbstractBaseAgent implements SearchAgent {
  private databaseAgent: any;
  private securityAgent: any;

  constructor() {
    super('SearchAgent', '1.0.0', ['DatabaseAgent', 'SecurityAgent'], {
      enabled: true,
      logLevel: 'info',
      timeout: 10000,
      retries: 2,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 30000
      }
    });
  }

  protected async onInitialize(): Promise<void> {
    this.databaseAgent = getDatabaseAgent();
    this.securityAgent = getSecurityAgent();

    // Initialize dependencies
    await this.databaseAgent.initialize();
    await this.securityAgent.initialize();

    this.log('info', 'Search agent initialized successfully');
  }

  protected async onShutdown(): Promise<void> {
    this.log('info', 'Search agent shut down successfully');
  }

  protected async onHealthCheck(): Promise<AgentHealth> {
    try {
      // Check dependencies
      const dbHealth = await this.databaseAgent.healthCheck();
      const securityHealth = await this.securityAgent.healthCheck();

      if (dbHealth.status !== 'healthy' || securityHealth.status !== 'healthy') {
        return {
          status: 'degraded',
          message: 'One or more dependencies are unhealthy',
          lastCheck: new Date(),
          dependencies: {
            database: dbHealth,
            security: securityHealth
          }
        };
      }

      // Test basic search functionality
      const testResult = await this.testSearchCapabilities();

      return {
        status: testResult ? 'healthy' : 'degraded',
        message: testResult ? 'Search agent is functioning properly' : 'Search capabilities test failed',
        lastCheck: new Date(),
        dependencies: {
          database: dbHealth,
          security: securityHealth
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Search agent health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastCheck: new Date()
      };
    }
  }

  async search(query: string, entities: string[], context: AgentContext): Promise<AgentResult<SearchResults>> {
    try {
      this.validateRequired({ query, entities }, ['query', 'entities']);

      this.log('info', 'Global search request', {
        query: query.substring(0, 50),
        entities,
        context: context.requestId
      });

      // Sanitize search query
      const sanitizedQueryResult = await this.securityAgent.sanitizeInput(
        query,
        { allowedChars: 'search' },
        context
      );

      if (!sanitizedQueryResult.success || !sanitizedQueryResult.data) {
        return this.createErrorResult('Invalid search query', 'INVALID_SEARCH_QUERY');
      }

      const sanitizedQuery = sanitizedQueryResult.data;

      if (!sanitizedQuery.trim()) {
        return this.createSuccessResult({
          results: [],
          total: 0,
          facets: {}
        });
      }

      // Execute search across all requested entities
      const searchPromises = entities.map(entity => this.searchEntity(entity, sanitizedQuery, context));
      const entityResults = await Promise.allSettled(searchPromises);

      const results: SearchResults['results'] = [];
      const facets: Record<string, Array<{ value: string; count: number }>> = {};

      for (let i = 0; i < entityResults.length; i++) {
        const result = entityResults[i];
        const entity = entities[i];

        if (result.status === 'fulfilled' && result.value.success && result.value.data) {
          results.push(...(result.value.data.results || []));

          // Merge facets
          Object.entries(result.value.data.facets || {}).forEach(([key, values]) => {
            if (!facets[key]) facets[key] = [];
            if (Array.isArray(values)) {
              facets[key].push(...values);
            }
          });
        } else {
          this.log('warn', `Search failed for entity ${entity}`, {
            error: result.status === 'rejected' ? result.reason : result.value.error
          });
        }
      }

      // Sort results by relevance score
      results.sort((a, b) => b.score - a.score);

      // Limit results
      const maxResults = 50;
      const limitedResults = results.slice(0, maxResults);

      return this.createSuccessResult({
        results: limitedResults,
        total: results.length,
        facets
      });

    } catch (error) {
      this.log('error', 'Global search failed', {
        query,
        entities,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'SEARCH_FAILED');
    }
  }

  async searchAthletes(query: string, filters: AthleteSearchFilters, context: AgentContext): Promise<AgentResult<AthleteSearchResults>> {
    try {
      this.validateRequired({ query, filters }, ['query', 'filters']);

      this.log('info', 'Athlete search request', {
        query: query.substring(0, 50),
        filters,
        context: context.requestId
      });

      // Sanitize search query
      const sanitizedQueryResult = await this.securityAgent.sanitizeInput(
        query,
        { allowedChars: 'search' },
        context
      );

      if (!sanitizedQueryResult.success) {
        return this.createErrorResult('Invalid search query', 'INVALID_SEARCH_QUERY');
      }

      const sanitizedQuery = sanitizedQueryResult.data || '';

      // Build search query
      let sql = `
        SELECT DISTINCT
          u.id,
          u.first_name,
          u.last_name,
          u.emails,
          u.birth_date,
          u.gender,
          u.height,
          u.weight,
          u.sports,
          u.positions,
          u.graduation_year,
          u.school,
          u.photo_url,
          u.organization_id,
          u.created_at,
          u.updated_at,
          ts_rank(to_tsvector('english', u.first_name || ' ' || u.last_name || ' ' || COALESCE(u.school, '')), plainto_tsquery('english', $1)) as relevance_score
        FROM users u
        WHERE u.role = 'athlete'
          AND u.is_active = 'true'
      `;

      const params: any[] = [sanitizedQuery];
      let paramIndex = 2;

      // Add text search if query is provided
      if (sanitizedQuery.trim()) {
        sql += ` AND (
          to_tsvector('english', u.first_name || ' ' || u.last_name || ' ' || COALESCE(u.school, '')) @@ plainto_tsquery('english', $1)
          OR u.first_name ILIKE $${paramIndex}
          OR u.last_name ILIKE $${paramIndex}
          OR u.school ILIKE $${paramIndex}
        )`;
        params.push(`%${sanitizedQuery}%`);
        paramIndex++;
      }

      // Apply filters
      if (filters.organizationId) {
        sql += ` AND u.organization_id = $${paramIndex}`;
        params.push(filters.organizationId);
        paramIndex++;
      }

      if (filters.sports && filters.sports.length > 0) {
        sql += ` AND u.sports && $${paramIndex}`;
        params.push(filters.sports);
        paramIndex++;
      }

      if (filters.graduationYear) {
        sql += ` AND u.graduation_year = $${paramIndex}`;
        params.push(filters.graduationYear);
        paramIndex++;
      }

      if (filters.teams && filters.teams.length > 0) {
        sql += ` AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.user_id = u.id
          AND tm.team_id = ANY($${paramIndex})
          AND tm.is_active = true
        )`;
        params.push(filters.teams);
        paramIndex++;
      }

      // Add ordering
      if (sanitizedQuery.trim()) {
        sql += ` ORDER BY relevance_score DESC, u.last_name, u.first_name`;
      } else {
        sql += ` ORDER BY u.last_name, u.first_name`;
      }

      // Add limit
      sql += ` LIMIT 100`;

      // Execute search
      const athletesResult = await this.databaseAgent.query(sql, params, context);

      if (!athletesResult.success) {
        return this.createErrorResult('Athlete search query failed', 'SEARCH_QUERY_FAILED');
      }

      const athletes = athletesResult.data.map((row: any) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.emails?.[0] || '',
        birthDate: row.birth_date,
        gender: row.gender,
        height: row.height,
        weight: row.weight,
        sports: row.sports || [],
        positions: row.positions || [],
        graduationYear: row.graduation_year,
        school: row.school,
        photoUrl: row.photo_url,
        organizationId: row.organization_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      // Generate facets
      const facets = await this.generateAthleteFacets(filters, context);

      return this.createSuccessResult({
        athletes,
        total: athletes.length,
        facets
      });

    } catch (error) {
      this.log('error', 'Athlete search failed', {
        query,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'ATHLETE_SEARCH_FAILED');
    }
  }

  async searchTeams(query: string, filters: TeamSearchFilters, context: AgentContext): Promise<AgentResult<TeamSearchResults>> {
    try {
      this.validateRequired({ query, filters }, ['query', 'filters']);

      this.log('info', 'Team search request', {
        query: query.substring(0, 50),
        filters,
        context: context.requestId
      });

      // Sanitize search query
      const sanitizedQueryResult = await this.securityAgent.sanitizeInput(
        query,
        { allowedChars: 'search' },
        context
      );

      if (!sanitizedQueryResult.success) {
        return this.createErrorResult('Invalid search query', 'INVALID_SEARCH_QUERY');
      }

      const sanitizedQuery = sanitizedQueryResult.data || '';

      // Build search query
      let sql = `
        SELECT
          t.id,
          t.name,
          t.sport,
          t.level,
          t.season,
          t.organization_id,
          t.coach_id,
          t.created_at,
          t.updated_at,
          ts_rank(to_tsvector('english', t.name || ' ' || t.sport || ' ' || t.level), plainto_tsquery('english', $1)) as relevance_score
        FROM teams t
        WHERE t.is_active = 'true'
      `;

      const params: any[] = [sanitizedQuery];
      let paramIndex = 2;

      // Add text search if query is provided
      if (sanitizedQuery.trim()) {
        sql += ` AND (
          to_tsvector('english', t.name || ' ' || t.sport || ' ' || t.level) @@ plainto_tsquery('english', $1)
          OR t.name ILIKE $${paramIndex}
          OR t.sport ILIKE $${paramIndex}
          OR t.level ILIKE $${paramIndex}
        )`;
        params.push(`%${sanitizedQuery}%`);
        paramIndex++;
      }

      // Apply filters
      if (filters.organizationId) {
        sql += ` AND t.organization_id = $${paramIndex}`;
        params.push(filters.organizationId);
        paramIndex++;
      }

      if (filters.sports && filters.sports.length > 0) {
        sql += ` AND t.sport = ANY($${paramIndex})`;
        params.push(filters.sports);
        paramIndex++;
      }

      if (filters.levels && filters.levels.length > 0) {
        sql += ` AND t.level = ANY($${paramIndex})`;
        params.push(filters.levels);
        paramIndex++;
      }

      if (filters.seasons && filters.seasons.length > 0) {
        sql += ` AND t.season = ANY($${paramIndex})`;
        params.push(filters.seasons);
        paramIndex++;
      }

      // Add ordering
      if (sanitizedQuery.trim()) {
        sql += ` ORDER BY relevance_score DESC, t.name`;
      } else {
        sql += ` ORDER BY t.name`;
      }

      // Add limit
      sql += ` LIMIT 100`;

      // Execute search
      const teamsResult = await this.databaseAgent.query(sql, params, context);

      if (!teamsResult.success) {
        return this.createErrorResult('Team search query failed', 'SEARCH_QUERY_FAILED');
      }

      const teams = teamsResult.data.map((row: any) => ({
        id: row.id,
        name: row.name,
        sport: row.sport,
        level: row.level,
        season: row.season,
        organizationId: row.organization_id,
        coachId: row.coach_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      // Generate facets
      const facets = await this.generateTeamFacets(filters, context);

      return this.createSuccessResult({
        teams,
        total: teams.length,
        facets
      });

    } catch (error) {
      this.log('error', 'Team search failed', {
        query,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'TEAM_SEARCH_FAILED');
    }
  }

  async advancedSearch(criteria: SearchCriteria, context: AgentContext): Promise<AgentResult<SearchResults>> {
    try {
      this.log('info', 'Advanced search request', {
        criteria,
        context: context.requestId
      });

      // Use the global search but with more specific criteria
      const query = criteria.query || '';
      const results = await this.search(query, criteria.entities, context);

      if (!results.success) {
        return results;
      }

      // Apply additional filters from criteria
      let filteredResults = results.data!.results;

      // Apply sorting
      if (criteria.sort) {
        filteredResults = this.applySorting(filteredResults, criteria.sort);
      }

      // Apply pagination
      const offset = criteria.offset || 0;
      const limit = criteria.limit || 50;
      const paginatedResults = filteredResults.slice(offset, offset + limit);

      return this.createSuccessResult({
        results: paginatedResults,
        total: filteredResults.length,
        facets: results.data!.facets
      });

    } catch (error) {
      this.log('error', 'Advanced search failed', {
        criteria,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'ADVANCED_SEARCH_FAILED');
    }
  }

  async getSuggestions(query: string, entity: string, context: AgentContext): Promise<AgentResult<string[]>> {
    try {
      this.validateRequired({ query, entity }, ['query', 'entity']);

      // Sanitize query
      const sanitizedQueryResult = await this.securityAgent.sanitizeInput(
        query,
        { allowedChars: 'search' },
        context
      );

      if (!sanitizedQueryResult.success) {
        return this.createErrorResult('Invalid query', 'INVALID_QUERY');
      }

      const sanitizedQuery = sanitizedQueryResult.data || '';

      if (!sanitizedQuery.trim() || sanitizedQuery.length < 2) {
        return this.createSuccessResult([]);
      }

      let suggestions: string[] = [];

      switch (entity.toLowerCase()) {
        case 'athletes':
          suggestions = await this.getAthleteSuggestions(sanitizedQuery, context);
          break;
        case 'teams':
          suggestions = await this.getTeamSuggestions(sanitizedQuery, context);
          break;
        case 'sports':
          suggestions = await this.getSportSuggestions(sanitizedQuery, context);
          break;
        default:
          this.log('warn', `Unknown suggestion entity: ${entity}`);
          suggestions = [];
      }

      return this.createSuccessResult(suggestions.slice(0, 10)); // Limit to 10 suggestions

    } catch (error) {
      this.log('error', 'Get suggestions failed', {
        query,
        entity,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'SUGGESTIONS_FAILED');
    }
  }

  // Private helper methods

  private async searchEntity(entity: string, query: string, context: AgentContext): Promise<AgentResult<{ results: any[], facets: any }>> {
    switch (entity.toLowerCase()) {
      case 'athletes':
        const athleteResult = await this.searchAthletes(query, { organizationId: context.organizationId }, context);
        if (athleteResult.success) {
          return this.createSuccessResult({
            results: athleteResult.data!.athletes.map(athlete => ({
              entity: 'athlete',
              id: athlete.id,
              title: `${athlete.firstName} ${athlete.lastName}`,
              snippet: `${athlete.school || 'Unknown School'} - ${athlete.sports?.join(', ') || 'No sports'}`,
              score: 1.0,
              data: athlete
            })),
            facets: athleteResult.data!.facets
          });
        }
        return athleteResult as any;

      case 'teams':
        const teamResult = await this.searchTeams(query, { organizationId: context.organizationId }, context);
        if (teamResult.success) {
          return this.createSuccessResult({
            results: teamResult.data!.teams.map(team => ({
              entity: 'team',
              id: team.id,
              title: team.name,
              snippet: `${team.sport} - ${team.level} (${team.season})`,
              score: 1.0,
              data: team
            })),
            facets: teamResult.data!.facets
          });
        }
        return teamResult as any;

      default:
        return this.createErrorResult(`Unknown entity type: ${entity}`, 'UNKNOWN_ENTITY');
    }
  }

  private async generateAthleteFacets(filters: AthleteSearchFilters, context: AgentContext): Promise<any> {
    try {
      // Get sport facets
      const sportsResult = await this.databaseAgent.query(`
        SELECT unnest(sports) as sport, COUNT(*) as count
        FROM users
        WHERE role = 'athlete' AND is_active = 'true'
        ${filters.organizationId ? 'AND organization_id = $1' : ''}
        GROUP BY sport
        ORDER BY count DESC
        LIMIT 20
      `, filters.organizationId ? [filters.organizationId] : [], context);

      // Get graduation year facets
      const yearsResult = await this.databaseAgent.query(`
        SELECT graduation_year, COUNT(*) as count
        FROM users
        WHERE role = 'athlete' AND is_active = 'true' AND graduation_year IS NOT NULL
        ${filters.organizationId ? 'AND organization_id = $1' : ''}
        GROUP BY graduation_year
        ORDER BY graduation_year DESC
        LIMIT 10
      `, filters.organizationId ? [filters.organizationId] : [], context);

      return {
        sports: sportsResult.success ? sportsResult.data.map((row: any) => ({
          value: row.sport,
          count: parseInt(row.count)
        })) : [],
        graduationYears: yearsResult.success ? yearsResult.data.map((row: any) => ({
          value: row.graduation_year,
          count: parseInt(row.count)
        })) : [],
        teams: [] // Would require more complex query with team memberships
      };
    } catch (error) {
      this.log('warn', 'Failed to generate athlete facets', { error });
      return { sports: [], graduationYears: [], teams: [] };
    }
  }

  private async generateTeamFacets(filters: TeamSearchFilters, context: AgentContext): Promise<any> {
    try {
      // Get sport facets
      const sportsResult = await this.databaseAgent.query(`
        SELECT sport, COUNT(*) as count
        FROM teams
        WHERE is_active = 'true'
        ${filters.organizationId ? 'AND organization_id = $1' : ''}
        GROUP BY sport
        ORDER BY count DESC
      `, filters.organizationId ? [filters.organizationId] : [], context);

      // Get level facets
      const levelsResult = await this.databaseAgent.query(`
        SELECT level, COUNT(*) as count
        FROM teams
        WHERE is_active = 'true'
        ${filters.organizationId ? 'AND organization_id = $1' : ''}
        GROUP BY level
        ORDER BY count DESC
      `, filters.organizationId ? [filters.organizationId] : [], context);

      // Get season facets
      const seasonsResult = await this.databaseAgent.query(`
        SELECT season, COUNT(*) as count
        FROM teams
        WHERE is_active = 'true'
        ${filters.organizationId ? 'AND organization_id = $1' : ''}
        GROUP BY season
        ORDER BY season DESC
      `, filters.organizationId ? [filters.organizationId] : [], context);

      return {
        sports: sportsResult.success ? sportsResult.data.map((row: any) => ({
          value: row.sport,
          count: parseInt(row.count)
        })) : [],
        levels: levelsResult.success ? levelsResult.data.map((row: any) => ({
          value: row.level,
          count: parseInt(row.count)
        })) : [],
        seasons: seasonsResult.success ? seasonsResult.data.map((row: any) => ({
          value: row.season,
          count: parseInt(row.count)
        })) : []
      };
    } catch (error) {
      this.log('warn', 'Failed to generate team facets', { error });
      return { sports: [], levels: [], seasons: [] };
    }
  }

  private async getAthleteSuggestions(query: string, context: AgentContext): Promise<string[]> {
    try {
      const result = await this.databaseAgent.query(`
        SELECT DISTINCT first_name || ' ' || last_name as full_name
        FROM users
        WHERE role = 'athlete'
          AND is_active = 'true'
          AND (first_name ILIKE $1 OR last_name ILIKE $1 OR (first_name || ' ' || last_name) ILIKE $1)
        ORDER BY full_name
        LIMIT 10
      `, [`%${query}%`], context);

      return result.success ? result.data.map((row: any) => row.full_name) : [];
    } catch (error) {
      this.log('warn', 'Failed to get athlete suggestions', { error });
      return [];
    }
  }

  private async getTeamSuggestions(query: string, context: AgentContext): Promise<string[]> {
    try {
      const result = await this.databaseAgent.query(`
        SELECT DISTINCT name
        FROM teams
        WHERE is_active = 'true'
          AND name ILIKE $1
        ORDER BY name
        LIMIT 10
      `, [`%${query}%`], context);

      return result.success ? result.data.map((row: any) => row.name) : [];
    } catch (error) {
      this.log('warn', 'Failed to get team suggestions', { error });
      return [];
    }
  }

  private async getSportSuggestions(query: string, context: AgentContext): Promise<string[]> {
    try {
      const result = await this.databaseAgent.query(`
        SELECT DISTINCT unnest(sports) as sport
        FROM users
        WHERE role = 'athlete'
          AND is_active = 'true'
          AND unnest(sports) ILIKE $1
        ORDER BY sport
        LIMIT 10
      `, [`%${query}%`], context);

      return result.success ? result.data.map((row: any) => row.sport) : [];
    } catch (error) {
      this.log('warn', 'Failed to get sport suggestions', { error });
      return [];
    }
  }

  private applySorting(results: any[], sortBy: string): any[] {
    const [field, direction] = sortBy.split(':');
    const isDesc = direction === 'desc';

    return results.sort((a, b) => {
      let aVal = a[field] || a.data?.[field];
      let bVal = b[field] || b.data?.[field];

      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return isDesc ? 1 : -1;
      if (aVal > bVal) return isDesc ? -1 : 1;
      return 0;
    });
  }

  private async testSearchCapabilities(): Promise<boolean> {
    try {
      // Test basic query sanitization
      const sanitizeResult = await this.securityAgent.sanitizeInput('test query', { allowedChars: 'search' });
      return sanitizeResult.success && sanitizeResult.data === 'test query';
    } catch (error) {
      this.log('error', 'Search capabilities test failed', { error });
      return false;
    }
  }
}

// Singleton instance
let searchAgentInstance: SearchAgentImpl | null = null;

export function getSearchAgent(): SearchAgentImpl {
  if (!searchAgentInstance) {
    searchAgentInstance = new SearchAgentImpl();
  }
  return searchAgentInstance;
}