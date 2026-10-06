# ADR-001: Measurement media_url and MQI Capture

**Date**: 2026-10-06
**Status**: Accepted

First ADR in `docs/adr/`. Implements AM-FEAT-015 (branch `feature/mqi-entry-ui`; migrations 0146-0148).

## Context

Coaches score Movement Quality Index (MQI) screens per athlete: 8 movement patterns plus 4 transition items, each scored on an ordinal 0-3 scale, with optional per-pattern notes and a reference video. The existing measurement pipeline assumed positive values, wrote event results directly, and treated every metric as eligible for percentiles, benchmarks and leaderboards. Ordinal rubric scores do not fit those assumptions, and a video link is sensitive data for minors.

## Decision

1. **Metrics (0146)**: seed 12 ordinal metrics `MQ_*` (0-3) and two derived totals, `MQI_TOTAL` (8 patterns, 0-24) and `MQ_TRANSITION_TOTAL` (4 `MQ_TRANS_*`, 0-12). Unit is `score`.
2. **Generic `measurements.media_url` (0147)**: nullable column, https-only (validated with `isSafePublicUrl`), max 2048 chars. Generic rather than MQI-specific so other metrics can attach media later. Excluded from the public report, snapshot, CSV export, LLM payloads, COPPA export, and parent/unified views (`packages/api/utils/measurement-redaction.ts`).
3. **Latest-event selection (0148)**: `calculationConfig.sourceSelection = 'latest_event'` on both totals. For a date, the latest event wins, and a total is computed only when all its source metrics come from that same event.
4. **Metric-aware zero validation**: 0 is accepted when `site_metrics.validation_min <= 0`; all other metrics still require positive values (`packages/shared/measurement-value-validation.ts`).
5. **Exclusion from comparisons**: MQ metrics are excluded from peer percentiles, benchmarks and leaderboards (`packages/shared/peer-comparison-exclusions.ts`).
6. **Event writes via `MeasurementService`**: event data entry now goes through the service (unit handling, validation, derived calculator) instead of direct inserts. MQ rows are upserted per (athlete, metric, event). New `DELETE /api/events/:eventId/measurements/:measurementId`. Frozen events remain frozen.
7. **Notes and UI**: per-pattern notes go in `measurements.notes`. UI is the `MovementQualityPanel` dialog on event data entry.

Rejected: a dedicated MQI table (duplicates measurement history, permissions and exports); raw-value percentiles for ordinal scores (not meaningful).

## Consequences

### Positive
- MQI reuses measurement permissions, history, audit and derived-metric machinery.
- `media_url` is reusable and consistently redacted in one place.
- Zero-valid metrics are possible without loosening validation for timed/jump metrics.

### Negative
- Event mutation rate limit (20 per 15 min per user) can return 429 when saving many athletes in one sitting.
- Athlete self-entered MQ scores are unverified and do not feed the totals.
- Redaction is allowlist-by-call-site: any new read path exposing measurements must apply `measurement-redaction`.

### Neutral
- v1 out of scope: score bands, report surfacing, BTB / AM-FEAT-014 quadrant, video upload (URL only), structured hard-fault.
- Manual migration numbers 0144/0145 are reserved for AM-FEAT-016.
- Dev server is unstyled when run from repo root (pre-existing, unrelated).
