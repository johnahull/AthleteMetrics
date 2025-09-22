/**
 * Agent Factory - Creates and manages agent instances
 */

import { BaseAgent } from './types';
import { getOrchestrator } from './orchestrator';

// Agent implementation imports (these will be imported when needed)
type AgentConstructor = new (...args: any[]) => BaseAgent;

export class AgentFactory {
  private static instance: AgentFactory | null = null;
  private agentRegistry: Map<string, AgentConstructor> = new Map();
  private agentInstances: Map<string, BaseAgent> = new Map();
  private orchestrator = getOrchestrator();

  private constructor() {
    this.registerBuiltInAgents();
  }

  static getInstance(): AgentFactory {
    if (!AgentFactory.instance) {
      AgentFactory.instance = new AgentFactory();
    }
    return AgentFactory.instance;
  }

  /**
   * Register an agent type
   */
  registerAgentType(name: string, constructor: AgentConstructor): void {
    if (this.agentRegistry.has(name)) {
      throw new Error(`Agent type ${name} is already registered`);
    }

    this.agentRegistry.set(name, constructor);
  }

  /**
   * Create and register an agent instance
   */
  async createAgent(name: string, ...args: any[]): Promise<BaseAgent> {
    const constructor = this.agentRegistry.get(name);
    if (!constructor) {
      throw new Error(`Agent type ${name} is not registered`);
    }

    if (this.agentInstances.has(name)) {
      throw new Error(`Agent instance ${name} already exists`);
    }

    // Load the constructor if it's a lazy-loaded ES6 agent
    let AgentConstructor = constructor;
    if ((constructor as any).load) {
      AgentConstructor = await (constructor as any).load();
    }

    // Create instance
    const agent = new AgentConstructor(...args);

    // Register with orchestrator
    await this.orchestrator.registerAgent(agent);

    // Store instance
    this.agentInstances.set(name, agent);

    return agent;
  }

  /**
   * Get an agent instance
   */
  getAgent<T extends BaseAgent>(name: string): T | undefined {
    return this.agentInstances.get(name) as T;
  }

  /**
   * Get all agent instances
   */
  getAllAgents(): Map<string, BaseAgent> {
    return new Map(this.agentInstances);
  }

  /**
   * Destroy an agent instance
   */
  async destroyAgent(name: string): Promise<void> {
    const agent = this.agentInstances.get(name);
    if (!agent) {
      throw new Error(`Agent instance ${name} not found`);
    }

    // Unregister from orchestrator
    await this.orchestrator.unregisterAgent(name);

    // Remove from instances
    this.agentInstances.delete(name);
  }

  /**
   * Initialize core agents required for the system
   */
  async initializeCoreAgents(): Promise<void> {
    const coreAgents = [
      'DatabaseAgent',
      'SecurityAgent',
      'AuthenticationAgent'
    ];

    for (const agentName of coreAgents) {
      if (!this.agentInstances.has(agentName)) {
        try {
          await this.createAgent(agentName);
        } catch (error) {
          console.error(`Failed to initialize core agent ${agentName}:`, error);
          throw error;
        }
      }
    }
  }

  /**
   * Initialize all available agents
   */
  async initializeAllAgents(): Promise<void> {
    const agentOrder = this.getInitializationOrder();

    for (const agentName of agentOrder) {
      if (!this.agentInstances.has(agentName)) {
        try {
          await this.createAgent(agentName);
        } catch (error) {
          console.error(`Failed to initialize agent ${agentName}:`, error);
          // Continue with other agents
        }
      }
    }
  }

  /**
   * Shutdown all agents
   */
  async shutdown(): Promise<void> {
    await this.orchestrator.shutdown();
    this.agentInstances.clear();
  }

