# Agent Usage Examples

Real-world examples of how to use AthleteMetrics' autonomous agent system for development tasks.

## Quick Reference

| Task Type | Agent to Use | Example Prompt |
|-----------|--------------|----------------|
| New feature with tests | `test-driven-feature-agent` | "Implement X with TDD" |
| Database changes | `database-schema-agent` | "Add column Y to table Z" |
| Analytics/Charts | `analytics-visualization-agent` | "Create box plot for metric X" |
| Security/Auth | `security-authentication-agent` | "Add role-based access for X" |
| API endpoint | `api-route-architecture-agent` | "Create REST endpoint for X" |
| UI components | `ui-component-library-agent` | "Build responsive form for X" |
| Tests only | `testing-qa-agent` | "Add tests for existing feature X" |
| Bug fix | `test-driven-feature-agent` | "Fix: X not working, TDD approach" |
| **Code formatting** | `code-quality-linting-agent` | "Setup ESLint and Prettier" |
| **Feature flags** | `feature-flag-settings-agent` | "Add feature toggle for X" |
| **Dependencies** | `dependency-management-agent` | "Update dependencies and fix vulnerabilities" |
| **Deployment** | `deployment-release-agent` | "Create release v1.2.0" |
| **Org customization** | `multi-tenant-profiles-agent` | "Add college org type profile" |
| **Custom metrics** | `custom-metric-config-agent` | "Allow orgs to create custom tests" |
| **Monitoring** | `monitoring-observability-agent` | "Setup Sentry error tracking" |
| **CI/CD workflows** | `ci-cd-pipeline-agent` | "Create GitHub Actions workflow for tests" |
| **GitHub operations** | `github-operations-agent` | "Setup automatic issue labeling" |

---

## Autonomous Feature Development

### Example 1: New Measurement Type (Simple)

**Scenario:** Add support for "Standing Long Jump" measurement

**Prompt:**
```
Implement Standing Long Jump measurement tracking with tests.

Requirements:
- Add STANDING_LONG_JUMP to MetricType enum
- Measured in inches
- Validation: 0-144 inches (0-12 feet)
- Include in analytics
- Add to measurement entry form
```

**What Happens:**
1. `test-driven-feature-agent` takes control
2. Invokes `testing-qa-agent` to write tests
3. Coordinates in parallel:
   - `database-schema-agent`: Add to schema
   - `form-validation-agent`: Update form
4. Invokes sequentially:
   - `analytics-visualization-agent`: Add to charts
5. Runs tests, iterates on failures
6. Completes in ~12 minutes, 8 tests passing

**Expected Output:**
```
✅ Created 8 tests (all passing)
✅ Updated shared/schema.ts
✅ Updated measurement form
✅ Updated analytics charts
✅ Type checking passed
✅ Full test suite passed (164 tests)
```

---

### Example 2: Complex Feature (Multi-System)

**Scenario:** Build team comparison analytics page

**Prompt:**
```
Implement team comparison analytics dashboard with TDD approach.

Requirements:
1. Compare 2-5 teams side-by-side
2. Show box plots for each metric
3. Display statistical significance (p-values)
4. Export comparison report to PDF
5. Coach-only access (RBAC)
6. Responsive design (mobile + desktop)
7. Filter by date range and metric selection

Use comprehensive testing including E2E tests.
```

**What Happens:**
1. `test-driven-feature-agent` analyzes requirements
2. Creates detailed plan with TodoWrite (12 tasks)
3. Invokes `testing-qa-agent` for comprehensive test suite
4. Phase 1 (parallel):
   - `database-schema-agent`: Query optimization
   - `security-authentication-agent`: RBAC for coaches
   - `api-route-architecture-agent`: Comparison endpoint
5. Phase 2 (parallel):
   - `analytics-visualization-agent`: Box plots & stats
   - `ui-component-library-agent`: Dashboard UI
   - `form-validation-agent`: Filters & inputs
6. Runs tests, iterates 3 times
7. Completes in ~45 minutes, 31 tests passing

**Expected Output:**
```
✅ Created 31 tests (all passing)
✅ Optimized database queries (200ms → 45ms)
✅ Implemented RBAC for coach dashboard
✅ Created 3 new API endpoints
✅ Built responsive dashboard UI
✅ Integrated statistical analysis
✅ Added PDF export functionality
✅ E2E tests passing (5 critical paths)
```

---

### Example 3: Bug Fix with Regression Test

**Scenario:** Athletes from archived teams not appearing in analytics

**Prompt:**
```
Fix: Athletes on archived teams don't show up in team analytics.

Write regression test first, then fix the issue.
```

**What Happens:**
1. `test-driven-feature-agent` takes control
2. `testing-qa-agent` writes regression test
3. Runs test → Confirms bug (test fails as expected)
4. `database-schema-agent` analyzes query logic
5. Fixes archived team filtering in analytics query
6. Runs test → Passes
7. Runs full suite → All pass
8. Completes in ~8 minutes, 3 new tests

**Expected Output:**
```
✅ Written 3 regression tests
✅ Fixed archived team query in analytics
✅ All tests passing (167 tests)
✅ No breaking changes detected
```

---

## Individual Agent Usage

### Database Schema Agent

**Example 1: Add New Table**

**Prompt:**
```
Add a new "training_sessions" table to track team practice sessions:
- id (uuid, primary key)
- teamId (references teams)
- sessionDate (timestamp)
- duration (integer, minutes)
- focus (text: "speed", "strength", "agility", "endurance")
- notes (text, optional)
- attendees (array of athlete ids)
```

**Output:**
```typescript
// Added to shared/schema.ts
export const trainingSessions = pgTable("training_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  sessionDate: timestamp("session_date").notNull(),
  duration: integer("duration").notNull(),
  focus: text("focus").notNull(),
  notes: text("notes"),
  attendees: text("attendees").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Example 2: Add Index for Performance**

**Prompt:**
```
Analytics queries for measurements by athlete and date are slow (>2s).
Add appropriate indexes to improve performance.
```

**Output:**
```typescript
// Added indexes to measurements table
export const measurements = pgTable("measurements", {
  // ... existing columns
}, (table) => ({
  athleteDateIdx: index("measurements_athlete_date_idx")
    .on(table.athleteId, table.measurementDate),
  metricDateIdx: index("measurements_metric_date_idx")
    .on(table.metricType, table.measurementDate),
}));

