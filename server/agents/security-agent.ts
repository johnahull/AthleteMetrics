/**
 * Security Agent - Handles input sanitization, validation, and security policies
 */

import { AbstractBaseAgent } from '@shared/agents/base-agent';
import { SecurityAgent, SanitizationRules } from '@shared/agents/contracts';
import { AgentContext, AgentResult, AgentHealth } from '@shared/agents/types';
import {
  sanitizeSearchTerm,
  validateSearchTerm,
  sanitizeTextInput,
  sanitizeEmail,
  sanitizeNumericInput
} from '@shared/input-sanitization';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

export class SecurityAgentImpl extends AbstractBaseAgent implements SecurityAgent {
  private rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();
  private csrfTokens: Map<string, { token: string; expires: number }> = new Map();
  private permissionCache: Map<string, { permissions: Set<string>; expires: number }> = new Map();

  constructor() {
    super('SecurityAgent', '1.0.0', [], {
      enabled: true,
      logLevel: 'info',
      timeout: 5000,
      retries: 1,
      circuitBreaker: {
        enabled: false, // Security operations should not use circuit breaker
        failureThreshold: 10,
        resetTimeout: 30000
      }
    });
  }

  protected async onInitialize(): Promise<void> {
    // Initialize security configurations
    this.startCleanupTimer();
    this.log('info', 'Security agent initialized successfully');
  }

  protected async onShutdown(): Promise<void> {
    // Clear all caches and timers
    this.rateLimitStore.clear();
    this.csrfTokens.clear();
    this.permissionCache.clear();
    this.log('info', 'Security agent shut down successfully');
  }

