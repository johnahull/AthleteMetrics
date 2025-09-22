/**
 * Database Agent - Manages all database operations and connections
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import postgres from 'postgres';
import Database from 'better-sqlite3';
import * as schema from "@shared/schema";
import { AbstractBaseAgent } from '@shared/agents/base-agent';
import { DatabaseAgent } from '@shared/agents/contracts';
import { AgentContext, AgentResult, AgentHealth } from '@shared/agents/types';

export class DatabaseAgentImpl extends AbstractBaseAgent implements DatabaseAgent {
  private db: any;
  private sql: any;
  private client: any;
  private isFileDatabase: boolean = false;
  private connectionPool: Map<string, any> = new Map();

  constructor() {
    super('DatabaseAgent', '1.0.0', [], {
      enabled: true,
      logLevel: 'info',
      timeout: 30000,
      retries: 3,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 60000
      }
    });
  }

  protected async onInitialize(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    // Determine which database to use based on URL
    this.isFileDatabase = databaseUrl.startsWith("file:");

    if (this.isFileDatabase) {
      // SQLite configuration
      this.client = new Database(databaseUrl.replace("file:", ""));
      this.db = drizzleSqlite(this.client, { schema });
      this.sql = this.db; // For compatibility
    } else {
      // PostgreSQL configuration
      this.client = postgres(databaseUrl);
      this.db = drizzle(this.client, { schema });
      this.sql = this.client; // For compatibility
    }

    // Test connection
    await this.testConnection();

    this.log('info', 'Database agent initialized successfully');
  }

  protected async onShutdown(): Promise<void> {
    // Close all connections in the pool
    for (const [id, connection] of this.connectionPool) {
      try {
        await this.releaseConnection(connection);
      } catch (error) {
        this.log('warn', `Failed to close connection ${id}`, error);
      }
    }
    this.connectionPool.clear();

    this.log('info', 'Database agent shut down successfully');
  }

  protected async onHealthCheck(): Promise<AgentHealth> {
    try {
      if (this.isFileDatabase) {
        // SQLite health check
        this.client.prepare('SELECT 1 as health_check').get();
      } else {
        // PostgreSQL health check
        await this.sql`SELECT 1 as health_check`;
      }

      return {
        status: 'healthy',
        message: 'Database connection is healthy',
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastCheck: new Date()
      };
    }
  }

  async query<T>(
    sql: string,
    params: any[] = [],
    context?: AgentContext
  ): Promise<AgentResult<T[]>> {
    const startTime = Date.now();

    try {
      this.log('debug', 'Executing query', { sql, params, context: context?.requestId });

      const result = await this.withCircuitBreaker(async () => {
        return await this.withTimeout(
          this.sql(sql, ...params),
          this.config.timeout
        );
      }) as T[];

      const executionTime = Date.now() - startTime;
      this.log('debug', 'Query executed successfully', {
        executionTime,
        rowCount: result.length
      });

      return this.createSuccessResult(result, { executionTime });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.log('error', 'Query execution failed', {
        sql,
        params,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'QUERY_FAILED');
    }
  }

  async queryOne<T>(
    sql: string,
    params: any[] = [],
    context?: AgentContext
  ): Promise<AgentResult<T | null>> {
    const result = await this.query<T>(sql, params, context);

    if (!result.success) {
      return result as AgentResult<T | null>;
    }

    const data = result.data && result.data.length > 0 ? result.data[0] : null;
    return this.createSuccessResult(data, result.metadata);
  }

  async transaction<T>(
    callback: (tx: any) => Promise<T>,
    context?: AgentContext
  ): Promise<AgentResult<T>> {
    const startTime = Date.now();

    try {
      this.log('debug', 'Starting transaction', { context: context?.requestId });

      const result = await this.withCircuitBreaker(async () => {
        return await this.withTimeout(
          this.db.transaction(callback),
          this.config.timeout
        );
      }) as T;

      const executionTime = Date.now() - startTime;
      this.log('debug', 'Transaction completed successfully', { executionTime });

      return this.createSuccessResult(result, { executionTime });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.log('error', 'Transaction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'TRANSACTION_FAILED');
    }
  }

  async getConnection(): Promise<any> {
    // For Neon HTTP, we don't manage persistent connections
    // Return the SQL function that can be used for queries
    return this.sql;
  }

  async releaseConnection(connection: any): Promise<void> {
    // For Neon HTTP, connections are automatically managed
    // This is a no-op but maintained for interface compatibility
    this.log('debug', 'Connection released (no-op for Neon HTTP)');
  }

  // Additional utility methods

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    try {
      if (this.isFileDatabase) {
        // SQLite test
        this.client.prepare('SELECT 1 as test').get();
      } else {
        // PostgreSQL test
        await this.sql`SELECT 1 as test`;
      }
      this.log('info', 'Database connection test successful');
    } catch (error) {
      this.log('error', 'Database connection test failed', error);
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute raw SQL with parameter substitution
   */
  async executeRaw<T>(
    query: string,
    params: Record<string, any> = {},
    context?: AgentContext
  ): Promise<AgentResult<T[]>> {
    const startTime = Date.now();

    try {
      this.log('debug', 'Executing raw query', { query, params, context: context?.requestId });

      // Convert named parameters to positional parameters for Neon
      const { sql: processedSql, values } = this.processNamedParameters(query, params);

      const result = await this.withCircuitBreaker(async () => {
        return await this.withTimeout(
          this.sql(processedSql, ...values),
          this.config.timeout
        );
      }) as T[];

      const executionTime = Date.now() - startTime;
      this.log('debug', 'Raw query executed successfully', {
        executionTime,
        rowCount: result.length
      });

      return this.createSuccessResult(result, { executionTime });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.log('error', 'Raw query execution failed', {
        query,
        params,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'RAW_QUERY_FAILED');
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(context?: AgentContext): Promise<AgentResult<DatabaseStats>> {
    try {
      const tablesResult = await this.query<{ table_name: string; row_count: number }>(
        `SELECT schemaname, tablename as table_name, n_tup_ins + n_tup_upd + n_tup_del as row_count
         FROM pg_stat_user_tables
         ORDER BY row_count DESC`,
        [],
        context
      );

      if (!tablesResult.success) {
        return this.createErrorResult('Failed to get table stats', 'STATS_QUERY_FAILED');
      }

      const sizeResult = await this.query<{ size_mb: number }>(
        `SELECT round(pg_database_size(current_database()) / 1024.0 / 1024.0, 2) as size_mb`,
        [],
        context
      );

      if (!sizeResult.success) {
        return this.createErrorResult('Failed to get database size', 'SIZE_QUERY_FAILED');
      }

      const stats: DatabaseStats = {
        tables: tablesResult.data || [],
        totalSizeMB: sizeResult.data?.[0]?.size_mb || 0,
        connectionCount: this.connectionPool.size,
        lastUpdated: new Date()
      };

      return this.createSuccessResult(stats);
    } catch (error) {
      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'STATS_FAILED');
    }
  }

  /**
   * Process named parameters for SQL queries
   */
  private processNamedParameters(query: string, params: Record<string, any>): { sql: string; values: any[] } {
    const values: any[] = [];
    let paramIndex = 1;

    const processedSql = query.replace(/:(\w+)/g, (match, paramName) => {
      if (paramName in params) {
        values.push(params[paramName]);
        return `$${paramIndex++}`;
      }
      return match;
    });

    return { sql: processedSql, values };
  }

  /**
   * Bulk insert with conflict resolution
   */
  async bulkInsert<T>(
    table: string,
    data: T[],
    onConflict: 'ignore' | 'update' | 'error' = 'error',
    context?: AgentContext
  ): Promise<AgentResult<BulkInsertResult>> {
    if (!data || data.length === 0) {
      return this.createSuccessResult({ inserted: 0, updated: 0, errors: 0 });
    }

    const startTime = Date.now();

    try {
      return await this.transaction(async (tx) => {
        let inserted = 0;
        let updated = 0;
        let errors = 0;

        for (const item of data) {
          try {
            // This would need to be implemented with proper Drizzle ORM syntax
            // For now, we'll use a placeholder approach
            const columns = Object.keys(item as any);
            const values = Object.values(item as any);
            const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

            let query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

            if (onConflict === 'ignore') {
              query += ' ON CONFLICT DO NOTHING';
            } else if (onConflict === 'update') {
              const updates = columns.map(col => `${col} = EXCLUDED.${col}`).join(', ');
              query += ` ON CONFLICT DO UPDATE SET ${updates}`;
            }

            const result = await tx.execute(query, values);

            if (result.rowCount > 0) {
              if (onConflict === 'update' && result.rowCount === 1) {
                // Check if it was an insert or update
                // This is simplified - in practice you'd need more sophisticated logic
                inserted++;
              } else {
                inserted++;
              }
            }
          } catch (error) {
            errors++;
            this.log('warn', 'Bulk insert item failed', { item, error });

            if (onConflict === 'error') {
              throw error;
            }
          }
        }

        const executionTime = Date.now() - startTime;
        return { inserted, updated, errors, executionTime };
      }, context);
    } catch (error) {
      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'BULK_INSERT_FAILED');
    }
  }
}

// Type definitions
export interface DatabaseStats {
  tables: Array<{ table_name: string; row_count: number }>;
  totalSizeMB: number;
  connectionCount: number;
  lastUpdated: Date;
}

export interface BulkInsertResult {
  inserted: number;
  updated: number;
  errors: number;
  executionTime?: number;
}

// Singleton instance
let databaseAgentInstance: DatabaseAgentImpl | null = null;

export function getDatabaseAgent(): DatabaseAgentImpl {
  if (!databaseAgentInstance) {
    databaseAgentInstance = new DatabaseAgentImpl();
  }
  return databaseAgentInstance;
}