# Agent System Documentation

## Overview

The AthleteMetrics Agent System is a modular, microservice-like architecture that breaks down complex application functionality into discrete, manageable agents. Each agent is responsible for a specific domain (authentication, database operations, security, etc.) and can be orchestrated to work together seamlessly.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Orchestrator                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │   Sequential    │ │    Parallel     │ │  Event-Driven   ││
│  │   Execution     │ │   Execution     │ │   Execution     ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Agent Factory                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │     Registry    │ │   Validation    │ │  Initialization ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        Agents                               │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────┐ │
│ │  Database   │ │  Security   │ │    Auth     │ │   Team   │ │
│ │    Agent    │ │    Agent    │ │    Agent    │ │  Agent   │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └──────────┘ │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────┐ │
│ │  Athlete    │ │Measurement  │ │ Analytics   │ │   OCR    │ │
│ │    Agent    │ │    Agent    │ │    Agent    │ │  Agent   │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └──────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Agents

Agents are self-contained units that handle specific business logic. Each agent implements the `BaseAgent` interface and provides:

- **Initialization/Shutdown**: Proper lifecycle management
- **Health Checking**: Real-time status monitoring
- **Error Handling**: Graceful failure and recovery
- **Circuit Breaking**: Automatic failure protection
- **Logging**: Comprehensive operation tracking

### Agent Context

Every agent operation receives an `AgentContext` that provides:

```typescript
interface AgentContext {
  requestId: string;           // Unique request identifier
  userId?: string;            // Current user ID
  organizationId?: string;    // Current organization context
  sessionId?: string;         // Session identifier
  permissions?: string[];     // User permissions
  metadata?: Record<string, any>; // Additional context data
}
```

### Orchestration

The orchestrator manages agent execution in three modes:

1. **Sequential**: Agents execute one after another
2. **Parallel**: Agents execute simultaneously
3. **Event-Driven**: Agents respond to system events

## Available Agents

### Core Agents

#### DatabaseAgent
- **Purpose**: Manages database connections and operations
- **Dependencies**: None
- **Key Methods**:
  - `query<T>(sql, params, context)`: Execute SQL query
  - `queryOne<T>(sql, params, context)`: Execute query expecting single result
  - `transaction<T>(callback, context)`: Execute transaction
  - `bulkInsert<T>(table, data, onConflict, context)`: Bulk data insertion

#### SecurityAgent
- **Purpose**: Input sanitization and security policies
- **Dependencies**: None
- **Key Methods**:
  - `sanitizeInput(input, rules, context)`: Sanitize user input
  - `validateInput(input, schema, context)`: Validate against schema
  - `checkPermission(action, resource, context)`: Check user permissions
  - `checkRateLimit(key, limit, window, context)`: Rate limiting
  - `generateCSRFToken(context)`: Generate CSRF protection token
  - `validateCSRFToken(token, context)`: Validate CSRF token

#### AuthenticationAgent
- **Purpose**: User authentication and session management
- **Dependencies**: DatabaseAgent, SecurityAgent
- **Key Methods**:
  - `login(email, password, context)`: User authentication
  - `logout(sessionId, context)`: Session termination
  - `validateSession(sessionId, context)`: Session validation
  - `changePassword(userId, oldPassword, newPassword, context)`: Password change
  - `resetPassword(email, context)`: Password reset initiation
  - `enableMFA(userId, context)`: Multi-factor authentication setup
  - `verifyMFA(userId, code, context)`: MFA verification

### Domain Agents (To Be Implemented)

#### OrganizationAgent
- **Purpose**: Multi-tenant organization management
- **Dependencies**: DatabaseAgent, SecurityAgent

#### TeamAgent
- **Purpose**: Team and roster management
- **Dependencies**: DatabaseAgent, SecurityAgent, OrganizationAgent

#### AthleteAgent
- **Purpose**: Athlete profile and data management
- **Dependencies**: DatabaseAgent, SecurityAgent, OrganizationAgent

#### MeasurementAgent
- **Purpose**: Performance measurement recording and processing
- **Dependencies**: DatabaseAgent, SecurityAgent, AthleteAgent

#### AnalyticsAgent
- **Purpose**: Data analysis and reporting
- **Dependencies**: DatabaseAgent, MeasurementAgent

#### ImportExportAgent
- **Purpose**: Bulk data operations and CSV processing
- **Dependencies**: DatabaseAgent, SecurityAgent, AthleteAgent, MeasurementAgent

#### OCRAgent
- **Purpose**: Image processing and data extraction
- **Dependencies**: SecurityAgent

