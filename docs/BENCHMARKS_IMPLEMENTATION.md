# Benchmarks Feature Implementation - TDD Tracker

## Overview
Implementation of benchmarks feature following Test-Driven Development (TDD) methodology.
Each item follows: Write failing test → Write minimal code → Refactor → Commit

**Architecture:** Two-tier system with separate tables (Option B)
- Site benchmarks (`site_benchmarks`) - managed by site admins
- Custom benchmarks (`custom_benchmarks`) - created by org admins
- Organization enablement (`organization_benchmarks`) - links benchmarks to orgs

---

## Phase 1: Database Foundation ✅ COMPLETE

### Migration
- [x] Create `migrations/0024_add_benchmarks_system.sql`
  - [x] `site_benchmarks` table with all columns
  - [x] `custom_benchmarks` table with all columns
  - [x] `organization_benchmarks` table
  - [x] Add `benchmarks_enabled` to organizations table
  - [x] Add `allow_custom_benchmarks` to organizations table
  - [x] Create indexes for performance
  - [x] Seed example site benchmarks (6 benchmarks)
  - [x] Update audit_logs action constraint

### Integration Test
- [x] Migration applied successfully to testing database
- [x] Tables verified: site_benchmarks, custom_benchmarks, organization_benchmarks
- [x] Constraints verified: comparison_operator, age_range, gender checks
- [x] Indexes verified: metric, active, composite indexes
- [x] Seed data verified: 6 benchmarks for FLY10_TIME, VERTICAL_JUMP, DASH_40YD

---

## Phase 2: Shared Schema & Types (5 TDD Cycles) ✅ COMPLETE

**File:** `packages/shared/__tests__/benchmark-schema.test.ts`

- [x] **Cycle 1:** Schema validation accepts valid site benchmark
  - [x] ❌ Write failing test
  - [x] ✅ Define `siteBenchmarksTable` in `schema.ts`
  - [x] 🔄 Refactor (not needed - code already clean)

- [x] **Cycle 2:** Schema validation rejects invalid comparison_operator
  - [x] ❌ Write failing test
  - [x] ✅ Add enum validation for comparison_operator
  - [x] 🔄 Refactor (not needed)

- [x] **Cycle 3:** Schema validation accepts valid custom benchmark
  - [x] ❌ Write failing test
  - [x] ✅ Define `customBenchmarksTable` in `schema.ts`
  - [x] 🔄 Refactor (not needed)

- [x] **Cycle 4:** Zod insert schema requires organization_id for custom benchmarks
  - [x] ❌ Write failing test
  - [x] ✅ Add Zod schemas with proper validation
  - [x] 🔄 Refactor (not needed)

- [x] **Cycle 5:** Age validation rejects age_min > age_max
  - [x] ❌ Write failing test
  - [x] ✅ Add Zod refinement for age range validation
  - [x] 🔄 Refactor (not needed)

**Result:** 9 tests passing covering all benchmark schema validation

---

## Phase 3: Storage Layer (19 TDD Cycles)

**File:** `packages/api/__tests__/benchmark-storage.test.ts`

### Site Benchmarks CRUD (6 cycles) ✅ COMPLETE

- [x] **Cycle 1:** `createSiteBenchmark()` inserts and returns benchmark
  - [x] ❌ Write failing test
  - [x] ✅ Implement `createSiteBenchmark()` in `storage.ts`
  - [x] 🔄 Refactor (not needed - code clean)

- [x] **Cycle 2:** `getSiteBenchmark(id)` returns benchmark or null
  - [x] ❌ Write failing test
  - [x] ✅ Implement `getSiteBenchmark()`
  - [x] 🔄 Refactor (not needed)

- [x] **Cycle 3:** `getSiteBenchmarks()` returns all active benchmarks
  - [x] ❌ Write failing test
  - [x] ✅ Implement with `WHERE is_active = true`
  - [x] 🔄 Refactor (not needed)

- [x] **Cycle 4:** `updateSiteBenchmark()` updates fields
  - [x] ❌ Write failing test
  - [x] ✅ Implement update method
  - [x] 🔄 Refactor (not needed)

