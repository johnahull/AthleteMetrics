# Eval Report follow-ups (AM-FEAT-019)

Prioritized open items after P1-P6. Size: S under half a day, M 1-2 days, L more. Context: `docs/adr/ADR-002-eval-report-v2.md`, `docs/EVAL_REPORT.md`. Items marked "(unverified)" were not re-checked against code while writing this list.

## Before or at merge

| # | Item | Why | Size | Where |
|---|---|---|---|---|
| 1 | Merge order and renumbering of migration 0153 | 0153 is provisional. 0151 is claimed twice (yard-benchmark description rewrite and the AM-FEAT-018 momentum branch). Order: momentum (0152) first, then eval renumbered to the next free number. When renumbering edit: both SQL file names (`0153_add_eval_report_templates.sql` and `_down.sql`); the `DELETE FROM manual_migrations WHERE migration_name = ...` line in the down file; `tests/migrations/0153-eval-report-templates.test.ts` (file names and `startsWith('0153_')`); the NOTICE text in the up file; `docs/MIGRATION_SYSTEM_REMEDIATION.md` line 11; the `CLAUDE.md` eval section. | S | files listed |
| 2 | Resolve the 0151 collision (yard description vs momentum) | Two migrations with one number; whichever merges second must renumber. | S | `migrations/` (AM-FEAT-018 branch / develop) |
| 3 | Rollback runbook (no feature flag by decision) | Rolling back only part of the stack once eval rows exist is unsafe: the old report routes have no eval access gate. Safe order: deactivate eval snapshots (`report_snapshots.is_active = false`) and archive or delete `reports` rows with `report_type = 'eval'` **before** any image rollback, and only then (if at all) run the 0153 down migration. A feature flag was considered and rejected (the feature is additive, manual and writer-only; a flag would not fix the rollback hazard). | S (doc) | `docs/EVAL_REPORT.md` release gate |
| 4 | P4 screenshots gap | The under-13 warning in `ShareReportDialog.tsx` and `SendReportToAthleteDialog.tsx` has no screenshots, which `CLAUDE.md` requires for UI changes. | S | `screenshots/` |
| 5 | Add the eval PDF pages to screenshots | The plan asked for 3-metric and 10-metric PDF pages; rendered pages are not in `screenshots/`. | S | `screenshots/`, `packages/api/utils/eval-report-pdf.ts` (render with `buildEvalReportPdf`) |

## Correctness and privacy

| # | Item | Why | Size | Where |
|---|---|---|---|---|
| 6 | Two minor-handling controls can disagree (by design now) | Share-to-athlete is blocked for under 13 today or unknown DOB only (John, 2026-10-09; `isUnder13OrUnknownDob`). Public-link restriction (`isEvalSnapshotRestricted`) also restricts on `users.isMinor` and on under 13 at the event date. So a 13+ athlete flagged `isMinor` can receive a share while their public link stays restricted, and `isMinor` can be stale (set at registration). Decide whether `isMinor` should be recomputed; the snapshot function has a TODO to dedupe with P4's helper. | M | `packages/api/services/report-service.ts` (`isEvalSnapshotRestricted`), `packages/shared/coppa-utils.ts` |
| 7 | COPPA deletion does not purge the child's data inside team / individual report snapshots | Pre-existing gap: snapshots of other report types embed athlete data and are only nulled for AI insights. Eval rows and their snapshots are covered by P3d (step 4c). | M | `packages/api/services/coppa-deletion-service.ts` |
| 8 | Eval snapshot ids in the COPPA export `reportSnapshots` section | P3d exports eval rows in a new `evalReports` section, but the existing `reportSnapshots` section is built from shares, so snapshot ids of an athlete's eval reports are not listed there (unverified whether they should be). Profile-merge re-pointing is done (step 8b). | S | `packages/api/services/coppa-export-service.ts` |
| 9 | Policy decision: should normal (non-COPPA) user deletion remove eval rows | Today they persist like measurements (soft delete, `config.athleteId` is not a foreign key). Decide and document; if purged, add a step to the normal deletion path. | S (decision) + M | `packages/api/storage.ts` deletion path, ADR-002 decision 7 |

## Performance

| # | Item | Why | Size | Where |
|---|---|---|---|---|
| 11 | Sequential awaits in `hasInaccessibleEval` and `dropBlockedEvalShares` | One `getOrgRole` / `evalShareBlocked` round trip per row; bulk routes and the athlete's report list scale linearly. Cache the role per organization within the call and batch the user lookup. | S | `packages/api/routes/report-routes.ts` |
| 12 | Defaults endpoint loads benchmarks it does not use | `computeEvalDefaults` only needs the metric list, but `loadEvalReportInputs` also loads the prior event, metadata and benchmarks. Split a lighter loader. | S | `packages/api/services/eval-report-service.ts`, `packages/api/routes/event-report-routes.ts` |
| 13 | Template and settings limiter vs `lastSelection` writes | Writes share the MUTATION limit (20 per 15 minutes) and the dialog saves `lastSelection` after every generation, so a busy session can exhaust it and the save is silently dropped (the dialog catches the error). Give the settings write a STANDARD-tier limiter or debounce. | S | `packages/api/routes/eval-template-routes.ts`, `packages/web/src/components/events/EvalReportDialog.tsx` |

