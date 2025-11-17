# Coaching Insights Feature - Implementation Summary

## Overview
This document summarizes the implementation of the AI-powered Coaching Insights feature for AthleteMetrics. The feature allows site admins and org admins to generate, edit, and export AI-generated coaching insights for team and individual reports.

## Feature Highlights

### 🤖 Multi-Provider AI Integration
- **7 AI Models** across 3 providers (OpenAI, Google, Anthropic)
- **Budget Tier** (5 models): GPT-5 Nano, Gemini 2.0/2.5 Flash-Lite, Claude Haiku 3/4.5
- **Premium Tier** (2 models): Gemini 2.5 Pro, Claude Sonnet 4.5
- **Default Model**: GPT-5 Nano ($0.05/$0.40 per 1M tokens - cheapest)
- **Model-Agnostic Architecture**: Strategy pattern with provider-specific implementations

### 🔐 Hierarchical Permission System
- **Site Admin Controls**:
  - Select AI model site-wide (7 models available)
  - Enable/disable AI per organization
  - Full visibility into all organizations

- **Org Admin Controls**:
  - Enable/disable AI for their organization (only if site admin allows)
  - Cannot enable if site admin has disabled

- **Dual-Flag Validation**:
  - `aiEnabledBySiteAdmin` (site admin gates org admin)
  - `aiEnabled` (org admin control)
  - Both must be true for features to be visible

### 📊 Core Functionality
- **Manual Generation**: Click "Generate Insights" button (not automatic)
- **Inline Editing**: Edit AI-generated insights directly in the UI
- **Regeneration**: Regenerate insights with updated AI analysis
- **Persistence**: Insights stored in database with metadata
- **PDF Export**: Insights included in report PDFs with markdown-to-plaintext conversion
- **Markdown Rendering**: Beautiful display using react-markdown

## Technical Implementation

### Database Schema (3 Migrations)

#### Migration 0036: Site Settings Table
```sql
CREATE TABLE site_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_model TEXT NOT NULL DEFAULT 'gpt-5-nano',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by VARCHAR REFERENCES users(id)
);

-- Constraint for valid AI models
ALTER TABLE site_settings ADD CONSTRAINT site_settings_ai_model_check
  CHECK (ai_model IN (
    'gpt-5-nano', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite',
    'claude-haiku-3', 'claude-haiku-4.5', 'gemini-2.5-pro', 'claude-sonnet-4.5'
  ));
```

#### Migration 0037: Organization AI Flags
```sql
ALTER TABLE organizations
  ADD COLUMN ai_enabled_by_site_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN ai_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Performance index for AI-enabled organizations
CREATE INDEX organizations_ai_enabled_idx
  ON organizations(ai_enabled_by_site_admin, ai_enabled)
  WHERE ai_enabled_by_site_admin = true AND ai_enabled = true;
```

#### Migration 0038: Report Coaching Insights
```sql
ALTER TABLE reports
  ADD COLUMN coaching_insights TEXT,
  ADD COLUMN coaching_insights_generated_at TIMESTAMP,
  ADD COLUMN coaching_insights_model TEXT;

-- Index for reports with insights
CREATE INDEX reports_has_insights_idx
  ON reports(coaching_insights_generated_at)
  WHERE coaching_insights IS NOT NULL;

-- Constraint for valid models
ALTER TABLE reports ADD CONSTRAINT reports_coaching_insights_model_check
  CHECK (coaching_insights_model IS NULL OR
         coaching_insights_model IN (...));
```

### Backend Implementation

#### AI Service (`packages/api/services/ai-insights-service.ts`)
- **Strategy Pattern**: Abstract `AIProvider` interface
- **3 Provider Implementations**:
  - `GoogleProvider` - Google Generative AI SDK
  - `OpenAIProvider` - OpenAI SDK
  - `AnthropicProvider` - Anthropic SDK
- **Model Configuration**: `AI_MODELS` object with pricing, tiers, descriptions
- **Context-Rich Prompts**: Performance data, athlete details, benchmarks

#### API Routes

**Site Settings Routes** (`packages/api/routes/site-settings-routes.ts`):
- `GET /api/site-settings` - Fetch current AI model
- `PATCH /api/site-settings` - Update AI model (site admin only)
- `GET /api/ai-models` - List all available models with pricing

**Report Routes** (`packages/api/routes/report-routes.ts`):
- `POST /api/reports/:id/generate-insights` - Generate AI insights
- `PATCH /api/reports/:id/insights` - Update insights (manual edit)
- PDF export enhanced with coaching insights section

#### Middleware (`packages/api/middleware.ts`)
- `requireAIEnabled` - Validates both permission flags before allowing access

### Frontend Implementation

#### Components

**CoachingInsightsCard** (`packages/web/src/components/reports/CoachingInsightsCard.tsx`):
- **4 UI States**:
  1. **Not Generated**: Shows "Generate Insights" button
  2. **Generating**: Loading spinner with status message
  3. **Display**: Markdown-rendered insights with Edit/Regenerate buttons
  4. **Editing**: Textarea with character limit (10,000 chars) and Save/Cancel

