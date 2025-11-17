# Coaching Insights Feature - TDD Implementation Progress

## Overview
Implementing AI-powered coaching insights with 7 AI models, feature flags, and PDF export.

## Implementation Status

### Phase 1: Database Schema ✅
- [x] Write tests for schema validation (manual verification)
- [x] Migration 0036: Site Settings Table
- [x] Migration 0037: Organization AI Flags
- [x] Migration 0038: Report Insights Columns
- [x] Update packages/shared/schema.ts
- [x] Run migrations and verify

### Phase 2: Backend AI Service ✅
- [x] Create ai-insights-service.ts with 7 models
- [x] Implement provider classes (Google, OpenAI, Anthropic)
- [x] Implement generateCoachingInsights()
- [x] Add storage methods for site settings and reports

### Phase 3: Backend API Endpoints ✅
- [x] Create site-settings-routes.ts
- [x] Update report-routes.ts with insights endpoints
- [x] Add requireAIEnabled middleware
- [x] Register site-settings routes
- [x] Fix TypeScript type errors

### Phase 4: Frontend - Site Admin Settings
- [ ] Write E2E tests for site admin AI config
- [ ] Update admin.tsx with AI model selector
- [ ] Tests pass

### Phase 5: Frontend - Org Admin Settings
- [ ] Write E2E tests for org AI settings
- [ ] Update organization-settings.tsx
- [ ] Create org-admin-settings.tsx
- [ ] Update navigation
- [ ] Tests pass

### Phase 6: Frontend - Coaching Insights Component
- [ ] Write E2E tests for insights generation/editing
- [ ] Create CoachingInsightsCard.tsx
- [ ] Update TeamReportView.tsx
- [ ] Update IndividualReportView.tsx
- [ ] Tests pass

### Phase 7: PDF Export
- [ ] Write tests for PDF with insights
- [ ] Update generatePDF() function
- [ ] Tests pass

### Phase 8: API Hooks
- [ ] Create useGenerateInsights hook
- [ ] Create useUpdateInsights hook

### Phase 9: Dependencies
- [ ] Install AI SDK dependencies
- [ ] Install react-markdown

### Phase 10: Full E2E Tests
- [ ] Site admin enables AI for org
- [ ] Org admin enables AI
- [ ] Generate insights (2+ models)
- [ ] Edit insights
- [ ] Regenerate insights
- [ ] PDF export includes insights
- [ ] Feature flags prevent access
- [ ] All tests pass

## Current Status
Starting Phase 1: Database Schema with TDD approach

## Notes
- Using test-first development for all phases
- Running tests after each implementation
- Iterating until all tests pass
