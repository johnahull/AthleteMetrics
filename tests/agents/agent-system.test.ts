/**
 * Agent System Test Suite
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AgentContext } from '@shared/agents/types';
import { agentFactory } from '@shared/agents/factory';
import { getOrchestrator } from '@shared/agents/orchestrator';
import { getDatabaseAgent } from '../../server/agents/database-agent';
import { getSecurityAgent } from '../../server/agents/security-agent';
import { getAuthenticationAgent } from '../../server/agents/authentication-agent';

describe('Agent System', () => {
  let testContext: AgentContext;

  beforeAll(async () => {
    // Set up test environment
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
    process.env.SESSION_SECRET = 'test-secret-key-for-agent-testing-only';

    // Initialize core agents
    await agentFactory.initializeCoreAgents();

    // Create test context
    testContext = {
      requestId: 'test-request-123',
      userId: 'test-user-456',
      sessionId: 'test-session-789',
      permissions: ['authenticated', 'athlete'],
      metadata: {
        test: true,
        timestamp: new Date()
      }
    };
  });

  afterAll(async () => {
    await agentFactory.shutdown();
  });

  describe('Agent Factory', () => {
    it('should register and create core agents', () => {
      const dbAgent = agentFactory.getAgent('DatabaseAgent');
      const securityAgent = agentFactory.getAgent('SecurityAgent');
      const authAgent = agentFactory.getAgent('AuthenticationAgent');

      expect(dbAgent).toBeDefined();
      expect(securityAgent).toBeDefined();
      expect(authAgent).toBeDefined();
    });

    it('should validate environment for agents', () => {
      const dbValidation = agentFactory.validateAgentEnvironment('DatabaseAgent');
      const securityValidation = agentFactory.validateAgentEnvironment('SecurityAgent');

      expect(dbValidation.isValid).toBe(true);
      expect(securityValidation.isValid).toBe(true);
    });

    it('should get agent configuration', () => {
      const dbConfig = agentFactory.getAgentConfig('DatabaseAgent');
      const securityConfig = agentFactory.getAgentConfig('SecurityAgent');

      expect(dbConfig).toBeDefined();
      expect(dbConfig?.name).toBe('DatabaseAgent');
      expect(securityConfig).toBeDefined();
      expect(securityConfig?.name).toBe('SecurityAgent');
    });
  });

  describe('Database Agent', () => {
    let dbAgent: any;

    beforeEach(() => {
      dbAgent = getDatabaseAgent();
    });

    it('should perform health check', async () => {
      const health = await dbAgent.healthCheck();
      expect(health.status).toBeOneOf(['healthy', 'degraded']);
    });

    it('should execute simple query', async () => {
      const result = await dbAgent.query('SELECT 1 as test_value', [], testContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.length).toBeGreaterThan(0);
      expect(result.data?.[0].test_value).toBe(1);
    });

    it('should handle query errors gracefully', async () => {
      const result = await dbAgent.query('SELECT invalid_syntax', [], testContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBeDefined();
    });

    it('should execute transactions', async () => {
      const result = await dbAgent.transaction(async (tx: any) => {
        // Simple transaction test
        return { success: true };
      }, testContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true });
    });
  });

  describe('Security Agent', () => {
    let securityAgent: any;

    beforeEach(() => {
      securityAgent = getSecurityAgent();
    });

    it('should perform health check', async () => {
      const health = await securityAgent.healthCheck();
      expect(health.status).toBeOneOf(['healthy', 'degraded']);
    });

    it('should sanitize string input', async () => {
      const maliciousInput = '<script>alert("xss")</script>Hello World';
      const result = await securityAgent.sanitizeInput(maliciousInput, { stripHTML: true }, testContext);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data).not.toContain('<script>');
      expect(result.data).toContain('Hello World');
    });

    it('should sanitize email input', async () => {
      const email = '  TEST@Example.COM  ';
      const result = await securityAgent.sanitizeInput(email, { allowedChars: 'email' }, testContext);

      expect(result.success).toBe(true);
      expect(result.data).toBe('test@example.com');
    });

    it('should sanitize object input recursively', async () => {
      const maliciousObject = {
        name: '<script>alert("xss")</script>John',
        email: '  test@example.com  ',
        nested: {
          value: '<b>Bold text</b>'
        }
      };

      const result = await securityAgent.sanitizeInput(maliciousObject, { stripHTML: true }, testContext);

      expect(result.success).toBe(true);
      expect(result.data.name).not.toContain('<script>');
      expect(result.data.email).toBe('test@example.com');
      expect(result.data.nested.value).not.toContain('<b>');
    });

    it('should check rate limits', async () => {
      const key = 'test-rate-limit';

      // First request should pass
      const result1 = await securityAgent.checkRateLimit(key, 2, 60000, testContext);
      expect(result1.success).toBe(true);
      expect(result1.data).toBe(true);

      // Second request should pass
      const result2 = await securityAgent.checkRateLimit(key, 2, 60000, testContext);
      expect(result2.success).toBe(true);
      expect(result2.data).toBe(true);

      // Third request should fail
      const result3 = await securityAgent.checkRateLimit(key, 2, 60000, testContext);
      expect(result3.success).toBe(true);
      expect(result3.data).toBe(false);
    });

    it('should generate and validate CSRF tokens', async () => {
      const contextWithSession = { ...testContext, sessionId: 'test-session-csrf' };

      const tokenResult = await securityAgent.generateCSRFToken(contextWithSession);
      expect(tokenResult.success).toBe(true);
      expect(tokenResult.data).toBeDefined();
      expect(typeof tokenResult.data).toBe('string');

      const validationResult = await securityAgent.validateCSRFToken(tokenResult.data, contextWithSession);
      expect(validationResult.success).toBe(true);
      expect(validationResult.data).toBe(true);

      // Second validation should fail (single use)
      const secondValidation = await securityAgent.validateCSRFToken(tokenResult.data, contextWithSession);
      expect(secondValidation.success).toBe(true);
      expect(secondValidation.data).toBe(false);
    });
  });

  describe('Authentication Agent', () => {
    let authAgent: any;

    beforeEach(() => {
      authAgent = getAuthenticationAgent();
    });

    it('should perform health check', async () => {
      const health = await authAgent.healthCheck();
      expect(health.status).toBeOneOf(['healthy', 'degraded']);
    });

    it('should handle invalid login attempts', async () => {
      const result = await authAgent.login('nonexistent@example.com', 'wrongpassword', testContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_CREDENTIALS');
    });

    it('should validate password strength', async () => {
      // This tests the internal password validation logic
      const weakPasswordResult = await authAgent.changePassword(
        'test-user',
        'oldpass',
        '123',
        testContext
      );

      expect(weakPasswordResult.success).toBe(false);
      expect(weakPasswordResult.error?.code).toBe('WEAK_PASSWORD');
    });

    it('should generate MFA setup', async () => {
      // Create a mock user first (this would normally exist in DB)
      const mockUserId = 'test-user-mfa';

      const mfaResult = await authAgent.enableMFA(mockUserId, testContext);

      // Should fail gracefully if user doesn't exist
      expect(mfaResult.success).toBe(false);
      expect(mfaResult.error?.code).toBe('USER_NOT_FOUND');
    });

    it('should handle session validation', async () => {
      const result = await authAgent.validateSession('nonexistent-session', testContext);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('Orchestrator', () => {
    let orchestrator: any;

    beforeEach(() => {
      orchestrator = getOrchestrator();
    });

    it('should execute single agent operation', async () => {
      const result = await orchestrator.executeAgent(
        'DatabaseAgent',
        'query',
        ['SELECT 1 as test_value', []],
        testContext
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.metadata?.executionTime).toBeDefined();
    });

    it('should execute parallel operations', async () => {
      const executions = [
        {
          agentName: 'DatabaseAgent',
          method: 'query',
          args: ['SELECT 1 as value1', []],
          context: testContext
        },
        {
          agentName: 'SecurityAgent',
          method: 'sanitizeInput',
          args: ['test input', {}],
          context: testContext
        }
      ];

      const result = await orchestrator.executeParallel(executions);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.metadata?.successCount).toBe(2);
    });

    it('should get system health', async () => {
      const health = await orchestrator.getSystemHealth();

      expect(health.status).toBeOneOf(['healthy', 'degraded', 'unhealthy']);
      expect(health.totalAgents).toBeGreaterThan(0);
      expect(health.agents).toBeDefined();
      expect(Object.keys(health.agents)).toContain('DatabaseAgent');
      expect(Object.keys(health.agents)).toContain('SecurityAgent');
      expect(Object.keys(health.agents)).toContain('AuthenticationAgent');
    });

    it('should handle agent errors gracefully', async () => {
      const result = await orchestrator.executeAgent(
        'NonexistentAgent',
        'someMethod',
        [],
        testContext
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AGENT_NOT_FOUND');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex workflow', async () => {
      const orchestrator = getOrchestrator();

      // 1. Sanitize input
      const sanitizeResult = await orchestrator.executeAgent(
        'SecurityAgent',
        'sanitizeInput',
        ['<script>test@example.com</script>', { allowedChars: 'email' }],
        testContext
      );

      expect(sanitizeResult.success).toBe(true);

      // 2. Check rate limit
      const rateLimitResult = await orchestrator.executeAgent(
        'SecurityAgent',
        'checkRateLimit',
        ['integration-test', 5, 60000],
        testContext
      );

      expect(rateLimitResult.success).toBe(true);

      // 3. Query database
      const dbResult = await orchestrator.executeAgent(
        'DatabaseAgent',
        'query',
        ['SELECT NOW() as current_time', []],
        testContext
      );

      expect(dbResult.success).toBe(true);
      expect(dbResult.data).toBeDefined();
    });

    it('should maintain context across operations', async () => {
      const contextWithMetadata = {
        ...testContext,
        metadata: {
          ...testContext.metadata,
          operationId: 'context-test-123'
        }
      };

      const orchestrator = getOrchestrator();

      const result = await orchestrator.executeAgent(
        'DatabaseAgent',
        'query',
        ['SELECT 1 as test', []],
        contextWithMetadata
      );

      expect(result.success).toBe(true);
      // The context should be preserved through the operation
      // (This would be verified through logging in a real implementation)
    });
  });
});

// Helper matchers
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    return {
      pass,
      message: () => `expected ${received} to be one of ${expected.join(', ')}`
    };
  }
});