// Query performance improved: 2100ms → 180ms
```

---

### Analytics & Visualization Agent

**Example: Custom Chart Component**

**Prompt:**
```
Create a "Swarm Plot" chart component for visualizing individual athlete measurements
with team distribution overlay:
- X-axis: Measurement dates
- Y-axis: Metric values
- Points: Individual measurements (colored by athlete)
- Overlay: Team average line + standard deviation bands
- Interactive: Click point to see athlete details
```

**Output:**
```typescript
// client/src/components/charts/SwarmPlot.tsx
export function SwarmPlot({ data, metric }: SwarmPlotProps) {
  // Implementation with Chart.js custom plugin
  // Includes:
  // - Beeswarm algorithm for non-overlapping points
  // - Team statistics overlay
  // - Interactive tooltips
  // - Responsive design
}

// Plus comprehensive tests
// client/src/components/charts/__tests__/SwarmPlot.test.tsx
```

---

### Security & Authentication Agent

**Example: Add MFA Support**

**Prompt:**
```
Implement Multi-Factor Authentication (MFA) for organization admins:
- TOTP-based (Google Authenticator compatible)
- Mandatory for Org Admin and Site Admin roles
- Setup flow during first login
- Backup codes (10 single-use codes)
- Recovery via email
```

**Output:**
```typescript
// server/auth/mfa.ts - MFA service
// server/routes/mfa-routes.ts - Setup/verify endpoints
// client/src/components/MFASetup.tsx - Setup UI
// client/src/components/MFAVerify.tsx - Login verification

// Plus:
// - Database schema for MFA secrets and backup codes
// - 12 tests covering setup, verify, recovery flows
// - Email templates for recovery
```

---

### API & Route Architecture Agent

**Example: REST API for Feature**

**Prompt:**
```
Create REST API for training sessions:
- POST /api/training-sessions (create)
- GET /api/training-sessions/:id (get by id)
- GET /api/training-sessions?teamId=X (list by team)
- PUT /api/training-sessions/:id (update)
- DELETE /api/training-sessions/:id (soft delete)

Include:
- Request validation (Zod schemas)
- Organization-based access control
- Pagination for list endpoint
- Error handling
```

**Output:**
```typescript
// server/routes/training-session-routes.ts
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";

const router = Router();

// All endpoints implemented with:
// - Zod validation schemas
// - Permission checks
// - Error handling
// - Pagination
// - Integration tests

export default router;
```

---

### Form & Validation Agent

**Example: Multi-Step Form**

**Prompt:**
```
Create multi-step athlete registration form:

Step 1: Personal Info
- First name, last name, birth date
- Email, phone

Step 2: Athletic Profile
- Position(s) - multi-select
- Previous teams
- Athletic history

Step 3: Medical Info (optional)
- Injuries
- Medical notes

Features:
- Save progress between steps
- Validation per step
- Summary before submit
- React Hook Form + Zod
```

**Output:**
```typescript
// client/src/components/forms/AthleteRegistrationForm.tsx
export function AthleteRegistrationForm() {
  const [step, setStep] = useState(1);
  const form = useForm<AthleteRegistration>({
    resolver: zodResolver(athleteRegistrationSchema),
    mode: "onChange",
  });

  // Implementation includes:
  // - Stepper UI with progress indicator
  // - Per-step validation
  // - Form state persistence
  // - Accessible navigation
}

// shared/schemas/athlete-registration.ts
// Zod schemas for each step
```

---

### Testing & QA Agent

**Example: Add Tests for Existing Feature**

**Prompt:**
```
Add comprehensive tests for the CSV import feature:
- Unit tests for CSV parsing
- Unit tests for athlete matching algorithm
- Integration tests for import API endpoint
- Component tests for ImportPreview UI
- E2E test for complete import flow

Current coverage: 45% → Target: 85%
```

**Output:**
```typescript
// tests/unit/csv-parser.test.ts (8 tests)
// tests/unit/athlete-matching.test.ts (12 tests)
// tests/integration/import-api.test.ts (6 tests)
// client/src/components/__tests__/ImportPreview.test.tsx (9 tests)
// tests/e2e/csv-import-flow.test.ts (1 test)

// Coverage: 45% → 87%
// All 36 tests passing
```

---

### UI/UX Component Library Agent

**Example: Design System Component**

**Prompt:**
```
Create a "StatCard" component for the analytics dashboard:
- Shows metric name, value, and change percentage
- Color-coded: green (improvement), red (decline), gray (neutral)
- Supports different sizes: sm, md, lg
- Responsive design
- Follows shadcn/ui patterns
- Includes loading state
- Accessible (ARIA labels)
```

**Output:**
```typescript
// client/src/components/ui/stat-card.tsx
import { Card } from "@/components/ui/card";
import { cva } from "class-variance-authority";

const statCardVariants = cva("...");

export function StatCard({
  metric,
  value,
  change,
  size = "md",
  isLoading = false,
}: StatCardProps) {
  // Implementation with:
  // - Tailwind styling
  // - Size variants
  // - Loading skeleton
  // - ARIA labels
}

// Includes Storybook story and component tests
```

---

### OCR & Image Processing Agent

**Example: Enhance OCR Accuracy**

**Prompt:**
```
Improve OCR accuracy for handwritten performance sheets:
- Add image preprocessing (contrast, rotation correction)
- Implement confidence scoring
- Add manual correction interface
- Support multiple measurement formats
- Handle messy handwriting better
```

**Output:**
```typescript
// server/ocr/preprocessing.ts
export function preprocessImage(image: Buffer): Buffer {
  // Contrast enhancement
  // Rotation detection and correction
  // Noise reduction
}

// server/ocr/confidence-scorer.ts
export function scoreOCRResult(result: OCRResult): number {
  // Confidence algorithm
}

// client/src/components/OCRCorrection.tsx
// Manual correction UI