  protected async onHealthCheck(): Promise<AgentHealth> {
    try {
      // Check if security functions are working
      const testInput = 'test<script>alert("xss")</script>';
      const sanitized = await this.sanitizeInput(testInput, { stripHTML: true });

      if (sanitized.success && !sanitized.data?.includes('<script>')) {
        return {
          status: 'healthy',
          message: 'Security agent is functioning properly',
          lastCheck: new Date()
        };
      } else {
        return {
          status: 'degraded',
          message: 'Security sanitization not working correctly',
          lastCheck: new Date()
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Security agent health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastCheck: new Date()
      };
    }
  }

  async sanitizeInput(
    input: any,
    rules: SanitizationRules = {},
    context?: AgentContext
  ): Promise<AgentResult<any>> {
    try {
      this.log('debug', 'Sanitizing input', { inputType: typeof input, context: context?.requestId });

      let sanitized: any;

      if (typeof input === 'string') {
        sanitized = this.sanitizeString(input, rules);
      } else if (typeof input === 'number') {
        sanitized = this.sanitizeNumber(input, rules);
      } else if (typeof input === 'object' && input !== null) {
        sanitized = await this.sanitizeObject(input, rules);
      } else if (Array.isArray(input)) {
        sanitized = await this.sanitizeArray(input, rules);
      } else {
        sanitized = input;
      }

      return this.createSuccessResult(sanitized);
    } catch (error) {
      this.log('error', 'Input sanitization failed', {
        input: typeof input === 'string' ? input.substring(0, 100) : typeof input,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'SANITIZATION_FAILED');
    }
  }

  async validateInput(
    input: any,
    schema: z.ZodSchema,
    context?: AgentContext
  ): Promise<AgentResult<boolean>> {
    try {
      this.log('debug', 'Validating input against schema', { context: context?.requestId });

      const result = schema.safeParse(input);

      if (result.success) {
        return this.createSuccessResult(true);
      } else {
        this.log('warn', 'Input validation failed', {
          errors: result.error.errors,
          context: context?.requestId
        });

        return this.createSuccessResult(false, {
          validationErrors: result.error.errors
        });
      }
    } catch (error) {
      this.log('error', 'Input validation error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'VALIDATION_FAILED');
    }
  }

  async checkPermission(
    action: string,
    resource: string,
    context: AgentContext
  ): Promise<AgentResult<boolean>> {
    try {
      if (!context.userId) {
        return this.createSuccessResult(false, { reason: 'No user context' });
      }

      this.log('debug', 'Checking permission', {
        action,
        resource,
        userId: context.userId,
        context: context.requestId
      });

      // Check cache first
      const cacheKey = `${context.userId}:${context.organizationId || 'global'}`;
      const cached = this.permissionCache.get(cacheKey);

      let userPermissions: Set<string>;

      if (cached && cached.expires > Date.now()) {
        userPermissions = cached.permissions;
      } else {
        // Get permissions from context or database
        userPermissions = new Set(context.permissions || []);

        // Add role-based permissions
        if (context.permissions?.includes('site_admin')) {
          userPermissions.add('*'); // Site admins have all permissions
        }

        // Cache permissions for 5 minutes
        this.permissionCache.set(cacheKey, {
          permissions: userPermissions,
          expires: Date.now() + 5 * 60 * 1000
        });
      }

      // Check permissions
      const hasPermission = this.evaluatePermission(action, resource, userPermissions);

      if (!hasPermission) {
        this.log('warn', 'Permission denied', {
          action,
          resource,
          userId: context.userId,
          userPermissions: Array.from(userPermissions)
        });
      }

      return this.createSuccessResult(hasPermission);
    } catch (error) {
      this.log('error', 'Permission check failed', {
        action,
        resource,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'PERMISSION_CHECK_FAILED');
    }
  }

  async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    context?: AgentContext
  ): Promise<AgentResult<boolean>> {
    try {
      const now = Date.now();
      const windowStart = now - windowMs;

      this.log('debug', 'Checking rate limit', {
        key,
        limit,
        windowMs,
        context: context?.requestId
      });

      // Clean up expired entries
      const existing = this.rateLimitStore.get(key);

      if (existing && existing.resetTime <= now) {
        this.rateLimitStore.delete(key);
      }

      const current = this.rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };

      if (current.count >= limit) {
        this.log('warn', 'Rate limit exceeded', {
          key,
          count: current.count,
          limit,
          resetTime: new Date(current.resetTime)
        });

        return this.createSuccessResult(false, {
          reason: 'Rate limit exceeded',
          resetTime: current.resetTime,
          remaining: 0
        });
      }

      // Increment counter
      current.count++;
      this.rateLimitStore.set(key, current);

      return this.createSuccessResult(true, {
        remaining: limit - current.count,
        resetTime: current.resetTime
      });
    } catch (error) {
      this.log('error', 'Rate limit check failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'RATE_LIMIT_CHECK_FAILED');
    }
  }

  async generateCSRFToken(context: AgentContext): Promise<AgentResult<string>> {
    try {
      if (!context.sessionId) {
        return this.createErrorResult('Session ID required for CSRF token generation', 'MISSING_SESSION');
      }

      const token = this.generateSecureToken();
      const expires = Date.now() + 60 * 60 * 1000; // 1 hour

      this.csrfTokens.set(context.sessionId, { token, expires });

      this.log('debug', 'CSRF token generated', {
        sessionId: context.sessionId,
        expires: new Date(expires)
      });

      return this.createSuccessResult(token);
    } catch (error) {
      this.log('error', 'CSRF token generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'CSRF_TOKEN_GENERATION_FAILED');
    }
  }

  async validateCSRFToken(token: string, context: AgentContext): Promise<AgentResult<boolean>> {
    try {
      if (!context.sessionId) {
        return this.createSuccessResult(false, { reason: 'No session ID' });
      }

      const stored = this.csrfTokens.get(context.sessionId);

      if (!stored) {
        return this.createSuccessResult(false, { reason: 'No CSRF token found' });
      }

      if (stored.expires <= Date.now()) {
        this.csrfTokens.delete(context.sessionId);
        return this.createSuccessResult(false, { reason: 'CSRF token expired' });
      }

      const isValid = stored.token === token;

      if (isValid) {
        // Remove token after successful validation (single use)
        this.csrfTokens.delete(context.sessionId);
      }

      this.log('debug', 'CSRF token validation', {
        sessionId: context.sessionId,
        isValid
      });

      return this.createSuccessResult(isValid);
    } catch (error) {
      this.log('error', 'CSRF token validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'CSRF_TOKEN_VALIDATION_FAILED');
    }
  }

  // Private helper methods

  private sanitizeString(input: string, rules: SanitizationRules): string {
    const options = {
      maxLength: rules.maxLength || 1000,
      allowSpecialChars: !rules.stripHTML,
      preserveNewlines: false
    };

    // Use existing utility functions based on context
    if (rules.allowedChars === 'search') {
      const sanitized = sanitizeSearchTerm(input);
      return validateSearchTerm(sanitized) ? sanitized : '';
    } else if (rules.allowedChars === 'email') {
      return sanitizeEmail(input);
    } else {
      return sanitizeTextInput(input, options);
    }
  }

  private sanitizeNumber(input: number, rules: SanitizationRules): number | null {
    return sanitizeNumericInput(input, {
      min: typeof rules.maxLength === 'number' ? -rules.maxLength : undefined,
      max: rules.maxLength,
      allowFloat: true
    });
  }

  private async sanitizeObject(obj: any, rules: SanitizationRules): Promise<any> {
    const sanitized: any = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value, rules);
      } else if (typeof value === 'number') {
        sanitized[key] = this.sanitizeNumber(value, rules);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = await this.sanitizeObject(value, rules);
      } else if (Array.isArray(value)) {
        sanitized[key] = await this.sanitizeArray(value, rules);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private async sanitizeArray(arr: any[], rules: SanitizationRules): Promise<any[]> {
    const sanitized: any[] = [];

    for (const item of arr) {
      if (typeof item === 'string') {
        sanitized.push(this.sanitizeString(item, rules));
      } else if (typeof item === 'number') {
        sanitized.push(this.sanitizeNumber(item, rules));
      } else if (typeof item === 'object' && item !== null) {
        sanitized.push(await this.sanitizeObject(item, rules));
      } else if (Array.isArray(item)) {
        sanitized.push(await this.sanitizeArray(item, rules));
      } else {
        sanitized.push(item);
      }
    }

    return sanitized;
  }

  private evaluatePermission(action: string, resource: string, permissions: Set<string>): boolean {
    // Check for wildcard permission (site admin)
    if (permissions.has('*')) {
      return true;
    }

    // Check for exact permission match
    const exactPermission = `${action}:${resource}`;
    if (permissions.has(exactPermission)) {
      return true;
    }

    // Check for action wildcard (e.g., "*:users")
    const actionWildcard = `*:${resource}`;
    if (permissions.has(actionWildcard)) {
      return true;
    }

    // Check for resource wildcard (e.g., "read:*")
    const resourceWildcard = `${action}:*`;
    if (permissions.has(resourceWildcard)) {
      return true;
    }

    // Check for role-based permissions
    const rolePermissions = this.getRolePermissions(permissions);
    return rolePermissions.some(permission =>
      permission === exactPermission ||
      permission === actionWildcard ||
      permission === resourceWildcard
    );
  }

  private getRolePermissions(permissions: Set<string>): string[] {
    const rolePermissions: string[] = [];

    // Map common roles to permissions
    if (permissions.has('site_admin')) {
      rolePermissions.push('*:*');
    }

    if (permissions.has('org_admin')) {
      rolePermissions.push('read:*', 'create:*', 'update:*', 'delete:users', 'delete:athletes');
    }

    if (permissions.has('coach')) {
      rolePermissions.push('read:*', 'create:athletes', 'update:athletes', 'create:measurements', 'update:measurements');
    }

    if (permissions.has('athlete')) {
      rolePermissions.push('read:own_profile', 'update:own_profile', 'read:own_measurements');
    }

    return rolePermissions;
  }

  private generateSecureToken(): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  private startCleanupTimer(): void {
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      const now = Date.now();

      // Clean rate limit store
      for (const [key, entry] of this.rateLimitStore.entries()) {
        if (entry.resetTime <= now) {
          this.rateLimitStore.delete(key);
        }
      }

      // Clean CSRF tokens
      for (const [sessionId, token] of this.csrfTokens.entries()) {
        if (token.expires <= now) {
          this.csrfTokens.delete(sessionId);
        }
      }

      // Clean permission cache
      for (const [key, cache] of this.permissionCache.entries()) {
        if (cache.expires <= now) {
          this.permissionCache.delete(key);
        }
      }

      this.log('debug', 'Cleanup completed', {
        rateLimitEntries: this.rateLimitStore.size,
        csrfTokens: this.csrfTokens.size,
        permissionCache: this.permissionCache.size
      });
    }, 5 * 60 * 1000);
  }
}

// Singleton instance
let securityAgentInstance: SecurityAgentImpl | null = null;

export function getSecurityAgent(): SecurityAgentImpl {
  if (!securityAgentInstance) {
    securityAgentInstance = new SecurityAgentImpl();
  }
  return securityAgentInstance;
}