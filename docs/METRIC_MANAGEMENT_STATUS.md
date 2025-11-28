# Metric Management System - Implementation Status

**Feature:** Site-level metric management with organization-level opt-in
**Branch:** `feature/metric-management` (or current branch)
**Started:** 2025-11-01
**Approach:** Test-Driven Development (TDD)

---

## 📊 Overall Progress: 93% Complete

- ✅ Backend Foundation: **100%** (7/7 tasks)
- ✅ Frontend Implementation: **100%** (11/11 tasks)
- ⏳ Testing & Deployment: **0%** (0/2 tasks)

---

## ✅ Phase 1: Backend Foundation (COMPLETE)

### Database Layer
- ✅ **Database Schema** (`packages/shared/schema.ts`)
  - Added `siteMetrics` table (master metric catalog)
  - Added `organizationMetrics` table (org opt-in mechanism)
  - Added relations, insert schemas, update schemas
  - Added TypeScript types exports
  - Lines added: ~200

- ✅ **Migration** (`migrations/0022_add_metric_management_system.sql`)
  - Creates both tables with indexes and constraints
  - Seeds 8 default metrics as system defaults with full metadata:
    - FLY10_TIME, VERTICAL_JUMP, AGILITY_505, AGILITY_5105
    - T_TEST, DASH_40YD, RSI, TOP_SPEED
  - Backfills `organization_metrics` for all existing organizations
  - Includes comprehensive documentation and safety checks
  - Status: **Not yet applied to database** ⚠️

### Service Layer
- ✅ **Storage Methods** (`packages/api/storage.ts`)
  - Added 11 new methods to IStorage interface
  - Implemented in DatabaseStorage class:
    - Site metrics: getSiteMetrics, getSiteMetric, createSiteMetric, updateSiteMetric, toggleSiteMetricStatus, deleteSiteMetric
    - Org metrics: getOrganizationMetrics, getOrganizationMetric, enableMetricForOrganization, disableMetricForOrganization, updateOrganizationMetric, bulkEnableMetricsForOrganization
  - Lines added: ~235

- ✅ **Metric Service** (`packages/api/services/metric-service.ts`)
  - Full CRUD operations for site metrics (site admin only)
  - Organization metric enablement (org admin + site admin)
  - Permission checks and validation
  - Audit logging for all operations
  - Lines: 444

### API Layer
- ✅ **API Routes** (`packages/api/routes/metric-routes.ts`)
  - 11 RESTful endpoints:
    - Site metrics: GET /api/metrics, GET /api/metrics/:code, POST /api/metrics, PATCH /api/metrics/:code, PATCH /api/metrics/:code/status, DELETE /api/metrics/:code
    - Org metrics: GET /api/organizations/:id/metrics, POST /api/organizations/:id/metrics/:code/enable, POST /api/organizations/:id/metrics/:code/disable, PATCH /api/organizations/:id/metrics/:code, POST /api/organizations/:id/metrics/bulk-enable
  - Rate limiting configured
  - Error sanitization for production
  - Lines: 272
  - **Status:** Registered in routes/index.ts ✅

### Testing (TDD)
- ✅ **Unit Tests** (`packages/api/services/__tests__/metric-service.test.ts`)
  - 25+ test cases covering:
    - Site metric CRUD operations
    - Permission enforcement (site admin only)
    - Organization metric enablement/disablement
    - Validation (duplicate codes, invalid formats)
    - System default protection
    - Bulk operations
    - Error handling
  - Lines: 758
  - **Status:** 🔴 RED (not yet run - requires database)

- ✅ **E2E Tests** (`tests/e2e/metric-management.spec.ts`)
  - 15+ test scenarios:
    - Site admin workflows (create, edit, delete, toggle)
    - Organization-level metric configuration
    - Metric visibility in measurement forms
    - Metric filtering in analytics
    - Permission enforcement
    - Custom label overrides
  - Lines: 374
  - **Status:** 🔴 RED (not yet run - requires UI + migration)

---

## ✅ Phase 2: Frontend Implementation (COMPLETE - 100%)

