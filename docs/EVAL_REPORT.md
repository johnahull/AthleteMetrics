# Eval Report (AM-FEAT-019)

A coach opens an evaluation event, picks an athlete, chooses metrics and sections (with age-group presets and defaults), previews, and downloads a branded PDF. Every generation is saved as a `reports` row (`reportType = 'eval'`). Eval batteries can be saved as templates and applied to a new event.

Design record and reasons: `docs/adr/ADR-002-eval-report-v2.md`. Open items: `docs/EVAL_REPORT_FOLLOWUPS.md`.

Scope of this tree: P1, P2, P3a-d, P4 (#560) and P5.

## What it does

- Uses only the chosen event's **verified** measurements for that athlete in the event's organization. Best value per metric honors `lower_is_better`. The report date is the event's calendar date, and age is taken at that date.
- Derived values (5-0-5 LSI, EUR, COD deficit, single-leg CMJ asymmetry) are recomputed from the event's per-leg bests, never read from stored totals.
- Compares each metric with the athlete's age-group average (above or below), optionally with a college standard marker. When no set applies (males, ages under 11 or over 18, some metrics, missing gender or birth date) it shows value and unit with no gauge.
- Fresh & Healthy panel: Load (coach pick), Balance (5-0-5 LSI wording), Movement (MQI band word). No survey data, no injury wording, no placement recommendation.
- Presets (Middle school, High school, Senior) are chosen from graduation year, then age, else High school.

## API

All routes need a signed-in user. "Writer" means coach, org admin or site admin **in the organization of the event / report / template row** (not the session's primary role). Anyone else gets 404.

### Event routes (`packages/api/routes/event-report-routes.ts`)

| Method | Path | Who | Returns |
|---|---|---|---|
| POST | `/api/events/:eventId/athletes/:athleteId/eval-report/preview` | Writer of the event's org; athlete must have verified measurements in the event | `{ model }`; saves nothing |
| POST | `/api/events/:eventId/athletes/:athleteId/eval-report` | Same | 201 `{ report, model }`; inserts a new `reports` row |
| GET | `/api/events/:eventId/athletes/:athleteId/eval-report/defaults` | Same | `{ source: "saved", reportId, selection, load, coachNote, offered }` or `{ source: "computed", selection, load, coachNote, offered }` |

Request body of preview and save (`evalReportRequestSchema`, `packages/shared/eval-report-config.ts`): `selection` (`preset`, `metricKeys`, `collegeGauge`, `metricCollegeGauge`, `sections`), `load` (`light` / `medium` / `heavy` / null), `coachNote` (max 2000 characters, null clears), `strengthsOverride`, `developmentAreasOverride`, `limiterOverride`. Errors: 400 invalid body or an override naming a metric not in the report; 404 not a writer, no such event, or athlete not measured in the event; 409 event has no organization (site admin only, others get 404); save returns 500 if the built config fails validation (a server fault).

Preview and defaults use the STANDARD limiter (100 per 15 minutes); save uses the MUTATION limiter (20 per 15 minutes).

### Saved report routes (`packages/api/routes/report-routes.ts`, existing routes with eval gates)

| Method | Path | Eval behavior |
|---|---|---|
| GET | `/api/reports` | Eval rows listed only for orgs where the caller is a writer; model stripped from list rows |
| GET | `/api/reports/:id` | Writer of the report's org, else 404 |
| PUT | `/api/reports/:id` | Only `name` and `description`; `config` is immutable |
| GET, POST | `/api/reports/:id/pdf` | Writer only; renders the frozen model |
| POST | `/api/reports/:id/snapshots` | Writer only; creates a public snapshot (link). Off unless the coach asks |
| POST | `/api/reports/:id/share` | Writer only; must name `config.athleteId`; 403 `UNDER_13_SHARE_BLOCKED` when the athlete is under 13 today or has a missing / unparseable / future birth date (P4 guard, all report types) |
| POST | `/api/reports/bulk-distribute` | Eval included; under-13 / unknown-DOB athletes get status `blocked_under_13` and are counted in `blockedUnder13` (same for `/share-bulk`, which rejects eval with 400) |
| POST | `/api/reports/:id/share-bulk` | 400 for eval |
| POST | `/api/reports/:id/generate-insights`, PATCH `/api/reports/:id/insights` | 400 for eval |
| GET | `/api/my/reports`, `/api/my/reports/:shareId` | The athlete sees an eval only if it was explicitly shared and `evalShareBlocked` (under 13 today or unknown DOB) does not apply |
| GET | `/api/events/:eventId/reports` | Event report access check; filtered in SQL by organization and `config->>'eventId'`; eval rows have `config.model` dropped (event date kept) |

Other report routes (delete, pin, archive, generate, snapshot list and delete, shares, bulk archive and delete) apply the same writer gate.

### Template and settings routes (`packages/api/routes/eval-template-routes.ts`)

| Method | Path | Who | Returns |
|---|---|---|---|
| GET | `/api/organizations/:orgId/eval-templates` | Writer of `:orgId` | Live templates of the org plus the global default |
| POST | `/api/organizations/:orgId/eval-templates` | Writer of `:orgId` | 201 template (metrics as logical keys; 400 unknown metrics, 409 duplicate name) |
| POST | `/api/events/:eventId/eval-templates` | Writer of the event's org | 201 template made from the event's metrics (400 if none) |
| GET | `/api/eval-templates/:id` | Writer of the template's org (any writer for the global default) | Template |
| PATCH | `/api/eval-templates/:id` | Writer of the template's org; site admin only for the global default (403) | Template |
| POST | `/api/eval-templates/:id/archive` | Same | Template |
| DELETE | `/api/eval-templates/:id` | Same; the global default cannot be deleted (409) | 204 |
| POST | `/api/events/:eventId/apply-eval-template` | Writer of the event's org | `{ added, skipped, alreadyPresent }`; body `{ templateId, includeOptional? }` |
| GET | `/api/organizations/:orgId/eval-report-settings` | Writer of `:orgId` | `{ organizationId, presets, lastSelection }` (synthetic default if none stored) |
| PUT | `/api/organizations/:orgId/eval-report-settings` | Writer of `:orgId` | Upserted settings |

Reads use the STANDARD limiter; writes use MUTATION (20 per 15 minutes).

## Data model

`reports` row (`packages/shared/schema/tables/reports.ts`), `reportType = 'eval'`, `config` validated by `evalReportConfigSchema`:

```
eventId, athleteId            ids (athleteId is not a foreign key)
metrics                       metric codes shown
selection                     what the coach chose (preset, metricKeys, collegeGauge, metricCollegeGauge, sections)
load                          "light" | "medium" | "heavy" | null
coachNote                     string | null (max 2000)
strengthsOverride, developmentAreasOverride, limiterOverride   optional
model                         the frozen EvalReportModel (athlete, eventDate, metrics, freshAndHealthy,
                              strengths, developmentAreas, limiter, coachNote, selection)
```

`eval_battery_templates` (migration `migrations/0153_add_eval_report_templates.sql`; down: `..._down.sql`): `organization_id` null = global default; `sport`, `name`, `metrics` jsonb of `{ metricKey, isRequired, displayOrder, customLabel? }` using logical keys; `archived_at`. Names are unique per organization among live rows. The seed adds "Soccer eval (yards)" and skips codes missing from `site_metrics`.

`org_eval_report_settings`: one row per organization (`organization_id` unique, cascade); `presets` jsonb (per-preset overrides), `last_selection` jsonb.

Migration number 0153 is provisional (see `docs/MIGRATION_SYSTEM_REMEDIATION.md`).

## Extending

**Add a metric to the default template.** Edit migration data only for new databases; for existing ones use the template PATCH route as a site admin (the default is global). The metric needs a `site_metrics` code. Use the logical key if one exists, else the literal code.

**Add a logical key.** (1) Add it to `EVAL_METRIC_CODES` in `packages/api/services/eval-report/metric-key-map.ts` if the report itself should know it (it then needs entries in `GROUPS` in `selection.ts` and `METRIC_LABELS` in `copy.ts`, which are typed on `EvalMetricKey`), or only to `TEMPLATE_METRIC_CODES` in `template-keys.ts` if it is a battery-only key. (2) Never spell a template-only key like the code it resolves to (`keyForCode` throws on collisions). (3) The code must be inserted by a `site_metrics` seed migration or `metric-key-map.test.ts` fails. (4) A metric that must not get a comparison goes in `NO_TIER_CODES` in `eval-report/tier-match.ts`. (5) To make a key a default headline metric, edit `HEADLINE_KEYS` in `selection.ts`.

Measured metrics outside the key map are still offered, unchecked, with their code as an id (`OTHER_METRIC_LABELS` and `OTHER_GROUPS` give them labels and groups).

## How the PDF is built

`packages/api/utils/eval-report-pdf.ts`: `renderEvalReportPdf(model, org)` fetches the org logo (SSRF-safe helper from `report-branding-utils.ts`) and calls `buildEvalReportPdf`, which returns the jsPDF document and the position of every block (`kind`, `page`, `top`, `bottom`). It draws only the frozen model, with no database reads. Sections are measured then flowed down the A4 pages; gauge rows are never split, and only the headline and retest-trend sections may break between rows. Text goes through `winAnsi` (Helvetica is WinAnsi only; other characters print as `?`). The radar uses jsPDF primitives. Load and Balance wording is shared with the web view through `packages/shared/eval-report-copy.ts` (`LOAD_LABELS`, `BALANCE_LABELS`, `balanceText`, re-used by `services/eval-report/copy.ts` and `components/reports/EvalReportView.tsx`); both draw the college gauge only when the metric's `collegeGauge === true`. Template wording is in `packages/api/services/eval-report/copy.ts`.

The PDF is served by `GET`/`POST /api/reports/:id/pdf` (`sendEvalReportPdf`) and, for snapshots, `generatePDF` dispatches on `reportData.reportType === 'eval'`.

## Testing

Commands below are the repo scripts with a path filter; they were not run while writing this guide. The unit paths are matched by the `include` patterns in `vitest.unit.config.ts` (`packages/api/**/__tests__/**`, `packages/shared/__tests__/**`), and the integration paths by `tests/integration/**` in `vitest.integration.config.ts`.

```bash
# Unit: domain modules, config schemas, PDF block positions, web helpers
npm run test:unit -- packages/api/services/eval-report packages/api/services/__tests__/eval-report-service.test.ts \
  packages/api/utils/__tests__/eval-report-pdf.test.ts packages/shared/__tests__/eval-report-config.test.ts \
  packages/shared/__tests__/eval-template-schemas.test.ts

# Integration (needs a Postgres in .env.local)
npm run test:integration -- tests/integration/eval-report-routes.test.ts tests/integration/eval-report-access.test.ts \
  tests/integration/eval-report-pdf.test.ts tests/integration/eval-templates.test.ts tests/integration/coppa-eval-reports.test.ts

# E2E (local; see below)
npx playwright test tests/e2e/eval-report.spec.ts --config=playwright.testing.config.ts
```

Two database shapes matter for the integration tests:

- **Push-only**: CI builds its database with `npm run db:push` and the default seed, **no manual migrations**. The eval integration tests create any missing `site_metrics`, benchmark and template rows themselves and delete only what they created. Tests must keep working on this shape.
- **Fully migrated**: `db:push` (or `db:migrate`) plus `npm run db:migrate:manual`, which applies 0153 and the seeds. `docs/MIGRATION_SYSTEM_REMEDIATION.md` explains the dual system; replaying `db:migrate` on a fresh database fails, so use push plus manual migrations on a private Postgres.

Use `tests/helpers/purge-test-rows.ts` in new integration tests.

**E2E**: `tests/e2e/eval-report.spec.ts` creates its data through the API and cleans up. The CI E2E suite is red (issue #490), so run this spec locally against a database with the site metrics and the default "Soccer eval (yards)" template, and say so in the PR. Add it to CI only once the suite is green.

Screenshots for UI changes go in `screenshots/` per `CLAUDE.md`.

## Troubleshooting

| Symptom | Cause |
|---|---|
| A metric is not offered in the dialog | The athlete has no **verified** measurement for it in this event and organization (other events and unverified rows are ignored). |
| A metric shows value but no gauge | No age-group set matched: athlete is male, under 11 or over 18 at the event date, gender is not Male/Female, birth date or sport missing, sport does not match the set exactly, the metric is in `NO_TIER_CODES`, or no benchmark row exists for that metric and sex. |
| No tier **names** anywhere | By design; age-group sets are single Average rows and the PDF never prints tier names. |
| College gauge missing | Hidden under age 14 and in the Middle school preset unless turned on; also needs a D1 row whose name matches `/average/i` for the athlete's sex and sport. |
| Balance line missing | Fewer than both 5-0-5 legs were tested, or the Fresh & Healthy section is off. It shows a neutral label (percentage only) when no LSI set exists for the athlete's sex. |
| Movement missing | The event has no `MQI_TOTAL` (verified), or MQI is not among the selected metrics. |
| 404 for a coach | The caller is not a coach / org admin / site admin **in the event's or report's organization**, the athlete has no verified measurements in the event, or the event does not exist. 404 is used on purpose. |
| 409 on preview or save | The event has no organization (site admin sees 409, others 404). |
| Share to athlete refused | Athlete is under 13 today or has a missing, unparseable or future birth date. Being flagged `isMinor` or under 13 at the event date does not block a share (it restricts the public link instead). Send the PDF to a parent. |
| A name prints with `?` | Characters outside WinAnsi; embedded font not yet added. |
| Template apply returns `skipped` | The key resolves to a code absent from `site_metrics`. |

## Release gate

Before a release that touches reports or eval, confirm **athletes (and other org members who are not coach, org admin or site admin of the report's organization) cannot read eval reports**. The P3c gates are the guarantee:

- `canAccessEvalRow` (`packages/api/routes/eval-report-access.ts`, imported by `report-routes.ts`) on every report route that loads a report row, answering 404.
- `GET /api/reports` list filter; `stripEvalModel` on list payloads.
- `canOpenRestrictedEval` for restricted public snapshots (writer, the athlete, or a parent actively linked to that athlete).
- `evalShareBlocked` and `dropBlockedEvalShares` for what an athlete is shown.
- Run `tests/integration/eval-report-access.test.ts`.

Any new route that touches reports must gate eval rows with `canAccessEvalRow`.

### Rollout and rollback

There is no feature flag (decision: the feature is additive, manual and writer-only). Roll out by enabling nothing special: generate a few reports on the Railway preview and a test organization first, compare the numbers and the PDF with the expected values, then release.

Rolling back only part of the stack once eval reports exist is unsafe: the old report routes have no eval access gate, so any org member could read the saved rows. Safe order: deactivate eval snapshots (`report_snapshots.is_active = false`) and archive or delete `reports` rows with `report_type = 'eval'` first, then revert the code, and only then (if at all) run the 0153 down migration. Revert the stack as a whole, never P3c on its own.

## COPPA retention (P3d)

Eval rows name the athlete only in `config.athleteId` (no foreign key), so the user cascade never reaches them. `coppa-deletion-service.ts` step 4c deletes them (snapshots and shares cascade), `coppa-export-service.ts` includes them in the `evalReports` export section, and `profile-merge-service.ts` step 8b re-points `config.athleteId` on merge (`summary.evalReportsTransferred`). All three select by athlete id across organizations. Test: `tests/integration/coppa-eval-reports.test.ts`. Normal (non-COPPA) user deletion does not remove eval rows.
