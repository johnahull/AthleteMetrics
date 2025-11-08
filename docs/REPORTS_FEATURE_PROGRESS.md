# Coach & Individual Reports Feature - Implementation Progress

**Branch:** `feat/coach-individual-reports`
**Started:** 2025-11-08
**Approach:** Test-Driven Development (TDD)

## Feature Overview

Two report types for athletic performance analysis:
1. **Coach Reports**: Team-level analysis with composite index scoring
2. **Individual Reports**: Athlete-level performance with team percentile rankings

**Key Features:**
- Flexible timeframes (preset + custom date ranges)
- Benchmark comparisons (site + custom + user-defined)
- Public sharing with expiring URLs
- PDF export
- Weighted composite index for team rankings

---

## Implementation Phases

### Phase 1: Setup & Dependencies ✅

- [x] Install required npm packages
  - [x] `jspdf-autotable` - PDF table formatting
  - [x] `simple-statistics` - Percentile calculations
  - [x] `nanoid` - Short public tokens
  - [x] `@react-pdf/renderer` - Modern PDF generation
  - [x] `chartjs-node-canvas` - Server-side chart rendering
- [x] Create database migration
  - [x] `reports` table (10 columns, 4 indexes)
  - [x] `report_snapshots` table (12 columns, 5 indexes)
  - [x] `report_benchmarks` table (11 columns, 2 indexes)
  - [x] Add Zod schemas to `packages/shared/schema.ts`
  - [x] Add relations and TypeScript types
- [x] Generated migration: `drizzle/migrations/0001_messy_human_cannonball.sql`

### Phase 2: E2E Tests First (TDD - RED 🔴) ✅

- [x] **Test Suite 1:** Coach Report Creation (`tests/e2e/coach-report-creation.spec.ts`)
  - [x] Navigate to reports page (9 tests)
  - [x] Create coach report wizard flow
  - [x] Select team, timeframe, metrics
  - [x] Configure benchmarks (site + custom + user-defined)
  - [x] Set composite index weights
  - [x] Verify performance snapshot table
  - [x] Verify metric rankings (1-to-n)
  - [x] Verify composite index rankings

- [x] **Test Suite 2:** Individual Report Creation (`tests/e2e/individual-report-creation.spec.ts`)
  - [x] Create individual report (7 tests)
  - [x] Select athletes/teams
  - [x] Choose metrics and benchmarks
  - [x] Verify athlete details display
  - [x] Verify performance table with percentiles

- [x] **Test Suite 3:** PDF Export (`tests/e2e/report-pdf-export.spec.ts`)
  - [x] Generate report (7 tests)
  - [x] Export as PDF
  - [x] Verify PDF download
  - [x] Verify PDF content quality

- [x] **Test Suite 4:** Public URL Sharing (`tests/e2e/report-public-sharing.spec.ts`)
  - [x] Create public link with expiration (11 tests)
  - [x] Access link without authentication
  - [x] Verify report displays correctly
  - [x] Revoke link
  - [x] Verify revoked link returns 404