### Shared Updates
- ✅ **Update METRIC_CONFIG** (`packages/shared/analytics-types.ts`)
  - [x] Create dynamic MetricConfig interface
  - [x] Update all references to use API-fetched data
  - Note: Kept METRIC_CONFIG for backward compatibility

- ✅ **Update Metric Utilities** - Created `use-metric-config.ts` hook
  - [x] Add React Query hooks for metric fetching
  - [x] Cache metric data for performance

### Site Admin UI
- ✅ **Metrics Management Page** (`packages/web/src/pages/metrics-management.tsx`) - 306 lines
  - [x] Create main metrics page with table view
  - [x] Display all metrics with status badges (Active/Inactive/System Default)
  - [x] Add/Edit/Delete/Toggle buttons with permission checks
  - [x] Filter controls implemented

- ✅ **Metric Form Dialog** (`packages/web/src/components/metric-form-dialog.tsx`) - 356 lines
  - [x] Create/edit form with React Hook Form + Zod validation
  - [x] Fields: code, label, category, unit, description
  - [x] Advanced fields: sport associations, validation rules, display settings
  - [x] Real-time validation feedback

- ✅ **Navigation Update** (`packages/web/src/components/sidebar.tsx`)
  - [x] Add "Metrics" menu item in site admin dropdown
  - [x] Route: /metrics
  - [x] Icon: Settings icon from lucide-react
  - [x] Show only for isSiteAdmin users

### Organization Admin UI
- ✅ **Organization Profile Metrics Tab** (`packages/web/src/pages/organization-profile.tsx`) - 296 lines
  - [x] Add "Metrics" section to organization profile
  - [x] Display available metrics with enable/disable toggles
  - [x] Custom label override input with inline editing
  - [x] Integrated via OrganizationMetricsCard component

### Dynamic Metric Integration
- ✅ **Measurement Form Update** (`packages/web/src/components/measurement-form.tsx`)
  - [x] Replace hardcoded metric enum with API call
  - [x] Fetch organization-enabled metrics only
  - [x] Update dropdown to show custom labels if set
  - [x] Update validation to use dynamic metric list

- ✅ **Analytics MetricsSelector** (`packages/web/src/components/analytics/MetricsSelector.tsx`)
  - [x] Replace METRIC_CONFIG with API-fetched metrics
  - [x] Filter to organization-enabled metrics
  - [x] Use custom labels if set
  - [x] Maintain mutual exclusivity logic (FLY10_TIME vs TOP_SPEED)

- ✅ **Chart Components** (14 files in `packages/web/src/components/charts/`)
  - [x] Created use-metric-config.ts hook for charts
  - [x] Updated all 14 chart components to use dynamic metric configs
  - [x] Fetch metric metadata (unit, lowerIsBetter) from API
  - [x] Update axis labels and formatting dynamically
  - Files: BarChart, LineChart, MultiLineChart, BoxPlot, Violin, Swarm, Radar, ScatterPlot, Distribution, ConnectedScatter, TimeSeriesViolin, TimeSeriesBoxSwarm, ChartAnalytics, utilities

- ✅ **CSV Export** (`packages/web/src/lib/chartExport.ts`, `packages/web/src/lib/csv.ts`)
  - [x] Added MetricLabelMap type for custom labels
  - [x] Use custom metric labels in CSV headers
  - [x] Use custom labels in export filenames
  - [x] Update validation to accept dynamic valid metrics

---

## ⏳ Phase 3: Testing & Deployment (PENDING)

### Database Migration
- ⏳ **Run Migration 0022**
  - [ ] Backup current database (if production)
  - [ ] Run migration: `npm run db:migrate:manual` or direct psql
  - [ ] Verify tables created: `\d site_metrics`, `\d organization_metrics`
  - [ ] Verify 8 metrics seeded: `SELECT * FROM site_metrics;`
  - [ ] Verify org backfill: `SELECT COUNT(*) FROM organization_metrics;`
  - [ ] Expected count: (number of orgs × 8)

### Testing
- ⏳ **Run All Tests**
  - [ ] Type checking: `npm run check` ✅ (already passing)
  - [ ] Unit tests: `npm test metric-service` (requires DB migration first)
  - [ ] E2E tests: `npm run test:staging -- metric-management` (requires UI + migration)
  - [ ] Full test suite: `npm test`
  - [ ] Manual QA testing of complete workflow