// Accuracy improved: 72% → 89%
```

---

### Code Quality & Linting Agent

**Example 1: Setup ESLint and Prettier**

**Prompt:**
```
Setup ESLint and Prettier for this project:
- ESLint config for React, TypeScript, and accessibility
- Prettier integration (no conflicts with ESLint)
- Pre-commit hooks with Husky + lint-staged
- Import sorting with eslint-plugin-import
- CI integration for automated checks
```

**Output:**
```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "prettier"
  ],
  "plugins": ["@typescript-eslint", "react", "jsx-a11y", "import"],
  "rules": {
    "import/order": ["error", { "groups": ["builtin", "external", "internal"] }],
    "react/react-in-jsx-scope": "off"
  }
}

// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": false,
  "printWidth": 100,
  "tabWidth": 2
}

// .husky/pre-commit
#!/bin/sh
npx lint-staged

// .lintstagedrc.json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md}": ["prettier --write"]
}

// Updated package.json with scripts:
"lint": "eslint . --ext .ts,.tsx",
"lint:fix": "eslint . --ext .ts,.tsx --fix",
"format": "prettier --write \"**/*.{ts,tsx,json,md}\""
```

**Example 2: Migrate to TypeScript Strict Mode**

**Prompt:**
```
Migrate codebase to TypeScript strict mode incrementally:
- Enable strict mode in tsconfig.json
- Fix all type errors file by file
- Add proper type annotations where missing
- Remove 'any' types
```

**Output:**
```typescript
// tsconfig.json - Updated
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}

// Fixed 47 type errors across 23 files
// Removed 31 'any' types
// Added proper type annotations to 89 functions
```

---

### Feature Flag & Settings Management Agent

**Example 1: Org Settings Page**

**Prompt:**
```
Create organization settings page where org admins can configure features:
- Enable/disable AI insights
- Enable/disable custom reports
- Enable/disable video analysis
- Custom branding (logo, colors)
- Email notification preferences
```

**Output:**
```typescript
// Database schema
export const organizationSettings = pgTable("organization_settings", {
  id: varchar("id").primaryKey(),
  organizationId: varchar("organization_id").references(() => organizations.id),
  featureFlags: jsonb("feature_flags").$type<{
    aiInsights: boolean;
    customReports: boolean;
    videoAnalysis: boolean;
  }>(),
  branding: jsonb("branding").$type<{
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  }>(),
  notificationPreferences: jsonb("notification_preferences"),
});

// API endpoint
// server/routes/organization-settings.ts

// UI component
// client/src/pages/OrganizationSettings.tsx
export function OrganizationSettings() {
  const { organization } = useAuth();
  const form = useForm<OrgSettingsForm>({ ... });

  // Feature toggle switches
  // Branding customization
  // Notification preferences
}

// React context for feature flags
// client/src/contexts/FeatureFlagContext.tsx
export function useFeatureFlag(flag: string): boolean {
  const { settings } = useOrganizationSettings();
  return settings?.featureFlags?.[flag] ?? false;
}
```

**Example 2: A/B Testing Infrastructure**

**Prompt:**
```
Add A/B testing capability for new features:
- Percentage-based rollout (e.g., 50% of users see new UI)
- User segment targeting (college orgs only)
- Feature analytics tracking
- Admin dashboard to control experiments
```

**Output:**
```typescript
// server/middleware/feature-flag.ts
export function checkFeatureFlag(flagName: string) {
  return async (req, res, next) => {
    const user = req.user;
    const flag = await db.query.featureFlags.findFirst({
      where: eq(featureFlags.name, flagName)
    });

    // Percentage rollout logic
    if (flag.rolloutPercentage < 100) {
      const hash = hashUserId(user.id);
      if (hash % 100 >= flag.rolloutPercentage) {
        return res.status(403).json({ message: "Feature not enabled" });
      }
    }

    // User segment targeting
    if (flag.targetSegments && !matchesSegment(user, flag.targetSegments)) {
      return res.status(403).json({ message: "Feature not available" });
    }

    req.featureEnabled = true;
    next();
  };
}
```

---

### Dependency Management Agent

**Example 1: Security Vulnerability Fixes**

**Prompt:**
```
Fix all security vulnerabilities detected by npm audit:
- Update packages with high/critical vulnerabilities
- Test after each update to ensure nothing breaks
- Document breaking changes if any
```

**Output:**
```bash
# Analysis of vulnerabilities
Found 3 high severity vulnerabilities:
- webpack 5.88.0 (requires 5.94.0)
- semver 6.3.0 (requires 7.6.0)
- @babel/traverse 7.22.0 (requires 7.23.2)

# Updates applied
npm update webpack@5.94.0
npm update semver@7.6.0
npm update @babel/traverse@7.23.2

# Tests run after each update
✅ All tests passing (167 tests)
✅ Build successful
✅ No breaking changes detected

# Security audit results
Before: 3 high, 2 moderate
After: 0 high, 0 moderate ✅
```

**Example 2: Major Version Upgrade**

**Prompt:**
```
Upgrade React Query from v4 to v5:
- Review breaking changes in changelog
- Update all usages across codebase
- Update types and imports
- Verify all queries still work
```

**Output:**
```typescript
// Breaking changes identified:
1. useQuery key must be array (was string)
2. onSuccess/onError callbacks moved to mutate()
3. cacheTime renamed to gcTime

// Files updated: 23 files
// Changes:
- Updated 47 useQuery calls
- Updated 12 useMutation calls
- Updated query keys to array format
- Moved callbacks to appropriate locations

// Testing results
✅ All 167 tests passing
✅ Manual testing: queries working correctly
✅ Type checking passed
```

---

### Deployment & Release Management Agent

**Example 1: Create Production Release**

**Prompt:**
```
Create production release v1.5.0:
- Generate release notes from commits since v1.4.0
- Verify all tests pass
- Create GitHub release
- Trigger deployment to Railway production
```

**Output:**
```markdown
# Release Notes Generated

## v1.5.0 - 2025-10-10

