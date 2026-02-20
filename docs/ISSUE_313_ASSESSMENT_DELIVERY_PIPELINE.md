# Issue #313 — Assessment Results Delivery Pipeline

## What the Issue Asks For

When an athlete's event registration is marked complete and all required metrics for their tier (Quick Screen / General / Advanced) are present, automatically generate a report card and deliver it via push notification and email. No manual coach step required.

SMS and parent contact support are deferred to Phase 3.

---

## Current State

### Exists — Fully Reusable

| Component | Location | Notes |
|-----------|----------|-------|
| `reports` + `reportShares` tables | `packages/shared/schema/tables/reports.ts` | Supports individual reports, archiving, sharing with athletes |
| `reportSnapshots` table | Same file | Permanent shareable URL via `publicToken` — satisfies "shareable link" AC |
| `ReportService` | `packages/api/services/report-service.ts` | Calculates athlete performance, percentiles, benchmark comparisons |
| Push notification system | `packages/api/services/push-notification-service.ts` | `sendToUser()` + `notificationPreferences` table |
| Email service | `packages/api/services/email-service.ts` | Resend-based, `sendReportSharedNotification()` already exists |
| `notificationPreferences` table | `packages/shared/schema/tables/notifications.ts` | Has `pushReportShared`, `emailReportShared` booleans |
| `notificationType` enum | `packages/shared/schema/enums.ts` | Has `report_shared` type |
| Measurement notification pattern | `packages/api/services/measurement-notification-service.ts` | Error-handling pattern to copy |
| Events + `eventRegistrations` | `packages/shared/schema/tables/events.ts` | `status` field with `completed` — the trigger point |
| Derived metric calculator | `packages/api/services/derived-metric-calculator.ts` | Auto-calculates CODD, RSI, F-v, APPROACH_REACH, BTB on ingestion |
| `IndividualReportConfig` | `packages/api/routes/report-routes.ts` | Supports `athleteId`, `metrics[]`, `benchmarks`, `eventId` |
| Athlete-facing report pages | `packages/web/src/pages/my-report-view.tsx`, `public-report.tsx` | Views already exist |

### Missing — Needs Building

1. **Assessment tier definitions** — nothing defines which metric codes = Quick Screen / General / Advanced complete
2. **Assessment completion detection** — event registration status → `completed` has no downstream automation
3. **`assessment-delivery-service.ts`** — the orchestrator that ties everything together
4. **BTA-branded email template** — `sendReportSharedNotification()` uses generic language; need "Your Big Time Assessment Results Are Ready"
5. **`assessment_results` notification type** — not in `notificationTypeEnum`
6. **Upsell CTA in report UI** — Quick Screen/General cards need contextual next-step prompt
7. **Historical delta rendering** — "vs. your last assessment" badges on each metric

---

## Architecture

### Trigger Point

Wire into `event-registration-routes.ts` when `eventRegistrations.status` is set to `'completed'`. Fire-and-forget — do not block the response:

```ts
assessmentDeliveryService
  .onAthleteAssessmentComplete(eventId, athleteUserId, req.session.user.organizationId)
  .catch(err => console.error('[assessment-delivery] Error:', err));
```

The registration-completion trigger is cleaner than hooking into every measurement write. It's intentional and maps to the documented assessment workflow (§7 of `docs/assessment-system.md`).

### Tier Completeness

Define as a constants file — these are stable BTA business logic, no DB table needed:

```ts
// packages/shared/constants/assessment-tiers.ts
export const ASSESSMENT_TIERS = {
  quick_screen: {
    soccer:     ['DASH_10YD', 'VERTICAL_JUMP'],
    volleyball: ['DASH_10YD', 'VERTICAL_JUMP', 'APPROACH_JUMP'],
  },
  general: {
    soccer:     ['DASH_10YD', 'DASH_20YD', 'FLY10_TIME', 'AGILITY_505_L', 'AGILITY_505_R', 'VERTICAL_JUMP', 'RSI', 'GCT'],
    volleyball: ['DASH_10YD', 'VERTICAL_JUMP', 'APPROACH_JUMP', 'BLOCK_JUMP', 'AGILITY_505_L', 'AGILITY_505_R', 'RSI', 'GCT'],
  },
  advanced: {
    soccer:     [...generalSoccer, 'ISO_IMTP', 'TB_DL_3RM'],
    volleyball: [...generalVolleyball, 'ISO_IMTP', 'TB_DL_3RM', 'STANDING_REACH'],
  },
} as const;

export type AssessmentTier = 'quick_screen' | 'general' | 'advanced';
```

Check order: advanced → general → quick_screen. Use the highest completed tier.

### Report Card as Standard `reports` Record

Do not create a separate `assessmentCards` table. Auto-generate a `reports` record:
- `reportType = 'individual'`
- `name = 'Quick Screen Results — Feb 2026'` (generated)
- `config = { tier, eventId, athleteId, metrics, benchmarks }` — `config` is JSONB, `tier` field costs nothing
- Immediately create a `reportSnapshots` record for the permanent shareable URL
- Use existing `reportShares` to push to the athlete

