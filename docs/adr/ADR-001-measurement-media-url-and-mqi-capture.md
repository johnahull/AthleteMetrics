# ADR-001: Measurement media_url and MQI Capture

**Date**: 2026-10-06
**Status**: Accepted

First ADR in `docs/adr/`. Implements AM-FEAT-015 (branch `feature/mqi-entry-ui`; migrations 0146-0149).

## Context

Coaches score Movement Quality Index (MQI) screens per athlete: 8 movement patterns plus 4 transition items, each scored on an ordinal 0-3 scale, with optional per-pattern notes and a reference video. The existing measurement pipeline assumed positive values, wrote event results directly, and treated every metric as eligible for percentiles, benchmarks and leaderboards. Ordinal rubric scores do not fit those assumptions, and a video link is sensitive data for minors.

## Decision

1. **Metrics (0146)**: seed 12 ordinal metrics `MQ_*` (0-3) and two derived totals, `MQI_TOTAL` (8 patterns, 0-24) and `MQ_TRANSITION_TOTAL` (4 `MQ_TRANS_*`, 0-12). Unit is `score`. The calculated totals cannot be entered manually.
2. **Generic `measurements.media_url` (0147)**: nullable column, https-only public host (`isSafePublicUrl`), no credentials or whitespace, stored in canonical form, max 2048 chars (also a DB CHECK). Generic rather than MQI-specific so other metrics can attach media later. It is kept out of public payloads in two ways: CSV, LLM and COPPA exports build explicit field lists without it, and the redaction helpers in `packages/api/utils/measurement-redaction.ts` (`omitMediaUrl`, `omitMediaUrlFromRows`, `stripMediaUrlDeep`) are applied by the parent view (`parent-routes.ts`), the unified cross-org views (`global-athlete-service.ts`) and public report snapshots (`report-service.ts`). The general measurement list queries return it to org members on purpose.
3. **Latest-event selection (0148)**: `calculationConfig.sourceSelection = 'latest_event'` on both totals. Only verified scores count. For a date, the latest event wins, ranked by event start time (any event outranks scores without one; entry order never decides), and a total is computed only when all its source metrics come from that same event. If the latest event is incomplete, the existing total for that date is deleted.
4. **Zero values only for MQ metrics**: 0 is accepted for MQ codes (prefix match in `packages/shared/peer-comparison-exclusions.ts`) whose `site_metrics.validation_min <= 0`, with a range and whole-number check; every other metric keeps the positive-only rule, including existing metrics seeded with `validation_min = 0` (`packages/shared/measurement-value-validation.ts`). The same check runs on the import write path.
5. **Exclusion from comparisons**: MQ metrics are excluded from peer percentiles, report percentiles / team averages / rankings / composite index, most-improved, benchmarks (create and update) and leaderboards (`packages/shared/peer-comparison-exclusions.ts`).
6. **Event writes via `MeasurementService`**: event data entry goes through the service (unit handling, validation, derived calculator) instead of direct inserts. MQ scores are one row per (athlete, metric, event), edited in place under an advisory lock, with a partial unique index as backstop (0149), and always use the event's calendar date. No athlete notifications or achievements before results are published. The panel saves one athlete atomically with `PUT /api/events/:eventId/athletes/:userId/movement-quality`; `DELETE /api/events/:eventId/measurements/:measurementId` also exists. Frozen events remain frozen.
7. **Notes and UI**: per-pattern notes go in `measurements.notes`. UI is the `MovementQualityPanel` dialog on event data entry.
8. **Coach-only MQ scores and clips**: athletes may not enter MQ scores (R2) or attach clips (R1). `MeasurementService` enforces both on create, batch and update, so every route that writes through it is covered. For an athlete-role user it rejects any MQ code (the same `isMovementQualityMetric` predicate, including moving an entry onto an MQ metric) and any non-empty `mediaUrl`; omitting or clearing `mediaUrl` (null or empty string) is still allowed. `POST` / `PUT /api/measurements` answer **403** `{ message }`, the status the measurement routes already use for role restrictions. The CSV measurement import rejects an athlete's MQ row before athlete matching. Event measurement routes, including the panel save, were already limited to event managers (site admin, or coach / org admin of the event's organization). In the UI, event data entry renders only for event managers, and the athlete self-entry form does not list MQ metrics for athletes. Coaches, org admins and site admins are unaffected.

Rejected: a dedicated MQI table (duplicates measurement history, permissions and exports); raw-value percentiles for ordinal scores (not meaningful).

## Consequences

### Positive
- MQI reuses measurement permissions, history, audit and derived-metric machinery.
- `media_url` is reusable; exports never select it, and the views that pass rows through strip it.
- Zero-valid metrics are possible without loosening validation for timed/jump metrics.

### Negative
- Redaction is allowlist-by-call-site: a new read path that exposes measurements must use an explicit field list without `mediaUrl` or one of the redaction helpers.
- Event measurement mutations are rate limited per user at 100 per 15 minutes; very large sessions can still reach it.
- Down migrations are manual (`apply-manual-migrations.js` skips `*_down.sql`): 0146 down refuses while MQ data or configuration references the metrics, 0147 down destroys stored links, 0148 down removes latest-event selection, 0149 down drops the unique index.

### Neutral
- Open item M4 (unverified athlete MQ scores never produce a total) is resolved by decision 8: athletes cannot create MQ scores, so no unverified athlete score can sit in a pattern set and the totals' verified-only rule needs no change.
- v1 out of scope: score bands, report surfacing, BTB / AM-FEAT-014 quadrant, video upload (URL only), structured hard-fault.
- Manual migration numbers 0144/0145 are reserved for AM-FEAT-016.
