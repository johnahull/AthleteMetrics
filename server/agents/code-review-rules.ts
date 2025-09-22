/**
 * AthleteMetrics-specific code review rules and patterns
 * These rules are tailored to the project's architecture and patterns
 */

export interface ProjectRule {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: RegExp;
  fileTypes: string[];
  category: 'security' | 'performance' | 'architecture' | 'data' | 'ui';
  suggestion: string;
  autoFixable?: boolean;
}

/**
 * AthleteMetrics-specific code review rules
 */
export const ATHLETE_METRICS_RULES: ProjectRule[] = [
  // Database and Schema Rules
  {
    id: 'drizzle-raw-sql',
    name: 'Raw SQL Usage',
    description: 'Direct SQL queries should use Drizzle ORM',
    severity: 'high',
    pattern: /db\.execute\s*\(\s*['"`](?:SELECT|INSERT|UPDATE|DELETE)/i,
    fileTypes: ['typescript', 'javascript'],
    category: 'data',
    suggestion: 'Use Drizzle ORM queries instead of raw SQL for type safety',
    autoFixable: false
  },
  {
    id: 'missing-organization-filter',
    name: 'Missing Organization Filter',
    description: 'Database queries should include organization filtering for multi-tenancy',
    severity: 'critical',
    pattern: /(?:select|update|delete)\s*\([^)]*\)\s*\.(?:from|where)\s*\([^)]*users|teams|measurements[^)]*\)(?![^)]*organization)/i,
    fileTypes: ['typescript', 'javascript'],
    category: 'security',
    suggestion: 'Add organization_id filter to prevent data leakage between organizations',
    autoFixable: false
  },
  {
    id: 'uuid-validation',
    name: 'UUID Parameter Validation',
    description: 'UUID parameters should be validated before database queries',
    severity: 'medium',
    pattern: /req\.params\.\w+.*(?:findFirst|findMany|update|delete)\s*\(/,
    fileTypes: ['typescript', 'javascript'],
    category: 'security',
    suggestion: 'Validate UUID format using zod schema before database operations',
    autoFixable: false
  },

  // Authentication and Security Rules
  {
    id: 'unprotected-route',
    name: 'Unprotected Route',
    description: 'API routes should use requireAuth middleware',
    severity: 'critical',
    pattern: /app\.(get|post|put|delete)\s*\(\s*['"`]\/api\/(?!auth\/login|auth\/logout|health)[^'"`]*['"`]\s*,\s*(?!requireAuth)/,
    fileTypes: ['typescript', 'javascript'],
    category: 'security',
    suggestion: 'Add requireAuth middleware to protect API endpoints',
    autoFixable: false
  },
  {
    id: 'session-access',
    name: 'Direct Session Access',
    description: 'Use session validation instead of direct req.session access',
    severity: 'medium',
    pattern: /req\.session\.user(?!\?)/,
    fileTypes: ['typescript', 'javascript'],
    category: 'security',
    suggestion: 'Use optional chaining or validation when accessing session data',
    autoFixable: true
  },
  {
    id: 'password-logging',
    name: 'Password in Logs',
    description: 'Sensitive data should not be logged',
    severity: 'critical',
    pattern: /console\.log.*(?:password|secret|token|key)/i,
    fileTypes: ['typescript', 'javascript'],
    category: 'security',
    suggestion: 'Remove sensitive data from log statements',
    autoFixable: false
  },

  // React and Frontend Rules
  {
    id: 'wouter-router-usage',
    name: 'Router Library Consistency',
    description: 'Use Wouter for routing, not React Router',
    severity: 'medium',
    pattern: /from\s+['"`]react-router|import.*Router.*from\s+['"`]react-router/,
    fileTypes: ['typescript', 'javascript'],
    category: 'architecture',
    suggestion: 'Use Wouter routing library as specified in project architecture',
    autoFixable: false
  },
  {
    id: 'shadcn-ui-consistency',
    name: 'UI Component Consistency',
    description: 'Use shadcn/ui components instead of custom UI elements',
    severity: 'low',
    pattern: /<(?:button|input|select|textarea)(?!\s+className.*\$\{cn\()/,
    fileTypes: ['typescript', 'javascript'],
    category: 'ui',
    suggestion: 'Use shadcn/ui components for consistency',
    autoFixable: false
  },
  {
    id: 'react-hook-form-usage',
    name: 'Form Handling Consistency',
    description: 'Use React Hook Form with Zod validation for forms',
    severity: 'medium',
    pattern: /<form(?![^>]*onSubmit.*handleSubmit)/,
    fileTypes: ['typescript', 'javascript'],
    category: 'architecture',
    suggestion: 'Use React Hook Form with handleSubmit for form management',
    autoFixable: false
  },

  // Performance and Data Rules
  {
    id: 'inefficient-measurement-query',
    name: 'Inefficient Measurement Query',
    description: 'Large measurement queries should include pagination or limits',
    severity: 'medium',
    pattern: /measurements.*findMany\s*\([^)]*\)(?![^}]*limit|take)/,
    fileTypes: ['typescript', 'javascript'],
    category: 'performance',
    suggestion: 'Add pagination or limit to measurement queries to prevent performance issues',
    autoFixable: false
  },
  {
    id: 'missing-chart-optimization',
    name: 'Chart Performance',
    description: 'Large datasets in charts should be optimized',
    severity: 'low',
    pattern: /Chart.*data.*length\s*>\s*100/,
    fileTypes: ['typescript', 'javascript'],
    category: 'performance',
    suggestion: 'Consider data sampling or virtualization for large chart datasets',
    autoFixable: false
  },

  // API and Data Structure Rules
  {
    id: 'response-structure',
    name: 'API Response Structure',
    description: 'API responses should follow consistent structure',
    severity: 'medium',
    pattern: /res\.json\s*\(\s*(?!.*message|.*data|.*error)/,
    fileTypes: ['typescript', 'javascript'],
    category: 'architecture',
    suggestion: 'Use consistent API response structure with message, data, or error fields',
    autoFixable: false
  },
  {
    id: 'error-handling',
    name: 'Error Handling',
    description: 'Database operations should have proper error handling',
    severity: 'high',
    pattern: /(?:findFirst|findMany|create|update|delete)\s*\([^}]*\)(?![^}]*catch|try)/,
    fileTypes: ['typescript', 'javascript'],
    category: 'architecture',
    suggestion: 'Add try-catch blocks around database operations',
    autoFixable: false
  },

  // CSV Import/Export Rules
  {
    id: 'csv-validation',
    name: 'CSV Data Validation',
    description: 'CSV imports should validate data before processing',
    severity: 'high',
    pattern: /csv.*parse(?![^}]*validate|schema)/i,
    fileTypes: ['typescript', 'javascript'],
    category: 'data',
    suggestion: 'Validate CSV data using Zod schemas before processing',
    autoFixable: false
  },
  {
    id: 'bulk-operations',
    name: 'Bulk Operation Efficiency',
    description: 'Large data operations should use batch processing',
    severity: 'medium',
    pattern: /for\s*\([^}]*\)\s*{[^}]*(?:create|insert|update)/,
    fileTypes: ['typescript', 'javascript'],
    category: 'performance',
    suggestion: 'Use batch operations for bulk data processing instead of loops',
    autoFixable: false
  },

  // Environment and Configuration Rules
  {
    id: 'env-validation',
    name: 'Environment Variable Usage',
    description: 'Environment variables should be validated',
    severity: 'medium',
    pattern: /process\.env\.\w+(?![^}]*\|\||.*\?\?)/,
    fileTypes: ['typescript', 'javascript'],
    category: 'architecture',
    suggestion: 'Provide fallback values or validation for environment variables',
    autoFixable: false
  },
  {
    id: 'hardcoded-urls',
    name: 'Hardcoded URLs',
    description: 'API URLs should be configurable',
    severity: 'low',
    pattern: /['"`]https?:\/\/(?!localhost)/,
    fileTypes: ['typescript', 'javascript'],
    category: 'architecture',
    suggestion: 'Use environment variables for external URLs',
    autoFixable: false
  }
];

