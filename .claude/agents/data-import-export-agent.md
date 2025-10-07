---
name: data-import-export-agent
description: CSV import/export functionality, bulk data operations, data transformation, athlete matching, import preview, and validation pipelines
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

# Data Import/Export Agent

**Specialization**: CSV processing, bulk operations, and data transformation for AthleteMetrics

## Core Expertise

### AthleteMetrics Import/Export Stack
- **CSV Parsing**: Custom string-split parsing (client/src/lib/csv.ts)
- **File Upload**: Multer with validation (MAX_CSV_FILE_SIZE = 5MB, MAX_CSV_ROWS = 10000)
- **Data Validation**: Zod schemas for comprehensive validation
- **Athlete Matching**: Levenshtein distance algorithm for fuzzy name matching
- **Bulk Operations**: Efficient batch database operations with Drizzle ORM
- **Preview System**: Multi-step import with user confirmation

### Import/Export Architecture
```typescript
// Key components:
client/src/components/import-export.tsx - Import/export UI
server/routes/import-routes.ts - CSV upload endpoints
server/utils/csv-parser.ts - CSV validation and parsing
server/utils/athlete-matcher.ts - Fuzzy matching logic
shared/schema.ts - Import validation schemas
```

## Responsibilities

### 1. CSV Import Flow
```typescript
// Complete import workflow:
1. User uploads CSV file
2. Validate file size and format
3. Parse CSV with custom string-split parser
4. Validate column headers
5. Match athletes (existing vs new)
6. Preview import with warnings
7. User confirms/edits data
8. Execute bulk insert/update
9. Report success/errors
10. Cleanup temporary files
```

### 2. Data Validation
```typescript
// Multi-layer validation:
- File validation (size, type, row count)
- Header validation (required columns)
- Row validation (data types, formats)
- Business logic validation (dates, ranges)
- Duplicate detection
- Foreign key validation (teams, organizations)
```

### 3. Athlete Matching
```typescript
// Intelligent athlete matching using Levenshtein distance:

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

async function matchAthlete(
  firstName: string,
  lastName: string,
  birthDate: Date,
  organizationId: string
) {
  // Exact match first
  const exactMatch = await db.query.users.findFirst({
    where: and(
      eq(users.firstName, firstName),
      eq(users.lastName, lastName),
      eq(users.organizationId, organizationId)
    )
  });

  if (exactMatch) return { match: exactMatch, confidence: 1.0 };

  // Fuzzy match using Levenshtein distance
  const allAthletes = await db.query.users.findMany({
    where: eq(users.organizationId, organizationId)
  });

  const searchName = `${firstName} ${lastName}`.toLowerCase();
  let bestMatch = null;
  let bestDistance = Infinity;

  for (const athlete of allAthletes) {
    const athleteName = `${athlete.firstName} ${athlete.lastName}`.toLowerCase();
    const distance = levenshteinDistance(searchName, athleteName);
    const maxLen = Math.max(searchName.length, athleteName.length);
    const similarity = 1 - (distance / maxLen);

    if (similarity >= 0.7 && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = athlete;
    }
  }

  if (bestMatch) {
    const maxLen = Math.max(searchName.length, `${bestMatch.firstName} ${bestMatch.lastName}`.toLowerCase().length);
    const confidence = 1 - (bestDistance / maxLen);
    return { match: bestMatch, confidence };
  }

  return { match: null, confidence: 0 };
}
```

### 4. Bulk Operations
```typescript
// Efficient batch processing:
async function bulkImportMeasurements(data: MeasurementImport[]) {
  const BATCH_SIZE = 100;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);

    await db.insert(measurements)
      .values(batch)
      .onConflictDoUpdate({
        target: [measurements.userId, measurements.metric, measurements.date],
        set: { value: sql`excluded.value` }
      });
  }

  return { imported: data.length };
}
```

## CSV Format Standards

### Required Columns
```typescript
// Measurement import CSV:
firstName, lastName, birthDate, metric, value, date

// Optional columns:
email, phone, teamName, season, flyInDistance, notes

// Example CSV:
firstName,lastName,birthDate,metric,value,date
John,Doe,2005-03-15,FLY10_TIME,1.85,2024-10-05
Jane,Smith,2004-08-22,VERTICAL_JUMP,28.5,2024-10-05
```

### Team Import Format
```typescript
// Team import CSV:
name, level, season, organizationId

// Example:
name,level,season,organizationId
Varsity Soccer,HS,2024-Fall,org-uuid-123
JV Basketball,HS,2024-Winter,org-uuid-123
```

### Athlete Import Format
```typescript
// Athlete/user import CSV:
firstName, lastName, birthDate, email, role, teamName

// Example:
firstName,lastName,birthDate,email,role,teamName
John,Doe,2005-03-15,john@example.com,athlete,Varsity Soccer
Jane,Smith,2004-08-22,jane@example.com,athlete,JV Basketball
```

## Data Validation Pipeline

