/**
 * Service Layer Entry Point
 *
 * Provides service container setup, factory registration, and
 * centralized service management for the AthleteMetrics application.
 */

import { ServiceContainer, type ContainerConfig } from './base/ServiceContainer';
import { AnalyticsService } from './AnalyticsService';
import { AuthenticationService } from './AuthenticationService';
import { OrganizationService } from './OrganizationService';
import { AthleteManagementService } from './AthleteManagementService';
import type { DatabaseStorage } from '../storage';

// Service registry for type safety
export interface ServiceRegistry {
  analytics: AnalyticsService;
  authentication: AuthenticationService;
  organization: OrganizationService;
  athleteManagement: AthleteManagementService;
}

// Service names for container registration
export const SERVICE_NAMES = {
  ANALYTICS: 'analytics',
  AUTHENTICATION: 'authentication',
  ORGANIZATION: 'organization',
  ATHLETE_MANAGEMENT: 'athleteManagement'
} as const;

export type ServiceName = keyof ServiceRegistry;

let serviceContainer: ServiceContainer | null = null;

/**
 * Initialize service container with dependencies
 */
export function initializeServices(config: ContainerConfig): ServiceContainer {
  if (serviceContainer) {
    throw new Error('Services already initialized. Use getServiceContainer() to access existing instance.');
  }

  serviceContainer = new ServiceContainer(config);

  // Register all service factories
  registerServiceFactories(serviceContainer);

  console.log('✅ Service layer initialized successfully');
  return serviceContainer;
}

/**
 * Get existing service container
 */
export function getServiceContainer(): ServiceContainer {
  if (!serviceContainer) {
    throw new Error('Services not initialized. Call initializeServices() first.');
  }
  return serviceContainer;
}

/**
 * Get specific service instance
 */
export function getService<T extends ServiceName>(serviceName: T): ServiceRegistry[T] {
  const container = getServiceContainer();
  return container.get<ServiceRegistry[T]>(serviceName);
}

/**
 * Register all service factories with the container
 */
function registerServiceFactories(container: ServiceContainer): void {
  // Analytics Service
  container.register(SERVICE_NAMES.ANALYTICS, (config) => {
    return new AnalyticsService(config);
  });

  // Authentication Service
  container.register(SERVICE_NAMES.AUTHENTICATION, (config) => {
    return new AuthenticationService(config);
  });

  // Organization Service
  container.register(SERVICE_NAMES.ORGANIZATION, (config) => {
    return new OrganizationService(config);
  });

  // Athlete Management Service
  container.register(SERVICE_NAMES.ATHLETE_MANAGEMENT, (config) => {
    return new AthleteManagementService(config);
  });

  console.log(`Registered ${container.getServiceNames().length} service factories`);
}

/**
 * Shutdown all services gracefully
 */
export async function shutdownServices(): Promise<void> {
  if (serviceContainer) {
    await serviceContainer.shutdown();
    serviceContainer = null;
    console.log('✅ Service layer shutdown completed');
  }
}

/**
 * Get service health status for monitoring
 */
export async function getServicesHealth(): Promise<any> {
  if (!serviceContainer) {
    return {
      status: 'not-initialized',
      error: 'Service container not initialized'
    };
  }

  return await serviceContainer.getHealthStatus();
}

/**
 * Convenience functions for commonly used services
 */
export const Analytics = {
  getInstance: () => getService('analytics')
};

export const Authentication = {
  getInstance: () => getService('authentication')
};

export const Organization = {
  getInstance: () => getService('organization')
};

export const AthleteManagement = {
  getInstance: () => getService('athleteManagement')
};

// Re-export service interfaces for external use
export type {
  AnalyticsServiceInterface,
  MeasurementFilters,
  AnalyticsRequest,
  AnalyticsResponse,
  ChartRecommendation
} from './AnalyticsService';

export type {
  AuthenticationServiceInterface,
  AuthenticationResult,
  SessionValidationResult,
  SessionData,
  MFASetupResult,
  Permission,
  LockoutStatus
} from './AuthenticationService';

export type {
  OrganizationServiceInterface,
  OrganizationStats,
  TeamStats,
  OrganizationHealth
} from './OrganizationService';

export type {
  AthleteManagementServiceInterface,
  AthleteFilters,
  AthletePerformance,
  PersonalBests,
  AthleteAnalytics,
  AthleteComparison,
  BulkOperationResult
} from './AthleteManagementService';

// Re-export base classes
export { BaseService, type ServiceContext, type ServiceConfig } from './base/BaseService';
export { ServiceContainer } from './base/ServiceContainer';

/**
 * Development utilities
 */
export const DevUtils = {
  /**
   * Reset services (for testing)
   */
  async reset(): Promise<void> {
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      throw new Error('Service reset is only available in development/test environments');
    }

    await shutdownServices();
    console.log('⚠️ Services reset for development');
  },

  /**
   * Get service container metrics
   */
  getMetrics() {
    if (!serviceContainer) {
      return { error: 'Services not initialized' };
    }

    return {
      registeredServices: serviceContainer.getServiceNames(),
      activeServices: serviceContainer.getActiveServiceNames(),
      containerStatus: 'initialized'
    };
  }
};

/**
 * Express middleware to inject services into request context
 */
export function injectServices() {
  return (req: any, res: any, next: any) => {
    try {
      req.services = {
        analytics: getService('analytics'),
        authentication: getService('authentication'),
        organization: getService('organization'),
        athleteManagement: getService('athleteManagement'),
        container: getServiceContainer()
      };
      next();
    } catch (error) {
      console.error('Service injection failed:', error);
      res.status(500).json({
        message: 'Service layer not available',
        error: (error as Error).message
      });
    }
  };
}

/**
 * Type definitions for Express request augmentation
 */
declare global {
  namespace Express {
    interface Request {
      services?: {
        analytics: AnalyticsService;
        authentication: AuthenticationService;
        organization: OrganizationService;
        athleteManagement: AthleteManagementService;
        container: ServiceContainer;
      };
    }
  }
}

export default {
  initializeServices,
  getServiceContainer,
  getService,
  shutdownServices,
  getServicesHealth,
  injectServices,
  Analytics,
  Authentication,
  Organization,
  AthleteManagement,
  DevUtils
};