  /**
   * Get agent configuration template
   */
  getAgentConfig(agentName: string): AgentConfigTemplate | undefined {
    const configs: Record<string, AgentConfigTemplate> = {
      DatabaseAgent: {
        name: 'DatabaseAgent',
        description: 'Manages database connections and operations',
        requiredEnvVars: ['DATABASE_URL'],
        optionalEnvVars: [],
        dependencies: [],
        defaultConfig: {
          enabled: true,
          logLevel: 'info',
          timeout: 30000,
          retries: 3,
          circuitBreaker: {
            enabled: true,
            failureThreshold: 5,
            resetTimeout: 60000
          }
        }
      },
      SecurityAgent: {
        name: 'SecurityAgent',
        description: 'Handles input sanitization and security policies',
        requiredEnvVars: [],
        optionalEnvVars: [],
        dependencies: [],
        defaultConfig: {
          enabled: true,
          logLevel: 'info',
          timeout: 5000,
          retries: 1
        }
      },
      AuthenticationAgent: {
        name: 'AuthenticationAgent',
        description: 'Manages user authentication and sessions',
        requiredEnvVars: ['SESSION_SECRET'],
        optionalEnvVars: ['MFA_ISSUER'],
        dependencies: ['DatabaseAgent', 'SecurityAgent'],
        defaultConfig: {
          enabled: true,
          logLevel: 'info',
          timeout: 10000,
          retries: 2,
          circuitBreaker: {
            enabled: true,
            failureThreshold: 5,
            resetTimeout: 30000
          }
        }
      },
      OrganizationAgent: {
        name: 'OrganizationAgent',
        description: 'Manages organizations and memberships',
        requiredEnvVars: [],
        optionalEnvVars: [],
        dependencies: ['DatabaseAgent', 'SecurityAgent'],
        defaultConfig: {
          enabled: true,
          logLevel: 'info',
          timeout: 15000,
          retries: 2
        }
      },
      TeamAgent: {
        name: 'TeamAgent',
        description: 'Manages teams and rosters',
        requiredEnvVars: [],
        optionalEnvVars: [],
        dependencies: ['DatabaseAgent', 'SecurityAgent', 'OrganizationAgent'],
        defaultConfig: {
          enabled: true,
          logLevel: 'info',
          timeout: 15000,
          retries: 2
        }
      },
      AthleteAgent: {
        name: 'AthleteAgent',
        description: 'Manages athlete profiles and data',
        requiredEnvVars: [],
        optionalEnvVars: ['PHOTO_STORAGE_PATH'],
        dependencies: ['DatabaseAgent', 'SecurityAgent', 'OrganizationAgent'],
        defaultConfig: {
          enabled: true,
          logLevel: 'info',
          timeout: 15000,
          retries: 2
        }
      },
      MeasurementAgent: {
        name: 'MeasurementAgent',
        description: 'Records and processes performance measurements',
        requiredEnvVars: [],
        optionalEnvVars: [],
        dependencies: ['DatabaseAgent', 'SecurityAgent', 'AthleteAgent'],
        defaultConfig: {
          enabled: true,
          logLevel: 'info',
          timeout: 20000,
          retries: 3
        }
      },
      AnalyticsAgent: {
        name: 'AnalyticsAgent',
        description: 'Generates reports and analytics',
        requiredEnvVars: [],
        optionalEnvVars: ['ANALYTICS_CACHE_TTL'],
        dependencies: ['DatabaseAgent', 'MeasurementAgent'],
        defaultConfig: {
          enabled: true,
          logLevel: 'info',
          timeout: 60000,
          retries: 2
        }
      },
      ImportExportAgent: {
        name: 'ImportExportAgent',
        description: 'Handles bulk data operations',
        requiredEnvVars: [],
        optionalEnvVars: ['TEMP_UPLOAD_PATH'],
        dependencies: ['DatabaseAgent', 'SecurityAgent'],
        defaultConfig: {
          enabled: true,
          logLevel: 'info',
          timeout: 300000, // 5 minutes for bulk operations
          retries: 1
        }
      },
      OCRAgent: {
        name: 'OCRAgent',
        description: 'Processes images and extracts data',
        requiredEnvVars: [],
        optionalEnvVars: ['OCR_API_KEY', 'OCR_CONFIDENCE_THRESHOLD'],
        dependencies: ['SecurityAgent'],
        defaultConfig: {
          enabled: false, // Disabled by default
          logLevel: 'info',
          timeout: 60000,
          retries: 2
        }
      },
      NotificationAgent: {
        name: 'NotificationAgent',
        description: 'Sends emails and notifications',
        requiredEnvVars: [],
        optionalEnvVars: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'],
        dependencies: [],
        defaultConfig: {
          enabled: false, // Disabled by default
          logLevel: 'info',
          timeout: 30000,
          retries: 3
        }
      },
      SearchAgent: {
        name: 'SearchAgent',
        description: 'Provides search capabilities',
        requiredEnvVars: [],
        optionalEnvVars: ['SEARCH_INDEX_PATH'],
        dependencies: ['DatabaseAgent', 'SecurityAgent'],
        defaultConfig: {
          enabled: true,
          logLevel: 'info',
          timeout: 10000,
          retries: 2
        }
      },
      CodeReviewAgent: {
        name: 'CodeReviewAgent',
        description: 'Automated code analysis and review for AthleteMetrics',
        requiredEnvVars: [],
        optionalEnvVars: ['CODE_REVIEW_RULES_PATH', 'TS_CONFIG_PATH'],
        dependencies: ['SecurityAgent'],
        defaultConfig: {
          enabled: true,
          logLevel: 'info',
          timeout: 30000, // Code analysis can be time-consuming
          retries: 1,
          circuitBreaker: {
            enabled: true,
            failureThreshold: 3,
            resetTimeout: 60000
          }
        }
      }
    };

    return configs[agentName];
  }

