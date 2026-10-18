# Report templates

A report template saves the metrics, benchmark sets, individual benchmark picks and chart choices from the report wizard, so a coach picks it in step 1 ("Start from template") instead of re-choosing them for every team or individual report.

## What a template stores

- `metrics`: metric codes (at least one).
- `benchmarkSetIds`: sets are stored by id, so a new report uses each set's current contents. Saved reports stay frozen: the wizard expands the sets into `config.benchmarks.site/custom` and records `setIds` / `setNames`.
- `siteBenchmarkIds`, `customBenchmarkIds`: individual picks.
- `charts`: `{ team?, individual? }`. One template fits both report types; the wizard applies the entry for the current type and saving merges the current type over the other one.

Not stored: timeframe, filters, audience, athletes, composite weights.

In the wizard the report gets the deduped union of every chosen set's items and the individual picks.

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/organizations/:orgId/report-templates` | list |
| POST | `/api/organizations/:orgId/report-templates` | 201; 409 on duplicate name |
| PATCH | `/api/report-templates/:id` | 409 on duplicate name; `description: null` clears it |
| DELETE | `/api/report-templates/:id` | 204 |

Schemas: `packages/shared/report-template-schemas.ts`. Table: `reportTemplates` (migration `0166_add_report_templates.sql`, number provisional). Web hooks: `packages/web/src/lib/report-templates-api.ts`.

## Authorization

Templates are shared org-wide. Coach, org admin and site admin of the template's own organization can read and write (`isMeasurementWriterRole(getOrgRole(user, orgId))`). Everyone else, including athletes and non-members, gets 404.

## Stale ids

When a template is applied, ids that no longer exist are dropped (not routed through `splitBenchmarkSelection`, which keeps stale ids) and counted in one "N items no longer available" note:

- metrics must be in the org's enabled metrics;
- individual picks must be in the org's enabled benchmarks;
- set ids must be in the org's visible set list, and the set detail must not return 404 (a 404 later in step 6 is dropped and counted too).

The template select is disabled until the metric, benchmark and set lists have loaded, so a slow list is never reported as "gone". Other set load errors keep Create blocked and offer Retry.

## Tier-group warning

Overlapping sets can bring more than one tier group for a single metric. The tier-distribution chart handles that, but the team table badge and the PDF label use only the first tier group. Step 6 shows a warning when the chosen benchmarks span more than one tier group for any metric.

## Limits

Name 1 to 200 characters and unique per organization; description up to 2000; at most 200 ids per list.