#### NotificationAgent
- **Purpose**: Email and system notifications
- **Dependencies**: None

#### SearchAgent
- **Purpose**: Cross-entity search capabilities
- **Dependencies**: DatabaseAgent, SecurityAgent

## Usage Examples

### Express.js Integration

```typescript
import {
  agentContextMiddleware,
  agentErrorHandler,
  agentRoute,
  initializeAgentSystem
} from './middleware/agent-middleware';

// Initialize agent system on startup
await initializeAgentSystem();

// Add middleware
app.use(agentContextMiddleware());

// Use agents in routes
app.get('/api/users', agentRoute(async (req, res, agents) => {
  // Sanitize search term
  const searchTerm = await agents.execute('SecurityAgent', 'sanitizeInput',
    req.query.search, { allowedChars: 'search' }
  );

  // Query users
  const users = await agents.execute('DatabaseAgent', 'query',
    'SELECT * FROM users WHERE name ILIKE $1', [`%${searchTerm}%`]
  );

  return users;
}));

// Error handling
app.use(agentErrorHandler());
```

### Direct Agent Usage

```typescript
import { agentFactory } from '@shared/agents/factory';

// Get agent instance
const dbAgent = agentFactory.getAgent('DatabaseAgent');

// Create context
const context = {
  requestId: 'req-123',
  userId: 'user-456',
  permissions: ['read:users']
};

// Execute operation
const result = await dbAgent.query(
  'SELECT * FROM users WHERE id = $1',
  ['user-456'],
  context
);

if (result.success) {
  console.log('User data:', result.data);
} else {
  console.error('Query failed:', result.error);
}
```

### Orchestrated Execution

```typescript
import { getOrchestrator } from '@shared/agents/orchestrator';

const orchestrator = getOrchestrator();

// Parallel execution
const results = await orchestrator.executeParallel([
  {
    agentName: 'SecurityAgent',
    method: 'sanitizeInput',
    args: [userInput, { stripHTML: true }],
    context: requestContext
  },
  {
    agentName: 'DatabaseAgent',
    method: 'query',
    args: ['SELECT COUNT(*) FROM users', []],
    context: requestContext
  }
]);

// Sequential execution
const seqResults = await orchestrator.executeSequence([
  {
    agentName: 'SecurityAgent',
    method: 'checkPermission',
    args: ['create', 'users'],
    context: requestContext
  },
  {
    agentName: 'DatabaseAgent',
    method: 'transaction',
    args: [async (tx) => {
      // Database operations
      return await tx.insert(users).values(newUser);
    }],
    context: requestContext,
    continueOnError: false
  }
]);
```

## Configuration

### Environment Variables

#### Required for Core Agents
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Session encryption key

#### Optional
- `MFA_ISSUER`: MFA issuer name (default: "AthleteMetrics")
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: Email configuration
- `OCR_API_KEY`: OCR service API key
- `ANALYTICS_CACHE_TTL`: Analytics cache duration

### Agent Configuration

Each agent can be configured with:

```typescript
interface AgentConfig {
  enabled: boolean;                    // Enable/disable agent
  logLevel: 'debug' | 'info' | 'warn' | 'error';  // Logging level
  timeout: number;                     // Operation timeout (ms)
  retries: number;                     // Retry attempts
  circuitBreaker?: {                   // Circuit breaker settings
    enabled: boolean;
    failureThreshold: number;
    resetTimeout: number;
  };
}
```

## Error Handling

### Agent Errors

All agent operations return a consistent error structure:

```typescript
interface AgentError {
  code: string;        // Error code (e.g., 'INVALID_CREDENTIALS')
  message: string;     // Human-readable message
  details?: any;       // Additional error details
  stack?: string;      // Stack trace (development)
  retryable?: boolean; // Whether operation can be retried
}
```

### Common Error Codes

- **Authentication**: `INVALID_CREDENTIALS`, `SESSION_EXPIRED`, `MFA_REQUIRED`
- **Authorization**: `PERMISSION_DENIED`, `INSUFFICIENT_PRIVILEGES`
- **Validation**: `INVALID_INPUT`, `SANITIZATION_FAILED`, `WEAK_PASSWORD`
- **Rate Limiting**: `RATE_LIMITED`
- **System**: `DATABASE_ERROR`, `TIMEOUT`, `AGENT_UNHEALTHY`

### Error Recovery

The system provides automatic error recovery through:

1. **Retries**: Configurable retry attempts with exponential backoff
2. **Circuit Breakers**: Automatic failure detection and recovery
3. **Fallbacks**: Alternative execution paths for critical operations
4. **Health Monitoring**: Continuous agent health assessment

