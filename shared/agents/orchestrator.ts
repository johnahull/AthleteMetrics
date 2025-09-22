/**
 * Agent Orchestrator - Coordinates agent execution and manages dependencies
 */

import { EventEmitter } from 'events';
import {
  BaseAgent,
  AgentContext,
  AgentResult,
  AgentEvent,
  AgentEventHandler,
  OrchestrationMode,
  ExecutionStrategy,
  AgentHealth
} from './types';

export class AgentOrchestrator extends EventEmitter {
  private agents: Map<string, BaseAgent> = new Map();
  private eventHandlers: Map<string, Map<string, AgentEventHandler>> = new Map();
  private executionQueue: ExecutionQueueItem[] = [];
  private isProcessingQueue = false;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.startHealthMonitoring();
  }

  /**
   * Register an agent with the orchestrator
   */
  async registerAgent(agent: BaseAgent): Promise<void> {
    if (this.agents.has(agent.name)) {
      throw new Error(`Agent ${agent.name} is already registered`);
    }

    // Check dependencies
    for (const depName of agent.dependencies) {
      if (!this.agents.has(depName)) {
        throw new Error(`Agent ${agent.name} depends on ${depName} which is not registered`);
      }
    }

    // Initialize agent
    await agent.initialize();

    this.agents.set(agent.name, agent);
    this.eventHandlers.set(agent.name, new Map());

    this.emit('agentRegistered', { agentName: agent.name, version: agent.version });
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentName: string): Promise<void> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} is not registered`);
    }

    // Check if other agents depend on this one
    const dependentAgents = Array.from(this.agents.values()).filter(a =>
      a.dependencies.includes(agentName)
    );

    if (dependentAgents.length > 0) {
      const dependentNames = dependentAgents.map(a => a.name).join(', ');
      throw new Error(`Cannot unregister ${agentName}: agents ${dependentNames} depend on it`);
    }

    // Shutdown agent
    await agent.shutdown();

    this.agents.delete(agentName);
    this.eventHandlers.delete(agentName);

    this.emit('agentUnregistered', { agentName });
  }

  /**
   * Get registered agent
   */
  getAgent<T extends BaseAgent>(agentName: string): T | undefined {
    return this.agents.get(agentName) as T;
  }

  /**
   * Execute a single agent operation
   */
  async executeAgent<T>(
    agentName: string,
    method: string,
    args: any[],
    context: AgentContext,
    strategy: ExecutionStrategy = { mode: 'sequential' }
  ): Promise<AgentResult<T>> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      return {
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: `Agent ${agentName} is not registered`,
          retryable: false
        }
      };
    }

    const startTime = Date.now();

    try {
      // Check agent health
      const health = await agent.healthCheck();
      if (health.status === 'unhealthy') {
        throw new Error(`Agent ${agentName} is unhealthy: ${health.message}`);
      }

      // Execute with timeout and retries
      const result = await this.executeWithStrategy(agent, method, args, context, strategy);

      const executionTime = Date.now() - startTime;

      if (result.success) {
        result.metadata = {
          ...result.metadata,
          executionTime,
          agentVersion: agent.version,
          dependencies: agent.dependencies
        };
      }

      return result as AgentResult<T>;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true
        },
        metadata: {
          executionTime,
          agentVersion: agent.version,
          dependencies: agent.dependencies
        }
      };
    }
  }

  /**
   * Execute multiple agents in parallel
   */
  async executeParallel<T>(
    executions: Array<{
      agentName: string;
      method: string;
      args: any[];
      context: AgentContext;
    }>,
    strategy: ExecutionStrategy = { mode: 'parallel' }
  ): Promise<AgentResult<T[]>> {
    try {
      const promises = executions.map(exec =>
        this.executeAgent(exec.agentName, exec.method, exec.args, exec.context, strategy)
      );

      const results = await Promise.allSettled(promises);
      const data: T[] = [];
      const errors: any[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          data.push(result.value.data as T);
        } else {
          errors.push(result.status === 'fulfilled' ? result.value.error : result.reason);
        }
      }

      if (errors.length > 0 && data.length === 0) {
        return {
          success: false,
          error: {
            code: 'PARALLEL_EXECUTION_FAILED',
            message: 'All parallel executions failed',
            details: errors,
            retryable: true
          }
        };
      }

      return {
        success: true,
        data,
        metadata: {
          executionTime: 0,
          agentVersion: 'orchestrator-1.0.0',
          dependencies: [],
          parallelResults: results.length,
          successCount: data.length,
          errorCount: errors.length,
          ...(errors.length > 0 && { partialFailures: errors })
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PARALLEL_ORCHESTRATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true
        }
      };
    }
  }

  /**
   * Execute agents in sequence
   */
  async executeSequence<T>(
    executions: Array<{
      agentName: string;
      method: string;
      args: any[];
      context: AgentContext;
      continueOnError?: boolean;
    }>,
    strategy: ExecutionStrategy = { mode: 'sequential' }
  ): Promise<AgentResult<T[]>> {
    const results: T[] = [];
    const errors: any[] = [];

    try {
      for (const exec of executions) {
        const result = await this.executeAgent<T>(
          exec.agentName,
          exec.method,
          exec.args,
          exec.context,
          strategy
        );

        if (result.success) {
          results.push(result.data!);
        } else {
          errors.push(result.error);

          if (!exec.continueOnError) {
            break;
          }
        }
      }

      return {
        success: errors.length === 0 || results.length > 0,
        data: results,
        metadata: {
          executionTime: 0,
          agentVersion: 'orchestrator-1.0.0',
          dependencies: [],
          sequentialResults: executions.length,
          successCount: results.length,
          errorCount: errors.length,
          ...(errors.length > 0 && { errors })
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SEQUENTIAL_ORCHESTRATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true
        }
      };
    }
  }

  /**
   * Register event handler for an agent
   */
  registerEventHandler(
    agentName: string,
    eventType: string,
    handler: AgentEventHandler
  ): void {
    const agentHandlers = this.eventHandlers.get(agentName);
    if (!agentHandlers) {
      throw new Error(`Agent ${agentName} is not registered`);
    }

    agentHandlers.set(eventType, handler);
  }

  /**
   * Emit event to trigger agent handlers
   */
  async emitAgentEvent(event: AgentEvent, context: AgentContext): Promise<void> {
    const eventItem: ExecutionQueueItem = {
      id: crypto.randomUUID(),
      type: 'event',
      event,
      context,
      createdAt: new Date(),
      retries: 0
    };

    this.executionQueue.push(eventItem);
    await this.processQueue();
  }

  /**
   * Get health status of all agents
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const agentHealths: Record<string, AgentHealth> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    for (const [name, agent] of this.agents) {
      try {
        const health = await agent.healthCheck();
        agentHealths[name] = health;

        if (health.status === 'unhealthy') {
          overallStatus = 'unhealthy';
        } else if (health.status === 'degraded' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        agentHealths[name] = {
          status: 'unhealthy',
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          lastCheck: new Date()
        };
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      agents: agentHealths,
      totalAgents: this.agents.size,
      healthyAgents: Object.values(agentHealths).filter(h => h.status === 'healthy').length,
      degradedAgents: Object.values(agentHealths).filter(h => h.status === 'degraded').length,
      unhealthyAgents: Object.values(agentHealths).filter(h => h.status === 'unhealthy').length,
      lastCheck: new Date()
    };
  }

  /**
   * Shutdown all agents
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Shutdown agents in reverse dependency order
    const shutdownOrder = this.getShutdownOrder();

    for (const agentName of shutdownOrder) {
      const agent = this.agents.get(agentName);
      if (agent) {
        try {
          await agent.shutdown();
        } catch (error) {
          console.error(`Failed to shutdown agent ${agentName}:`, error);
        }
      }
    }

    this.agents.clear();
    this.eventHandlers.clear();
    this.executionQueue.length = 0;
  }

  // Private methods

  private async executeWithStrategy<T>(
    agent: BaseAgent,
    method: string,
    args: any[],
    context: AgentContext,
    strategy: ExecutionStrategy
  ): Promise<AgentResult<T>> {
    const timeout = strategy.timeout || 30000;
    const retries = strategy.retries || 0;

    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await Promise.race([
          this.callAgentMethod(agent, method, args, context),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
          })
        ]);

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: {
        code: 'EXECUTION_FAILED',
        message: lastError!.message,
        retryable: true
      }
    };
  }

  private async callAgentMethod(agent: BaseAgent, method: string, args: any[], context: AgentContext): Promise<any> {
    const agentMethod = (agent as any)[method];
    if (typeof agentMethod !== 'function') {
      throw new Error(`Method ${method} not found on agent ${agent.name}`);
    }

    return agentMethod.apply(agent, [...args, context]);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.executionQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.executionQueue.length > 0) {
        const item = this.executionQueue.shift()!;

        try {
          await this.processQueueItem(item);
        } catch (error) {
          console.error('Failed to process queue item:', error);

          if (item.retries < 3) {
            item.retries++;
            this.executionQueue.push(item);
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async processQueueItem(item: ExecutionQueueItem): Promise<void> {
    if (item.type === 'event') {
      const event = item.event!;

      // Find handlers for this event
      if (event.target) {
        // Directed event
        const agentHandlers = this.eventHandlers.get(event.target);
        const handler = agentHandlers?.get(event.type);

        if (handler) {
          await handler(event, item.context);
        }
      } else {
        // Broadcast event
        for (const [agentName, handlers] of this.eventHandlers) {
          const handler = handlers.get(event.type);
          if (handler) {
            try {
              await handler(event, item.context);
            } catch (error) {
              console.error(`Event handler failed for ${agentName}:`, error);
            }
          }
        }
      }
    }
  }

  private getShutdownOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (agentName: string) => {
      if (visited.has(agentName)) {
        return;
      }

      visited.add(agentName);

      // First visit dependencies
      const agent = this.agents.get(agentName);
      if (agent) {
        for (const dep of agent.dependencies) {
          visit(dep);
        }
      }

      result.push(agentName);
    };

    for (const agentName of this.agents.keys()) {
      visit(agentName);
    }

    return result.reverse(); // Reverse for shutdown order
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getSystemHealth();

        if (health.status === 'unhealthy') {
          this.emit('systemUnhealthy', health);
        } else if (health.status === 'degraded') {
          this.emit('systemDegraded', health);
        }

        this.emit('healthCheck', health);
      } catch (error) {
        console.error('Health monitoring failed:', error);
      }
    }, 60000); // Check every minute
  }
}

// Type definitions
interface ExecutionQueueItem {
  id: string;
  type: 'event';
  event?: AgentEvent;
  context: AgentContext;
  createdAt: Date;
  retries: number;
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  agents: Record<string, AgentHealth>;
  totalAgents: number;
  healthyAgents: number;
  degradedAgents: number;
  unhealthyAgents: number;
  lastCheck: Date;
}

// Singleton instance
let orchestratorInstance: AgentOrchestrator | null = null;

export function getOrchestrator(): AgentOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AgentOrchestrator();
  }
  return orchestratorInstance;
}