### Features
- Added custom metric builder for organizations (#123)
- Implemented team comparison analytics (#125)
- Added PDF export for reports (#128)

### Bug Fixes
- Fixed archived team filtering in analytics (#124)
- Resolved CSV import validation issue (#126)

### Improvements
- Optimized database queries (200ms → 45ms) (#127)
- Enhanced mobile responsive design (#129)

---

# Pre-release checks
✅ All tests passing (173 tests)
✅ Type checking passed
✅ Build successful
✅ Security audit passed (0 vulnerabilities)
✅ Environment variables validated

# GitHub Release Created
Tag: v1.5.0
Branch: main
Release URL: https://github.com/org/repo/releases/tag/v1.5.0

# Railway Deployment Triggered
Environment: production
Status: Deploying...
Health check: ✅ Passed
Deployment complete: https://athletemetrics.io
```

**Example 2: Rollback After Failed Deployment**

**Prompt:**
```
Production deployment failed health checks. Rollback to v1.4.0:
- Restore previous Railway deployment
- Verify rollback successful
- Document what went wrong
```

**Output:**
```bash
# Rollback initiated
Previous deployment ID: d7f9e3a1
Target version: v1.4.0

# Railway rollback
railway rollback d7f9e3a1 --service athletemetrics-production

# Health check verification
✅ Health endpoint responding (200 OK)
✅ Database connection successful
✅ All critical services running

# Post-mortem
Issue: Database migration failed due to missing column
Root cause: Migration script had syntax error
Action items:
1. Add migration testing to CI/CD
2. Require manual migration approval for production
3. Improve pre-deployment validation

# Rollback complete
Current version: v1.4.0 ✅
Status: Stable
```

---

### Multi-Tenant Configuration Agent

**Example 1: College Organization Profile**

**Prompt:**
```
Create a "College Program" organization type profile:
- Features: Recruitment tools, NCAA compliance, scholarship tracking
- Custom branding: School colors, athletic department logo
- Role customization: Add "Recruiting Coordinator" role
- Default metrics: College-specific benchmarks
```

**Output:**
```typescript
// Database schema
export const organizationTypes = pgTable("organization_types", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  defaultFeatures: jsonb("default_features").$type<{
    recruitmentTools: boolean;
    ncaaCompliance: boolean;
    scholarshipTracking: boolean;
    advancedAnalytics: boolean;
  }>(),
  defaultRoles: jsonb("default_roles").$type<string[]>(),
});

// Seeded college profile
{
  id: "college-program",
  name: "College Program",
  description: "NCAA college athletic programs",
  defaultFeatures: {
    recruitmentTools: true,
    ncaaCompliance: true,
    scholarshipTracking: true,
    advancedAnalytics: true
  },
  defaultRoles: ["athlete", "coach", "recruiting-coordinator", "athletic-director"]
}

// UI customization
// client/src/pages/CollegeDashboard.tsx
export function CollegeDashboard() {
  const { organizationType } = useOrganization();

  if (organizationType === "college-program") {
    return (
      <>
        <RecruitmentPipeline />
        <NCAAComplianceChecklist />
        <ScholarshipAllocation />
        <TeamAnalytics />
      </>
    );
  }
}
```

**Example 2: White-Label Branding**

**Prompt:**
```
Implement white-label branding for organizations:
- Custom logo upload
- Primary/secondary color picker
- Custom domain support (e.g., athletics.university.edu)
- Branded email templates
- Custom login page design
```

**Output:**
```typescript
// Organization branding schema
export const organizationBranding = pgTable("organization_branding", {
  id: varchar("id").primaryKey(),
  organizationId: varchar("organization_id").references(() => organizations.id),
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color"),
  secondaryColor: varchar("secondary_color"),
  customDomain: varchar("custom_domain"),
  emailFromName: varchar("email_from_name"),
});

// Theme provider
// client/src/contexts/ThemeContext.tsx
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { branding } = useOrganization();

  useEffect(() => {
    if (branding) {
      document.documentElement.style.setProperty(
        '--color-primary',
        branding.primaryColor
      );
      document.documentElement.style.setProperty(
        '--color-secondary',
        branding.secondaryColor
      );
    }
  }, [branding]);

  return <>{children}</>;
}

// Branded email templates
// server/services/email-templates.ts
export function getBrandedTemplate(org: Organization, templateType: string) {
  const branding = org.branding;
  return `
    <div style="background-color: ${branding.primaryColor}">
      <img src="${branding.logoUrl}" alt="${org.name}" />
      ${getTemplateContent(templateType)}
    </div>
  `;
}
```

---

### Custom Metric Configuration Agent

**Example 1: Sport-Specific Metric Builder**

**Prompt:**
```
Create custom metric builder UI for organization admins:
- Define metric name, data type (number, time, distance)
- Set validation rules (min/max, required)
- Specify unit (inches, seconds, meters, etc.)
- Add sport-specific tags
- Create custom form for data entry
```

**Output:**
```typescript
// Database schema
export const customMetrics = pgTable("custom_metrics", {
  id: varchar("id").primaryKey(),
  organizationId: varchar("organization_id").references(() => organizations.id),
  name: varchar("name").notNull(),
  description: text("description"),
  dataType: varchar("data_type").$type<"number" | "time" | "distance">(),
  unit: varchar("unit"),
  validationRules: jsonb("validation_rules").$type<{
    min?: number;
    max?: number;
    required: boolean;
    decimalPlaces?: number;
  }>(),
  sportSpecific: varchar("sport_specific"),
  active: boolean("active").default(true),
});

// Custom metric values
export const customMetricValues = pgTable("custom_metric_values", {
  id: varchar("id").primaryKey(),
  measurementId: varchar("measurement_id").references(() => measurements.id),
  customMetricId: varchar("custom_metric_id").references(() => customMetrics.id),
  value: numeric("value").notNull(),
  validated: boolean("validated").default(false),
});

// Metric builder UI
// client/src/components/admin/MetricBuilder.tsx
export function MetricBuilder() {
  const form = useForm<CustomMetricForm>({
    resolver: zodResolver(customMetricSchema),
  });

  return (
    <Form {...form}>
      <FormField name="name" label="Metric Name" />
      <FormField name="dataType" label="Data Type">
        <Select>
          <SelectItem value="number">Number</SelectItem>
          <SelectItem value="time">Time</SelectItem>
          <SelectItem value="distance">Distance</SelectItem>
        </Select>
      </FormField>
      <FormField name="unit" label="Unit" />
      <FormField name="validationRules.min" label="Minimum Value" />
      <FormField name="validationRules.max" label="Maximum Value" />
      <Button type="submit">Create Metric</Button>
    </Form>
  );
}
```

**Example 2: Formula-Based Derived Metrics**

**Prompt:**
```
Add support for calculated metrics based on formulas:
- Example: Power = (Force × Distance) / Time
- Example: Speed Score = (40yd time × weight) / vertical jump
- Allow admins to define custom formulas
- Auto-calculate when component values are entered
```

**Output:**
```typescript
// Extended custom metrics schema
export const customMetrics = pgTable("custom_metrics", {
  // ... existing columns
  calculationFormula: text("calculation_formula"),
  formulaInputs: jsonb("formula_inputs").$type<string[]>(),
  isCalculated: boolean("is_calculated").default(false),
});

// Formula evaluation engine
// server/services/metric-calculator.ts
import { create, all } from 'mathjs';

// Configure math.js for safe formula evaluation
const math = create(all, {});

export function calculateMetric(
  metric: CustomMetric,
  inputValues: Record<string, number>
): number {
  if (!metric.calculationFormula) {
    throw new Error("Metric is not calculated");
  }

  // Parse and evaluate formula safely using math.js
  const formula = metric.calculationFormula;
  const scope = inputValues;

  // Safe formula evaluation with math.js (prevents code injection)
  try {
    const result = math.evaluate(formula, scope);

    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Formula must evaluate to a finite number');
    }

    return result;
  } catch (error) {
    console.error('Formula evaluation error:', error);
    throw new Error(`Invalid formula: ${error.message}`);
  }
}

// Example formula definition
{
  name: "Explosive Power Index",
  calculationFormula: "(vertical_jump * 0.6) + (broad_jump * 0.4)",
  formulaInputs: ["vertical_jump", "broad_jump"],
  isCalculated: true,
  unit: "composite"
}

// Auto-calculation on data entry
// client/src/components/forms/MeasurementEntry.tsx
export function MeasurementEntry() {
  const { calculatedMetrics } = useCustomMetrics();
  const form = useForm();

  useEffect(() => {
    const values = form.getValues();

    calculatedMetrics.forEach(metric => {
      const inputs = metric.formulaInputs.reduce((acc, input) => {
        acc[input] = values[input];
        return acc;
      }, {});

      if (Object.values(inputs).every(v => v != null)) {
        const calculated = calculateMetricClient(metric, inputs);
        form.setValue(metric.id, calculated);
      }
    });
  }, [form.watch()]);
}
```

---

### CI/CD Pipeline Agent

**Example 1: Create E2E Test Workflow**

**Prompt:**
```
Create GitHub Actions workflow for running E2E tests on PRs:
- Trigger on pull_request to main
- Install dependencies with caching
- Run Playwright tests
- Upload test artifacts on failure
- Add status check
```

**Output:**
```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  pull_request:
    branches: [main]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-results
          path: test-results/
          retention-days: 7

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-coverage
          path: coverage/
          retention-days: 30

# Also updates: package.json with test:e2e script
# Also creates: playwright.config.ts if not exists
```

**Example 2: Optimize Slow Workflow**

**Prompt:**
```
Optimize pr-checks.yml workflow - it's taking 8 minutes to run:
- Type check takes 2 min
- Tests take 4 min
- Build takes 2 min
```

**Output:**
```yaml
# .github/workflows/pr-checks.yml (optimized)
name: PR Checks

on:
  pull_request:
    branches: [main, develop]

concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  # Run jobs in parallel instead of sequentially
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      # Cache node_modules for faster installs
      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-

      - run: npm ci --prefer-offline
      - run: npm run check

  tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}

      # Cache Vitest cache for faster test runs
      - name: Cache Vitest
        uses: actions/cache@v4
        with:
          path: node_modules/.vitest
          key: ${{ runner.os }}-vitest-${{ hashFiles('vitest.config.ts') }}

      - run: npm ci --prefer-offline
      - run: npm run test:run
        env:
          NODE_OPTIONS: --max-old-space-size=4096

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}

      # Cache build output
      - name: Cache build
        uses: actions/cache@v4
        with:
          path: |
            dist
            .vite
          key: ${{ runner.os }}-build-${{ hashFiles('vite.config.ts', 'src/**') }}

      - run: npm ci --prefer-offline
      - run: npm run build

# Improvements:
# ✅ Parallel jobs (8min → 4min)
# ✅ node_modules cache (saves 90s per job)
# ✅ Vitest cache (saves 60s)
# ✅ Build cache (saves 30s on cache hit)
# ✅ Concurrency control (cancels old runs)
# Total: 8 minutes → ~2 minutes
```

---

### GitHub Operations Agent

**Example 1: Automatic Issue Triage**

**Prompt:**
```
Setup automatic issue labeling and triage:
- Label bugs, features, docs, performance based on content
- Auto-assign to team members based on area
- Add "needs-triage" label to unlabeled issues
- Comment with template on new issues
```

**Output:**
```yaml
# .github/workflows/issue-triage.yml
name: Issue Triage

on:
  issues:
    types: [opened, edited]

jobs:
  triage:
    runs-on: ubuntu-latest
    permissions:
      issues: write

    steps:
      - name: Label bug issues
        if: contains(github.event.issue.body, 'bug') || contains(github.event.issue.title, 'bug') || contains(github.event.issue.title, 'fix')
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              labels: ['bug', 'needs-review']
            });

      - name: Label feature requests
        if: contains(github.event.issue.body, 'feature') || contains(github.event.issue.title, 'feature') || contains(github.event.issue.title, 'add')
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              labels: ['enhancement', 'needs-triage']
            });

      - name: Label documentation issues
        if: contains(github.event.issue.body, 'documentation') || contains(github.event.issue.title, 'docs')
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              labels: ['documentation']
            });

            // Auto-assign to docs team
            github.rest.issues.addAssignees({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              assignees: ['docs-team-member']
            });

      - name: Comment on new issues
        if: github.event.action == 'opened'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `Thanks for opening this issue! 🎉\n\nOur team will review it shortly. In the meantime:\n- Make sure you've provided reproduction steps\n- Check if this is related to any existing issues\n- Review our [contributing guidelines](CONTRIBUTING.md)`
            });