## Monitoring and Health Checks

### System Health Endpoint

```
GET /api/health/agents
```

Returns comprehensive system health:

```json
{
  "status": "healthy",
  "agents": {
    "DatabaseAgent": {
      "status": "healthy",
      "message": "Database connection is healthy",
      "lastCheck": "2024-01-15T10:30:00Z"
    },
    "SecurityAgent": {
      "status": "healthy",
      "message": "Security agent is functioning properly",
      "lastCheck": "2024-01-15T10:30:00Z"
    }
  },
  "totalAgents": 3,
  "healthyAgents": 3,
  "degradedAgents": 0,
  "unhealthyAgents": 0,
  "lastCheck": "2024-01-15T10:30:00Z"
}
```

### Logging

All agent operations are logged with:

- Request ID for tracing
- Execution time metrics
- Error details and stack traces
- Context information

### Metrics

The system tracks:

- Operation success/failure rates
- Average execution times
- Error frequencies by type
- Circuit breaker states
- Rate limiting statistics

## Testing

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { getDatabaseAgent } from '../server/agents/database-agent';

describe('DatabaseAgent', () => {
  it('should execute queries successfully', async () => {
    const agent = getDatabaseAgent();
    const result = await agent.query('SELECT 1 as test', []);

    expect(result.success).toBe(true);
    expect(result.data[0].test).toBe(1);
  });
});
```

### Integration Tests

The test suite includes comprehensive integration tests covering:

- Agent initialization and lifecycle
- Cross-agent dependencies
- Error handling and recovery
- Performance and timeout behavior
- Security validation

Run tests with:

```bash
npm test tests/agents/
```

## Development Guide

### Creating a New Agent

1. **Define Interface**: Add agent contract to `shared/agents/contracts.ts`

```typescript
export interface MyNewAgent extends BaseAgent {
  doSomething(param: string, context?: AgentContext): Promise<AgentResult<string>>;
}
```

2. **Implement Agent**: Create implementation in `server/agents/`

```typescript
export class MyNewAgentImpl extends AbstractBaseAgent implements MyNewAgent {
  constructor() {
    super('MyNewAgent', '1.0.0', ['DatabaseAgent']);
  }

  protected async onInitialize(): Promise<void> {
    // Initialization logic
  }

  async doSomething(param: string, context?: AgentContext): Promise<AgentResult<string>> {
    try {
      // Implementation logic
      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(error, 'OPERATION_FAILED');
    }
  }
}
```

3. **Register Agent**: Add to factory in `shared/agents/factory.ts`

```typescript
this.agentRegistry.set('MyNewAgent', this.lazyLoad(() =>
  require('../../server/agents/my-new-agent').MyNewAgentImpl
));
```

4. **Add Configuration**: Update agent config templates

5. **Write Tests**: Create comprehensive test coverage

### Best Practices

1. **Single Responsibility**: Each agent should handle one domain
2. **Dependency Management**: Clearly define and validate dependencies
3. **Error Handling**: Always return structured errors
4. **Context Awareness**: Use agent context for tracing and permissions
5. **Performance**: Implement timeouts and circuit breakers
6. **Testing**: Write both unit and integration tests
7. **Documentation**: Document all public methods and usage patterns

## Troubleshooting

### Common Issues

#### Agent Initialization Failures
- Check environment variables are set
- Verify database connectivity
- Check dependency order

#### Performance Issues
- Review timeout configurations
- Check for database connection leaks
- Monitor circuit breaker states

#### Authentication Problems
- Verify session configuration
- Check MFA setup
- Review permission mappings

### Debug Mode

Enable debug logging:

```typescript
const agent = new MyAgentImpl();
agent.config.logLevel = 'debug';
```

### Health Monitoring

Monitor agent health continuously:

```typescript
setInterval(async () => {
  const health = await orchestrator.getSystemHealth();
  if (health.status !== 'healthy') {
    console.warn('System health degraded:', health);
  }
}, 60000);
```

## Migration Guide

### From Direct Service Calls

Replace direct service calls with agent execution:

```typescript
// Before
const userService = new UserService();
const users = await userService.getUsers();

// After
const users = await agents.execute('DatabaseAgent', 'query',
  'SELECT * FROM users WHERE is_active = true', []
);
```

### Gradual Adoption

1. Start with core agents (Database, Security, Auth)
2. Migrate existing services to agents incrementally
3. Update routes to use agent middleware
4. Replace direct database calls with agent operations
5. Add comprehensive monitoring and testing

The agent system is designed for gradual adoption and can coexist with existing code during migration.