## Product and rendering

| # | Item | Why | Size | Where |
|---|---|---|---|---|
| 14 | Embed a Unicode font in the PDF | Helvetica is WinAnsi only; names and notes in other scripts print as `?` (`winAnsi`). | M | `packages/api/utils/eval-report-pdf.ts` (font registration, `winAnsi`, width measurement) |
| 15 | Male benchmarks (AM-FEAT-020) | No male age-group sets exist, so every male athlete gets value only. The report picks up new sets with no code change as long as rows are shaped like the female ones. | L (data) | `site_benchmarks` seeds; spec AM-FEAT-020 |
| 16 | Tier ladders for age-group sets | Age-group sets are single Average rows (above/below only). A ladder would allow finer wording; `matchTierGroup` already routes grouped rows through `selectTierGroup` / `evaluateTierBenchmark`, but the PDF prints no tier names and would need a design. | L | seeds, `eval-report/tier-match.ts`, `eval-report-pdf.ts` |
| 17 | Entry card search and paging | `EventEvalReportsCard` lists every measured athlete in one list. Large events need search or paging. | S | `packages/web/src/components/events/EventEvalReportsCard.tsx` |
| 18 | Split `EvalReportDialog` | About 720 lines mixing form state, preview, result and sharing. Extract sections and the result panel. | M | `packages/web/src/components/events/EvalReportDialog.tsx`, `packages/web/src/lib/eval-report-form.ts` |
| 19 | Event-detail mobile header overflow | Pre-existing layout overflow on small screens; the new card sits on this page. | S | `packages/web/src/pages/event-detail.tsx` |

## Tooling

| # | Item | Why | Size | Where |
|---|---|---|---|---|
| 20 | Lockfile validation for the `jspdf` workspace entry | `jspdf` was added to `packages/api/package.json`; confirm `npm ci` and the lockfile agree in CI (the `packages/api` entry in `package-lock.json` lists it, but a clean `npm ci` was not run here) and that the version matches the web package. | S | `package-lock.json`, `packages/api/package.json` |
| 21 | E2E suite red baseline (#490) | `tests/e2e/eval-report.spec.ts` is run locally only. Add it to CI once the suite is green, so it is not lost among ~440 failures. | depends on #490 | CI workflow, `playwright.*.config.ts` |
| 22 | Default-template seed is silent about absent codes and cannot top up | Block C skips missing `site_metrics` codes and its NOT EXISTS guard stops a later run adding them. When `RSI_105`, `JUMP_CMJ_SL_L/R`, `MOMENTUM`, `HEIGHT`/`WEIGHT` and ground contact, flight time and sitting height codes exist, add a migration that tops up the global "Soccer eval (yards)" template. | S | new migration, `migrations/0153_*.sql` Block C |
| 23 | Multi-sport athletes use `sports[0]` for benchmark lookup | `loadEvalReportInputs` takes the first sport only; a second-sport athlete gets that sport's sets or none. | S | `packages/api/services/eval-report-service.ts` |
| 24 | `eventCalendarDate` uses the UTC date | An evening local event can print the next day on the PDF and shift age and preset by a day. | S | `packages/api/services/event-measurements-service.ts` |
| 25 | Org `lastSelection` is partial and its limits differ from a report | `evalSelectionSchema` lacks `noteFirst`, `radar` and `metricCollegeGauge` (so remember-my-selection is incomplete) and allows 100 metric keys while a report allows 50. | S | `packages/shared/eval-template-schemas.ts`, `eval-report-config.ts` |
| 26 | Strengths are the top two by position even when below the average | A weak athlete can have "strengths" that are behind the age-group average. The coach can edit; consider showing only at-or-above metrics. | S | `packages/api/services/eval-report/limiter.ts` |
| 27 | Share-dialog text is inaccurate for restricted snapshots | "Anyone who has a share link can view this report" is false when the snapshot is restricted (logged-out viewers get 403). | S | `packages/web/src/components/events/EvalReportDialog.tsx` (~line 485) |
| 28 | Test database shape differs from a migrated one | CI is `db:push` + seed-default-metrics + cascade triggers with **no manual migrations**, so integration tests must create the `site_metrics` (and benchmark) rows they use. Keep that rule for new eval tests. | ongoing | `tests/integration/eval-*.test.ts` |

## Resolved

- Expression index for eval report lookups (was #10): `reports_eval_athlete_event_idx` on `((config->>'athleteId'), (config->>'eventId')) WHERE report_type = 'eval'`, created by migration 0153 Block C2 and also declared in `packages/shared/schema/tables/reports.ts`, so push-only CI databases have it too.
- Profile merge re-pointing of `config.athleteId` (P3d, step 8b).
- Under-13 share guard for all report types (P4, #560) and the share-to-athlete rule decision (under 13 only, 2026-10-09).
- Snapshot-flag leak and the EOL rewrite (reported fixed by the coordinator; not re-verified here).
- Shared Load/Balance copy between PDF and web (`packages/shared/eval-report-copy.ts`); `GET /api/events/:eventId/reports` filters in SQL and drops the eval model.
