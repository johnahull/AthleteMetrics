/**
 * Service Container for Dependency Injection
 *
 * Manages service instances and their dependencies, providing:
 * - Service registration and resolution
 * - Dependency injection
 * - Lifecycle management
 * - Configuration management
 */

import { EventEmitter } from 'events';
import type { DatabaseStorage } from '../../storage';
import { DefaultLogger, type ServiceLogger, type ServiceConfig } from './BaseService';

export interface ContainerConfig {
  storage: DatabaseStorage;
  logger?: ServiceLogger;
  eventBus?: EventEmitter;
}

export type ServiceFactory<T> = (config: ServiceConfig) => T;
export type ServiceInstance<T> = T;

export class ServiceContainer {
  private services = new Map<string, ServiceInstance<any>>();
  private factories = new Map<string, ServiceFactory<any>>();
  private config: ServiceConfig;
  private eventBus: EventEmitter;

  constructor(config: ContainerConfig) {
    this.eventBus = config.eventBus || new EventEmitter();
    this.config = {
      storage: config.storage,
      logger: config.logger || new DefaultLogger(),
      eventBus: this.eventBus
    };

    this.config.logger?.info('Service container initialized');
  }

  /**
   * Register a service factory
   */
  register<T>(name: string, factory: ServiceFactory<T>): void {
    if (this.factories.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    this.factories.set(name, factory);
    this.config.logger?.info(`Service factory registered: ${name}`);
  }

  /**
   * Get service instance (creates if not exists)
   */
  get<T>(name: string): T {
    // Return existing instance if available
    if (this.services.has(name)) {
      return this.services.get(name) as T;
    }

    // Get factory and create instance
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Service '${name}' not found. Available services: ${Array.from(this.factories.keys()).join(', ')}`);
    }

    try {
      const instance = factory(this.config);
      this.services.set(name, instance);

      this.config.logger?.info(`Service instance created: ${name}`);
      this.eventBus.emit('service.created', { name, instance });

      return instance;
    } catch (error) {
      this.config.logger?.error(`Failed to create service: ${name}`, error as Error);
      throw error;
    }
  }

  /**
   * Check if service is registered
   */
  has(name: string): boolean {
    return this.factories.has(name);
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get all instantiated service names
   */
  getActiveServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Get container health status
   */
  async getHealthStatus(): Promise<{
    container: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: {
      registered: number;
      active: number;
      list: string[];
    };
    checks: Record<string, any>;
  }> {
    const serviceHealthChecks: Record<string, any> = {};

    // Check health of active services
    for (const [name, instance] of this.services.entries()) {
      try {
        if (typeof instance.getHealthStatus === 'function') {
          serviceHealthChecks[name] = await instance.getHealthStatus();
        } else {
          serviceHealthChecks[name] = { status: 'unknown' };
        }
      } catch (error) {
        serviceHealthChecks[name] = { status: 'unhealthy', error: (error as Error).message };
      }
    }

    const unhealthyServices = Object.values(serviceHealthChecks)
      .filter((check: any) => check.status === 'unhealthy').length;

    return {
      container: 'ServiceContainer',
      status: unhealthyServices > 0 ? 'degraded' : 'healthy',
      services: {
        registered: this.factories.size,
        active: this.services.size,
        list: this.getServiceNames()
      },
      checks: serviceHealthChecks
    };
  }

  /**
   * Shutdown all services gracefully
   */
  async shutdown(): Promise<void> {
    this.config.logger?.info('Shutting down service container');

    // Call shutdown on services that support it
    for (const [name, instance] of this.services.entries()) {
      try {
        if (typeof instance.shutdown === 'function') {
          await instance.shutdown();
          this.config.logger?.info(`Service shutdown completed: ${name}`);
        }
      } catch (error) {
        this.config.logger?.error(`Service shutdown failed: ${name}`, error as Error);
      }
    }

    this.services.clear();
    this.eventBus.emit('container.shutdown');
    this.config.logger?.info('Service container shutdown completed');
  }
}