/**
 * File-specific rule sets
 */
export const FILE_SPECIFIC_RULES = {
  // Schema files should follow specific patterns
  'schema.ts': [
    {
      id: 'drizzle-schema-naming',
      name: 'Schema Naming Convention',
      description: 'Database tables should use snake_case naming',
      severity: 'medium',
      pattern: /pgTable\s*\(\s*['"`][a-z]+(?:[A-Z][a-z]*)+['"`]/,
      fileTypes: ['typescript'],
      category: 'architecture' as const,
      suggestion: 'Use snake_case for database table names'
    }
  ],

  // Route files should follow REST conventions
  '*routes*.ts': [
    {
      id: 'rest-conventions',
      name: 'REST Convention',
      description: 'API routes should follow REST conventions',
      severity: 'low',
      pattern: /app\.(get|post|put|delete)\s*\(\s*['"`]\/api\/\w+\/(?![\w-]+(?:\/:\w+)?)\w/,
      fileTypes: ['typescript'],
      category: 'architecture' as const,
      suggestion: 'Follow REST naming conventions for API endpoints'
    }
  ],

  // Component files should follow React patterns
  '*.tsx': [
    {
      id: 'component-naming',
      name: 'Component File Naming',
      description: 'Component files should use PascalCase',
      severity: 'low',
      pattern: /export\s+(?:default\s+)?function\s+([a-z])/,
      fileTypes: ['typescript'],
      category: 'architecture' as const,
      suggestion: 'Component names should start with uppercase letter'
    }
  ]
};

/**
 * Performance thresholds specific to AthleteMetrics
 */
export const PERFORMANCE_THRESHOLDS = {
  maxComplexity: 15,
  maxFileLines: 400,
  maxFunctionLines: 50,
  maxMeasurementQuerySize: 1000,
  maxChartDataPoints: 500
};

/**
 * Security patterns specific to sports data
 */
export const SECURITY_PATTERNS = [
  {
    name: 'PII Exposure',
    pattern: /console\.log.*(?:email|phone|birthDate|address)/i,
    severity: 'critical' as const,
    description: 'Personal information should not be logged'
  },
  {
    name: 'Medical Data Exposure',
    pattern: /console\.log.*(?:injury|medical|health)/i,
    severity: 'critical' as const,
    description: 'Medical information requires special protection'
  },
  {
    name: 'Performance Data Validation',
    pattern: /measurements.*(?:FLY10_TIME|VERTICAL_JUMP|AGILITY).*[^0-9.]/,
    severity: 'medium' as const,
    description: 'Performance measurements should be validated as numbers'
  }
];

/**
 * Check if a rule applies to a specific file
 */
export function isRuleApplicableToFile(rule: ProjectRule, filePath: string): boolean {
  const fileName = filePath.split('/').pop() || '';
  const fileExtension = fileName.split('.').pop() || '';

  // Check file type compatibility
  if (!rule.fileTypes.includes(getFileType(fileExtension))) {
    return false;
  }

  // Check file-specific rules
  for (const [pattern, rules] of Object.entries(FILE_SPECIFIC_RULES)) {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      if (regex.test(fileName) && rules.includes(rule as any)) {
        return true;
      }
    } else if (fileName === pattern && rules.includes(rule as any)) {
      return true;
    }
  }

  return true; // General rules apply to all files of the correct type
}

/**
 * Get file type from extension
 */
function getFileType(extension: string): string {
  const typeMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript'
  };
  return typeMap[extension] || extension;
}

/**
 * Get rules for a specific category
 */
export function getRulesByCategory(category: string): ProjectRule[] {
  return ATHLETE_METRICS_RULES.filter(rule => rule.category === category);
}

/**
 * Get rules by severity
 */
export function getRulesBySeverity(severity: string): ProjectRule[] {
  return ATHLETE_METRICS_RULES.filter(rule => rule.severity === severity);
}

/**
 * Get critical rules that should block deployment
 */
export function getCriticalRules(): ProjectRule[] {
  return getRulesBySeverity('critical');
}