This reuses all existing report infrastructure and athlete-facing UI with no new tables.

### Upsell CTA

No schema change needed — `config.tier` in the JSONB config drives the UI. When `tier !== 'advanced'`, render the CTA card.

---

## Implementation Plan

### Phase 1 — Core Pipeline

**1. Create `packages/shared/constants/assessment-tiers.ts`**
Tier-to-metric-code mappings for soccer and volleyball, plus derived metrics to surface per tier.

**2. Modify `packages/shared/schema/enums.ts`**
Add `'assessment_results'` to `notificationTypeEnum`.

**3. Create `packages/api/services/assessment-delivery-service.ts`**

```ts
async function onAthleteAssessmentComplete(
  eventId: string,
  athleteUserId: string,
  organizationId: string
): Promise<void>
```

Steps:
1. Fetch athlete's sport from `athleteProfiles`
2. Query `measurements` where `eventId = X AND userId = Y` — collect present metric codes
3. Detect which tier is complete (advanced → general → quick_screen)
4. Return early if no tier is complete
5. Call `ReportService.generateIndividualReport()` with tier-appropriate metrics + BTA D1 benchmarks
6. Insert `reports` record with `config.tier`, `config.eventId`
7. Insert `reportSnapshots` record — `publicToken = nanoid(12)`, `expiresAt = +5 years`
8. Insert `reportShares` record
9. Call `pushNotificationService.sendToUser()` — `type: 'assessment_results'`, deep link `/my-reports`
10. Check `notificationPreferences.emailReportShared` → call `emailService.sendAssessmentResultsNotification()` if true
11. All errors caught and logged — never throws (mirror `measurement-notification-service.ts`)

**4. Modify `packages/api/services/email-service.ts`**

Add `AssessmentResultsEmailData` interface:
```ts
interface AssessmentResultsEmailData {
  athleteName: string;
  tier: AssessmentTier;
  eventName: string;
  reportUrl: string;
  topMetrics: Array<{ label: string; value: string; benchmark?: string }>;
  upsellCta: boolean;
}
```

Add `sendAssessmentResultsNotification()` with BTA-branded HTML template. Shows top 3 metrics with D1 benchmark comparisons, CTA button to report. For quick_screen/general, includes upsell block.

**5. Modify `packages/api/routes/event-registration-routes.ts`**
Find the route that sets `status = 'completed'`. Add fire-and-forget call to `assessmentDeliveryService`.

---

### Phase 2 — UI Enhancements

**6. Modify `packages/web/src/components/reports/AthleteReportView.tsx`**
- Upsell CTA: when `report.config.tier !== 'advanced'`, render "Ready for the full picture? Book your Advanced Assessment →"
- Historical deltas: when a previous assessment snapshot exists for same athlete + sport, show `+0.3 in` / `-0.05 s` badges per metric

---

### Phase 3 — Parent Contact + SMS (Follow-on, separate PR)

- Add `athleteGuardians` table: `{ id, athleteUserId, name, email, phone, relationship, notifyOnReport }`
- Add `'sms'` to `notificationChannelEnum`
- Add `smsEnabled`, `smsPhone` to `notificationPreferences`
- Create `packages/api/services/sms-service.ts` (Twilio)
- Wire SMS into `assessment-delivery-service.ts`

---

## Files Summary

| File | Action |
|------|--------|
| `packages/shared/constants/assessment-tiers.ts` | **Create** |
| `packages/shared/schema/enums.ts` | Modify — add `assessment_results` |
| `packages/api/services/assessment-delivery-service.ts` | **Create** |
| `packages/api/services/email-service.ts` | Modify — add template + method |
| `packages/api/routes/event-registration-routes.ts` | Modify — wire trigger |
| `packages/web/src/components/reports/AthleteReportView.tsx` | Modify — upsell CTA + historical deltas |

---

## Key Constraint

The `assessmentDeliveryService` must resolve `organizationId` from `events.organizationId` — the `reports` table has a non-nullable FK to organizations. Always scope to the event's org, not the session user's org.

---

## Verification Checklist

- [ ] Create test event, add athlete, enter all Quick Screen soccer metrics
- [ ] Mark registration as `completed` via API
- [ ] Confirm `reports` record created with `config.tier = 'quick_screen'`
- [ ] Confirm `reportSnapshots` record with public token
- [ ] Confirm `reportShares` record linking to athlete
- [ ] Push notification received (test subscription)
- [ ] Email delivered (Resend dashboard)
- [ ] `/my-reports` shows the report card as the athlete
- [ ] `athletemetrics.io/report/<token>` — public shareable URL works
- [ ] Upsell CTA renders on Quick Screen and General cards
- [ ] Run second assessment — historical delta badges appear