# Also creates:
# - .github/ISSUE_TEMPLATE/bug_report.yml
# - .github/ISSUE_TEMPLATE/feature_request.yml
# - .github/ISSUE_TEMPLATE/config.yml
```

**Example 2: Branch Protection Setup**

**Prompt:**
```
Configure branch protection for main branch:
- Require PR reviews (2 approvals)
- Require status checks: type-check, tests, build
- Require branches to be up to date
- Require linear history
- Include administrators
- Setup CODEOWNERS
```

**Output:**
```javascript
// Script: scripts/setup-branch-protection.js
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function setupBranchProtection() {
  const owner = "johnahull";
  const repo = "AthleteMetrics";
  const branch = "main";

  // Update branch protection
  await octokit.rest.repos.updateBranchProtection({
    owner,
    repo,
    branch,
    required_status_checks: {
      strict: true, // Require branches to be up to date
      contexts: [
        "type-check",
        "tests",
        "build",
        "security-audit"
      ]
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismissal_restrictions: {},
      dismiss_stale_reviews: true,
      require_code_owner_reviews: true,
      required_approving_review_count: 2,
      require_last_push_approval: true
    },
    restrictions: null,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true
  });

  console.log("✅ Branch protection rules updated");
}

setupBranchProtection();
```

```
# CODEOWNERS file created
# AthleteMetrics CODEOWNERS

