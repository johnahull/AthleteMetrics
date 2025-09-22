/**
 * Agent Middleware - Integrates the agent system with Express.js
 */

import { Request, Response, NextFunction } from 'express';
import { AgentContext } from '@shared/agents/types';
import { agentFactory } from '@shared/agents/factory';
import { getOrchestrator } from '@shared/agents/orchestrator';
import crypto from 'crypto';

// Extend Express Request to include agent context
declare global {
  namespace Express {
    interface Request {
      agentContext: AgentContext;
      agents: AgentManager;
    }
  }
}

export class AgentManager {
  constructor(private context: AgentContext) {}

  /**
   * Execute a single agent operation
   */
  async execute<T>(
    agentName: string,
    method: string,
    ...args: any[]
  ): Promise<T> {
    const orchestrator = getOrchestrator();
    const result = await orchestrator.executeAgent<T>(
      agentName,
      method,
      args,
      this.context
    );

    if (!result.success) {
      const error = new Error(result.error?.message || 'Agent execution failed');
      (error as any).code = result.error?.code;
      (error as any).retryable = result.error?.retryable;
      throw error;
    }

    return result.data!;
  }

  /**
   * Execute multiple agents in parallel
   */
  async executeParallel<T>(
    executions: Array<{
      agentName: string;
      method: string;
      args: any[];
    }>
  ): Promise<T[]> {
    const orchestrator = getOrchestrator();
    const executionsWithContext = executions.map(exec => ({
      ...exec,
      context: this.context
    }));

    const result = await orchestrator.executeParallel<T>(executionsWithContext);

    if (!result.success) {
      const error = new Error(result.error?.message || 'Parallel execution failed');
      (error as any).code = result.error?.code;
      throw error;
    }

    return result.data!;
  }

  /**
   * Execute agents in sequence
   */
  async executeSequence<T>(
    executions: Array<{
      agentName: string;
      method: string;
      args: any[];
      continueOnError?: boolean;
    }>
  ): Promise<T[]> {
    const orchestrator = getOrchestrator();
    const executionsWithContext = executions.map(exec => ({
      ...exec,
      context: this.context
    }));

    const result = await orchestrator.executeSequence<T>(executionsWithContext);

    if (!result.success) {
      const error = new Error(result.error?.message || 'Sequential execution failed');
      (error as any).code = result.error?.code;
      throw error;
    }

    return result.data!;
  }

  /**
   * Get direct access to an agent (use with caution)
   */
  getAgent<T>(agentName: string): T | undefined {
    return agentFactory.getAgent<T>(agentName);
  }

  /**
   * Emit an event to the agent system
   */
  async emitEvent(eventType: string, payload: any, target?: string): Promise<void> {
    const orchestrator = getOrchestrator();
    await orchestrator.emitAgentEvent({
      type: eventType,
      source: 'http-request',
      target,
      payload,
      timestamp: new Date(),
      correlationId: this.context.requestId
    }, this.context);
  }
}

/**
 * Middleware to inject agent context into Express requests
 */
