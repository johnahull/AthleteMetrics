# Eval Report follow-ups (AM-FEAT-019)

Prioritized open items after P1-P6. Size: S under half a day, M 1-2 days, L more. Context: `docs/adr/ADR-002-eval-report-v2.md`, `docs/EVAL_REPORT.md`. Items marked "(unverified)" were not re-checked against code while writing this list.

## Before or at merge

| # | Item | Why | Size | Where |
|---|---|---|---|---|
| 1 | Merge-time renumbering of migration 0153 | 0153 is provisional. 0151 is also claimed twice (the yard-benchmark description rewrite and the unmerged AM-FEAT-018 momentum branch). Take the next free number at merge and rename both SQL files; the file header and `docs/MIGRATION_SYSTEM_REMEDIATION.md` note refer to 0153. | S | `migrations/0153_add_eval_report_templates*.sql`, `docs/MIGRATION_SYSTEM_REMEDIATION.md`, `CLAUDE.md` eval section, `tests/integration/eval-templates.test.ts` comment |
| 2 | Resolve the 0151 collision (yard description vs momentum) | Two migrations with one number; whichever merges second must renumber. | S | `migrations/` (AM-FEAT-018 branch / develop) |
| 3 | Merge P4 (#560, all-report-types share guard) before any eval is shared to an athlete account | This stack only has the eval-specific `evalShareBlocked`; P4 adds the general `/share`, `/share-bulk`, `/bulk-distribute` guard and `blockedUnder13` counts. | S (coordination) | `feature/eval-report-p4-under13` |
| 4 | P4 screenshots gap | The share-warning UI in `ShareReportDialog.tsx` and `SendReportToAthleteDialog.tsx` has no screenshots, which `CLAUDE.md` requires for UI changes. | S | `screenshots/`, P4 PR |
| 5 | Add the eval PDF pages to screenshots | The plan asked for 3-metric and 10-metric PDF pages; rendered pages are not in `screenshots/`. | S | `screenshots/`, `packages/api/utils/eval-report-pdf.ts` (render with `buildEvalReportPdf`) |

## Correctness and privacy

| # | Item | Why | Size | Where |
|---|---|---|---|---|
| 6 | Reconcile `users.isMinor` with date-of-birth checks | `isEvalSnapshotRestricted` treats `isMinor = true` as restricted regardless of age at the event, while share blocking uses birth date. The two can disagree (for example an `isMinor` flag set at registration on an athlete now 19). Needs one rule, ideally one helper shared with P4's `isUnder13OrUnknownDob`. | M | `packages/api/services/report-service.ts` (`isEvalSnapshotRestricted`, has a TODO), `packages/api/routes/report-routes.ts` (`evalShareBlocked`), `packages/shared/coppa-utils.ts` |
| 7 | COPPA deletion does not purge the child's data inside team / individual report snapshots | Pre-existing gap: snapshots of other report types embed athlete data and are only nulled for AI insights. Eval rows and their snapshots are covered by P3d (step 4c). | M | `packages/api/services/coppa-deletion-service.ts` |
| 8 | Eval snapshot ids in the COPPA export `reportSnapshots` section | P3d exports eval rows in a new `evalReports` section, but the existing `reportSnapshots` section is built from shares, so snapshot ids of an athlete's eval reports are not listed there (unverified whether they should be). Profile-merge re-pointing is done (step 8b). | S | `packages/api/services/coppa-export-service.ts` |
| 9 | Policy decision: should normal (non-COPPA) user deletion remove eval rows | Today they persist like measurements (soft delete, `config.athleteId` is not a foreign key). Decide and document; if purged, add a step to the normal deletion path. | S (decision) + M | `packages/api/storage.ts` deletion path, ADR-002 decision 7 |

## Performance

| # | Item | Why | Size | Where |
|---|---|---|---|---|
| 10 | Expression index on `reports ((config->>'athleteId')) WHERE report_type = 'eval'` | The defaults endpoint, COPPA deletion/export and profile merge filter on `config->>'athleteId'`; only `reports_org_type_idx` helps today. Needs a migration (take the next free number). | S | new migration, `packages/shared/schema/tables/reports.ts` |
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