- [x] **Cycle 5:** `deleteSiteBenchmark()` deletes benchmark
  - [x] ❌ Write failing test
  - [x] ✅ Implement delete method with system default check
  - [x] 🔄 Refactor (not needed)

- [x] **Cycle 6:** `toggleSiteBenchmarkStatus()` flips is_active
  - [x] ❌ Write failing test
  - [x] ✅ Implement toggle method
  - [x] 🔄 Refactor (not needed)

**Result:** 9/9 tests passing for site benchmarks CRUD

### Custom Benchmarks CRUD (5 cycles)

- [ ] **Cycle 7:** `createCustomBenchmark()` inserts with organization_id
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement `createCustomBenchmark()`
  - [ ] 🔄 Refactor

- [ ] **Cycle 8:** `getCustomBenchmarksForOrg(orgId)` returns only that org's benchmarks
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement with `WHERE organization_id = ?`
  - [ ] 🔄 Refactor

- [ ] **Cycle 9:** `getCustomBenchmarksForOrg()` does NOT return other org's benchmarks
  - [ ] ❌ Write failing test
  - [ ] ✅ Verify query filter works correctly
  - [ ] 🔄 Refactor

- [ ] **Cycle 10:** `updateCustomBenchmark()` only updates if org_id matches
  - [ ] ❌ Write failing test
  - [ ] ✅ Add org_id to WHERE clause
  - [ ] 🔄 Refactor

- [ ] **Cycle 11:** `deleteCustomBenchmark()` only deletes if org_id matches
  - [ ] ❌ Write failing test
  - [ ] ✅ Add org_id to WHERE clause
  - [ ] 🔄 Refactor

### Organization Benchmarks - Enablement (4 cycles)

- [ ] **Cycle 12:** `enableBenchmarkForOrg()` creates organization_benchmarks entry for site benchmarks
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement enablement for site benchmarks
  - [ ] 🔄 Refactor

- [ ] **Cycle 13:** `enableBenchmarkForOrg()` works for custom benchmarks too
  - [ ] ❌ Write failing test
  - [ ] ✅ Support both benchmark_type values
  - [ ] 🔄 Refactor

- [ ] **Cycle 14:** `disableBenchmarkForOrg()` sets is_enabled = false
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement soft disable
  - [ ] 🔄 Refactor

- [ ] **Cycle 15:** `getEnabledBenchmarksForOrg()` returns UNION of site + custom
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement UNION query
  - [ ] 🔄 Refactor

### Evaluation Queries (4 cycles)

- [ ] **Cycle 16:** `getApplicableBenchmarks()` filters by athlete gender
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement with `WHERE gender IS NULL OR gender = ?`
  - [ ] 🔄 Refactor

- [ ] **Cycle 17:** `getApplicableBenchmarks()` filters by athlete age
  - [ ] ❌ Write failing test
  - [ ] ✅ Add age range filtering
  - [ ] 🔄 Refactor

- [ ] **Cycle 18:** `getApplicableBenchmarks()` filters by athlete position
  - [ ] ❌ Write failing test
  - [ ] ✅ Add position filtering
  - [ ] 🔄 Refactor

- [ ] **Cycle 19:** `getApplicableBenchmarks()` returns site + custom benchmarks
  - [ ] ❌ Write failing test
  - [ ] ✅ Ensure UNION query includes both
  - [ ] 🔄 Refactor

---

## Phase 4: Service Layer (19 TDD Cycles)

**File:** `packages/api/services/__tests__/benchmark-service.test.ts`

### Site Admin Operations (6 cycles)

- [ ] **Cycle 1:** `createSiteBenchmark()` requires site admin permission
  - [ ] ❌ Write failing test
  - [ ] ✅ Add permission check, throw error if not site admin
  - [ ] 🔄 Refactor

- [ ] **Cycle 2:** `createSiteBenchmark()` validates metric exists
  - [ ] ❌ Write failing test
  - [ ] ✅ Add metric validation
  - [ ] 🔄 Refactor

- [ ] **Cycle 3:** `createSiteBenchmark()` creates audit log
  - [ ] ❌ Write failing test
  - [ ] ✅ Add audit log creation
  - [ ] 🔄 Refactor

