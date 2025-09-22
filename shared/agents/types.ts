/**
 * Core agent system types and interfaces
 */

// Base agent interface that all agents must implement
export interface BaseAgent {
  readonly name: string;
  readonly version: string;
  readonly dependencies: string[];

  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<AgentHealth>;
}

// Agent health status
export interface AgentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastCheck: Date;
  dependencies?: Record<string, AgentHealth>;
}

// Agent execution context
export interface AgentContext {
  requestId: string;
  userId?: string;
  organizationId?: string;
  sessionId?: string;
  permissions?: string[];
  metadata?: Record<string, any>;
}

// Agent operation result
export interface AgentResult<T = any> {
  success: boolean;
  data?: T;
  error?: AgentError;
  metadata?: {
    executionTime: number;
    agentVersion: string;
    dependencies?: string[];
    [key: string]: any; // Allow additional orchestrator-specific metadata
  };
}

// Agent error structure
export interface AgentError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
  retryable?: boolean;
}

// Event system for agent orchestration
export interface AgentEvent {
  type: string;
  source: string;
  target?: string;
  payload: any;
  timestamp: Date;
  correlationId?: string;
}

// Agent event handler
export type AgentEventHandler<T = any> = (event: AgentEvent, context: AgentContext) => Promise<AgentResult<T>>;

// Agent orchestration modes
export type OrchestrationMode = 'sequential' | 'parallel' | 'event-driven';

// Agent execution strategy
export interface ExecutionStrategy {
  mode: OrchestrationMode;
  timeout?: number;
  retries?: number;
  fallback?: string; // fallback agent name
}

// Agent configuration
export interface AgentConfig {
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  timeout: number;
  retries: number;
  circuitBreaker?: {
    enabled: boolean;
    failureThreshold: number;
    resetTimeout: number;
  };
}