# AthleteMetrics Report Improvements — Specification

## Overview
Seven improvements to transform reports from a coaching tool into a sales & retention engine.

---

## Improvement 1: BTA-Aware AI Coaching Insights

### Problem
The AI prompt is generic ("you are an expert athletic performance coach"). It doesn't know about BTA's methodology, John's coaching philosophy, or sport-specific context.

### Solution
Add organization-level AI prompt customization that gets prepended to the coaching insights prompt.

### Implementation

**Database Changes:**
- Add `aiPromptContext` text field to `organizations` table (nullable, max 2000 chars)
- This allows each organization to customize their AI voice

**API Changes:**
- Update `buildReportDataForAI()` in `report-routes.ts` to include `organizationContext` field
- Update `buildPrompt()` in `ai-insights-service.ts` to prepend org context

**Prompt Addition (before existing instructions):**
```
## Organization Context
{organizationContext}

When generating insights, incorporate this context to make recommendations
specific to this organization's training philosophy and methodology.
```

**Default BTA Context (seeded for John's org):**
```
Big Time Athletes (BTA) focuses on speed, strength, movement quality, and injury
prevention for youth and collegiate athletes. Training philosophy emphasizes:
- Progressive overload with age-appropriate programming
- Movement quality before movement quantity
- Data-driven decisions using objective measurements
- Sport-specific transfer of training adaptations
Coach John Hull (MIT MechE, 20+ years engineering) brings an analytical,
systems-thinking approach to athletic development.
```

**UI Changes:**
- Add "AI Context" textarea in Organization Settings under the AI section
- Character counter (max 2000)
- Help text: "Customize how AI generates coaching insights for your reports"

### Files to Modify
- `packages/shared/schema/tables/organizations.ts` — add column
- `packages/api/services/ai-insights-service.ts` — update `buildPrompt()`, add `organizationContext` to `ReportData`
- `packages/api/routes/report-routes.ts` — pass org context in `buildReportDataForAI()`
- `packages/web/src/pages/organization-settings.tsx` — add AI context textarea
- Migration file for new column

---

## Improvement 2: Before/After Progress Comparison

### Problem
Reports show point-in-time snapshots. No way to see "you improved your 40-yard dash from 5.2s to 4.9s over 8 weeks."

### Solution
Add a `compareToDate` option in report config that pulls a previous measurement window and calculates deltas.

### Implementation

**Report Config Changes:**
Add optional `comparison` field to report config:
```typescript
interface ReportConfig {
  // ... existing fields
  comparison?: {
    enabled: boolean;
    type: 'previous_event' | 'date_range' | 'baseline';
    previousEventId?: string;  // Compare to a specific past event
    baselineDate?: string;     // Compare to measurements before this date
  };
}
```

**ReportService Changes:**
Add `calculateProgressComparison()` method:
```typescript
async calculateProgressComparison(
  athleteId: string,
  organizationId: string,
  metrics: string[],
  currentPerformances: Record<string, number>,
  comparisonConfig: ComparisonConfig
): Promise<Record<string, {
  previousValue: number;
  currentValue: number;
  absoluteChange: number;
  percentageChange: number;
  direction: 'improved' | 'declined' | 'unchanged';
  previousDate: string;
}>>
```

Logic:
1. For `previous_event`: Query measurements from that event for the athlete
2. For `date_range`: Query best performance before the baseline date
3. For `baseline`: Use earliest measurement as baseline
4. Calculate delta, percentage change, and direction (respecting lowerIsBetter)

**Individual Report Data Changes:**
Add `progressComparison` to `AthletePerformance` interface:
```typescript
interface AthletePerformance {
  // ... existing fields
  progressComparison?: Record<string, {
    previousValue: number;
    currentValue: number;
    absoluteChange: number;
    percentageChange: number;
    direction: 'improved' | 'declined' | 'unchanged';
    previousDate: string;
  }>;
}
```

**AI Insights Changes:**
Add progress data to the prompt:
```
## Progress Since Previous Assessment
- 40-Yard Dash: 5.20s → 4.90s (↓0.30s, 5.8% improvement)
- Vertical Jump: 22.0in → 24.5in (↑2.5in, 11.4% improvement)
- Pro Agility: 4.80s → 4.75s (↓0.05s, 1.0% improvement)
```

**PDF Changes:**
Add "Progress" column to individual report tables showing ↑↓ arrows and delta values.

**UI Changes (ReportWizard):**
- Add "Compare to Previous" toggle in report wizard step
- When enabled, show dropdown: "Previous Event" | "Custom Date" | "First Assessment"
- If "Previous Event", show event selector dropdown

### Files to Modify
- `packages/api/services/report-service.ts` — add `calculateProgressComparison()`
- `packages/api/routes/report-routes.ts` — pass comparison to AI, include in PDF
- `packages/api/services/ai-insights-service.ts` — add progress section to prompt
- `packages/web/src/components/reports/ReportWizard.tsx` — add comparison UI
- `packages/web/src/components/reports/IndividualReportView.tsx` — render progress
- `packages/web/src/components/reports/AthleteReportView.tsx` — render progress (athlete view)

---

## Improvement 3: Automated Report Delivery After Events

### Problem
Reports exist but someone has to manually share them. After an eval, the coach has to remember to generate, review, and send each report.

### Solution
Add an event-level "auto-share" setting. When an event is completed/finalized, automatically generate individual reports for all participants and share them.

### Implementation

**Database Changes:**
- Add `autoShareReports` boolean to `events` table (default false)
- Add `autoShareReportTemplateId` UUID nullable FK to `reports` table (the template to use)
- Add `autoShareMessage` text to `events` table (nullable, custom message for the share)
- Add `eventStatus` enum to `events` table: 'draft' | 'active' | 'completed' (default 'active')

**API Changes:**

New endpoint: `POST /api/events/:id/finalize`
```typescript
// 1. Set event status to 'completed'
// 2. If autoShareReports is true:
//    a. Get all unique athletes with measurements in this event
//    b. For each athlete, create an individual report from the template
//       (with eventId filter set to this event)
//    c. Generate AI coaching insights for each report
//    d. Share each report with its athlete (triggers email + push)
// 3. Return summary: { finalized: true, reportsGenerated: N, reportsSent: N }
```

This should be a background job (not blocking the HTTP response) since generating AI insights for 30+ athletes takes time.

**Job Queue:**
Create `packages/api/jobs/event-finalize-job.ts`:
- Accepts eventId
- Processes athletes in batches of 5 (to avoid AI rate limits)
- Updates event with `finalizedAt` timestamp when complete
- Logs progress

**UI Changes:**
- Add "Auto-share reports" toggle in Event creation/edit form
- When enabled, show template selector and optional message
- Add "Finalize Event" button on event detail page
- Show progress indicator while reports are being generated
- Confirmation dialog: "This will generate and send reports to N athletes"

### Files to Modify
- `packages/shared/schema/tables/events.ts` — add columns
- `packages/api/routes/event-routes.ts` — add finalize endpoint
- `packages/api/jobs/event-finalize-job.ts` — new file
- `packages/web/src/pages/event-detail.tsx` (or equivalent) — add finalize UI
- Migration file

---

## Improvement 4: Parent-Friendly Report Language

### Problem
AI insights are written for "coaches and athletes." But parents are the buyers — they need to understand what the data means for their kid and why they should keep paying.

### Solution
Add a `reportAudience` field to report config. When set to 'parent', the AI prompt shifts to parent-friendly language with different emphasis.

### Implementation

**Report Config Changes:**
```typescript
interface ReportConfig {
  // ... existing fields
  audience?: 'coach' | 'athlete' | 'parent';  // default: 'coach'
}
```

**AI Prompt Changes (`ai-insights-service.ts`):**

When audience is 'parent':
```
## Instructions
You are writing for PARENTS of youth athletes, NOT coaches or trainers.

Write in clear, non-technical language that a parent with no sports science
background can understand. Focus on:

1. **What the numbers mean** for their child's development
2. **What's going well** — celebrate specific achievements with context
3. **What to work on** — frame as growth opportunities, not deficiencies
4. **Why continued training matters** — connect metrics to real athletic outcomes
   (making the team, getting faster, reducing injury risk)

TONE: Encouraging, professional, data-backed. Like a doctor explaining test
results — clear, honest, but not alarming.

AVOID: Jargon (percentile ranks are OK, but explain what they mean),
negative framing, comparisons that might discourage.

Keep it to 200-300 words. Use the athlete's first name.
```

When audience is 'athlete':
```
## Instructions
You are writing directly TO the athlete. Use "you" language.
Be motivating and specific. Tell them exactly what to focus on in training.
Keep it short (150-200 words). Be real — athletes respect honesty over hype.
```

**UI Changes:**
- Add "Report Audience" selector in ReportWizard: Coach | Athlete | Parent
- Default to 'coach' for team reports, 'parent' for individual reports
- When sharing to athlete, default audience to 'athlete'
- Label: "Who will read this report?"

**PDF Changes:**
- When audience is 'parent', add a brief "How to Read This Report" section at the top of the PDF explaining what percentiles and benchmarks mean

### Files to Modify
- `packages/api/services/ai-insights-service.ts` — add audience-aware prompts
- `packages/api/routes/report-routes.ts` — pass audience to AI builder
- `packages/web/src/components/reports/ReportWizard.tsx` — add audience selector
- `packages/web/src/components/reports/IndividualReportView.tsx` — show audience badge

---

## Improvement 5: Premium PDF Branding

### Problem
PDFs are generic — no logo, no brand colors, just plain tables. For $75/eval, the deliverable should look premium.

### Solution
Add organization-level branding config (logo, colors, tagline) and apply it to PDF generation.

### Implementation

**Database Changes:**
Add to `organizations` table:
- `brandLogoUrl` text nullable — URL to uploaded logo (use existing file upload if available)
- `brandPrimaryColor` varchar(7) nullable — hex color (e.g., '#1a365d')
- `brandSecondaryColor` varchar(7) nullable — hex color
- `brandTagline` varchar(200) nullable — e.g., "Data-Driven Athletic Development"

**PDF Changes (`report-routes.ts` → `generatePDF()`):**

Header:
- If logo exists: render logo (left) + report title (right) + tagline below
- Use brand colors for table headers, section titles, accents
- Add organization name styled prominently

Footer:
- Replace generic "athletemetrics.io" with "{org name} | Powered by AthleteMetrics"
- Add page numbers

Cover page (for individual reports):
- Full-page branded cover with:
  - Organization logo (centered)
  - "Performance Assessment Report"
  - Athlete name
  - Date
  - Organization tagline

**UI Changes:**
- Add "Branding" section in Organization Settings
- Logo upload (reuse existing upload infrastructure)
- Color pickers for primary/secondary
- Tagline input
- Live preview panel showing a mini PDF mockup

### Files to Modify
- `packages/shared/schema/tables/organizations.ts` — add branding columns
- `packages/api/routes/report-routes.ts` — update `generatePDF()` to use branding
- `packages/web/src/pages/organization-settings.tsx` — add branding UI
- Migration file

---

## Improvement 6: Progress Tracking Over Time (Trend Lines)

### Problem
Individual reports show a single snapshot. Parents and athletes can't see trajectory — are they improving, plateauing, or declining?

### Solution
Add a `trendData` section to individual reports that shows all historical measurements for each metric, enabling trend visualization.

### Implementation

**ReportService Changes:**
Add `getAthleteMetricHistory()` method:
```typescript
async getAthleteMetricHistory(
  athleteId: string,
  organizationId: string,
  metrics: string[],
  startDate?: string
): Promise<Record<string, Array<{
  date: string;
  value: number;
  eventName?: string;
}>>>
```

**Individual Report Data Changes:**
```typescript
interface IndividualReportData {
  // ... existing fields
  trendData?: Record<string, Array<{
    date: string;
    value: number;
    eventName?: string;
  }>>;
}
```

**Report Config Changes:**
```typescript
interface ReportConfig {
  // ... existing fields
  includeTrends?: boolean;  // default: true for individual reports
}
```

**API Changes:**
- When `includeTrends` is true (or not set), include trend data in individual report generation
- Pass trend data to AI insights for context

**AI Prompt Addition:**
```
## Performance Trends
- 40-Yard Dash: 5.40s (Jan 15) → 5.20s (Feb 12) → 4.90s (Mar 8) — consistent improvement
- Vertical Jump: 22.0in (Jan 15) → 21.5in (Feb 12) → 24.5in (Mar 8) — breakout session
```

**UI Changes (IndividualReportView):**
- Add trend chart (line graph) for each metric using existing charting library
- X-axis: date, Y-axis: metric value
- Highlight current report's data point
- Show event names as tooltips on data points

**PDF Changes:**
- Add "Performance Trends" section with a simple text-based trend summary
  (PDF charting is complex — use text: "40yd Dash: 5.40 → 5.20 → 4.90 (3 assessments, trending ↓)")

### Files to Modify
- `packages/api/services/report-service.ts` — add `getAthleteMetricHistory()`
- `packages/api/routes/report-routes.ts` — include trends in generation, AI, and PDF
- `packages/api/services/ai-insights-service.ts` — add trends to prompt
- `packages/web/src/components/reports/IndividualReportView.tsx` — add trend charts
- `packages/web/src/components/reports/AthleteReportView.tsx` — add trend charts (athlete view)

---

## Improvement 7: Fix Hardcoded `isMetricLowerBetter` in AI Helper

### Problem
`report-routes.ts` has a hardcoded `isMetricLowerBetter()` function with a static list of metric codes. The report service already queries the database for this info via `getMetricInfo()`. The AI helper should use the same source of truth.

### Solution
Replace the hardcoded function with a database query, consistent with `report-utils.ts`.

### Implementation

**Changes to `report-routes.ts`:**

Remove the hardcoded `isMetricLowerBetter()` function.

Update `buildReportDataForAI()` to query metric info from the database:
```typescript
// Replace:
lowerIsBetter: isMetricLowerBetter(metricCode),

// With:
lowerIsBetter: await isLowerBetter(metricCode),  // from report-utils.ts
```

Import `isLowerBetter` from `../utils/report-utils`.

Also remove the hardcoded `getMetricUnit()` function and query units from `siteMetrics` table (the data is already available in `teamStatistics[].units`).

### Files to Modify
- `packages/api/routes/report-routes.ts` — remove hardcoded functions, use `report-utils.ts`

---

## Implementation Order

1. **#7 Fix hardcoded metric helper** — smallest change, pure bugfix, no migrations
2. **#1 BTA-aware AI context** — small schema + prompt change, high impact
3. **#4 Parent-friendly language** — prompt-only change, no schema needed
4. **#5 Premium PDF branding** — schema + PDF changes, visual impact
5. **#2 Before/after progress** — medium complexity, high value
6. **#6 Trend lines** — builds on #2, adds historical view
7. **#3 Auto-delivery after events** — most complex, needs job queue

Improvements #7, #1, and #4 can be done in parallel (independent changes).
Improvements #2 and #6 are sequential (#6 extends #2).
Improvement #3 depends on the sharing infrastructure already working (it does).
