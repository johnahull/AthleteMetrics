/**
 * Example routes demonstrating agent usage
 * These can be used as templates for migrating existing routes
 */

import type { Express } from "express";
import { requireAuth } from "../middleware";
import { agentRoute } from "../middleware/agent-middleware";
import { getOrchestrator } from "@shared/agents/orchestrator";

export function registerAgentExampleRoutes(app: Express) {
  /**
   * Example: Global search using SearchAgent
   * @route GET /api/agents/search
   * @query {string} q - Search query
   * @query {string[]} entities - Entities to search (athletes, teams)
   * @access Authenticated users
   */
  app.get("/api/agents/search", requireAuth, agentRoute(async (req, res, agents) => {
    const { q: query, entities } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: "Search query is required" });
    }

    const searchEntities = Array.isArray(entities) ? entities :
                          typeof entities === 'string' ? [entities] :
                          ['athletes', 'teams'];

    // Use SearchAgent to perform search
    const results = await agents.execute('SearchAgent', 'search',
      query, searchEntities
    );

    return results;
  }));

  /**
   * Example: Athlete search with filters using SearchAgent
   * @route GET /api/agents/athletes/search
   * @query {string} q - Search query
   * @query {string} sport - Filter by sport
   * @query {number} graduationYear - Filter by graduation year
   * @access Authenticated users
   */
  app.get("/api/agents/athletes/search", requireAuth, agentRoute(async (req, res, agents) => {
    const { q: query = '', sport, graduationYear } = req.query;

    const filters = {
      organizationId: req.session.user?.primaryOrganizationId,
      sports: sport ? [sport as string] : undefined,
      graduationYear: graduationYear ? parseInt(graduationYear as string) : undefined
    };

    const results = await agents.execute('SearchAgent', 'searchAthletes',
      query as string, filters
    );

    return results;
  }));

  /**
   * Example: CSV import using ImportExportAgent
   * @route POST /api/agents/import/athletes
   * @body {file} csvFile - CSV file to import
   * @access Authenticated users with admin permissions
   */
  app.post("/api/agents/import/athletes", requireAuth, agentRoute(async (req, res, agents) => {
    // In a real implementation, you'd use multer to handle file upload
    // For this example, assume the file data is in req.body.csvData
    const csvData = req.body.csvData;

    if (!csvData) {
      return res.status(400).json({ message: "CSV data is required" });
    }

    // Step 1: Parse CSV
    const csvBuffer = Buffer.from(csvData);
    const columnMapping = {
      'First Name': 'firstName',
      'Last Name': 'lastName',
      'Email': 'email',
      'Sport': 'sports',
      'Graduation Year': 'graduationYear'
    };

    const parseResult = await agents.execute('ImportExportAgent', 'parseCSV',
      csvBuffer, columnMapping
    );

    // Step 2: Validate data
    const validationRules = {
      required: ['firstName', 'lastName', 'email'],
      unique: ['email'],
      patterns: {
        email: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
      }
    };

    const validationResult = await agents.execute('ImportExportAgent', 'validateImportData',
      parseResult.preview, validationRules
    );

    if (!validationResult.isValid) {
      return res.status(400).json({
        message: "Validation failed",
        errors: validationResult.errors,
        warnings: validationResult.warnings
      });
    }

    // Step 3: Import data
    const importResult = await agents.execute('ImportExportAgent', 'importData',
      parseResult.preview, 'athletes'
    );

    return {
      message: "Import completed",
      ...importResult
    };
  }));

  /**
   * Example: Export athletes to CSV using ImportExportAgent
   * @route GET /api/agents/export/athletes
   * @query {string} format - Export format (csv, json)
   * @query {string} sport - Filter by sport
   * @access Authenticated users
   */
  app.get("/api/agents/export/athletes", requireAuth, agentRoute(async (req, res, agents) => {
    const { format = 'csv', sport } = req.query;

    const exportQuery = {
      entity: 'athletes',
      filters: {
        organization_id: req.session.user?.primaryOrganizationId,
        ...(sport && { sports: `{${sport}}` }) // PostgreSQL array contains
      },
      fields: ['first_name', 'last_name', 'email', 'sports', 'graduation_year', 'school'],
      orderBy: 'last_name, first_name'
    };

    const result = await agents.execute('ImportExportAgent', 'exportData',
      exportQuery, format as string
    );

    // Set response headers for file download
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.data.length);

    return res.send(result.data);
  }));

  /**
   * Example: Secure data handling using SecurityAgent
   * @route POST /api/agents/secure-form
   * @body {object} formData - Form data to sanitize and validate
   * @access Authenticated users
   */
  app.post("/api/agents/secure-form", requireAuth, agentRoute(async (req, res, agents) => {
    const { formData } = req.body;

    if (!formData) {
      return res.status(400).json({ message: "Form data is required" });
    }

    // Sanitize all input
    const sanitizedData = await agents.execute('SecurityAgent', 'sanitizeInput',
      formData, { stripHTML: true, maxLength: 1000 }
    );

    // Check rate limiting
    const rateLimitOk = await agents.execute('SecurityAgent', 'checkRateLimit',
      `form:${req.session.user?.id}`, 10, 60000 // 10 per minute
    );

    if (!rateLimitOk) {
      return res.status(429).json({ message: "Too many requests, please try again later" });
    }

    // Generate CSRF token for next request
    const csrfToken = await agents.execute('SecurityAgent', 'generateCSRFToken');

    return {
      message: "Form processed successfully",
      sanitizedData,
      csrfToken
    };
  }));

  /**
   * Example: Multi-agent workflow
   * @route POST /api/agents/workflow/athlete-registration
   * @body {object} athleteData - Athlete registration data
   * @access Authenticated users with appropriate permissions
   */
  app.post("/api/agents/workflow/athlete-registration", requireAuth, agentRoute(async (req, res, agents) => {
    const { athleteData } = req.body;

    // Step 1: Security - sanitize and validate input
    const sanitizedData = await agents.execute('SecurityAgent', 'sanitizeInput',
      athleteData, { stripHTML: true, maxLength: 255 }
    );

    // Step 2: Security - check permissions and rate limits
    const [hasPermission, rateLimitOk] = await agents.executeParallel([
      {
        agentName: 'SecurityAgent',
        method: 'checkPermission',
        args: ['create', 'athletes']
      },
      {
        agentName: 'SecurityAgent',
        method: 'checkRateLimit',
        args: [`registration:${req.session.user?.id}`, 5, 3600000] // 5 per hour
      }
    ]);

    if (!hasPermission) {
      return res.status(403).json({ message: "Permission denied" });
    }

    if (!rateLimitOk) {
      return res.status(429).json({ message: "Registration rate limit exceeded" });
    }

    // Step 3: Database - check for existing athlete and create if not exists
    const checkExistingQuery = 'SELECT id FROM users WHERE $1 = ANY(emails) AND role = \'athlete\'';
    const existingResult = await agents.execute('DatabaseAgent', 'queryOne',
      checkExistingQuery, [sanitizedData.email]
    );

    if (existingResult) {
      return res.status(409).json({ message: "Athlete with this email already exists" });
    }

    // Step 4: Database - create new athlete
    const insertQuery = `
      INSERT INTO users (first_name, last_name, emails, role, organization_id, is_active, password, created_at, updated_at)
      VALUES ($1, $2, $3, 'athlete', $4, 'true', 'INVITATION_PENDING', NOW(), NOW())
      RETURNING id, first_name, last_name, emails
    `;

    const newAthlete = await agents.execute('DatabaseAgent', 'queryOne',
      insertQuery, [
        sanitizedData.firstName,
        sanitizedData.lastName,
        [sanitizedData.email],
        req.session.user?.primaryOrganizationId
      ]
    );

    // Step 5: Emit event for other systems (notifications, analytics, etc.)
    await agents.emitEvent('athlete_registered', {
      athleteId: newAthlete.id,
      organizationId: req.session.user?.primaryOrganizationId,
      registeredBy: req.session.user?.id
    });

    return {
      message: "Athlete registered successfully",
      athlete: newAthlete
    };
  }));

  /**
   * Example: Health check endpoint for agents
   * @route GET /api/agents/health
   * @access Public (for monitoring)
   */
  app.get("/api/agents/health-detailed", agentRoute(async (req, res, agents) => {
    // This would be handled by agentHealthCheck middleware, but here's a custom version
    const orchestrator = agents.getAgent('orchestrator') ||
                        getOrchestrator();

    if (!orchestrator) {
      return res.status(503).json({ status: 'error', message: 'Orchestrator not available' });
    }

    const systemHealth = await orchestrator.getSystemHealth();

    return {
      status: systemHealth.status,
      agents: systemHealth.agents,
      summary: {
        total: systemHealth.totalAgents,
        healthy: systemHealth.healthyAgents,
        degraded: systemHealth.degradedAgents,
        unhealthy: systemHealth.unhealthyAgents
      },
      timestamp: new Date().toISOString()
    };
  }));
}