  /**
   * Validate environment for agent
   */
  validateAgentEnvironment(agentName: string): ValidationResult {
    const config = this.getAgentConfig(agentName);
    if (!config) {
      return { isValid: false, errors: [`Unknown agent: ${agentName}`] };
    }

    const errors: string[] = [];

    // Check required environment variables
    for (const envVar of config.requiredEnvVars) {
      if (!process.env[envVar]) {
        errors.push(`Missing required environment variable: ${envVar}`);
      }
    }

    // Check dependencies
    for (const depName of config.dependencies) {
      if (!this.agentRegistry.has(depName)) {
        errors.push(`Missing dependency: ${depName}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: config.optionalEnvVars.filter(envVar => !process.env[envVar])
        .map(envVar => `Optional environment variable not set: ${envVar}`)
    };
  }

  // Private methods

  private registerBuiltInAgents(): void {
    // Register agent types (using dynamic imports)
    this.agentRegistry.set('DatabaseAgent', this.lazyLoadES6(() =>
      import('../../server/agents/database-agent').then(m => m.DatabaseAgentImpl)
    ));

    this.agentRegistry.set('SecurityAgent', this.lazyLoadES6(() =>
      import('../../server/agents/security-agent').then(m => m.SecurityAgentImpl)
    ));

    this.agentRegistry.set('AuthenticationAgent', this.lazyLoadES6(() =>
      import('../../server/agents/authentication-agent').then(m => m.AuthenticationAgentImpl)
    ));

    this.agentRegistry.set('SearchAgent', this.lazyLoadES6(() =>
      import('../../server/agents/search-agent').then(m => m.SearchAgentImpl)
    ));

    this.agentRegistry.set('CodeReviewAgent', this.lazyLoadES6(() =>
      import('../../server/agents/code-review-agent').then(m => m.CodeReviewAgent)
    ));

    this.agentRegistry.set('ImportExportAgent', this.lazyLoadES6(() =>
      import('../../server/agents/import-export-agent').then(m => m.ImportExportAgentImpl)
    ));

    // TODO: Register other agents as they are implemented
    // this.agentRegistry.set('OrganizationAgent', this.lazyLoadES6(() =>
    //   import('../../server/agents/organization-agent').then(m => m.OrganizationAgentImpl)
    // ));
  }

  private lazyLoadES6(loader: () => Promise<AgentConstructor>): AgentConstructor {
    let cachedConstructor: AgentConstructor | null = null;

    return class LazyAgent {
      constructor(...args: any[]) {
        // For ES6 imports, we need to handle async loading differently
        // Return a promise that resolves to the instance
        if (!cachedConstructor) {
          throw new Error('Agent constructor not loaded yet. Use async initialization.');
        }
        const instance = new cachedConstructor(...args);
        Object.setPrototypeOf(this, Object.getPrototypeOf(instance));
        Object.assign(this, instance);
        return instance;
      }

      static async load(): Promise<AgentConstructor> {
        if (!cachedConstructor) {
          cachedConstructor = await loader();
        }
        return cachedConstructor;
      }
    } as any;
  }

  private lazyLoad(loader: () => AgentConstructor): AgentConstructor {
    let cachedConstructor: AgentConstructor | null = null;

    return class LazyAgent {
      constructor(...args: any[]) {
        if (!cachedConstructor) {
          cachedConstructor = loader();
        }
        const instance = new cachedConstructor(...args);
        Object.setPrototypeOf(this, Object.getPrototypeOf(instance));
        Object.assign(this, instance);
        return instance;
      }
    } as any;
  }

  private getInitializationOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (agentName: string) => {
      if (visited.has(agentName)) {
        return;
      }

      if (visiting.has(agentName)) {
        throw new Error(`Circular dependency detected involving ${agentName}`);
      }

      visiting.add(agentName);

      const config = this.getAgentConfig(agentName);
      if (config) {
        for (const dep of config.dependencies) {
          visit(dep);
        }
      }

      visiting.delete(agentName);
      visited.add(agentName);
      order.push(agentName);
    };

    // Visit all registered agent types
    for (const agentName of this.agentRegistry.keys()) {
      visit(agentName);
    }

    return order;
  }
}

// Type definitions
interface AgentConfigTemplate {
  name: string;
  description: string;
  requiredEnvVars: string[];
  optionalEnvVars: string[];
  dependencies: string[];
  defaultConfig: any;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

// Export singleton
export const agentFactory = AgentFactory.getInstance();