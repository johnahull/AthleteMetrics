# Wellness Questionnaire Feature - Implementation Tracker

**Branch:** `feature/wellness-questionnaire`
**Approach:** Test-Driven Development (TDD)
**Started:** 2025-11-21

---

## Overview

Comprehensive wellness questionnaire system allowing:
- ✅ Coaches to create templates and request athlete submissions
- ✅ Athletes to complete questionnaires via multiple access methods
- ✅ Team and individual analytics with trend visualization
- ✅ Alert system for concerning wellness patterns

---

## Implementation Phases

### Phase 1: Setup & Documentation ✅
- [x] Create feature branch `feature/wellness-questionnaire`
- [x] Create tracking document `docs/WELLNESS_IMPLEMENTATION.md`
- [x] Initialize todo list for phase tracking

### Phase 2: Database Schema (TDD) ✅
**Status:** Completed (2025-11-21)
**Files created:**
- [x] `tests/integration/wellness-schema.test.ts` - Schema validation tests (24 tests passing)
- [x] `packages/shared/schema.ts` - Added 3 new tables (already existed in schema)
- [x] `packages/shared/wellness-types.ts` - TypeScript interfaces
- [x] `packages/shared/wellness-validation.ts` - Zod schemas
- [x] Migration files - No migration needed (tables already in schema)

**Database Tables:**
1. **wellnessTemplates** - Template definitions with JSONB config ✅
   - Fields: id, organizationId, name, description, config (JSONB), isDefault, isActive, createdBy, timestamps
   - Indexes: organizationId, isActive
   - Relations: organizations (cascade delete), users (set null on delete)

2. **wellnessRequests** - Coach-initiated or scheduled requests ✅
   - Fields: id, organizationId, templateId, requestedBy, distributionMethod, targetAthleteIds, targetTeamIds, publicToken, requiresAuth, scheduledFor, expiresAt, status, createdAt
   - Indexes: organizationId, publicToken (unique), status, scheduledFor
   - Relations: organizations (cascade delete), templates (cascade delete), users (set null on delete)

3. **wellnessResponses** - Athlete submissions (historical snapshots) ✅
   - Fields: id, requestId, organizationId, templateId, userId, userFullName, teamId, teamNameSnapshot, submittedAt, date, responses (JSONB), accessMethod, ipAddress, userAgent, createdAt
   - Indexes: userId, organizationId, date, teamId, submittedAt, composite (userId + date)
   - Relations: requests (set null on delete), NO FK constraints for historical preservation
   - Historical references: organizationId, templateId, userId, teamId (no FKs - preserves data after deletion)

**Test Coverage:** ✅ All 24 tests passing
- [x] Table creation and structure
- [x] JSONB field validation (config, responses)
- [x] Index existence and performance
- [x] Data insertion and retrieval
- [x] Token uniqueness constraint
- [x] Historical data preservation (no FK errors when referenced data deleted)
- [x] Organization scoping works correctly
- [x] Cascade deletion behavior
- [x] Set null on user deletion

### Phase 3: Backend API (TDD) 🔄
**Status:** Not Started
**Files to create:**
- [ ] `tests/integration/wellness-api.test.ts` - API endpoint tests
- [ ] `packages/api/services/wellness-service.ts` - Business logic
- [ ] `packages/api/routes/wellness-routes.ts` - REST endpoints
- [ ] `packages/api/auth/wellness-access.ts` - Magic link generation

**Files to modify:**
- [ ] `packages/api/middleware.ts` - Add `requireWellnessAccess()` middleware
- [ ] `packages/api/routes/index.ts` - Register wellness routes
- [ ] `packages/api/services/email-service.ts` - Wellness email templates
- [ ] `packages/api/storage.ts` - Add wellness storage methods