### File Validation
```typescript
// CSV file validation:
const CSV_CONFIG = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxRows: 10000,
  allowedMimeTypes: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
  requiredEncoding: 'utf-8'
};

function validateCSVFile(file: Express.Multer.File) {
  if (file.size > CSV_CONFIG.maxFileSize) {
    throw new Error(`File too large. Maximum ${CSV_CONFIG.maxFileSize / 1024 / 1024}MB`);
  }

  if (!CSV_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
    throw new Error('Invalid file type. Please upload a CSV file');
  }

  return true;
}
```

### Header Validation
```typescript
// Validate CSV headers:
const REQUIRED_HEADERS = {
  measurements: ['firstName', 'lastName', 'metric', 'value', 'date'],
  teams: ['name', 'level', 'organizationId'],
  athletes: ['firstName', 'lastName', 'birthDate', 'email']
};

function validateHeaders(headers: string[], type: string) {
  const required = REQUIRED_HEADERS[type];
  const missing = required.filter(h => !headers.includes(h));

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }

  return true;
}
```

### Row Validation
```typescript
// Validate each CSV row:
import { z } from 'zod';

const MeasurementRowSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  metric: z.enum(['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'RSI']),
  value: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email().optional(),
  teamName: z.string().optional(),
});

function validateRow(row: any, rowNumber: number) {
  try {
    return MeasurementRowSchema.parse(row);
  } catch (error) {
    throw new Error(`Row ${rowNumber}: ${error.message}`);
  }
}
```

## Import Preview System

### Preview Data Structure
```typescript
// Import preview response:
interface ImportPreview {
  summary: {
    totalRows: number;
    newAthletes: number;
    existingAthletes: number;
    newMeasurements: number;
    warnings: string[];
    errors: string[];
  };
  athletes: Array<{
    row: number;
    status: 'new' | 'existing' | 'match' | 'error';
    confidence?: number;
    data: {
      firstName: string;
      lastName: string;
      birthDate: Date;
    };
    matchedTo?: {
      id: string;
      fullName: string;
    };
    measurements: Array<{
      metric: string;
      value: number;
      date: Date;
    }>;
  }>;
}
```

### Preview Generation
```typescript
// Generate import preview:
async function generatePreview(csvData: any[], organizationId: string) {
  const preview: ImportPreview = {
    summary: {
      totalRows: csvData.length,
      newAthletes: 0,
      existingAthletes: 0,
      newMeasurements: 0,
      warnings: [],
      errors: []
    },
    athletes: []
  };

  for (const [index, row] of csvData.entries()) {
    try {
      // Validate row
      const validatedRow = validateRow(row, index + 1);

      // Match athlete
      const { match, confidence } = await matchAthlete(
        validatedRow.firstName,
        validatedRow.lastName,
        new Date(validatedRow.birthDate),
        organizationId
      );

      // Determine status
      const status = match
        ? confidence === 1.0 ? 'existing' : 'match'
        : 'new';

      if (status === 'new') preview.summary.newAthletes++;
      if (status === 'existing') preview.summary.existingAthletes++;

      preview.athletes.push({
        row: index + 1,
        status,
        confidence,
        data: validatedRow,
        matchedTo: match ? { id: match.id, fullName: match.fullName } : undefined,
        measurements: [{ metric: validatedRow.metric, value: validatedRow.value, date: new Date(validatedRow.date) }]
      });
    } catch (error) {
      preview.summary.errors.push(`Row ${index + 1}: ${error.message}`);
      preview.athletes.push({
        row: index + 1,
        status: 'error',
        data: row,
        measurements: []
      });
    }
  }

  return preview;
}
```

## Error Handling

### Import Errors
```typescript
// Common import errors:
const ERROR_TYPES = {
  FILE_TOO_LARGE: 'File exceeds maximum size limit',
  TOO_MANY_ROWS: 'CSV exceeds maximum row limit (10,000)',
  INVALID_FORMAT: 'Invalid CSV format',
  MISSING_HEADERS: 'Required columns are missing',
  INVALID_DATA: 'Data validation failed',
  DUPLICATE_ROWS: 'Duplicate entries detected',
  FOREIGN_KEY_VIOLATION: 'Referenced team/organization not found'
};
```

### Error Reporting
```typescript
// Detailed error reporting:
interface ImportError {
  row: number;
  column?: string;
  message: string;
  suggestion?: string;
}

function reportErrors(errors: ImportError[]) {
  return {
    success: false,
    errorCount: errors.length,
    errors: errors.map(e => ({
      location: `Row ${e.row}${e.column ? `, Column "${e.column}"` : ''}`,
      message: e.message,
      suggestion: e.suggestion
    }))
  };
}
```

### Partial Import Handling
```typescript
// Allow partial imports:
async function partialImport(data: any[], skipErrors: boolean = true) {
  const results = {
    successful: [],
    failed: []
  };

  for (const row of data) {
    try {
      const imported = await importRow(row);
      results.successful.push(imported);
    } catch (error) {
      if (skipErrors) {
        results.failed.push({ row, error: error.message });
      } else {
        throw error; // Fail entire import
      }
    }
  }

  return results;
}
```