---

## 📝 Implementation Notes

### Key Design Decisions

1. **Database-Driven Metrics**: Metrics stored in DB instead of hardcoded enums
   - Enables runtime flexibility without code deployments
   - Supports custom metrics created by site admins
   - Historical data preserved even when metrics disabled

2. **System Default Protection**: 8 original metrics marked as `is_system_default`
   - Cannot be deleted
   - Cannot be disabled
   - Ensures backward compatibility

3. **Org Opt-In Model**: Organizations choose which metrics to enable
   - Not forced to use all available metrics
   - Reduces clutter for specialized use cases
   - Custom labels allow org-specific terminology

4. **Soft Disable Pattern**: Disabling metrics hides them but preserves data
   - Measurements remain in database
   - Historical analytics still work
   - Can re-enable metrics without data loss

5. **TDD Approach**: Tests written before implementation
   - 25+ unit tests guide service implementation
   - 15+ E2E tests guide UI implementation
   - Currently in RED phase (tests exist but not passing)

### Security Considerations

- **Permission Enforcement**: Site admin only for metric CRUD, org admin for org-level config
- **Rate Limiting**: Prevents abuse of metric creation/modification endpoints
- **Audit Logging**: All metric changes logged with user, timestamp, details
- **Validation**: Metric codes must be uppercase alphanumeric + underscores
- **Data Protection**: Cannot delete metrics with measurement data

### Performance Considerations

- **Indexed Queries**: site_metrics.code, organizationMetrics.organizationId indexed
- **Cached Metric Data**: Frontend should cache metric configs (React Query)
- **Batch Operations**: Bulk enable endpoint reduces API round-trips
- **Joined Queries**: getOrganizationMetrics joins site_metrics data in single query

---

## 🚀 Next Steps (Priority Order)

1. **Run Migration** - Apply migration 0022 to create tables and seed data
2. **Test Backend** - Verify unit tests pass with real database
3. **Update Shared Types** - Remove METRIC_CONFIG, add dynamic interfaces
4. **Build Site Admin UI** - Metrics management page + form dialog
5. **Build Org Admin UI** - Metrics tab in org profile
6. **Update Forms** - Measurement form uses org-enabled metrics
7. **Update Analytics** - Dynamic metric selectors and charts
8. **Run E2E Tests** - Verify complete workflows
9. **QA Testing** - Manual testing of all functionality
10. **Deploy** - Merge to main and deploy to production

---

## 📊 Files Modified/Created

### Created (7 files)
- `packages/shared/schema.ts` - Added tables, relations, types (~200 lines added)
- `migrations/0022_add_metric_management_system.sql` (253 lines)
- `packages/api/services/metric-service.ts` (444 lines)
- `packages/api/routes/metric-routes.ts` (272 lines)
- `packages/api/services/__tests__/metric-service.test.ts` (758 lines)
- `tests/e2e/metric-management.spec.ts` (374 lines)
- `METRIC_MANAGEMENT_STATUS.md` (this file)

### Modified (3 files)
- `packages/api/storage.ts` - Added 11 methods (~235 lines added)
- `packages/api/routes/index.ts` - Registered metric routes (~5 lines)
- `packages/shared/schema.ts` - Added metric tables and types

### To Be Modified (~15 files)
- `packages/shared/analytics-types.ts` - Remove METRIC_CONFIG
- `packages/web/src/lib/metrics.ts` - Dynamic fetching
- `packages/web/src/components/navigation.tsx` - Add metrics link
- `packages/web/src/components/measurement-form.tsx` - Dynamic metrics
- `packages/web/src/components/analytics/MetricsSelector.tsx` - Dynamic metrics
- `packages/web/src/lib/csv.ts` - Filter by org metrics
- 8+ chart components in `packages/web/src/components/charts/`

---

## 🐛 Known Issues / TODOs