**Features**:
- Markdown rendering via react-markdown
- Inline editing capability
- Optimistic UI updates
- Character count validation
- Generation metadata display (timestamp + model)

#### Pages

**Admin Page** (`packages/web/src/pages/admin.tsx`):
- AI Model Configuration card
- Dropdown with all 7 models
- Pricing display per 100 reports
- Tier badges (Budget/Premium)

**Organization Settings** (`packages/web/src/pages/organization-settings.tsx`):
- Site admin: Toggle `aiEnabledBySiteAdmin`
- Shows feature flags section

**Org Admin Settings** (`packages/web/src/pages/org-admin-settings.tsx`):
- Org admin: Toggle `aiEnabled`
- Disabled state with explanation if site admin hasn't enabled
- Conditional enable/disable based on site admin permission

**Report Views**:
- `TeamReportView.tsx` - Integrated CoachingInsightsCard
- `IndividualReportView.tsx` - Integrated CoachingInsightsCard

### API Hooks

**React Query Hooks** (`packages/web/src/lib/reports-api.ts`):
- `useGenerateInsights(reportId)` - Generate insights mutation
- `useUpdateInsights(reportId)` - Update insights mutation
- Optimistic updates for instant UI feedback
- Cache invalidation strategies

### PDF Export Enhancement

**stripMarkdown Helper** (`packages/api/routes/report-routes.ts`):
- Removes all markdown formatting for PDF rendering
- Converts headers, bold, italic, links, lists, code blocks to plain text
- Preserves text content and readability

**PDF Section**:
- Added after all report content, before footer
- "Coaching Insights" header with appropriate styling
- Text wrapping with proper line breaks
- Page break handling for long insights
- Generation metadata footer (timestamp + model)

## Testing

### E2E Test Suite (`tests/e2e/coaching-insights.spec.ts`)

**11 Comprehensive Tests**:

1. **Site Admin Configuration** (2 tests):
   - AI model selection across all 7 models
   - Enabling AI for specific organizations

2. **Org Admin Configuration** (2 tests):
   - Disabled state when site admin hasn't enabled
   - Enabling AI when site admin allows

3. **Generation and Editing** (3 tests):
   - Generating insights for team reports
   - Editing existing insights
   - Regenerating insights

4. **PDF Export** (1 test):
   - Verifying insights included in PDF downloads

5. **Feature Visibility** (2 tests):
   - Hidden when AI disabled at either level
   - Visible when AI enabled at both levels

6. **Individual Reports** (1 test):
   - Generating insights for individual athlete reports

### Unit Tests
- Fixed existing test files to include new schema fields:
  - `PinnedReportsSection.test.tsx`
  - `RecentReportsSection.test.tsx`

## Environment Configuration

### Required Environment Variables

```bash
# At least one AI provider required
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_AI_API_KEY=your_google_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Existing required variables
DATABASE_URL=postgresql://...
SESSION_SECRET=your_session_secret_here
ADMIN_USER=admin
ADMIN_PASSWORD=your_password_here
```

### Provider Setup

**OpenAI** (gpt-5-nano):
- Account: https://platform.openai.com/
- API Key: From API Keys section
- Models: GPT-5 Nano

**Google** (gemini-2.0-flash-lite, gemini-2.5-flash-lite, gemini-2.5-pro):
- Account: https://aistudio.google.com/
- API Key: Get API Key button
- Models: Gemini 2.0 Flash-Lite, Gemini 2.5 Flash-Lite, Gemini 2.5 Pro

**Anthropic** (claude-haiku-3, claude-haiku-4.5, claude-sonnet-4.5):
- Account: https://console.anthropic.com/
- API Key: From API Keys section
- Models: Claude Haiku 3, Claude Haiku 4.5, Claude Sonnet 4.5

## Installation & Setup

### 1. Install Dependencies
```bash
npm install @google/generative-ai openai @anthropic-ai/sdk
```

### 2. Run Migrations
```bash
npm run db:migrate:manual
```

This applies:
- 0036_create_site_settings.sql
- 0037_add_org_ai_flags.sql
- 0038_add_report_insights.sql

### 3. Configure Environment
Create `.env` file with AI provider API keys (see Environment Configuration above).

### 4. Build & Start
```bash
npm run build
npm run dev
```

## Usage Workflow

### Site Admin Workflow
1. Navigate to Admin page (`/admin`)
2. Find "AI Model Configuration" card
3. Select AI model from dropdown (7 options)
4. Navigate to Organizations page (`/organizations`)
5. Click Settings icon for an organization
6. Toggle "Enable Coaching Insights for this Organization"

### Org Admin Workflow
1. Navigate to Settings page (sidebar)
2. Find "Coaching Insights" section
3. Toggle "Enable Coaching Insights" (if site admin allows)