# Global owners
* @johnahull

# Database schema changes
/shared/schema.ts @johnahull @database-team
/server/db.ts @johnahull @database-team

# Security-related changes
/server/auth/ @johnahull @security-team
/server/permissions.ts @johnahull @security-team

# CI/CD workflows
/.github/workflows/ @johnahull @devops-team

# Documentation
*.md @johnahull @docs-team
/docs/ @johnahull @docs-team

# Frontend components
/client/src/components/ @johnahull @frontend-team

# API routes
/server/routes/ @johnahull @backend-team
```

---

## Monitoring & Observability Agent

### Example 1: Sentry Integration for Error Tracking

**Scenario:** Setup production error tracking with Sentry to monitor crashes, exceptions, and user-reported issues.

**Prompt:**
```
Setup Sentry error tracking for AthleteMetrics production environment.

Requirements:
- Install and configure Sentry SDK for both frontend and backend
- Capture unhandled errors and promise rejections
- Track user context (org, role, user ID)
- Set up release tracking for deployments
- Configure source maps for readable stack traces
- Add custom error boundaries for React components
- Create alerts for high-priority errors (auth, data loss)
- Exclude PII from error reports
- Setup rate limiting to prevent quota exhaustion

Environment: Production Railway deployment
```

**Agent Actions:**

1. **Install Dependencies**
```bash
npm install @sentry/react @sentry/node @sentry/tracing
```

2. **Frontend Configuration** (`client/src/sentry.ts`)
```typescript
import * as Sentry from "@sentry/react";
import { BrowserTracing } from "@sentry/tracing";

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      new BrowserTracing({
        tracePropagationTargets: ["localhost", /^https:\/\/api\.athletemetrics\.com/],
      }),
    ],
    tracesSampleRate: 0.1, // 10% of transactions
    environment: import.meta.env.MODE,
    release: `athletemetrics@${import.meta.env.VITE_APP_VERSION}`,

    // Exclude PII
    beforeSend(event, hint) {
      // Remove sensitive data
      if (event.request) {
        delete event.request.cookies;
      }
      return event;
    },

    // User context (without PII)
    beforeSendTransaction(event) {
      // Add user context if authenticated
      const user = getCurrentUser();
      if (user) {
        event.contexts = {
          ...event.contexts,
          user: {
            id: user.id,
            role: user.role,
            orgId: user.organizationId,
          },
        };
      }
      return event;
    },
  });
}
```

3. **Backend Configuration** (`server/sentry.ts`)
```typescript
import * as Sentry from "@sentry/node";
import { ProfilingIntegration } from "@sentry/profiling-node";

export function initSentry() {
  if (process.env.NODE_ENV === "production") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      integrations: [
        new ProfilingIntegration(),
      ],
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      release: `athletemetrics@${process.env.npm_package_version}`,

      // Filter sensitive routes
      beforeSend(event) {
        // Don't capture /api/login or /api/register errors
        if (event.request?.url?.includes('/login') ||
            event.request?.url?.includes('/register')) {
          return null;
        }
        return event;
      },
    });
  }
}
```

4. **Express Middleware** (`server/index.ts`)
```typescript
import * as Sentry from "@sentry/node";
import { initSentry } from "./sentry";

initSentry();

// Request handler must be first middleware
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// ... your routes ...

// Error handler must be last middleware
app.use(Sentry.Handlers.errorHandler());
```

5. **React Error Boundary** (`client/src/App.tsx`)
```typescript
import * as Sentry from "@sentry/react";

function FallbackComponent({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
      <p className="text-gray-600 mb-4">{error.message}</p>
      <Button onClick={resetError}>Try again</Button>
    </div>
  );
}

function App() {
  return (
    <Sentry.ErrorBoundary fallback={FallbackComponent} showDialog>
      <Router>
        {/* Your app routes */}
      </Router>
    </Sentry.ErrorBoundary>
  );
}
```

6. **Environment Variables** (`.env.production`)
```bash
# Sentry Configuration
VITE_SENTRY_DSN=https://abc123@o123456.ingest.sentry.io/789
SENTRY_DSN=https://abc123@o123456.ingest.sentry.io/789
VITE_APP_VERSION=1.2.0
```

7. **Alert Configuration** (Sentry Dashboard)
- **Critical Errors**: Authentication failures, database connection errors
  - Trigger: >5 errors in 5 minutes
  - Notify: Slack #alerts + Email
- **Data Loss**: Failed measurement saves, import failures
  - Trigger: Any occurrence
  - Notify: Slack #urgent + PagerDuty
- **Performance Degradation**: P95 response time >2s
  - Trigger: Sustained for 10 minutes
  - Notify: Slack #performance

**Outcome:**
✅ Sentry integrated for frontend and backend
✅ Error tracking with user context (no PII)
✅ Source maps uploaded for readable stack traces
✅ Critical alerts configured
✅ 10% transaction sampling (cost-effective)
✅ PII automatically filtered

**Monitoring Dashboard:**
- **Error Rate**: 0.2% (baseline)
- **P95 Response Time**: 180ms
- **Affected Users**: Real-time tracking
- **Release Health**: Version comparison

---

### Example 2: APM and Performance Monitoring

**Scenario:** Identify and monitor performance bottlenecks in production, particularly for the analytics dashboard which has been reported as slow.

**Prompt:**
```
Setup comprehensive performance monitoring for AthleteMetrics to identify slow queries and bottlenecks.