- [ ] Unit tests require database connection (not run yet)
- [ ] E2E tests require UI implementation (not run yet)
- [ ] Migration not yet applied to any environment
- [ ] Frontend UI not started
- [ ] No integration between frontend and backend yet
- [ ] Need to add audit log actions to audit_logs CHECK constraint in migration 0003
- [ ] Consider adding metric categories to shared enum/constant
- [ ] Consider adding metric icons to shared mapping

---

## 📚 References

- **CLAUDE.md** - Project TDD guidelines and E2E test policy
- **Migration Pattern** - Based on existing migrations 0015-0021
- **Service Pattern** - Based on OrganizationService, TeamService
- **Route Pattern** - Based on organization-routes.ts
- **E2E Test Pattern** - Based on athlete-crud.spec.ts

---

**Last Updated:** 2025-11-01 (auto-generated)
**Updated By:** Claude Code Assistant

---

## 📝 Latest Update (2025-11-01 - Continued Session)

### Frontend Implementation Completed: 100% ✅

**Completed Components:**
1. ✅ **Metric API Client** (`packages/web/src/lib/metrics-api.ts`) - 359 lines
   - React Query hooks for all metric operations
   - Proper type definitions with joined SiteMetric data

2. ✅ **Metrics Management Page** (`packages/web/src/pages/metrics-management.tsx`) - 306 lines
   - Full CRUD interface for site admins
   - Integrated with MetricFormDialog

3. ✅ **Metric Form Dialog** (`packages/web/src/components/metric-form-dialog.tsx`) - 356 lines
   - Create/Edit modes with form validation
   - All fields with data-testid attributes

4. ✅ **Sidebar Navigation** (`packages/web/src/components/sidebar.tsx`) - Modified
   - Added Metrics menu item for site admins

5. ✅ **Organization Metrics Card** (`packages/web/src/components/organization-metrics-card.tsx`) - 296 lines
   - Enable/disable toggles
   - Custom label inline editing
   - Integrated into organization profile

6. ✅ **Measurement Form** (`packages/web/src/components/measurement-form.tsx`) - Modified
   - Dynamic metrics from org configuration
   - Custom labels support
   - Dynamic units display

7. ✅ **MetricsSelector** (`packages/web/src/components/analytics/MetricsSelector.tsx`) - Modified
   - Replaced METRIC_CONFIG with dynamic API-fetched metrics
   - Organization-enabled metrics filtering
   - Custom labels in all displays

8. ✅ **Chart Components Hook** (`packages/web/src/hooks/use-metric-config.ts`) - NEW 131 lines
   - Reusable hook for accessing dynamic metric configs
   - Falls back to static METRIC_CONFIG for backward compatibility
   - Provides getMetricConfig(code) function

9. ✅ **All Chart Components** (14 files) - Modified
   - BarChart.tsx, LineChart.tsx, MultiLineChart.tsx
   - BoxPlotChart.tsx, ViolinChart.tsx, SwarmChart.tsx
   - RadarChart.tsx, ScatterPlotChart.tsx, DistributionChart.tsx
   - ConnectedScatterChart.tsx, TimeSeriesViolinChart.tsx
   - TimeSeriesBoxSwarmChart.tsx, ChartAnalyticsDisplay.tsx
   - Utils: timeSeriesChartOptions.ts, useTimeSeriesChartData.ts
   - All now display custom metric labels

10. ✅ **CSV Export Enhancement** (`packages/web/src/lib/chartExport.ts`) - Modified
    - Added MetricLabelMap type for custom labels
    - exportAnalyticsDataAsCSV() accepts optional metricLabelMap
    - generateExportFilename() uses custom labels
    - All converter functions respect custom labels

11. ✅ **CSV Import Validation** (`packages/web/src/lib/csv.ts`) - Modified
    - validateMeasurementCSV() accepts optional validMetrics array
    - Allows org-level metric filtering during import

**Remaining Tasks:**
- ⏳ Run Migration 0022 on testing database
- ⏳ Run unit tests and E2E tests

**Ready for Testing:**
All frontend components (critical + optional enhancements) are complete. Charts display custom labels, CSV exports use custom labels, and import validation supports org-level metric filtering.

**TypeScript Compilation:** ✅ Passing
**Git Status:** All changes committed to `feature/metric-management` branch
**Commits:** 6 commits (backend + frontend + enhancements)