export function agentContextMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Generate unique request ID
      const requestId = crypto.randomUUID();

      // Create agent context from request
      const agentContext: AgentContext = {
        requestId,
        userId: req.session?.user?.id,
        organizationId: req.session?.user?.primaryOrganizationId,
        sessionId: req.sessionID,
        permissions: req.session?.user ? getUserPermissions(req.session.user) : [],
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          path: req.path,
          method: req.method,
          timestamp: new Date(),
          session: {
            isAuthenticated: !!req.session?.user,
            isSiteAdmin: req.session?.user?.isSiteAdmin || false,
            isImpersonating: req.session?.isImpersonating || false
          }
        }
      };

      // Attach context and agent manager to request
      req.agentContext = agentContext;
      req.agents = new AgentManager(agentContext);

      // Log request start
      console.log(`[${requestId}] ${req.method} ${req.path} - User: ${agentContext.userId || 'anonymous'}`);

      next();
    } catch (error) {
      console.error('Agent context middleware error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

/**
 * Middleware to handle agent errors
 */
export function agentErrorHandler() {
  return (error: any, req: Request, res: Response, next: NextFunction) => {
    if (error.code && error.retryable !== undefined) {
      // This is an agent error
      const statusCode = getStatusCodeForAgentError(error.code);

      console.error(`[${req.agentContext?.requestId}] Agent error:`, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        path: req.path,
        userId: req.agentContext?.userId
      });

      res.status(statusCode).json({
        message: error.message,
        code: error.code,
        retryable: error.retryable
      });
    } else {
      // Regular error, pass to next handler
      next(error);
    }
  };
}

/**
 * Middleware to validate agent system health
 */
export function agentHealthCheck() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/health/agents') {
      try {
        const orchestrator = getOrchestrator();
        const health = await orchestrator.getSystemHealth();

        res.json(health);
      } catch (error) {
        console.error('Agent health check failed:', error);
        res.status(500).json({
          status: 'unhealthy',
          message: 'Health check failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    } else {
      next();
    }
  };
}

/**
 * Initialize agent system
 */
export async function initializeAgentSystem(): Promise<void> {
  try {
    console.log('Initializing agent system...');

    // Validate environment for core agents
    const coreAgents = ['DatabaseAgent', 'SecurityAgent', 'AuthenticationAgent'];

    for (const agentName of coreAgents) {
      const validation = agentFactory.validateAgentEnvironment(agentName);
      if (!validation.isValid) {
        throw new Error(`Environment validation failed for ${agentName}: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings && validation.warnings.length > 0) {
        console.warn(`${agentName} warnings:`, validation.warnings);
      }
    }

    // Initialize core agents
    await agentFactory.initializeCoreAgents();

    console.log('Core agent system initialized successfully');

    // Optionally initialize additional agents
    try {
      await initializeOptionalAgents();
    } catch (error) {
      console.warn('Some optional agents failed to initialize:', error);
    }

  } catch (error) {
    console.error('Failed to initialize agent system:', error);
    throw error;
  }
}

/**
 * Shutdown agent system
 */
export async function shutdownAgentSystem(): Promise<void> {
  try {
    console.log('Shutting down agent system...');
    await agentFactory.shutdown();
    console.log('Agent system shut down successfully');
  } catch (error) {
    console.error('Failed to shutdown agent system:', error);
  }
}

/**
 * Agent-aware route wrapper
 */
export function agentRoute<T = any>(
  handler: (req: Request, res: Response, agents: AgentManager) => Promise<T>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await handler(req, res, req.agents);

      // If handler doesn't send response, send the result
      if (!res.headersSent && result !== undefined) {
        res.json(result);
      }
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Require specific agent to be healthy
 */
export function requireAgent(agentName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agent = agentFactory.getAgent(agentName);
      if (!agent) {
        return res.status(503).json({
          message: `Service unavailable: ${agentName} not available`,
          code: 'AGENT_NOT_AVAILABLE'
        });
      }

      const health = await agent.healthCheck();
      if (health.status === 'unhealthy') {
        return res.status(503).json({
          message: `Service unavailable: ${agentName} is unhealthy`,
          code: 'AGENT_UNHEALTHY',
          details: health.message
        });
      }

      next();
    } catch (error) {
      console.error(`Health check failed for ${agentName}:`, error);
      res.status(503).json({
        message: `Service unavailable: Health check failed for ${agentName}`,
        code: 'AGENT_HEALTH_CHECK_FAILED'
      });
    }
  };
}

// Helper functions

function getUserPermissions(user: any): string[] {
  const permissions: string[] = [];

  if (user.isSiteAdmin) {
    permissions.push('site_admin');
  }

  if (user.role) {
    permissions.push(user.role);
  }

  // Add default permissions based on authentication status
  if (user.id) {
    permissions.push('authenticated');
  }

  return permissions;
}

function getStatusCodeForAgentError(errorCode: string): number {
  const errorCodeMap: Record<string, number> = {
    // Authentication errors
    'INVALID_CREDENTIALS': 401,
    'ACCOUNT_INACTIVE': 401,
    'SESSION_EXPIRED': 401,
    'MFA_REQUIRED': 401,
    'INVALID_RESET_TOKEN': 401,

    // Authorization errors
    'PERMISSION_DENIED': 403,
    'INSUFFICIENT_PRIVILEGES': 403,

    // Validation errors
    'INVALID_INPUT': 400,
    'SANITIZATION_FAILED': 400,
    'VALIDATION_FAILED': 400,
    'WEAK_PASSWORD': 400,

    // Rate limiting
    'RATE_LIMITED': 429,

    // Not found
    'USER_NOT_FOUND': 404,
    'AGENT_NOT_FOUND': 404,
    'SESSION_NOT_FOUND': 404,

    // Server errors
    'DATABASE_ERROR': 500,
    'EXECUTION_ERROR': 500,
    'TIMEOUT': 504,

    // Service unavailable
    'AGENT_UNHEALTHY': 503,
    'CIRCUIT_BREAKER_OPEN': 503
  };

  return errorCodeMap[errorCode] || 500;
}

async function initializeOptionalAgents(): Promise<void> {
  const optionalAgents = [
    'SearchAgent',
    'ImportExportAgent',
    'NotificationAgent',
    'OCRAgent'
  ];

  for (const agentName of optionalAgents) {
    try {
      const validation = agentFactory.validateAgentEnvironment(agentName);

      if (validation.isValid) {
        const config = agentFactory.getAgentConfig(agentName);

        // Check if agent should be enabled based on config and environment
        if (config?.defaultConfig.enabled) {
          await agentFactory.createAgent(agentName);
          console.log(`Optional agent ${agentName} initialized successfully`);
        } else {
          console.log(`Optional agent ${agentName} is disabled by default`);
        }
      } else {
        console.log(`Skipping ${agentName}: ${validation.errors.join(', ')}`);
      }
    } catch (error) {
      console.warn(`Failed to initialize optional agent ${agentName}:`, error);
    }
  }
}