Focus Areas:
- Analytics dashboard (reported slow)
- Database query performance
- API endpoint response times
- Frontend rendering performance
- User experience metrics (Core Web Vitals)

Requirements:
- Setup lightweight APM solution (avoid DataDog's high cost)
- Monitor database query performance
- Track API endpoint latency (P50, P95, P99)
- Identify N+1 query problems
- Monitor Core Web Vitals (LCP, FID, CLS)
- Create performance regression alerts
- Cost-effective solution (prefer open-source or cheap options)
```

**Agent Actions:**

1. **Choose APM Stack**
```
Recommendation: Sentry Performance + Custom DB Logging
- Sentry Performance: $26/month (already have Sentry)
- Custom query logging: Free
- Grafana Cloud Free Tier: 10k series
```

2. **Sentry Performance Monitoring** (Already integrated from Example 1)
```typescript
// Additional configuration for performance
import * as Sentry from "@sentry/react";

Sentry.init({
  // ... existing config ...
  integrations: [
    new BrowserTracing({
      routingInstrumentation: Sentry.reactRouterV6Instrumentation(
        React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      ),
    }),
  ],
  tracesSampleRate: 0.1, // 10% for performance monitoring
});
```

3. **Custom Database Query Logging** (`server/db/logger.ts`)
```typescript
import { db } from "./index";
import * as Sentry from "@sentry/node";

export function logSlowQuery(query: string, duration: number, params?: any) {
  // Log queries slower than 500ms
  if (duration > 500) {
    console.warn(`[SLOW QUERY] ${duration}ms: ${query}`, params);

    // Track in Sentry as breadcrumb
    Sentry.addBreadcrumb({
      category: "database",
      message: `Slow query: ${query}`,
      level: "warning",
      data: {
        duration,
        params,
      },
    });
  }
}

// Wrap database queries
export async function timedQuery<T>(
  queryFn: () => Promise<T>,
  queryName: string,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await queryFn();
    const duration = performance.now() - start;
    logSlowQuery(queryName, duration);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    Sentry.captureException(error, {
      contexts: {
        query: {
          name: queryName,
          duration,
        },
      },
    });
    throw error;
  }
}
```

4. **Instrument Analytics Queries** (`server/routes/analytics.ts`)
```typescript
import { timedQuery } from "../db/logger";

// Before (slow query)
router.get("/api/analytics/team/:teamId", async (req, res) => {
  const measurements = await db.query.measurements.findMany({
    where: eq(measurements.teamId, req.params.teamId),
    with: {
      athlete: true,
      team: true,
    },
  });
  // ... more logic
});

// After (instrumented)
router.get("/api/analytics/team/:teamId", async (req, res) => {
  const measurements = await timedQuery(
    () => db.query.measurements.findMany({
      where: eq(measurements.teamId, req.params.teamId),
      with: {
        athlete: true,
        team: true,
      },
    }),
    "analytics.team.measurements",
  );
  // ... more logic
});
```

5. **Core Web Vitals Tracking** (`client/src/monitoring/web-vitals.ts`)
```typescript
import { onCLS, onFID, onLCP } from 'web-vitals';
import * as Sentry from "@sentry/react";

function sendToAnalytics({ name, delta, id }: { name: string; delta: number; id: string }) {
  // Track in Sentry
  Sentry.setMeasurement(name, delta, 'millisecond');

  // Log poor scores
  if (name === 'LCP' && delta > 2500) {
    console.warn(`Poor LCP: ${delta}ms`);
  }
  if (name === 'FID' && delta > 100) {
    console.warn(`Poor FID: ${delta}ms`);
  }
  if (name === 'CLS' && delta > 0.1) {
    console.warn(`Poor CLS: ${delta}`);
  }
}

onCLS(sendToAnalytics);
onFID(sendToAnalytics);
onLCP(sendToAnalytics);
```

6. **Performance Regression Alerts** (Sentry Dashboard)
```yaml
Alert Rules:
  - name: "Slow Analytics Endpoint"
    conditions:
      - metric: p95(transaction.duration)
      - filter: transaction:"GET /api/analytics/*"
      - threshold: > 2000ms
    frequency: 5 minutes
    actions:
      - Slack: #performance

  - name: "Database Query Slowdown"
    conditions:
      - metric: avg(span.duration)
      - filter: span.op:"db.query"
      - threshold: > 500ms
    frequency: 10 minutes
    actions:
      - Email: dev-team@athletemetrics.com

  - name: "Poor Core Web Vitals"
    conditions:
      - metric: p75(measurements.lcp)
      - threshold: > 2500ms
    frequency: 1 hour
    actions:
      - Slack: #frontend-team
```

7. **Performance Dashboard** (Grafana/Sentry)
```
Key Metrics:
├── API Performance
│   ├── P50, P95, P99 latency by endpoint
│   ├── Throughput (requests/second)
│   ├── Error rate (%)
│   └── Slow query count (>500ms)
├── Database Performance
│   ├── Query duration (avg, p95, p99)
│   ├── Connection pool usage
│   ├── Slow queries (>500ms)
│   └── N+1 query detection
├── Frontend Performance
│   ├── LCP (Largest Contentful Paint)
│   ├── FID (First Input Delay)
│   ├── CLS (Cumulative Layout Shift)
│   └── Bundle size
└── User Experience
    ├── Page load time
    ├── Time to interactive
    └── Session duration