**API Endpoints:**
```
POST   /api/organizations/:orgId/wellness/templates
GET    /api/organizations/:orgId/wellness/templates
PUT    /api/organizations/:orgId/wellness/templates/:id
DELETE /api/organizations/:orgId/wellness/templates/:id

POST   /api/organizations/:orgId/wellness/requests
GET    /api/organizations/:orgId/wellness/requests
PUT    /api/organizations/:orgId/wellness/requests/:id/cancel

POST   /api/wellness/responses (supports both auth + magic link)
GET    /api/wellness/responses/:id

GET    /api/organizations/:orgId/wellness/analytics
GET    /api/athletes/:athleteId/wellness/responses
GET    /api/athletes/:athleteId/wellness/trends
```

**Test Coverage:**
- [ ] Template CRUD operations with org scoping
- [ ] Request creation with token generation
- [ ] Magic link validation and expiry
- [ ] Response submission (authenticated)
- [ ] Response submission (magic link)
- [ ] Response submission (team link)
- [ ] Analytics aggregation queries
- [ ] Rate limiting enforcement
- [ ] Permission checks (org admin, coach, athlete)

### Phase 4: Coach Interface (TDD) ✅
**Status:** Complete (2025-11-21)
**Files created:**
- [x] `tests/e2e/wellness-coach-workflows.spec.ts` - E2E tests (RED phase - tests written first)
- [x] `packages/web/src/pages/wellness-templates.tsx` - Template management page
- [x] `packages/web/src/components/wellness/TemplateBuilder.tsx` - Template editor with React Hook Form
- [x] `packages/web/src/components/wellness/QuestionEditor.tsx` - Question configuration dialog
- [x] `packages/web/src/components/wellness/TemplatePreview.tsx` - Preview modal showing athlete view
- [x] `packages/web/src/components/wellness/TemplateCard.tsx` - Template card component
- [x] `packages/web/src/components/wellness/RequestModal.tsx` - Send request modal with distribution options
- [x] `packages/web/src/components/wellness/QRCodeGenerator.tsx` - QR code display and download
- [x] `packages/web/src/components/wellness/RequestsList.tsx` - Active requests table with filtering
- [x] `packages/web/src/hooks/use-wellness-templates.ts` - React Query hooks for templates
- [x] `packages/web/src/hooks/use-wellness-requests.ts` - React Query hooks for requests
- [x] `packages/web/src/App.tsx` - Added /wellness route
- [x] `packages/web/src/components/sidebar.tsx` - Added Wellness navigation link with Heart icon

**Implementation Details:**
- Used existing TeamAthleteSelector component for athlete/team selection
- QR code generation uses `qrcode` library (installed: qrcode@1.5.4, @types/qrcode@1.5.5)
- All components use shadcn/ui components (Dialog, Form, Table, Progress, etc.)
- Form validation with React Hook Form + Zod schemas from wellness-validation.ts
- React Query for data fetching with proper cache invalidation
- Followed existing AthleteMetrics patterns (teams.tsx, athletes.tsx pages)

**E2E Test Scenarios:**
- [ ] Create new template with multiple questions
- [ ] Edit existing template
- [ ] Delete template
- [ ] Preview template as athlete would see it
- [ ] Send request to specific athletes
- [ ] Send request to entire team
- [ ] Generate magic link
- [ ] Generate QR code
- [ ] View request completion status
- [ ] Send reminder for incomplete requests
- [ ] Cancel active request

### Phase 5: Athlete Interface (TDD) 🔄
**Status:** Not Started
**Files to create:**
- [ ] `tests/e2e/wellness-athlete-submission.spec.ts` - E2E tests
- [ ] `packages/web/src/pages/wellness-submit.tsx` - Submission page
- [ ] `packages/web/src/pages/wellness-history.tsx` - Athlete history
- [ ] `packages/web/src/components/wellness/QuestionnaireForm.tsx` - Dynamic form
- [ ] `packages/web/src/components/wellness/ScaleQuestionInput.tsx` - Scale input
- [ ] `packages/web/src/components/wellness/TextQuestionInput.tsx` - Text input
- [ ] `packages/web/src/components/wellness/BooleanQuestionInput.tsx` - Yes/No
- [ ] `packages/web/src/components/wellness/BodyMapInput.tsx` - Body diagram
- [ ] `packages/web/src/components/wellness/ProgressIndicator.tsx` - Progress bar
- [ ] `packages/web/src/components/wellness/SubmissionConfirmation.tsx` - Success screen
- [ ] `packages/web/src/components/wellness/ResponseDetailCard.tsx` - Response display
- [ ] `packages/web/src/hooks/use-wellness-submit.ts` - Form hooks

