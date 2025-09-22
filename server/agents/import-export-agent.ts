/**
 * Import/Export Agent - Handles bulk data operations and CSV processing
 */

import { AbstractBaseAgent } from '@shared/agents/base-agent';
import {
  ImportExportAgent,
  ColumnMapping,
  ParsedData,
  ValidationRules,
  ValidationReport,
  ImportResult,
  ExportQuery,
  ExportResult
} from '@shared/agents/contracts';
import { AgentContext, AgentResult, AgentHealth } from '@shared/agents/types';
import { getDatabaseAgent } from './database-agent';
import { getSecurityAgent } from './security-agent';
import csv from 'csv-parser';
import { stringify } from 'csv-stringify';
import { Readable } from 'stream';

export class ImportExportAgentImpl extends AbstractBaseAgent implements ImportExportAgent {
  private databaseAgent: any;
  private securityAgent: any;

  constructor() {
    super('ImportExportAgent', '1.0.0', ['DatabaseAgent', 'SecurityAgent'], {
      enabled: true,
      logLevel: 'info',
      timeout: 300000, // 5 minutes for bulk operations
      retries: 1,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 3,
        resetTimeout: 60000
      }
    });
  }

  protected async onInitialize(): Promise<void> {
    this.databaseAgent = getDatabaseAgent();
    this.securityAgent = getSecurityAgent();

    // Initialize dependencies
    await this.databaseAgent.initialize();
    await this.securityAgent.initialize();

    this.log('info', 'Import/Export agent initialized successfully');
  }

  protected async onShutdown(): Promise<void> {
    this.log('info', 'Import/Export agent shut down successfully');
  }

  protected async onHealthCheck(): Promise<AgentHealth> {
    try {
      // Check dependencies
      const dbHealth = await this.databaseAgent.healthCheck();
      const securityHealth = await this.securityAgent.healthCheck();

      if (dbHealth.status !== 'healthy' || securityHealth.status !== 'healthy') {
        return {
          status: 'degraded',
          message: 'One or more dependencies are unhealthy',
          lastCheck: new Date(),
          dependencies: {
            database: dbHealth,
            security: securityHealth
          }
        };
      }

      // Test basic CSV processing functionality
      const testResult = await this.testCsvProcessing();

      return {
        status: testResult ? 'healthy' : 'degraded',
        message: testResult ? 'Import/Export agent is functioning properly' : 'CSV processing test failed',
        lastCheck: new Date(),
        dependencies: {
          database: dbHealth,
          security: securityHealth
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Import/Export agent health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastCheck: new Date()
      };
    }
  }

  async parseCSV(file: Buffer, mapping: ColumnMapping, context: AgentContext): Promise<AgentResult<ParsedData>> {
    try {
      this.validateRequired({ file, mapping }, ['file', 'mapping']);

      this.log('info', 'CSV parsing request', {
        fileSize: file.length,
        mappingKeys: Object.keys(mapping).length,
        context: context.requestId
      });

      return new Promise((resolve) => {
        const rows: any[][] = [];
        let headers: string[] = [];
        let isFirstRow = true;

        const stream = Readable.from(file.toString('utf8'))
          .pipe(csv({ headers: false }));

        stream.on('data', (row: any) => {
          const rowArray = Object.values(row);

          if (isFirstRow) {
            headers = rowArray as string[];
            isFirstRow = false;
          } else {
            rows.push(rowArray as any[]);
          }
        });

        stream.on('end', () => {
          try {
            // Generate preview data (first 5 rows)
            const preview = rows.slice(0, 5).map(row => {
              const obj: any = {};
              headers.forEach((header, index) => {
                const mappedField = mapping[header] || header;
                obj[mappedField] = row[index] || '';
              });
              return obj;
            });

            const result: ParsedData = {
              headers,
              rows,
              mapping,
              preview
            };

            this.log('info', 'CSV parsing completed', {
              headers: headers.length,
              rows: rows.length,
              context: context.requestId
            });

            resolve(this.createSuccessResult(result));
          } catch (error) {
            resolve(this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'CSV_PROCESSING_ERROR'));
          }
        });

        stream.on('error', (error) => {
          this.log('error', 'CSV parsing failed', { error: error.message });
          resolve(this.createErrorResult(error, 'CSV_PARSE_ERROR'));
        });
      });

    } catch (error) {
      this.log('error', 'CSV parsing failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'CSV_PARSE_FAILED');
    }
  }

  async validateImportData(data: any[], rules: ValidationRules, context: AgentContext): Promise<AgentResult<ValidationReport>> {
    try {
      this.validateRequired({ data, rules }, ['data', 'rules']);

      this.log('info', 'Import data validation request', {
        dataRows: data.length,
        context: context.requestId
      });

      const errors: Array<{ row: number; field: string; message: string }> = [];
      const warnings: Array<{ row: number; field: string; message: string }> = [];
      let validRows = 0;
      const seenValues: Record<string, Set<any>> = {};

      // Initialize unique field tracking
      for (const field of rules.unique || []) {
        seenValues[field] = new Set();
      }

      // Validate each row
      for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];
        let rowIsValid = true;

        // Check required fields
        for (const field of rules.required || []) {
          if (!row[field] || row[field].toString().trim() === '') {
            errors.push({
              row: rowIndex + 1,
              field,
              message: `${field} is required`
            });
            rowIsValid = false;
          }
        }

        // Check unique fields
        for (const field of rules.unique || []) {
          if (row[field]) {
            const value = row[field].toString().toLowerCase();
            if (seenValues[field].has(value)) {
              errors.push({
                row: rowIndex + 1,
                field,
                message: `${field} must be unique (duplicate: ${value})`
              });
              rowIsValid = false;
            } else {
              seenValues[field].add(value);
            }
          }
        }

        // Check pattern validation
        for (const [field, pattern] of Object.entries(rules.patterns || {})) {
          if (row[field]) {
            const regex = new RegExp(pattern);
            if (!regex.test(row[field].toString())) {
              errors.push({
                row: rowIndex + 1,
                field,
                message: `${field} does not match required format`
              });
              rowIsValid = false;
            }
          }
        }

        // Check range validation
        for (const [field, range] of Object.entries(rules.ranges || {})) {
          if (row[field]) {
            const value = parseFloat(row[field]);
            if (isNaN(value)) {
              errors.push({
                row: rowIndex + 1,
                field,
                message: `${field} must be a number`
              });
              rowIsValid = false;
            } else {
              if (range.min !== undefined && value < range.min) {
                errors.push({
                  row: rowIndex + 1,
                  field,
                  message: `${field} must be at least ${range.min}`
                });
                rowIsValid = false;
              }
              if (range.max !== undefined && value > range.max) {
                errors.push({
                  row: rowIndex + 1,
                  field,
                  message: `${field} must be at most ${range.max}`
                });
                rowIsValid = false;
              }
            }
          }
        }

        // Sanitize data and check for warnings
        for (const [field, value] of Object.entries(row)) {
          if (value && typeof value === 'string') {
            const sanitizedResult = await this.securityAgent.sanitizeInput(
              value,
              { stripHTML: true, maxLength: 255 },
              context
            );

            if (sanitizedResult.success && sanitizedResult.data !== value) {
              warnings.push({
                row: rowIndex + 1,
                field,
                message: `${field} contains potentially unsafe content that will be cleaned`
              });
              // Update the row with sanitized data
              row[field] = sanitizedResult.data;
            }
          }
        }

        if (rowIsValid) {
          validRows++;
        }
      }

      const report: ValidationReport = {
        isValid: errors.length === 0,
        errors,
        warnings,
        summary: {
          totalRows: data.length,
          validRows,
          errorRows: data.length - validRows,
          warningRows: warnings.length
        }
      };

      this.log('info', 'Import data validation completed', {
        totalRows: data.length,
        validRows,
        errors: errors.length,
        warnings: warnings.length,
        context: context.requestId
      });

      return this.createSuccessResult(report);

    } catch (error) {
      this.log('error', 'Import data validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'VALIDATION_FAILED');
    }
  }

  async importData(data: any[], type: string, context: AgentContext): Promise<AgentResult<ImportResult>> {
    try {
      this.validateRequired({ data, type }, ['data', 'type']);

      this.log('info', 'Data import request', {
        type,
        dataRows: data.length,
        context: context.requestId
      });

      let processed = 0;
      let created = 0;
      let updated = 0;
      let errors = 0;
      const details: Array<{ action: string; id?: string; error?: string }> = [];

      // Use transaction for data integrity
      const transactionResult = await this.databaseAgent.transaction(async (tx: any) => {
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          processed++;

          try {
            const result = await this.importSingleRow(tx, row, type, context);

            if (result.success) {
              if (result.action === 'created') {
                created++;
                details.push({ action: 'created', id: result.id });
              } else if (result.action === 'updated') {
                updated++;
                details.push({ action: 'updated', id: result.id });
              }
            } else {
              errors++;
              details.push({ action: 'error', error: result.error });
            }
          } catch (error) {
            errors++;
            details.push({
              action: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            });

            this.log('warn', `Import error at row ${i + 1}`, { error, row });
          }
        }

        return { processed, created, updated, errors, details };
      }, context);

      if (!transactionResult.success) {
        return this.createErrorResult('Import transaction failed', 'IMPORT_TRANSACTION_FAILED');
      }

      const result = transactionResult.data!;

      this.log('info', 'Data import completed', {
        type,
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        errors: result.errors,
        context: context.requestId
      });

      return this.createSuccessResult(result);

    } catch (error) {
      this.log('error', 'Data import failed', {
        type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'DATA_IMPORT_FAILED');
    }
  }

  async exportData(query: ExportQuery, format: string, context: AgentContext): Promise<AgentResult<ExportResult>> {
    try {
      this.validateRequired({ query, format }, ['query', 'format']);

      this.log('info', 'Data export request', {
        entity: query.entity,
        format,
        context: context.requestId
      });

      // Build SQL query based on export parameters
      const sqlQuery = this.buildExportQuery(query);

      // Execute query
      const dataResult = await this.databaseAgent.query(sqlQuery.sql, sqlQuery.params, context);

      if (!dataResult.success) {
        return this.createErrorResult('Export query failed', 'EXPORT_QUERY_FAILED');
      }

      const records = dataResult.data;

      // Format data based on requested format
      let exportData: Buffer;
      let contentType: string;
      let filename: string;

      switch (format.toLowerCase()) {
        case 'csv':
          exportData = await this.formatAsCSV(records, query.fields);
          contentType = 'text/csv';
          filename = `${query.entity}_export_${new Date().toISOString().split('T')[0]}.csv`;
          break;

        case 'json':
          exportData = Buffer.from(JSON.stringify(records, null, 2));
          contentType = 'application/json';
          filename = `${query.entity}_export_${new Date().toISOString().split('T')[0]}.json`;
          break;

        default:
          return this.createErrorResult(`Unsupported export format: ${format}`, 'UNSUPPORTED_FORMAT');
      }

      const result: ExportResult = {
        data: exportData,
        filename,
        contentType,
        recordCount: records.length
      };

      this.log('info', 'Data export completed', {
        entity: query.entity,
        format,
        records: records.length,
        size: exportData.length,
        context: context.requestId
      });

      return this.createSuccessResult(result);

    } catch (error) {
      this.log('error', 'Data export failed', {
        query,
        format,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'DATA_EXPORT_FAILED');
    }
  }

  async generateTemplate(type: string, context?: AgentContext): Promise<AgentResult<Buffer>> {
    try {
      this.validateRequired({ type }, ['type']);

      this.log('info', 'Template generation request', {
        type,
        context: context?.requestId
      });

      const template = this.getTemplateForType(type);

      if (!template) {
        return this.createErrorResult(`Unknown template type: ${type}`, 'UNKNOWN_TEMPLATE_TYPE');
      }

      const csvData = await this.formatAsCSV([template.example], template.headers);

      this.log('info', 'Template generation completed', {
        type,
        context: context?.requestId
      });

      return this.createSuccessResult(csvData);

    } catch (error) {
      this.log('error', 'Template generation failed', {
        type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'TEMPLATE_GENERATION_FAILED');
    }
  }

  // Private helper methods

  private async importSingleRow(tx: any, row: any, type: string, context: AgentContext): Promise<{ success: boolean; action?: string; id?: string; error?: string }> {
    try {
      switch (type.toLowerCase()) {
        case 'athletes':
          return await this.importAthleteRow(tx, row, context);
        case 'measurements':
          return await this.importMeasurementRow(tx, row, context);
        case 'teams':
          return await this.importTeamRow(tx, row, context);
        default:
          return { success: false, error: `Unknown import type: ${type}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async importAthleteRow(tx: any, row: any, context: AgentContext): Promise<{ success: boolean; action?: string; id?: string; error?: string }> {
    try {
      // Check if athlete already exists (by email)
      const existingQuery = `
        SELECT id FROM users
        WHERE $1 = ANY(emails) AND role = 'athlete'
      `;

      const existing = await tx.query(existingQuery, [row.email]);

      if (existing.length > 0) {
        // Update existing athlete
        const updateQuery = `
          UPDATE users SET
            first_name = $1,
            last_name = $2,
            birth_date = $3,
            gender = $4,
            height = $5,
            weight = $6,
            sports = $7,
            positions = $8,
            graduation_year = $9,
            school = $10,
            updated_at = NOW()
          WHERE id = $11
          RETURNING id
        `;

        const result = await tx.query(updateQuery, [
          row.firstName || row.first_name,
          row.lastName || row.last_name,
          row.birthDate || row.birth_date || null,
          row.gender || null,
          row.height ? parseFloat(row.height) : null,
          row.weight ? parseFloat(row.weight) : null,
          row.sports ? (Array.isArray(row.sports) ? row.sports : row.sports.split(',').map((s: string) => s.trim())) : [],
          row.positions ? (Array.isArray(row.positions) ? row.positions : row.positions.split(',').map((p: string) => p.trim())) : [],
          row.graduationYear || row.graduation_year ? parseInt(row.graduationYear || row.graduation_year) : null,
          row.school || null,
          existing[0].id
        ]);

        return { success: true, action: 'updated', id: result[0].id };
      } else {
        // Create new athlete
        const insertQuery = `
          INSERT INTO users (
            first_name, last_name, emails, birth_date, gender, height, weight,
            sports, positions, graduation_year, school, role, is_active,
            organization_id, password, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'athlete', 'true',
            $12, 'INVITATION_PENDING', NOW(), NOW()
          )
          RETURNING id
        `;

        const result = await tx.query(insertQuery, [
          row.firstName || row.first_name,
          row.lastName || row.last_name,
          [row.email],
          row.birthDate || row.birth_date || null,
          row.gender || null,
          row.height ? parseFloat(row.height) : null,
          row.weight ? parseFloat(row.weight) : null,
          row.sports ? (Array.isArray(row.sports) ? row.sports : row.sports.split(',').map((s: string) => s.trim())) : [],
          row.positions ? (Array.isArray(row.positions) ? row.positions : row.positions.split(',').map((p: string) => p.trim())) : [],
          row.graduationYear || row.graduation_year ? parseInt(row.graduationYear || row.graduation_year) : null,
          row.school || null,
          context.organizationId || null
        ]);

        return { success: true, action: 'created', id: result[0].id };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async importMeasurementRow(tx: any, row: any, context: AgentContext): Promise<{ success: boolean; action?: string; id?: string; error?: string }> {
    try {
      // Find athlete by email or ID
      let athleteId = row.athleteId || row.athlete_id;

      if (!athleteId && row.athleteEmail) {
        const athleteQuery = `
          SELECT id FROM users
          WHERE $1 = ANY(emails) AND role = 'athlete'
        `;
        const athlete = await tx.query(athleteQuery, [row.athleteEmail]);

        if (athlete.length === 0) {
          return { success: false, error: `Athlete not found with email: ${row.athleteEmail}` };
        }

        athleteId = athlete[0].id;
      }

      if (!athleteId) {
        return { success: false, error: 'Athlete ID or email is required for measurements' };
      }

      // Insert measurement
      const insertQuery = `
        INSERT INTO measurements (
          athlete_id, type, value, unit, date, conditions, notes, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
        )
        RETURNING id
      `;

      const result = await tx.query(insertQuery, [
        athleteId,
        row.type,
        parseFloat(row.value),
        row.unit || 'seconds',
        row.date || new Date(),
        row.conditions || null,
        row.notes || null
      ]);

      return { success: true, action: 'created', id: result[0].id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async importTeamRow(tx: any, row: any, context: AgentContext): Promise<{ success: boolean; action?: string; id?: string; error?: string }> {
    try {
      // Check if team already exists
      const existingQuery = `
        SELECT id FROM teams
        WHERE name = $1 AND sport = $2 AND level = $3 AND season = $4
      `;

      const existing = await tx.query(existingQuery, [
        row.name,
        row.sport,
        row.level,
        row.season
      ]);

      if (existing.length > 0) {
        return { success: true, action: 'updated', id: existing[0].id };
      } else {
        // Create new team
        const insertQuery = `
          INSERT INTO teams (
            name, sport, level, season, organization_id, is_active, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'true', NOW(), NOW()
          )
          RETURNING id
        `;

        const result = await tx.query(insertQuery, [
          row.name,
          row.sport,
          row.level,
          row.season,
          context.organizationId || null
        ]);

        return { success: true, action: 'created', id: result[0].id };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private buildExportQuery(query: ExportQuery): { sql: string; params: any[] } {
    let sql = '';
    let params: any[] = [];
    let paramIndex = 1;

    switch (query.entity.toLowerCase()) {
      case 'athletes':
        sql = `
          SELECT
            u.id,
            u.first_name,
            u.last_name,
            u.emails[1] as email,
            u.birth_date,
            u.gender,
            u.height,
            u.weight,
            array_to_string(u.sports, ', ') as sports,
            array_to_string(u.positions, ', ') as positions,
            u.graduation_year,
            u.school,
            u.created_at,
            u.updated_at
          FROM users u
          WHERE u.role = 'athlete' AND u.is_active = 'true'
        `;
        break;

      case 'measurements':
        sql = `
          SELECT
            m.id,
            u.first_name || ' ' || u.last_name as athlete_name,
            u.emails[1] as athlete_email,
            m.type,
            m.value,
            m.unit,
            m.date,
            m.conditions,
            m.notes,
            m.created_at
          FROM measurements m
          JOIN users u ON m.athlete_id = u.id
          WHERE u.is_active = 'true'
        `;
        break;

      case 'teams':
        sql = `
          SELECT
            t.id,
            t.name,
            t.sport,
            t.level,
            t.season,
            t.created_at,
            t.updated_at
          FROM teams t
          WHERE t.is_active = 'true'
        `;
        break;

      default:
        throw new Error(`Unknown entity type: ${query.entity}`);
    }

    // Apply filters
    if (query.filters) {
      Object.entries(query.filters).forEach(([field, value]) => {
        if (value !== undefined && value !== null) {
          sql += ` AND ${field} = $${paramIndex}`;
          params.push(value);
          paramIndex++;
        }
      });
    }

    // Apply ordering
    if (query.orderBy) {
      sql += ` ORDER BY ${query.orderBy}`;
    } else {
      sql += ` ORDER BY created_at DESC`;
    }

    // Apply limit
    if (query.limit) {
      sql += ` LIMIT ${query.limit}`;
    }

    return { sql, params };
  }

  private async formatAsCSV(records: any[], fields?: string[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (records.length === 0) {
        return resolve(Buffer.from(''));
      }

      const headers = fields || Object.keys(records[0]);
      const csvData: any[][] = [headers];

      // Add data rows
      records.forEach(record => {
        const row = headers.map(header => {
          const value = record[header];
          return value !== null && value !== undefined ? value.toString() : '';
        });
        csvData.push(row);
      });

      stringify(csvData, (err, output) => {
        if (err) {
          reject(err);
        } else {
          resolve(Buffer.from(output || ''));
        }
      });
    });
  }

  private getTemplateForType(type: string): { headers: string[]; example: any } | null {
    switch (type.toLowerCase()) {
      case 'athletes':
        return {
          headers: ['firstName', 'lastName', 'email', 'birthDate', 'gender', 'height', 'weight', 'sports', 'positions', 'graduationYear', 'school'],
          example: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            birthDate: '2000-01-15',
            gender: 'M',
            height: '72',
            weight: '180',
            sports: 'Basketball, Football',
            positions: 'Forward, Quarterback',
            graduationYear: '2024',
            school: 'Example High School'
          }
        };

      case 'measurements':
        return {
          headers: ['athleteEmail', 'type', 'value', 'unit', 'date', 'conditions', 'notes'],
          example: {
            athleteEmail: 'john.doe@example.com',
            type: 'FLY10_TIME',
            value: '1.85',
            unit: 'seconds',
            date: '2024-01-15',
            conditions: 'Indoor track',
            notes: 'Personal best'
          }
        };

      case 'teams':
        return {
          headers: ['name', 'sport', 'level', 'season'],
          example: {
            name: 'Varsity Basketball',
            sport: 'Basketball',
            level: 'Varsity',
            season: '2024-Winter'
          }
        };

      default:
        return null;
    }
  }

  private async testCsvProcessing(): Promise<boolean> {
    try {
      const testCsv = 'name,age\nJohn,25\nJane,30';
      const testBuffer = Buffer.from(testCsv);
      const testMapping = { name: 'name', age: 'age' };

      const result = await this.parseCSV(testBuffer, testMapping, {
        requestId: 'health-check',
        permissions: []
      });

      return result.success && result.data?.rows.length === 2;
    } catch (error) {
      this.log('error', 'CSV processing test failed', { error });
      return false;
    }
  }
}

// Singleton instance
let importExportAgentInstance: ImportExportAgentImpl | null = null;

export function getImportExportAgent(): ImportExportAgentImpl {
  if (!importExportAgentInstance) {
    importExportAgentInstance = new ImportExportAgentImpl();
  }
  return importExportAgentInstance;
}