```

**Results After Implementation:**

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Analytics Dashboard Load | 3.2s | 0.8s | **75% faster** |
| P95 API Latency | 1200ms | 380ms | **68% faster** |
| Slow Queries (>500ms) | 24/day | 2/day | **92% reduction** |
| LCP Score | 3.1s (Poor) | 1.8s (Good) | **42% faster** |

**Key Findings:**
1. ✅ **N+1 Query Identified**: Analytics dashboard was making 150+ queries
   - Fixed with: Drizzle `.with()` for eager loading
2. ✅ **Missing Index**: `measurements.teamId` was not indexed
   - Added: Index on `(teamId, measurementDate)`
3. ✅ **Over-fetching**: Fetching all athlete data when only names needed
   - Fixed: Select only required columns

**Cost:**
- **Sentry Performance**: $26/month (includes 100k transactions)
- **Grafana Cloud Free Tier**: $0
- **Custom Logging**: $0
- **Total: $26/month** (vs $200+/month for DataDog)

---

## Combined Multi-Agent Workflows

### Example 1: Full-Stack Feature from Scratch

**Prompt:**
```
Implement "Athlete Growth Tracking" feature with TDD:

Description:
Track and visualize athlete physical development over time:
- Height (inches)
- Weight (pounds)
- Body fat percentage (optional)

Features:
- Growth charts with percentile curves
- Compare to age/gender norms
- Alert coaches when measurements needed
- Parent/guardian view access
- Historical trend analysis
- Export growth report

Use comprehensive TDD approach.
```

**Agents Invoked (by test-driven-feature-agent):**
1. `testing-qa-agent` - Write comprehensive test suite
2. `database-schema-agent` - Add growth_measurements table
3. `security-authentication-agent` - Parent access permissions
4. `api-route-architecture-agent` - CRUD endpoints
5. `form-validation-agent` - Measurement entry form
6. `analytics-visualization-agent` - Growth charts
7. `ui-component-library-agent` - Dashboard UI
8. `notification-communication-agent` - Coach alerts

**Timeline:**
- Planning & Tests: 10 minutes
- Parallel Implementation (Phase 1): 15 minutes
- Sequential Implementation (Phase 2): 20 minutes
- Test iterations: 10 minutes (2 iterations)
- Verification: 5 minutes
- **Total: ~60 minutes**

**Deliverables:**
- 38 tests (all passing)
- 6 new database tables/columns
- 5 API endpoints
- 3 UI components
- 2 chart types
- Email notification system
- Full test coverage (88%)

---

### Example 2: Refactoring with Safety

**Prompt:**
```
Refactor measurement storage to support sub-metrics:

Current: Single value per measurement
Goal: Support compound measurements

Example: Vertical Jump
- Approach step count
- Takeoff velocity
- Jump height (main metric)
- Landing balance score

Requirements:
- Backward compatible (existing measurements still work)
- Write tests for current behavior before changes
- Migrate existing data
- Update all dependent code (forms, analytics, exports)

Use TDD to ensure no regressions.
```

**Process:**
1. `testing-qa-agent` writes tests for ALL current behavior
2. Verify all tests pass (baseline)
3. `database-schema-agent` designs new schema
4. Writes migration script
5. Updates code incrementally
6. Runs tests after each change
7. Fixes any failures
8. Completes when all tests pass

**Safety Net:**
- 156 existing tests + 24 new tests
- Zero regressions
- Rollback capability
- Data integrity verified

---

## Common Patterns & Tips

### Pattern 1: Start Small, Iterate

```
First: "Implement basic RSI calculation with tests"
Then: "Add visualization for RSI"
Then: "Add historical RSI tracking"
Then: "Add RSI percentile rankings"
```

Better than one massive request. Easier to iterate and verify.

---

### Pattern 2: Be Specific About Testing

```
❌ "Implement feature X"
   - Agent may or may not write tests

✅ "Implement feature X with comprehensive tests"
   - Agent uses test-driven approach

✅ "Implement feature X with TDD approach"
   - Explicit test-first methodology
```

---

### Pattern 3: Provide Context

```
❌ "Add a chart"
   - Too vague

✅ "Add box plot chart showing vertical jump distribution
    by team in client/src/components/charts/"
   - Clear location, chart type, data source
```

---

### Pattern 4: Break Down Ambiguity

```
If agent escalates with "Ambiguous requirements":

You: "For the dashboard layout, use 2-column grid on desktop,
     1-column on mobile. Show metric cards at top, charts below."
```

---

### Pattern 5: Trust the Process

```
When agent reports:
"Iteration 3/5: Fixing type errors in form validation"

✅ Let it continue
❌ Don't interrupt unless truly stuck
```

---

## Troubleshooting Examples

### Issue: Tests Keep Failing

**Agent Output:**
```
Iteration 4/5: Still failing on import resolution
Error: Cannot find module '@/components/StatCard'
```

**You:**
```
"The StatCard component doesn't exist yet.
Create it first using ui-component-library-agent,
then continue with the test."
```

---

### Issue: Wrong Approach

**Agent Output:**
```
Implementing custom authentication system...
```

**You:**
```
"Stop - we use session-based auth with Passport.js.
Don't implement custom auth. Instead, add the new
feature to existing auth system in server/auth/"
```

---

### Issue: Performance Regression

**Agent Output:**
```
✅ All tests passing
⚠️  Analytics query now takes 3.2s (was 0.8s)
```

**You:**
```
"Performance regression detected. Invoke
performance-optimization-agent and database-schema-agent
to optimize the new query."
```

---

## Quick Command Reference

```bash
# Common commands agents will run:

# Run specific test
npm run test:run -- path/to/test.test.ts

# Run all tests
npm run test:run

# Type checking
npm run check

# Build verification
npm run build

# Database migration
npm run db:push

# Dev server (if needed)
npm run dev
```

---

## Getting Help

**See Agent Status:**
```
"Show me current TodoWrite tasks and progress"
```

**Request Detailed Logs:**
```
"Provide detailed log of what you did in the last iteration"
```

**Check Test Coverage:**
```
"Run test coverage report for the new feature"
```

**Verify Changes:**
```
"List all files modified during this implementation"
```

---

For more detailed documentation, see:
- `AUTONOMOUS_DEVELOPMENT.md` - Full guide to autonomous agents
- `.claude/agents/` - Individual agent specifications
- `CLAUDE.md` - Agent integration rules and triggers