### Coach Workflow (Generating Insights)
1. Navigate to Reports page (`/reports`)
2. Click on a team or individual report
3. Find "Coaching Insights" card
4. Click "Generate Insights" button
5. Wait for AI generation (5-30 seconds)
6. Review insights, edit if needed
7. Export PDF to include insights

## Cost Optimization

### Budget Tier Models (Recommended for High Volume)
- **GPT-5 Nano**: $0.05/$0.40 per 1M tokens ⭐ Default
- **Gemini 2.0 Flash-Lite**: $0.075/$0.30 per 1M tokens
- **Gemini 2.5 Flash-Lite**: $0.10/$0.40 per 1M tokens
- **Claude Haiku 3**: $0.25/$1.25 per 1M tokens
- **Claude Haiku 4.5**: $0.80/$4.00 per 1M tokens

### Premium Tier Models (High Quality)
- **Gemini 2.5 Pro**: $1.25/$10.00 per 1M tokens
- **Claude Sonnet 4.5**: $3.00/$15.00 per 1M tokens

### Estimated Costs (GPT-5 Nano)
- **Per Report**: ~$0.002 - $0.005 (0.2-0.5 cents)
- **100 Reports**: ~$0.20 - $0.50
- **1000 Reports**: ~$2.00 - $5.00

## Security Considerations

### Permission Validation
- All AI endpoints protected by `requireAIEnabled` middleware
- Dual-flag validation prevents unauthorized access
- Site admin must explicitly enable per organization

### Rate Limiting
- Insights generation uses existing report rate limiting
- Default: 50 requests per 15 minutes
- Protects against abuse and API cost overruns

### Data Privacy
- Insights stored in database with encryption at rest
- API keys stored as environment variables (never in code)
- No user data sent to AI providers except performance metrics

## Future Enhancements

### Potential Improvements
1. **Streaming Responses**: Real-time insight generation with SSE
2. **Custom Prompts**: Allow site admins to customize AI prompts
3. **Insight Templates**: Pre-defined insight templates per sport
4. **Comparison Insights**: Compare team/athlete across time periods
5. **Multi-Language Support**: Insights in multiple languages
6. **Insight History**: Track changes and regenerations
7. **Batch Generation**: Generate insights for multiple reports at once
8. **Smart Suggestions**: AI-powered coaching suggestions based on trends

## Files Changed/Created

### New Files (13)
1. `migrations/0036_create_site_settings.sql`
2. `migrations/0036_create_site_settings_down.sql`
3. `migrations/0037_add_org_ai_flags.sql`
4. `migrations/0037_add_org_ai_flags_down.sql`
5. `migrations/0038_add_report_insights.sql`
6. `migrations/0038_add_report_insights_down.sql`
7. `packages/api/services/ai-insights-service.ts`
8. `packages/api/routes/site-settings-routes.ts`
9. `packages/web/src/components/reports/CoachingInsightsCard.tsx`
10. `packages/web/src/lib/reports-api.ts`
11. `packages/web/src/pages/org-admin-settings.tsx`
12. `tests/e2e/coaching-insights.spec.ts`
13. `COACHING_INSIGHTS_IMPLEMENTATION.md` (this file)

### Modified Files (12)
1. `packages/shared/schema.ts` - Added 3 tables, validation schemas
2. `packages/api/routes/report-routes.ts` - Insights endpoints, PDF export
3. `packages/api/middleware.ts` - requireAIEnabled middleware
4. `packages/web/src/pages/admin.tsx` - AI model selector
5. `packages/web/src/pages/organization-settings.tsx` - AI toggle for site admin
6. `packages/web/src/components/sidebar.tsx` - Org admin settings link
7. `packages/web/src/components/reports/TeamReportView.tsx` - Insights card integration
8. `packages/web/src/components/reports/IndividualReportView.tsx` - Insights card integration
9. `packages/web/src/App.tsx` - Org admin settings route
10. `packages/web/src/components/reports/__tests__/PinnedReportsSection.test.tsx` - Schema updates
11. `packages/web/src/components/reports/__tests__/RecentReportsSection.test.tsx` - Schema updates
12. `package.json` - AI provider dependencies

## Support & Documentation

### API Documentation
- AI Insights Service: `packages/api/services/ai-insights-service.ts`
- Site Settings API: `packages/api/routes/site-settings-routes.ts`
- Report Insights API: `packages/api/routes/report-routes.ts`

### Component Documentation
- CoachingInsightsCard: `packages/web/src/components/reports/CoachingInsightsCard.tsx`
- React Query Hooks: `packages/web/src/lib/reports-api.ts`

### Database Documentation
- Schema Changes: `packages/shared/schema.ts`
- Migration Files: `migrations/0036*.sql`, `migrations/0037*.sql`, `migrations/0038*.sql`

---

**Implementation Date**: November 17, 2025
**Version**: 1.0.0
**Branch**: feature/coaching-insights
**Status**: ✅ Complete - Ready for Pull Request