**E2E Test Scenarios:**
- [ ] Access via magic link (no login)
- [ ] Access via athlete account (authenticated)
- [ ] Access via team link
- [ ] Access via QR code scan
- [ ] Complete questionnaire with all question types
- [ ] Form validation (required fields)
- [ ] Auto-save to local storage
- [ ] Mobile responsive design (viewport resize)
- [ ] Touch-optimized scale input
- [ ] Body map interaction
- [ ] Submission success confirmation
- [ ] View submission history
- [ ] Cannot submit expired request

### Phase 6: Analytics Dashboard (TDD) ✅
**Status:** Completed (2025-11-21)
**Files created:**
- [x] `tests/e2e/wellness-analytics.spec.ts` - E2E tests for analytics dashboard
- [x] `packages/web/src/pages/wellness-analytics.tsx` - Analytics dashboard with summary cards, filters, and visualizations
- [x] `packages/web/src/components/wellness/WellnessSummaryCard.tsx` - Average wellness score widget with trend indicators
- [x] `packages/web/src/components/wellness/AlertsCard.tsx` - Concerning patterns alerts with severity badges
- [x] `packages/web/src/components/wellness/CompletionRateCard.tsx` - Response completion rate tracker with progress bar
- [x] `packages/web/src/components/wellness/WellnessTrendChart.tsx` - Chart.js line chart for individual athlete trends
- [x] `packages/web/src/components/wellness/TeamHeatmap.tsx` - Color-coded heatmap grid (athletes × dates)
- [x] `packages/web/src/components/wellness/WellnessFilters.tsx` - Comprehensive filter panel (date range, teams, athletes)
- [x] `packages/web/src/hooks/use-wellness-analytics.ts` - React Query hooks with calculated metrics
- [x] `packages/web/src/App.tsx` - Added /wellness-analytics route

**Implementation Details:**
- **Summary Cards**: Average wellness score with up/down/stable trend, completion rate with progress bar, alerts for drops >20%
- **Trend Chart**: Individual athlete selection, multi-line chart showing all wellness questions over time, empty states
- **Team Heatmap**: Interactive grid with color-coded cells (red=low, yellow=medium, green=high), click cell opens detail modal
- **Filters**: Date range picker, team dropdown, athlete multi-select using TeamAthleteSelector, collapsible on mobile
- **Alerts**: Automatic detection of wellness drops >20% and sustained low wellness (<4 for 3+ days)
- **Mobile Responsive**: Stack cards vertically, collapsible filters (<768px), scrollable heatmap, responsive charts

**E2E Test Scenarios:**
- [x] Dashboard loads with summary cards showing key metrics
- [x] Trend chart displays individual athlete wellness over time
- [x] Team heatmap renders with color-coded cells
- [x] Date range filtering updates all visualizations
- [x] Team/athlete filtering works correctly
- [x] Alerts display when concerning patterns detected
- [x] Click heatmap cell shows athlete detail modal
- [x] Mobile responsive layout (375px and 768px viewports tested)
- [x] Empty states handled (no data, no athlete selected)

### Phase 7: Integration & Polish 🔄
**Status:** Not Started
**Tasks:**
- [ ] Run all tests (unit, integration, E2E) on testing environment
- [ ] Manual testing on staging environment
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Mobile device testing (iOS, Android)
- [ ] Performance testing (large datasets)
- [ ] Security audit (token validation, rate limiting, SQL injection)
- [ ] Accessibility audit (WCAG compliance, keyboard navigation)
- [ ] Email template testing (SendGrid)
- [ ] QR code generation testing
- [ ] Fix all bugs discovered
- [ ] Update `CLAUDE.md` with wellness agent guidance
- [ ] Update main `README.md` with wellness feature
- [ ] Create comprehensive PR description
- [ ] Request code review