## Export Functionality

### CSV Export
```typescript
// Export measurements to CSV using custom arrayToCSV:
import { arrayToCSV } from '@/lib/csv';

async function exportMeasurements(filters: ExportFilters) {
  const measurements = await db.query.measurements.findMany({
    where: and(
      eq(measurements.organizationId, filters.organizationId),
      gte(measurements.date, filters.startDate),
      lte(measurements.date, filters.endDate)
    ),
    with: {
      user: true,
      team: true
    }
  });

  const csvData = measurements.map(m => ({
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    birthDate: m.user.birthDate,
    metric: m.metric,
    value: m.value,
    units: m.units,
    date: m.date,
    teamName: m.team?.name,
    age: m.age
  }));

  return arrayToCSV(csvData);
}
```

### Export Templates
```typescript
// Provide CSV templates for import using arrayToCSV:
import { arrayToCSV } from '@/lib/csv';

function generateTemplate(type: 'measurements' | 'athletes' | 'teams') {
  const templates = {
    measurements: {
      headers: ['firstName', 'lastName', 'birthDate', 'metric', 'value', 'date', 'email', 'teamName'],
      data: [{
        firstName: 'John',
        lastName: 'Doe',
        birthDate: '2005-03-15',
        metric: 'FLY10_TIME',
        value: '1.85',
        date: '2024-10-05',
        email: 'john@example.com',
        teamName: 'Varsity Soccer'
      }]
    },
    athletes: {
      headers: ['firstName', 'lastName', 'birthDate', 'email', 'role', 'teamName'],
      data: [{
        firstName: 'Jane',
        lastName: 'Smith',
        birthDate: '2004-08-22',
        email: 'jane@example.com',
        role: 'athlete',
        teamName: 'JV Basketball'
      }]
    },
    teams: {
      headers: ['name', 'level', 'season', 'organizationId'],
      data: [{
        name: 'Varsity Soccer',
        level: 'HS',
        season: '2024-Fall',
        organizationId: 'your-org-id'
      }]
    }
  };

  const template = templates[type];
  return arrayToCSV(template.data, template.headers);
}
```

## Performance Optimization

### Large File Handling
```typescript
// CSV parsing with custom parseCSV function:
import { parseCSV } from '@/lib/csv';

async function handleLargeCSV(csvText: string) {
  // Parse entire CSV using string-split approach
  const rows = parseCSV(csvText);

  if (rows.length > MAX_CSV_ROWS) {
    throw new Error(`CSV exceeds maximum ${MAX_CSV_ROWS} rows`);
  }

  // Process in batches to avoid memory issues
  const BATCH_SIZE = 100;
  const results = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const processed = await processBatch(batch);
    results.push(...processed);
  }

  return results;
}
```

### Database Optimization
```typescript
// Optimize bulk inserts:
- Use transactions for atomicity
- Batch inserts (100-500 rows per batch)
- Disable indexes during large imports
- Use COPY command for PostgreSQL
- Parallel processing where possible
```

## Security Considerations

### Upload Security
```typescript
// CSV upload protection:
- Validate file content (not just extension)
- Scan for CSV injection attacks
- Sanitize cell values
- Prevent formula injection (=, +, -, @)
- Rate limit uploads (20 per 15 minutes)
- Virus scanning in production
```

### Data Access Control
```typescript
// Import permission validation:
async function validateImportPermission(userId: string, organizationId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: { userOrganizations: true }
  });

  const orgMembership = user.userOrganizations.find(
    uo => uo.organizationId === organizationId
  );

  if (!orgMembership || !['org_admin', 'site_admin'].includes(orgMembership.role)) {
    throw new Error('Insufficient permissions for data import');
  }

  return true;
}
```

## Integration Points
- **Database Schema Agent**: Efficient bulk insert strategies
- **Form Validation Agent**: Reuse validation schemas
- **OCR Agent**: Alternative to CSV for photo-based data
- **Analytics Agent**: Export filtered analytics data

## Success Metrics
- Import success rate > 95%
- Processing time < 5 seconds per 1000 rows
- Athlete matching accuracy > 90%
- User error correction rate < 10%
- Zero data loss during imports
- Export download success rate > 99%

## User Experience

### Import UI Flow
```typescript
// Multi-step import wizard:
1. Upload CSV file
2. Map columns (if headers don't match)
3. Preview data with warnings
4. Resolve conflicts (merge or create new)
5. Confirm import
6. View import results
7. Download error report (if any)
```

### Progress Indication
```typescript
// Real-time import progress:
- File upload progress bar
- Parsing progress (rows processed)
- Validation progress
- Import execution progress
- Success/error summary
```

## Testing Import/Export

### Test Scenarios
```typescript
// Test cases:
- Valid CSV with all required fields
- CSV with missing optional fields
- Duplicate athlete detection
- Invalid data formats
- Large file (10,000 rows)
- Empty file
- Malformed CSV
- CSV injection attempts
- Concurrent imports
```
