/**
 * Organization Type Middleware
 * 
 * @fileoverview Middleware for organization type validation, authorization, and error handling.
 * Provides reusable middleware functions for consistent organization type operations across routes.
 * 
 * @author AthleteMetrics System
 * @version 1.0.0
 * @since 2025-11-09
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { 
  isValidOrganizationType, 
  parseOrganizationType,
  createOrganizationTypeSchema,
  type OrganizationType 
} from '@shared/organization-type-utils';
import { organizationTypeEnum } from '@shared/schema';

/**
 * Error types for organization type operations
 */
export enum OrganizationTypeErrorType {
  INVALID_TYPE = 'INVALID_ORG_TYPE',
  UNAUTHORIZED_TYPE_ACCESS = 'UNAUTHORIZED_TYPE_ACCESS',
  TYPE_VALIDATION_FAILED = 'TYPE_VALIDATION_FAILED',
  TYPE_FILTERING_ERROR = 'TYPE_FILTERING_ERROR',
}

/**
 * Custom error class for organization type operations
 */
export class OrganizationTypeError extends Error {
  constructor(
    public type: OrganizationTypeErrorType,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'OrganizationTypeError';
  }
}

/**
 * Extended Request interface with organization type context
 */
export interface OrganizationTypeRequest extends Request {
  organizationType?: OrganizationType | null;
  organizationTypeValidated?: boolean;
  organizationTypeContext?: {
    source: 'param' | 'query' | 'body';
    original: unknown;
    normalized: OrganizationType;
  };
}

/**
 * Configuration for organization type validation middleware
 */
interface OrganizationTypeValidationConfig {
  /** Source of organization type value */
  source: 'param' | 'query' | 'body';
  /** Field name containing organization type */
  field: string;
  /** Whether organization type is required */
  required: boolean;
  /** Default organization type if not provided */
  defaultValue?: OrganizationType;
  /** Whether to normalize the value */
  normalize: boolean;
  /** Custom error message */
  errorMessage?: string;
  /** Whether to skip validation for site admins */
  skipForSiteAdmin: boolean;
}

/**
 * Default configuration for organization type validation
 */
const DEFAULT_CONFIG: OrganizationTypeValidationConfig = {
  source: 'param',
  field: 'orgType',
  required: false,
  normalize: true,
  skipForSiteAdmin: false,
};

/**
 * Validates and normalizes organization type from request
 * 
 * @param config - Validation configuration
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * app.get('/api/metrics/:orgType', 
 *   validateOrganizationType({ source: 'param', field: 'orgType', required: true }),
 *   (req, res) => {
 *     // req.organizationType is now validated and available
 *   }
 * );
 * ```
 */