- [ ] **Cycle 4:** `updateSiteBenchmark()` requires site admin permission
  - [ ] ❌ Write failing test
  - [ ] ✅ Add permission check
  - [ ] 🔄 Refactor

- [ ] **Cycle 5:** `deleteSiteBenchmark()` prevents deleting system defaults
  - [ ] ❌ Write failing test
  - [ ] ✅ Add is_system_default check
  - [ ] 🔄 Refactor

- [ ] **Cycle 6:** `toggleSiteBenchmarkStatus()` requires site admin
  - [ ] ❌ Write failing test
  - [ ] ✅ Add permission check
  - [ ] 🔄 Refactor

### Org Admin Operations (5 cycles)

- [ ] **Cycle 7:** `createCustomBenchmark()` requires org admin OR site admin
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement permission check with `validateOrganizationAccess()`
  - [ ] 🔄 Refactor

- [ ] **Cycle 8:** `createCustomBenchmark()` fails if allow_custom_benchmarks = false
  - [ ] ❌ Write failing test
  - [ ] ✅ Add feature flag check
  - [ ] 🔄 Refactor

- [ ] **Cycle 9:** `createCustomBenchmark()` creates audit log
  - [ ] ❌ Write failing test
  - [ ] ✅ Add audit log
  - [ ] 🔄 Refactor

- [ ] **Cycle 10:** `updateCustomBenchmark()` only allows owner org or site admin
  - [ ] ❌ Write failing test
  - [ ] ✅ Add ownership validation
  - [ ] 🔄 Refactor

- [ ] **Cycle 11:** `deleteCustomBenchmark()` only allows owner org or site admin
  - [ ] ❌ Write failing test
  - [ ] ✅ Add ownership validation
  - [ ] 🔄 Refactor

### Enablement Operations (3 cycles)

- [ ] **Cycle 12:** `enableBenchmarkForOrg()` requires org admin OR site admin
  - [ ] ❌ Write failing test
  - [ ] ✅ Add permission check
  - [ ] 🔄 Refactor

- [ ] **Cycle 13:** `enableBenchmarkForOrg()` fails if benchmarks_enabled = false
  - [ ] ❌ Write failing test
  - [ ] ✅ Add feature flag check
  - [ ] 🔄 Refactor

- [ ] **Cycle 14:** `disableBenchmarkForOrg()` requires org admin OR site admin
  - [ ] ❌ Write failing test
  - [ ] ✅ Add permission check
  - [ ] 🔄 Refactor

### Evaluation Logic (5 cycles)

- [ ] **Cycle 15:** `evaluateBenchmark()` returns true for met 'lte' benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement comparison logic for 'lte'
  - [ ] 🔄 Refactor

- [ ] **Cycle 16:** `evaluateBenchmark()` returns true for met 'gte' benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Add 'gte' logic
  - [ ] 🔄 Refactor

- [ ] **Cycle 17:** `evaluateBenchmark()` handles 'eq' operator
  - [ ] ❌ Write failing test
  - [ ] ✅ Add 'eq' logic
  - [ ] 🔄 Refactor

- [ ] **Cycle 18:** `getBenchmarkProgress()` calculates percentage correctly
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement progress calculation
  - [ ] 🔄 Refactor

- [ ] **Cycle 19:** `getAthleteBenchmarkStatus()` returns met/unmet for all applicable
  - [ ] ❌ Write failing test
  - [ ] ✅ Combine applicable benchmarks query with evaluation
  - [ ] 🔄 Refactor

---

## Phase 5: API Routes (16 TDD Cycles)

**File:** `packages/api/routes/__tests__/benchmark-routes.test.ts`

### Site Benchmarks Endpoints (6 cycles)

- [ ] **Cycle 1:** `GET /api/benchmarks` returns 401 for non-site-admin
  - [ ] ❌ Write failing test
  - [ ] ✅ Add authentication middleware
  - [ ] 🔄 Refactor

- [ ] **Cycle 2:** `GET /api/benchmarks` returns all site benchmarks for site admin
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement GET handler
  - [ ] 🔄 Refactor