**Total Tests Written:** 34 E2E tests
**Expected Result:** ✅ All tests FAIL (features don't exist yet - this is expected in TDD RED phase)

### Phase 3: Backend Implementation (TDD - GREEN 🟢)

- [ ] **Database Schema**
  - [ ] Define Drizzle schemas
  - [ ] Add validation with Zod
  - [ ] Test schema constraints

- [ ] **Report Service** (`packages/api/services/report-service.ts`)
  - [ ] `generateCoachReport()` - Team aggregations
  - [ ] `generateIndividualReport()` - Athlete analysis
  - [ ] `calculateCompositeIndex()` - Weighted scoring
  - [ ] `calculatePercentiles()` - Team rankings
  - [ ] `getBenchmarkComparisons()` - Benchmark matching

- [ ] **API Routes** (`packages/api/routes/report-routes.ts`)
  - [ ] POST `/api/reports` - Create config
  - [ ] GET `/api/reports` - List reports
  - [ ] GET `/api/reports/:id` - Get config
  - [ ] POST `/api/reports/:id/generate` - Execute report
  - [ ] POST `/api/reports/:id/snapshots` - Create public snapshot
  - [ ] GET `/api/public/reports/:token` - Public access
  - [ ] GET `/api/reports/:id/pdf` - PDF export
  - [ ] DELETE `/api/reports/:id/snapshots/:snapshotId` - Revoke

- [ ] **PDF Generation**
  - [ ] jsPDF + autotable implementation
  - [ ] @react-pdf/renderer implementation
  - [ ] Server-side charts (chartjs-node-canvas)
  - [ ] Layout and styling

**Expected Result:** Backend E2E tests START PASSING

### Phase 4: Frontend Implementation (TDD - GREEN 🟢)

- [ ] **Wizard Components**
  - [ ] `ReportWizard.tsx` - Multi-step form
  - [ ] `TimeframeSelector.tsx` - Preset + custom dates
  - [ ] `MetricsSelector.tsx` - Multi-select metrics
  - [ ] `BenchmarkConfigurator.tsx` - Benchmark selection
  - [ ] `CompositeIndexBuilder.tsx` - Weight assignment

- [ ] **Display Components**
  - [ ] `CoachReportView.tsx` - Team analysis
  - [ ] `IndividualReportView.tsx` - Athlete analysis
  - [ ] `PerformanceSnapshotTable.tsx` - Team stats
  - [ ] `MetricRankingsTable.tsx` - Rankings per metric
  - [ ] `CompositeIndexTable.tsx` - Composite rankings
  - [ ] `ShareReportDialog.tsx` - Public link UI

- [ ] **Routing**
  - [ ] `/reports` - List and creation
  - [ ] `/reports/:id` - Report viewer
  - [ ] `/public/reports/:token` - Public viewer

**Expected Result:** ALL E2E tests PASS ✅

### Phase 5: Refactor & Polish (TDD - REFACTOR ♻️)

- [ ] Extract reusable components
- [ ] Optimize database queries
- [ ] Add loading states
- [ ] Error boundaries
- [ ] Accessibility improvements
- [ ] Mobile responsive design
- [ ] Performance optimization

**Expected Result:** Tests remain GREEN while improving code quality

### Phase 6: Additional Test Coverage

- [ ] Edge cases (empty data, invalid inputs)
- [ ] Permission tests
- [ ] Error handling
- [ ] Concurrent operations
- [ ] Security tests

---

## Progress Notes

### 2025-11-08
- Created feature branch: `feat/coach-individual-reports`
- Created progress tracking document
- Beginning TDD implementation with Phase 1

---

## Testing Commands

```bash
# Run all E2E tests
npm run test:staging

# Run specific test suite
npx playwright test tests/e2e/coach-report-creation.spec.ts --config=playwright.staging.config.ts

# Run with UI (debugging)
npx playwright test --ui --config=playwright.staging.config.ts

# Type checking
npm run check

# Database operations
npm run db:push
npm run db:migrate:all
```

---

## Dependencies Added

- [ ] `jspdf-autotable` - Professional PDF table formatting
- [ ] `simple-statistics` - Statistical calculations (percentiles, quartiles)
- [ ] `nanoid` - URL-safe token generation (21 chars)
- [ ] `@react-pdf/renderer` - React-based PDF generation
- [ ] `chartjs-node-canvas` - Server-side chart rendering

---

## Key Technical Decisions

✅ Leverage existing `siteBenchmarks` and `customBenchmarks` tables
✅ JSONB for flexible report configurations
✅ Immutable snapshots for public sharing
✅ nanoid for shorter, shareable URLs (21 chars vs 64)
✅ Dual PDF approach (jsPDF + @react-pdf/renderer)
✅ Server-side chart rendering for quality
✅ Test-Driven Development approach

---

## Blockers / Issues

*None currently*

---

## Estimated Timeline

**Total Effort:** 2.5-3 weeks full-time
**Completion Target:** TBD