export function validateOrganizationType(
  config: Partial<OrganizationTypeValidationConfig> = {}
) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return (req: OrganizationTypeRequest, res: Response, next: NextFunction) => {
    try {
      // Skip validation for site admins if configured
      if (finalConfig.skipForSiteAdmin && req.session?.user?.isSiteAdmin) {
        return next();
      }

      // Extract value from request
      let value: unknown;
      switch (finalConfig.source) {
        case 'param':
          value = req.params[finalConfig.field];
          break;
        case 'query':
          value = req.query[finalConfig.field];
          break;
        case 'body':
          value = req.body?.[finalConfig.field];
          break;
        default:
          throw new OrganizationTypeError(
            OrganizationTypeErrorType.TYPE_VALIDATION_FAILED,
            `Invalid source: ${finalConfig.source}`,
            500
          );
      }

      // Handle missing value
      if (value == null || value === '') {
        if (finalConfig.required) {
          throw new OrganizationTypeError(
            OrganizationTypeErrorType.INVALID_TYPE,
            finalConfig.errorMessage || `Organization type is required in ${finalConfig.source}.${finalConfig.field}`,
            400
          );
        }
        
        if (finalConfig.defaultValue) {
          value = finalConfig.defaultValue;
        } else {
          return next(); // Skip validation if not required and no default
        }
      }

      // Validate organization type
      if (!isValidOrganizationType(value)) {
        throw new OrganizationTypeError(
          OrganizationTypeErrorType.INVALID_TYPE,
          `Invalid organization type: ${value}. Valid types are: ${organizationTypeEnum.join(', ')}`,
          400,
          { 
            provided: value, 
            validTypes: organizationTypeEnum,
            source: finalConfig.source,
            field: finalConfig.field,
          }
        );
      }

      // Normalize and attach to request
      const normalizedType = parseOrganizationType(value);
      
      req.organizationType = normalizedType;
      req.organizationTypeValidated = true;
      req.organizationTypeContext = {
        source: finalConfig.source,
        original: value,
        normalized: normalizedType,
      };

      // Update request object with normalized value if normalizing
      if (finalConfig.normalize) {
        switch (finalConfig.source) {
          case 'param':
            req.params[finalConfig.field] = normalizedType;
            break;
          case 'query':
            req.query[finalConfig.field] = normalizedType;
            break;
          case 'body':
            if (req.body) {
              req.body[finalConfig.field] = normalizedType;
            }
            break;
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validates organization type in request parameters
 * Convenience middleware for common route parameter validation
 * 
 * @param paramName - Parameter name (defaults to 'orgType')
 * @param required - Whether parameter is required (defaults to true)
 * @returns Express middleware function
 */
export function validateOrgTypeParam(paramName: string = 'orgType', required: boolean = true) {
  return validateOrganizationType({
    source: 'param',
    field: paramName,
    required,
    normalize: true,
  });
}

/**
 * Validates organization type in query parameters
 * Convenience middleware for query parameter validation
 * 
 * @param queryName - Query parameter name (defaults to 'orgType')
 * @param required - Whether parameter is required (defaults to false)
 * @returns Express middleware function
 */
export function validateOrgTypeQuery(queryName: string = 'orgType', required: boolean = false) {
  return validateOrganizationType({
    source: 'query',
    field: queryName,
    required,
    normalize: true,
  });
}

/**
 * Validates organization type in request body
 * Convenience middleware for body validation
 * 
 * @param fieldName - Field name in body (defaults to 'orgType')
 * @param required - Whether field is required (defaults to true)
 * @returns Express middleware function
 */
export function validateOrgTypeBody(fieldName: string = 'orgType', required: boolean = true) {
  return validateOrganizationType({
    source: 'body',
    field: fieldName,
    required,
    normalize: true,
  });
}

/**
 * Validates array of organization types in request body
 * Used for bulk operations and filtering endpoints
 * 
 * @param fieldName - Field name containing array (defaults to 'orgTypes')
 * @param required - Whether field is required (defaults to false)
 * @param maxLength - Maximum array length (defaults to 10)
 * @returns Express middleware function
 */
export function validateOrgTypeArray(
  fieldName: string = 'orgTypes',
  required: boolean = false,
  maxLength: number = 10
) {
  return (req: OrganizationTypeRequest, res: Response, next: NextFunction) => {
    try {
      const value = req.body?.[fieldName];

      // Handle missing value
      if (value == null) {
        if (required) {
          throw new OrganizationTypeError(
            OrganizationTypeErrorType.TYPE_VALIDATION_FAILED,
            `${fieldName} is required`,
            400
          );
        }
        return next();
      }

      // Validate array
      if (!Array.isArray(value)) {
        throw new OrganizationTypeError(
          OrganizationTypeErrorType.TYPE_VALIDATION_FAILED,
          `${fieldName} must be an array`,
          400
        );
      }

      // Check array length
      if (value.length > maxLength) {
        throw new OrganizationTypeError(
          OrganizationTypeErrorType.TYPE_VALIDATION_FAILED,
          `${fieldName} cannot contain more than ${maxLength} items`,
          400
        );
      }

      // Validate each organization type
      const validatedTypes: OrganizationType[] = [];
      const invalidTypes: string[] = [];

      for (let i = 0; i < value.length; i++) {
        const orgType = value[i];
        if (isValidOrganizationType(orgType)) {
          validatedTypes.push(orgType);
        } else {
          invalidTypes.push(`${i}: ${orgType}`);
        }
      }

      if (invalidTypes.length > 0) {
        throw new OrganizationTypeError(
          OrganizationTypeErrorType.INVALID_TYPE,
          `Invalid organization types at indices: ${invalidTypes.join(', ')}. Valid types are: ${organizationTypeEnum.join(', ')}`,
          400,
          { invalidIndices: invalidTypes, validTypes: organizationTypeEnum }
        );
      }

      // Update request body with validated array
      req.body[fieldName] = validatedTypes;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to verify user has access to a specific organization type
 * Non-admin users can only access data for organization types they belong to
 *
 * @param storage - Storage instance for database queries
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * app.get('/api/organization-types/:orgType/metrics',
 *   requireAuth,
 *   validateOrgTypeParam('orgType'),
 *   verifyOrganizationTypeAccess(storage),
 *   handler
 * );
 * ```
 */
export function verifyOrganizationTypeAccess(storage: any) {
  return async (req: OrganizationTypeRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.session?.user;
      if (!user) {
        throw new OrganizationTypeError(
          OrganizationTypeErrorType.UNAUTHORIZED_TYPE_ACCESS,
          'Authentication required',
          401
        );
      }

      // Site admins have access to all organization types
      if (user.isSiteAdmin) {
        return next();
      }

      // Get requested organization type from params
      const requestedOrgType = req.params.orgType as OrganizationType | undefined;
      if (!requestedOrgType) {
        return next(); // No org type specified, proceed (will be handled by other validation)
      }

      // Get user's organizations to check their organization types
      const userOrgs = await storage.getUserOrganizations(user.id);

      // Extract unique organization types the user belongs to
      const userOrgTypes = new Set(
        userOrgs
          .map((uo: any) => uo.organization?.orgType)
          .filter((type: any) => type != null)
      );

      // Check if user has access to the requested organization type
      if (!userOrgTypes.has(requestedOrgType)) {
        throw new OrganizationTypeError(
          OrganizationTypeErrorType.UNAUTHORIZED_TYPE_ACCESS,
          `You don't have access to resources for organization type '${requestedOrgType}'. You can only access data for organization types you belong to.`,
          403,
          {
            requestedOrgType,
            userOrgTypes: Array.from(userOrgTypes),
            userId: user.id
          }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Authorization middleware to check if user can access specific organization type data
 * Enforces business rules for organization type access
 *
 * @param allowedRoles - Roles allowed to access organization type data
 * @returns Express middleware function
 */
export function authorizeOrganizationTypeAccess(
  allowedRoles: string[] = ['site_admin', 'org_admin', 'coach']
) {
  return async (req: OrganizationTypeRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.session?.user;
      if (!user) {
        throw new OrganizationTypeError(
          OrganizationTypeErrorType.UNAUTHORIZED_TYPE_ACCESS,
          'Authentication required',
          401
        );
      }

      // Site admins have access to all organization types
      if (user.isSiteAdmin) {
        return next();
      }

      // Check user role
      const userRole = user.role || 'athlete';
      if (!allowedRoles.includes(userRole)) {
        throw new OrganizationTypeError(
          OrganizationTypeErrorType.UNAUTHORIZED_TYPE_ACCESS,
          `Access denied. Required roles: ${allowedRoles.join(', ')}`,
          403,
          { userRole, allowedRoles }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Error handling middleware for organization type errors
 * Provides consistent error responses and logging
 * 
 * @param error - Error object
 * @param req - Express request
 * @param res - Express response
 * @param next - Express next function
 */
export function handleOrganizationTypeError(
  error: Error,
  req: OrganizationTypeRequest,
  res: Response,
  next: NextFunction
) {
  // Handle organization type specific errors
  if (error instanceof OrganizationTypeError) {
    const response = {
      error: {
        type: error.type,
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && error.details ? { details: error.details } : {}),
      },
    };

    // Log error for monitoring
    console.error(`OrganizationTypeError [${error.type}]:`, {
      message: error.message,
      statusCode: error.statusCode,
      details: error.details,
      url: req.url,
      method: req.method,
      userId: req.session?.user?.id,
      timestamp: new Date().toISOString(),
    });

    return res.status(error.statusCode).json(response);
  }

  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    const response = {
      error: {
        type: OrganizationTypeErrorType.TYPE_VALIDATION_FAILED,
        message: 'Organization type validation failed',
        details: error.errors,
      },
    };

    return res.status(400).json(response);
  }

  // Pass other errors to default error handler
  next(error);
}

/**
 * Middleware to ensure organization type is present in request
 * Used after validation middleware to guarantee type safety
 * 
 * @returns Express middleware function
 */
export function requireOrganizationType() {
  return (req: OrganizationTypeRequest, res: Response, next: NextFunction) => {
    if (!req.organizationType || !req.organizationTypeValidated) {
      return next(new OrganizationTypeError(
        OrganizationTypeErrorType.TYPE_VALIDATION_FAILED,
        'Organization type validation middleware must be used before this middleware',
        500
      ));
    }
    next();
  };
}

/**
 * Middleware to log organization type access for audit purposes
 * 
 * @param action - Action being performed (for audit logging)
 * @returns Express middleware function
 */
export function logOrganizationTypeAccess(action: string = 'organization_type_accessed') {
  return async (req: OrganizationTypeRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.session?.user;
      const orgType = req.organizationType;
      
      if (user && orgType) {
        // Create audit log entry
        const auditData = {
          userId: user.id,
          action,
          resourceType: 'organization_type',
          resourceId: orgType,
          details: JSON.stringify({
            organizationType: orgType,
            url: req.url,
            method: req.method,
            userAgent: req.get('user-agent'),
            source: req.organizationTypeContext?.source,
          }),
          ipAddress: req.ip,
        };

        // Log asynchronously to avoid blocking request
        setImmediate(async () => {
          try {
            // Assuming storage is available through some dependency injection
            // This would need to be implemented based on your storage setup
            console.log('Organization type access logged:', auditData);
          } catch (logError) {
            // CRITICAL: Audit log failure - this should trigger alerts in production
            console.error('CRITICAL: Audit log failed:', logError);

            // TODO: Integrate with monitoring service (e.g., Sentry, DataDog, CloudWatch)
            // Example implementations:
            // - await Sentry.captureException(logError, { level: 'error', tags: { type: 'audit_log_failure' } });
            // - await DatadogLogger.error('audit_log_failure', { error: logError, context: auditData });
            // - await CloudWatchLogger.putMetricData({ MetricName: 'AuditLogFailure', Value: 1 });

            // In production, this should trigger alerts for compliance monitoring
            if (process.env.NODE_ENV === 'production') {
              // Production alert handling should be implemented here
              // await alertService.sendCriticalAlert('audit_log_failure', {
              //   error: logError,
              //   auditData,
              //   severity: 'critical',
              //   requiresImmediate: true,
              // });
              console.error('PRODUCTION ALERT: Audit logging system failure requires immediate attention');
            }
          }
        });
      }

      next();
    } catch (error) {
      // Don't fail the request if logging fails
      console.error('Error in organization type access logging:', error);
      next();
    }
  };
}

/**
 * Type guard to check if request has validated organization type
 * 
 * @param req - Express request object
 * @returns True if request has validated organization type
 */
export function hasValidatedOrganizationType(req: Request): req is OrganizationTypeRequest & { organizationType: OrganizationType } {
  const orgReq = req as OrganizationTypeRequest;
  return !!(orgReq.organizationType && orgReq.organizationTypeValidated);
}

/**
 * Utility function to extract organization type from request safely
 * 
 * @param req - Express request object
 * @returns Organization type if validated, null otherwise
 */
export function getOrganizationTypeFromRequest(req: Request): OrganizationType | null {
  const orgReq = req as OrganizationTypeRequest;
  return (orgReq.organizationType && orgReq.organizationTypeValidated) ? orgReq.organizationType : null;
}