- [ ] **Cycle 3:** `POST /api/benchmarks` creates benchmark and returns 201
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement POST handler
  - [ ] 🔄 Refactor

- [ ] **Cycle 4:** `POST /api/benchmarks` validates required fields
  - [ ] ❌ Write failing test
  - [ ] ✅ Add validation middleware
  - [ ] 🔄 Refactor

- [ ] **Cycle 5:** `PATCH /api/benchmarks/:id` updates benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement PATCH handler
  - [ ] 🔄 Refactor

- [ ] **Cycle 6:** `DELETE /api/benchmarks/:id` deletes benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement DELETE handler
  - [ ] 🔄 Refactor

### Custom Benchmarks Endpoints (4 cycles)

- [ ] **Cycle 7:** `GET /api/organizations/:id/custom-benchmarks` requires org access
  - [ ] ❌ Write failing test
  - [ ] ✅ Add permission check
  - [ ] 🔄 Refactor

- [ ] **Cycle 8:** `POST /api/organizations/:id/custom-benchmarks` checks allow_custom_benchmarks
  - [ ] ❌ Write failing test
  - [ ] ✅ Add feature flag check
  - [ ] 🔄 Refactor

- [ ] **Cycle 9:** `PATCH /api/organizations/:id/custom-benchmarks/:benchmarkId` validates ownership
  - [ ] ❌ Write failing test
  - [ ] ✅ Add ownership check
  - [ ] 🔄 Refactor

- [ ] **Cycle 10:** `DELETE /api/organizations/:id/custom-benchmarks/:benchmarkId` validates ownership
  - [ ] ❌ Write failing test
  - [ ] ✅ Add ownership check
  - [ ] 🔄 Refactor

### Enablement Endpoints (4 cycles)

- [ ] **Cycle 11:** `GET /api/organizations/:id/benchmarks` returns site + custom
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement GET with UNION query
  - [ ] 🔄 Refactor

- [ ] **Cycle 12:** `POST /api/organizations/:id/benchmarks/:benchmarkId/enable` enables benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement enable endpoint
  - [ ] 🔄 Refactor

- [ ] **Cycle 13:** `POST /api/organizations/:id/benchmarks/:benchmarkId/disable` disables benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement disable endpoint
  - [ ] 🔄 Refactor

- [ ] **Cycle 14:** `PATCH /api/organizations/:id/benchmarks/:benchmarkId` updates custom name
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement settings update
  - [ ] 🔄 Refactor

### Evaluation Endpoints (2 cycles)

- [ ] **Cycle 15:** `GET /api/athletes/:id/benchmarks/:metricCode` returns applicable benchmarks
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement evaluation endpoint
  - [ ] 🔄 Refactor

- [ ] **Cycle 16:** Endpoint includes met/unmet status for each benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Add evaluation logic to response
  - [ ] 🔄 Refactor

---

## Phase 6: Frontend API Hooks (5 TDD Cycles)

**File:** `packages/web/src/lib/__tests__/benchmarks-api.test.ts`

- [ ] **Cycle 1:** `useSiteBenchmarks()` fetches from correct endpoint
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement React Query hook
  - [ ] 🔄 Refactor

- [ ] **Cycle 2:** `useCreateSiteBenchmark()` posts data and invalidates cache
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement mutation hook
  - [ ] 🔄 Refactor

- [ ] **Cycle 3:** `useCustomBenchmarks(orgId)` fetches org-specific benchmarks
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement with orgId parameter
  - [ ] 🔄 Refactor

- [ ] **Cycle 4:** `useEnableBenchmark()` posts to enable endpoint
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement mutation
  - [ ] 🔄 Refactor

- [ ] **Cycle 5:** `useAthleteBenchmarks()` fetches and caches per athlete/metric
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement with composite query key
  - [ ] 🔄 Refactor

---

## Phase 7: Frontend Components (17 TDD Cycles)

### BenchmarkFormDialog Component (6 cycles)

**File:** `packages/web/src/components/__tests__/benchmark-form-dialog.test.tsx`

