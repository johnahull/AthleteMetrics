# Metric Explanations Editor — Phase 2 Design Spec

**Issue:** #367 (Phase 2)
**Date:** 2026-04-17
**Status:** Draft

## Problem

Phase 1 (PR #369) shipped metric explanations in reports with hardcoded prose content. Site admins cannot customize the explanation text for built-in metrics, and org admins can only set a single `description` field for custom org metrics. There is no UI for editing explanation content.

## Goals

1. Site admins can edit the prose (title, short description, what it measures, why it matters) for any built-in metric
2. Org admins can write richer explanations for their custom org metrics via the existing metric form
3. Partial overrides — a site admin can change one field while keeping the rest at built-in defaults
4. "Reset to default" reverts any override cleanly

## Non-Goals

- Audience-aware copy variants (dropped from scope)
- Unifying `MetricExplanation` and `MetricEducation` types (deferred)
- Editing `unitNote` or `directionOfBetter` (derived from metric definition)

## Design

### Database

**New table: `site_metric_explanations`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| metric_code | varchar(100) | unique, not null |
| title | text | nullable — null = use built-in |
| short_description | text | nullable |
| what_it_measures | text | nullable |
| why_it_matters | text | nullable |
| updated_by | uuid | FK → users.id |
| created_at | timestamp | default now() |
| updated_at | timestamp | default now() |

All prose fields are nullable. A null field means "fall through to the built-in default." This enables partial overrides — e.g. only change `whyItMatters` for FLY10_TIME while keeping the other three fields at their defaults.

**"Reset to default" = DELETE the row.** The built-in is always the fallback.

**Extended columns on `custom_org_metrics`:**

| Column | Type | Notes |
|--------|------|-------|
| short_description | text | nullable, new |
| what_it_measures | text | nullable, new |
| why_it_matters | text | nullable, new |

These supplement the existing `description` field. When present, `what_it_measures` takes precedence over `description` for the glossary.

### Resolver Chain

The existing `getMetricExplanation()` function in `packages/shared/metric-explanations/index.ts` gains a per-field merge:

```
For each field (title, shortDescription, whatItMeasures, whyItMatters):
  1. Site admin override → if non-null for this field, use it
  2. Built-in default → if metric code is a built-in, use its value
  3. Custom org metric → for non-built-in codes, use org-level fields
  4. Generic placeholder → last resort
```

`unitNote` and `directionOfBetter` bypass this chain entirely — they're always derived from the metric definition.

### API

**Site Admin Endpoints** (new route file: `admin-metric-explanation-routes.ts`)

All protected by `requireAuth` + `requireSiteAdmin`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/metric-explanations` | List all built-ins merged with overrides |
| PUT | `/api/admin/metric-explanations/:code` | Upsert override (partial) |
| DELETE | `/api/admin/metric-explanations/:code` | Reset to default |

GET returns each metric with `hasOverride: boolean` and `overrideFields: string[]` so the UI can show which fields have been customized.

PUT accepts a partial body — only sends changed fields. Setting a field to `null` clears that specific override while keeping others intact.

**Org-Level Extension** (existing `custom-org-metric-routes.ts`)

Extend the existing Zod schemas to accept `shortDescription`, `whatItMeasures`, `whyItMatters`. No new endpoints.

### Frontend

**Site Admin Editor Page** (`/metric-explanations`)

Follows the `admin-wellness-templates.tsx` pattern:
- Card grid showing all built-in metrics (currently 8, dynamically from `BUILT_IN_METRIC_EXPLANATIONS`)
- Each card shows title, short description preview, and an "Edited" badge when an override exists
- Click → editor dialog with 4 textarea fields
- Each field shows built-in default as placeholder text
- Per-field "Reset" and a "Reset All" button
- Live markdown preview pane (reuses `react-markdown` + `rehype-sanitize`)

**Custom Org Metric Form Extension**

Add an "Explanations" tab (4th tab) to `CustomOrgMetricForm.tsx` with three textareas: Short Description, What It Measures, Why It Matters. Optional — org admins don't have to fill these.

### Report Service Integration

`getMetricExplanations()` in `report-service.ts` is updated to query `site_metric_explanations` and pass results as `siteOverrides` to the resolver. Reports immediately reflect edits; snapshots remain frozen at creation time.

### Security

- All site-admin endpoints: `requireAuth` + `requireSiteAdmin`
- Org endpoints: existing org-admin access check
- All text: `react-markdown` + `rehype-sanitize` (no `dangerouslySetInnerHTML`)
- Existing XSS integration test validates the server-stores-raw / client-sanitizes pattern

## Migration

Single migration `0023_add_site_metric_explanations.sql`:
1. CREATE TABLE `site_metric_explanations`
2. ALTER TABLE `custom_org_metrics` ADD COLUMN (x3)

Non-destructive, additive-only. Safe to run on production with no downtime.

## Testing Strategy

- **Unit:** Per-field merge logic, null fallthrough, full override chain
- **Integration:** CRUD on admin endpoints, 403 for non-admins, report generation with overrides, snapshot freezing
- **E2E:** Admin navigates to editor, edits metric, resets, verifies in report; org admin fills explanation tab
