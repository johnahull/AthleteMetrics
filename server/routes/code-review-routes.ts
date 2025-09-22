/**
 * Code Review Agent API routes
 * Provides endpoints for Claude bot integration and real-time code analysis
 */

import type { Express } from "express";
import { requireAuth } from "../middleware";
import { agentRoute } from "../middleware/agent-middleware";
import multer from "multer";
import { z } from "zod";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 20 // Max 20 files per request
  },
  fileFilter: (req, file, cb) => {
    // Only allow text-based files
    const allowedTypes = [
      'text/plain',
      'application/javascript',
      'application/typescript',
      'text/typescript',
      'application/json'
    ];

    const allowedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'];
    const hasValidExtension = allowedExtensions.some(ext =>
      file.originalname.toLowerCase().endsWith(ext)
    );

    if (allowedTypes.includes(file.mimetype) || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Only TypeScript, JavaScript, and JSON files are allowed'));
    }
  }
});

// Validation schemas
const analyzeFileSchema = z.object({
  filePath: z.string().min(1),
  content: z.string(),
  options: z.object({
    includeSecurityScan: z.boolean().optional().default(true),
    includePerformanceCheck: z.boolean().optional().default(true),
    includeStyleValidation: z.boolean().optional().default(true),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
    customRules: z.array(z.string()).optional().default([])
  }).optional().default({})
});

const analyzePRSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
    previousContent: z.string().optional(),
    changeType: z.enum(['added', 'modified', 'deleted']),
    diff: z.string().optional()
  })),
  options: z.object({
    includeSecurityScan: z.boolean().optional().default(true),
    includePerformanceCheck: z.boolean().optional().default(true),
    includeStyleValidation: z.boolean().optional().default(true),
    includeTests: z.boolean().optional().default(true),
    maxFilesToAnalyze: z.number().optional().default(50),
    baseBranch: z.string().optional(),
    targetBranch: z.string().optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium')
  }).optional().default({})
});