- [ ] **Cycle 1:** Renders form fields (name, value, metric, operator)
  - [ ] ❌ Write failing test
  - [ ] ✅ Create component with basic fields
  - [ ] 🔄 Refactor

- [ ] **Cycle 2:** Shows filtering fields (age, gender, position, level)
  - [ ] ❌ Write failing test
  - [ ] ✅ Add filter fields
  - [ ] 🔄 Refactor

- [ ] **Cycle 3:** Validates required fields on submit
  - [ ] ❌ Write failing test
  - [ ] ✅ Add Zod validation with react-hook-form
  - [ ] 🔄 Refactor

- [ ] **Cycle 4:** Calls onSubmit with form data
  - [ ] ❌ Write failing test
  - [ ] ✅ Wire up form submission
  - [ ] 🔄 Refactor

- [ ] **Cycle 5:** Shows different title for edit vs create
  - [ ] ❌ Write failing test
  - [ ] ✅ Add conditional title based on props
  - [ ] 🔄 Refactor

- [ ] **Cycle 6:** Pre-fills form when editing existing benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Add defaultValues from props
  - [ ] 🔄 Refactor

### OrganizationBenchmarksCard Component (6 cycles)

**File:** `packages/web/src/components/__tests__/organization-benchmarks-card.test.tsx`

- [ ] **Cycle 7:** Renders "Site Benchmarks" and "Custom Benchmarks" sections
  - [ ] ❌ Write failing test
  - [ ] ✅ Create component structure
  - [ ] 🔄 Refactor

- [ ] **Cycle 8:** Shows enable/disable switches for site benchmarks
  - [ ] ❌ Write failing test
  - [ ] ✅ Add Switch components with handlers
  - [ ] 🔄 Refactor

- [ ] **Cycle 9:** Hides custom section if allow_custom_benchmarks = false
  - [ ] ❌ Write failing test
  - [ ] ✅ Add conditional rendering
  - [ ] 🔄 Refactor

- [ ] **Cycle 10:** Shows "Create Custom" button when allowed
  - [ ] ❌ Write failing test
  - [ ] ✅ Add button with permission check
  - [ ] 🔄 Refactor

- [ ] **Cycle 11:** Calls enable mutation when switch toggled
  - [ ] ❌ Write failing test
  - [ ] ✅ Wire up mutation hooks
  - [ ] 🔄 Refactor

- [ ] **Cycle 12:** Opens form dialog when "Create Custom" clicked
  - [ ] ❌ Write failing test
  - [ ] ✅ Add dialog state management
  - [ ] 🔄 Refactor

### Display Components (5 cycles)

**BenchmarkBadge:** `packages/web/src/components/__tests__/benchmark-badge.test.tsx`

- [ ] **Cycle 13:** Renders benchmark name, icon, and "Achieved" indicator
  - [ ] ❌ Write failing test
  - [ ] ✅ Create badge component with styling
  - [ ] 🔄 Refactor

**BenchmarkProgress:** `packages/web/src/components/__tests__/benchmark-progress.test.tsx`

- [ ] **Cycle 14:** Shows progress bar with correct percentage
  - [ ] ❌ Write failing test
  - [ ] ✅ Calculate and display percentage
  - [ ] 🔄 Refactor

- [ ] **Cycle 15:** Handles 'lte' vs 'gte' correctly for progress direction
  - [ ] ❌ Write failing test
  - [ ] ✅ Invert calculation for 'lte' operators
  - [ ] 🔄 Refactor

**BenchmarkComparisonChart:** `packages/web/src/components/__tests__/benchmark-comparison-chart.test.tsx`

- [ ] **Cycle 16:** Renders Recharts chart with athlete and benchmark values
  - [ ] ❌ Write failing test
  - [ ] ✅ Set up Recharts integration
  - [ ] 🔄 Refactor

- [ ] **Cycle 17:** Uses color coding for performance zones
  - [ ] ❌ Write failing test
  - [ ] ✅ Add conditional colors
  - [ ] 🔄 Refactor

---

## Phase 8: E2E Tests (18 Tests)