---

## Dependencies to Install

```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

**Already available:**
- `chart.js` + `react-chartjs-2` (visualization)
- `zod` (validation)
- `react-hook-form` (forms)
- `@tanstack/react-query` (data fetching)
- `express` + `drizzle-orm` (backend)
- `nodemailer` / SendGrid (emails)

---

## Testing Strategy

### Test-Driven Development Flow
1. **Red Phase:** Write failing test first
2. **Green Phase:** Write minimum code to pass test
3. **Refactor Phase:** Improve code quality while tests pass

### Test Pyramid
- **E2E Tests (tests/e2e/):** User workflows, critical paths
- **Integration Tests (tests/integration/):** API endpoints, database operations
- **Unit Tests:** Business logic, utility functions

### Test Environments
- **Local:** SQLite for rapid development
- **Testing:** PostgreSQL (Railway testing environment)
- **Staging:** PostgreSQL (Railway staging environment)

---

## Database Migration Plan

1. Generate migration:
   ```bash
   npm run db:generate
   ```

2. Review migration SQL files in `drizzle/`

3. Apply to testing database:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:migrate:all
   ```

4. Apply to staging database:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:migrate:all
   ```

5. Apply to production (after thorough testing):
   ```bash
   DATABASE_URL="postgresql://..." npm run db:migrate:all
   ```

---

## Rollout Plan

### Phase 1: Alpha Testing (Week 1)
- Deploy to testing environment
- Internal testing with development team
- Fix critical bugs

### Phase 2: Beta Testing (Week 2)
- Deploy to staging environment
- Pilot with 1-2 teams
- Gather feedback
- Iterate on UX

### Phase 3: Production Release (Week 3)
- Deploy to production
- Gradual rollout (feature flag)
- Monitor error logs and performance
- Support early adopters

---

## Success Metrics

**Adoption:**
- [ ] 80% of coaches create at least one template
- [ ] 90% athlete response rate within 24 hours
- [ ] 50% of teams use wellness tracking weekly

**Technical:**
- [ ] 100% test coverage for critical paths
- [ ] < 2s page load time for all wellness pages
- [ ] < 500ms API response time for analytics queries
- [ ] Zero security vulnerabilities

**User Satisfaction:**
- [ ] < 2 minutes average questionnaire completion time
- [ ] Positive feedback from coaches and athletes
- [ ] Reduction in injury rates (correlation with wellness data)

---

## Known Limitations & Future Enhancements

**V1 Limitations:**
- No real-time notifications (email only)
- No athlete-to-coach messaging
- No integration with wearable devices
- Body map is basic (not anatomically detailed)
- No multi-language support

**Future Enhancements (V2+):**
- Push notifications (mobile app)
- SMS reminders
- Wearable device integration (Whoop, Oura, Garmin)
- Advanced body mapping with 3D visualization
- AI-powered wellness insights
- Automated training load adjustments
- Team wellness leaderboards
- Custom alert thresholds per athlete
- Wellness vs injury correlation reports

---

## Implementation Log

### 2025-11-21

**Morning Session:**
- ✅ Created feature branch `feature/wellness-questionnaire`
- ✅ Created implementation tracking document

**Afternoon Session (Phase 2 - Database Schema TDD):**
- ✅ Created `packages/shared/wellness-types.ts` with comprehensive TypeScript interfaces
  - Question types (scale, text, boolean, body_map)
  - Template configuration structures
  - Request distribution methods
  - Response data structures
  - Analytics types (summaries, trends, alerts, heatmaps, correlations)
- ✅ Created `packages/shared/wellness-validation.ts` with Zod validation schemas
  - Template config validation with question uniqueness checks
  - Request validation with distribution method rules
  - Response validation with dynamic schema generation
  - Analytics filter validation
  - JSONB structure validation for config and responses
- ✅ Created `tests/integration/wellness-schema.test.ts` with 24 comprehensive integration tests
  - All tests passing on local development database
  - Tests cover: JSONB validation, indexes, FK constraints, historical preservation, org scoping
- ✅ Verified database schema already includes wellness tables (no migration needed)
- ✅ **Phase 2 Complete** - Database schema validated and working

**Evening Session (Phase 3-4 - Backend API & Coach UI):**
- ✅ Implemented comprehensive backend API in `packages/api/routes/wellness-routes.ts`
  - Template CRUD operations with organization scoping
  - Request management with magic link token generation
  - Response submission with dual authentication (session + token)
  - Analytics endpoints (team summaries, athlete trends)
  - Rate limiting and security middleware
- ✅ Created `tests/integration/wellness-api.test.ts` and `wellness-routes.test.ts`
  - 60 integration tests passing ✅
  - Covers all CRUD operations, authorization, organization scoping
- ✅ Implemented Coach UI in `packages/web/src/pages/wellness-templates.tsx`
  - Template builder with drag-and-drop question ordering
  - Request distribution interface with magic link generation
  - Real-time preview of questionnaires
- ✅ Fixed code review issues (completion rate, CSRF, org isolation)
- ✅ **Phases 3-4 Complete** - Backend API and Coach UI working

### 2025-11-21 (Continued)

**Late Evening (Phase 5 - Athlete Submission Interface):**
- ✅ Created wellness submission page (`packages/web/src/pages/wellness-submit.tsx`)
  - Magic link access (no authentication required)
  - Form validation with React Hook Form + Zod
  - Auto-save to local storage with debouncing
  - Progress tracking (X of Y questions answered)
  - Support for all question types (scale, text, boolean, body_map)
- ✅ Built question input components:
  - `ScaleQuestionInput.tsx` - 1-10 slider with touch support
  - `TextQuestionInput.tsx` - Text area with character limits
  - `BooleanQuestionInput.tsx` - Yes/No toggle buttons
  - `BodyMapInput.tsx` - Interactive body part selection
- ✅ Created athlete pending requests view (`packages/web/src/pages/wellness-my-requests.tsx`)
  - Displays active wellness requests targeted at athlete
  - Filters by targetAthleteIds and targetTeamIds
  - Shows template info, scheduled/expiry dates
  - Click-to-start navigation with magic link token
- ✅ Created submission history view (`packages/web/src/pages/wellness-history.tsx`)
  - Lists all past submissions sorted by date (most recent first)
  - Click to view details in modal
  - Fetches template to show question labels with responses
  - Supports all question types with formatted display
- ✅ Implemented duplicate submission detection:
  - Added GET `/api/wellness/requests/:requestId/check-submission` endpoint
  - Checks if user already submitted for specific request
  - Prevents form access if already submitted
  - Shows "already submitted" message with timestamp
- ✅ Added athlete-specific API endpoints:
  - GET `/api/wellness/my-requests` - Get pending requests for authenticated athlete
  - GET `/api/wellness/my-responses` - Get submission history for authenticated athlete
- ✅ Verified with integration tests (60 tests passing ✅)
- ✅ TypeScript compilation passing with no errors
- ✅ **Phase 5 Complete** - Athlete Submission Interface fully functional

---

## Notes & Decisions

- **No FK constraints on historical data:** Preserves athlete responses even after user/team deletion (follows `measurements` table pattern)
- **JSONB for flexibility:** Allows custom question types without schema migrations
- **Multiple access methods:** Supports magic links, athlete accounts, team links, QR codes for maximum flexibility
- **Token security:** 64-character crypto-secure tokens with 7-day expiry
- **Rate limiting:** 100 requests per 15 minutes (matches existing analytics endpoints)
- **Mobile-first design:** Touch-optimized inputs, full-screen forms on mobile
- **Organization scoping:** All data scoped to organizations for multi-tenant isolation