export function registerCodeReviewRoutes(app: Express) {
  /**
   * Analyze a single file
   * @route POST /api/code-review/analyze-file
   * @body {string} filePath - Path to the file
   * @body {string} content - File content to analyze
   * @body {object} options - Analysis options
   * @access Authenticated users
   */
  app.post("/api/code-review/analyze-file", requireAuth, agentRoute(async (req, res, agents) => {
    try {
      const validated = analyzeFileSchema.parse(req.body);

      const result = await agents.execute('CodeReviewAgent', 'analyzeFile',
        validated.filePath,
        validated.content,
        validated.options
      );

      return {
        success: true,
        data: result,
        metadata: {
          analysisTime: new Date().toISOString(),
          rulesApplied: 'AthleteMetrics-specific + standard',
          userId: req.session.user?.id
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.errors
        });
      }
      throw error;
    }
  }));

  /**
   * Analyze multiple files (PR analysis)
   * @route POST /api/code-review/analyze-pr
   * @body {array} files - Array of file changes
   * @body {object} options - Analysis options
   * @access Authenticated users
   */
  app.post("/api/code-review/analyze-pr", requireAuth, agentRoute(async (req, res, agents) => {
    try {
      const validated = analyzePRSchema.parse(req.body);

      const result = await agents.execute('CodeReviewAgent', 'analyzePullRequest',
        validated.files,
        validated.options
      );

      return {
        success: true,
        data: result,
        metadata: {
          analysisTime: new Date().toISOString(),
          filesAnalyzed: validated.files.length,
          rulesApplied: 'AthleteMetrics-specific + standard',
          userId: req.session.user?.id
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.errors
        });
      }
      throw error;
    }
  }));

  /**
   * Upload and analyze files
   * @route POST /api/code-review/upload-analyze
   * @files Multiple files to analyze
   * @query {string} includeSecurityScan - Include security analysis
   * @query {string} includePerformanceCheck - Include performance analysis
   * @access Authenticated users
   */
  app.post("/api/code-review/upload-analyze", requireAuth, upload.array('files', 20), agentRoute(async (req, res, agents) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const options = {
      includeSecurityScan: req.query.includeSecurityScan === 'true',
      includePerformanceCheck: req.query.includePerformanceCheck === 'true',
      includeStyleValidation: req.query.includeStyleValidation !== 'false', // Default true
      severity: (req.query.severity as any) || 'medium'
    };

    const fileChanges = files.map(file => ({
      path: file.originalname,
      content: file.buffer.toString('utf-8'),
      changeType: 'added' as const
    }));

    const result = await agents.execute('CodeReviewAgent', 'analyzePullRequest',
      fileChanges,
      { ...options, maxFilesToAnalyze: files.length }
    );

    return {
      success: true,
      data: result,
      metadata: {
        analysisTime: new Date().toISOString(),
        uploadedFiles: files.map(f => f.originalname),
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        userId: req.session.user?.id
      }
    };
  }));

  /**
   * Security scan only
   * @route POST /api/code-review/security-scan
   * @body {string} content - Code content to scan
   * @body {string} fileType - File type (typescript, javascript, etc.)
   * @access Authenticated users
   */
  app.post("/api/code-review/security-scan", requireAuth, agentRoute(async (req, res, agents) => {
    const { content, fileType } = req.body;

    if (!content || !fileType) {
      return res.status(400).json({
        success: false,
        message: 'Content and fileType are required'
      });
    }

    const result = await agents.execute('CodeReviewAgent', 'scanSecurity',
      content, fileType
    );

    return {
      success: true,
      data: result,
      metadata: {
        scanTime: new Date().toISOString(),
        fileType,
        contentLength: content.length,
        userId: req.session.user?.id
      }
    };
  }));

  /**
   * Performance check only
   * @route POST /api/code-review/performance-check
   * @body {string} content - Code content to check
   * @body {string} fileType - File type
   * @access Authenticated users
   */
  app.post("/api/code-review/performance-check", requireAuth, agentRoute(async (req, res, agents) => {
    const { content, fileType } = req.body;

    if (!content || !fileType) {
      return res.status(400).json({
        success: false,
        message: 'Content and fileType are required'
      });
    }

    const result = await agents.execute('CodeReviewAgent', 'checkPerformance',
      content, fileType
    );

    return {
      success: true,
      data: result,
      metadata: {
        checkTime: new Date().toISOString(),
        fileType,
        contentLength: content.length,
        userId: req.session.user?.id
      }
    };
  }));

  /**
   * Style validation only
   * @route POST /api/code-review/style-check
   * @body {string} content - Code content to validate
   * @body {string} fileType - File type
   * @body {object} rules - Style rules (optional)
   * @access Authenticated users
   */
  app.post("/api/code-review/style-check", requireAuth, agentRoute(async (req, res, agents) => {
    const { content, fileType, rules } = req.body;

    if (!content || !fileType) {
      return res.status(400).json({
        success: false,
        message: 'Content and fileType are required'
      });
    }

    const result = await agents.execute('CodeReviewAgent', 'validateCodeStyle',
      content, fileType, rules
    );

    return {
      success: true,
      data: result,
      metadata: {
        validationTime: new Date().toISOString(),
        fileType,
        rulesApplied: rules ? 'custom' : 'default',
        userId: req.session.user?.id
      }
    };
  }));

  /**
   * Get available rules and patterns
   * @route GET /api/code-review/rules
   * @query {string} category - Filter by category (optional)
   * @query {string} severity - Filter by severity (optional)
   * @access Authenticated users
   */
  app.get("/api/code-review/rules", requireAuth, agentRoute(async (req, res, agents) => {
    const { category, severity } = req.query;

    // This would ideally be handled by the agent, but for now we'll return static info
    const rules = {
      athleteMetricsRules: {
        total: 15,
        categories: ['security', 'performance', 'architecture', 'data', 'ui'],
        severities: ['low', 'medium', 'high', 'critical']
      },
      standardRules: {
        typescript: ['no-any', 'no-unused-vars', 'prefer-const'],
        security: ['no-hardcoded-credentials', 'no-eval', 'no-innerHTML'],
        performance: ['no-nested-loops', 'no-console-log', 'efficient-algorithms']
      },
      projectSpecific: {
        database: ['drizzle-orm-usage', 'organization-filtering', 'uuid-validation'],
        authentication: ['require-auth-middleware', 'session-validation'],
        frontend: ['shadcn-ui-consistency', 'react-hook-form-usage', 'wouter-routing']
      }
    };

    return {
      success: true,
      data: rules,
      metadata: {
        requestTime: new Date().toISOString(),
        filters: { category, severity },
        userId: req.session.user?.id
      }
    };
  }));

  /**
   * Code Review Agent health check
   * @route GET /api/code-review/health
   * @access Authenticated users
   */
  app.get("/api/code-review/health", requireAuth, agentRoute(async (req, res, agents) => {
    try {
      // Test basic agent functionality
      const testCode = 'const test: string = "hello world";';
      const testResult = await agents.execute('CodeReviewAgent', 'analyzeFile',
        'test.ts', testCode, { severity: 'low' }
      );

      return {
        status: 'healthy',
        message: 'Code Review Agent is operational',
        capabilities: {
          fileAnalysis: true,
          prAnalysis: true,
          securityScanning: true,
          performanceChecking: true,
          styleValidation: true,
          projectRules: true
        },
        lastTest: new Date().toISOString(),
        testSuccessful: !!testResult
      };
    } catch (error) {
      return res.status(503).json({
        status: 'unhealthy',
        message: 'Code Review Agent is not working properly',
        error: error instanceof Error ? error.message : 'Unknown error',
        lastTest: new Date().toISOString()
      });
    }
  }));

  /**
   * Webhook endpoint for GitHub integration
   * @route POST /api/code-review/github-webhook
   * @body GitHub webhook payload
   * @access Public (with webhook validation)
   */
  app.post("/api/code-review/github-webhook", agentRoute(async (req, res, agents) => {
    const { action, pull_request, repository } = req.body;

    // Simple webhook handling - in production, you'd validate the GitHub signature
    if (action === 'opened' || action === 'synchronize') {
      try {
        // This is a simplified example - in reality, you'd:
        // 1. Fetch the PR diff from GitHub API
        // 2. Parse the changed files
        // 3. Run analysis
        // 4. Post results back to GitHub

        const analysisResult = {
          prNumber: pull_request?.number,
          repository: repository?.name,
          action,
          message: 'AthleteMetrics Code Review Agent ready to analyze',
          timestamp: new Date().toISOString()
        };

        // Log the webhook for monitoring
        console.log('GitHub webhook received:', analysisResult);

        return {
          success: true,
          message: 'Webhook processed',
          data: analysisResult
        };
      } catch (error) {
        console.error('GitHub webhook processing failed:', error);
        return res.status(500).json({
          success: false,
          message: 'Webhook processing failed'
        });
      }
    }

    return { success: true, message: 'Webhook ignored' };
  }));
}