**File:** `tests/e2e/benchmark-management.spec.ts`

### Site Admin Workflow (5 tests)

- [ ] **Test 1:** Site admin can navigate to benchmarks page
  - [ ] ❌ Write failing test
  - [ ] ✅ Add route and navigation menu item
  - [ ] 🔄 Refactor

- [ ] **Test 2:** Site admin can create new site benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement full create flow
  - [ ] 🔄 Refactor

- [ ] **Test 3:** Site admin can edit existing benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement edit flow
  - [ ] 🔄 Refactor

- [ ] **Test 4:** Site admin can toggle benchmark active status
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement toggle
  - [ ] 🔄 Refactor

- [ ] **Test 5:** Site admin can delete non-system benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement delete with confirmation
  - [ ] 🔄 Refactor

### Org Admin Workflow (6 tests)

- [ ] **Test 6:** Org admin can view organization benchmarks tab
  - [ ] ❌ Write failing test
  - [ ] ✅ Add tab to org profile page
  - [ ] 🔄 Refactor

- [ ] **Test 7:** Org admin can enable site benchmark for org
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement enable flow
  - [ ] 🔄 Refactor

- [ ] **Test 8:** Org admin can disable benchmark for org
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement disable flow
  - [ ] 🔄 Refactor

- [ ] **Test 9:** Org admin can set custom name for benchmark
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement custom name editing
  - [ ] 🔄 Refactor

- [ ] **Test 10:** Org admin can create custom benchmark when allowed
  - [ ] ❌ Write failing test
  - [ ] ✅ Implement custom create flow
  - [ ] 🔄 Refactor

- [ ] **Test 11:** Org admin cannot create custom benchmark when not allowed
  - [ ] ❌ Write failing test
  - [ ] ✅ Verify button hidden/disabled
  - [ ] 🔄 Refactor

### Athlete View (5 tests)

- [ ] **Test 12:** Athlete profile shows benchmarks section when enabled
  - [ ] ❌ Write failing test
  - [ ] ✅ Add benchmarks section to profile
  - [ ] 🔄 Refactor

- [ ] **Test 13:** Benchmarks section shows badges for met benchmarks
  - [ ] ❌ Write failing test
  - [ ] ✅ Integrate badge component
  - [ ] 🔄 Refactor

- [ ] **Test 14:** Benchmarks section shows progress bars
  - [ ] ❌ Write failing test
  - [ ] ✅ Integrate progress component
  - [ ] 🔄 Refactor

- [ ] **Test 15:** Benchmarks section shows comparison chart
  - [ ] ❌ Write failing test
  - [ ] ✅ Integrate chart component
  - [ ] 🔄 Refactor

- [ ] **Test 16:** Benchmarks section hidden when benchmarks_enabled = false
  - [ ] ❌ Write failing test
  - [ ] ✅ Add feature flag check
  - [ ] 🔄 Refactor

### Feature Flags (2 tests)

- [ ] **Test 17:** Site admin can toggle benchmarks_enabled for org
  - [ ] ❌ Write failing test
  - [ ] ✅ Add toggle to org settings
  - [ ] 🔄 Refactor

- [ ] **Test 18:** Site admin can toggle allow_custom_benchmarks for org
  - [ ] ❌ Write failing test
  - [ ] ✅ Add toggle to org settings
  - [ ] 🔄 Refactor

---

## Progress Summary

- **Phase 1:** 10/10 complete (100%) ✅
- **Phase 2:** 5/5 cycles complete (100%) ✅
- **Phase 3:** 6/19 cycles complete (32%) - Site Benchmarks CRUD ✅
- **Phase 4:** 0/19 cycles complete (0%)
- **Phase 5:** 0/16 cycles complete (0%)
- **Phase 6:** 0/5 cycles complete (0%)
- **Phase 7:** 0/17 cycles complete (0%)
- **Phase 8:** 0/18 tests complete (0%)

**Total Progress:** 21/109 items complete (19.3%)

---

## Notes

- Each TDD cycle must follow strict Red → Green → Refactor
- Commit after each green test
- Run full test suite before moving to next phase
- Update this file as you complete each item
