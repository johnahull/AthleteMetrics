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
