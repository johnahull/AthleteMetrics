# Changelog

All notable changes to AthleteMetrics will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.32.0] - 2026-10-30

### Added
- Single-leg triple hop Limb Symmetry Index (`HOP_SL_TRIPLE_LSI`, shorter leg over longer leg x 100), a Triple Hop Asymmetry Screening benchmark set and soccer distance tiers per leg for male and female athletes. Migration `0169` (#691)
- 5-10-5 agility tier benchmarks (Elite / Competitive / Average / Developing) per sex, sport and level, with template sets. Provisional norms; eval reports keep comparing to the single age-group Average. Migration `0170` (#693)
- High school boys 40-yard dash tiers (Elite <=4.60 s through Below Average <=5.50 s) and a matching site benchmark set, from OVR Performance laser-timed, rolling-start data. Migration `0171` (#692)
- Every athlete must have a birthdate and a real email: athletes missing either (OAuth sign-ups, legacy and CSV-imported athletes with placeholder emails) are sent to a post-login "Complete your profile" page. Under-13 athletes go to `pending_consent` and need a parent email (#695)

### Changed
- Single-leg triple hop is now measured in feet instead of meters: site metric unit and range, measurements, benchmarks, report benchmarks and goals are converted. Migration `0168` (#691). It also accepts units already spelled Feet/ft and normalizes them to `ft` (#696)
- API: incomplete athletes get `403 profile_incomplete`; consent-blocked users get `403 coppa_*`; revoking consent deletes the athlete's sessions (#695)
- Dependency bumps: @radix-ui/react-menubar, react-collapsible, react-separator, @testing-library/user-event (#686, #687, #688, #690)

### Deployment notes
- Migrations `0168`-`0171` are new. Back up first: `0168` rewrites stored measurement values. After `npm run db:migrate:manual`, run `POST /api/admin/recalculate-derived-metrics` to backfill the LSI.
- Coaches should be told that CSV-imported athletes will be asked to complete their profile at first login.

## [0.31.0] - 2026-10-25

### Added
- Dashr import derives a fly 10 from every pair of dash gates 10 yd apart. A 40yd dash with 10/20/30 gates now yields RI10, FLY10_TIME and RI30. The fastest in-range candidate wins, and a direct Flying measurement suppresses the derived one. Meters are unchanged (#676)
- Sprint runs history card on the athlete dashboard and profile, with personal-best and faster-than-previous markers (#677)
- Report pages: "Copy for LLM" exports only what the report shows (selected metrics, best values, benchmarks, optional trends and F-V, insights, glossary) (#680)
- Coaching Insights can be written or edited by hand without generating first, including in organizations with AI off. Editing requires coach, org admin or site admin in the report's own organization (#680)
- Individual-report AI insights now also see the dated history, peer distribution, teams, composite index and Force-Velocity profile when the report shows them (#681)

### Fixed
- Time inputs have full keyboard support, so the m:ss colon is typeable (#672)
- Benchmark achievement summary counts each athlete once per benchmark (#674)
- Team report AI insights no longer blocked by minors elsewhere in the organization: the parental-consent gate checks only the athletes the report covers (#679)
- Larger app icon in browser tabs and on phones; separate maskable and apple-touch icons (#682)

### Changed
- AI insights prompt is de-identified: no athlete, organization, report, team, event or cohort names and no exact age (age band instead). The first name is filled in locally after the response. The insights footer reads "Evaluation Written:" instead of "Generated on:" (#680)
- Patched npm audit advisories (body-parser, dompurify, multer, undici, ip-address); happy-dom bumped to ^21.0.4. The zod advisory GHSA-mrhx-c7xc-m3w5 is excluded in `scripts/security-audit.sh` until the zod 4 migration (#683)
- CI: failing E2E specs are quarantined (`tests/e2e/quarantine.json`) so the E2E suite can gate (#673)
- CI: the full Playwright suite no longer runs against deployed staging (#675)

## [0.30.1] - 2026-10-19

### Fixed
- Athletes opening a shared individual or team report from My Reports got a blank screen; the report views called a hook after their loading early return (#669)
- A render error on any page now shows a fallback with a Reload button instead of blanking the whole app (#669)
- Hooks called after an early return in the athletes, metrics management, sidebar, coaching insights and box plot components (#669)

### Added
- `npm run lint:hooks` (ESLint, `react-hooks/rules-of-hooks` only), run in CI in the type check job (#669)

### Changed
- Dev dependencies: eslint 10, eslint-plugin-react-hooks 7, typescript-eslint 8 (#669)

## [0.30.0] - 2026-10-19

### Added
- AI insights: shared system prompt, grounded recommendations, trend improvements and event context in the prompt, plus an offline eval harness (`scripts/eval-ai-insights.ts`) (#659, #660)

### Fixed
- AI insights prompt now grounded in real stats, benchmark facts and data limits (#658)
- EUR / RSI tier benchmarks renamed so the athlete profile shows the right group label (EUR, RSI Left, RSI Right, RSI Asymmetry). Migration `0167` (#657)

### Changed
- Dependencies: @radix-ui/react-slider 1.6.1, @radix-ui/react-radio-group 1.5.1, @tanstack/react-query 5.104.3 (#662, #663, #664)

## [0.29.0] - 2026-10-18

### Added
- Report templates: save a report's configuration as a template and reuse it; reports can now use multiple benchmark sets. Migration `0166` (#654)

### Fixed
- Seeded squat jump benchmarks removed. Migration `0165` (#653)

## [0.28.0] - 2026-10-17

### Added
- Team reports match individual reports: metric labels instead of raw codes and metric-group headings in the PDF and web view, plus an empty state when no athlete has measurements (#649)
- Benchmark and benchmark-set pickers are searchable and filterable, with group headings, filter chips and smart default filters (#650)

### Fixed
- Women's soccer 20/30/40 yd benchmarks are corrected to the Vescovi 2011 electronic-timing data; rows without a source are switched off (`is_active=false`). Manual migration `0164` (#648)

## [0.26.0] - 2026-10-16

### Added
- **Duration (mm:ss) metrics** - metrics can use a `duration` display format, set by an admin toggle (new `display_format` column on `site_metrics` and `custom_org_metrics`). Coaches enter `6:42.5`; values show as mm:ss in grids, charts, leaderboards, reports and the eval report. Storage and analysis stay in seconds. CSV export gains a last `display_value` column (#625, #629, #630)
- `AGILITY_COD_DEFICIT_M_INTERP` derived metric: change-of-direction deficit for evals that run the 5-0-5 in meters and the sprint in yards (#624)

### Changed
- Eval report uses the meter 5-0-5 and the interpolated COD deficit for every organization; yard 5-0-5 rows are no longer offered (#628)
- Metric units now show on dashboards, with uniform spacing (`1.10 s`) (#631)
- Lower-is-better is resolved from the metric's own type, with one shared resolver on server and web; empty `METRIC_CONFIG` removed (#632, #633, #637)
- Org metric toggles are staged and saved in one request (#626)

### Fixed
- Calendar dates show on the correct day west of UTC (#636)
- Reports show selected site benchmarks when the organization has no enablement row (#635)
- Achievement history is scoped to the measurement's organization; report metric info is org-aware; goal update checks direction (#634)
- Athlete selector ranks time metrics fastest first (#638)
- CSV/OCR import of mm:ss times (#625)

### Security
- Org metric write routes are restricted to org admins (#627)

### Deploy notes
- New migrations 0161 and 0162; run `npm run db:migrate:all`

## [0.15.1] - 2026-01-23

### Security
- Resolve critical security and data integrity issues from v0.15.0 release

### Fixed
- Remove leftover merge conflict markers and duplicate declarations

### Tests
- Update OAuth tests for multi-user security blocking behavior

## [0.15.0] - 2026-01-21

### Added
- **Benchmark Sets** - Group benchmarks into sets for easier management (#297)
- **Profile Merge** - Org admins can merge duplicate athlete profiles (#299)
- **Report Multi-Share** - Share reports with multiple athletes simultaneously (#298)

### Fixed
- OAuth duplicate user prevention and multi-account linking (#300)
- Critical security and data integrity issues in release process

## [0.2.0] - 2024-12

### Added
- **Events Feature** - Complete event management system (#287)
- **Athlete Org Switcher** - Athletes can switch between organizations
- **Derived Metrics** - Automatic calculation of derived performance metrics
- **Push Notifications** - Real-time notification system
- **Import Wizard** - Improved CSV import experience with validation preview
- **Benchmark Overlay** - Visual comparison against benchmark standards
- **Benchmark Standards** - Added benchmarks for soccer and volleyball athletes

### Changed
- Major security enhancements throughout the application
- Improved audit logging with better type safety
- Migration system improvements for idempotency and safety

### Fixed
- E2E authentication and session handling in CI
- OAuth skip conditions for E2E tests
- Various migration and deployment fixes

## [0.1.0] - 2024-11

### Added
- Initial release of AthleteMetrics
- Multi-tenant organization support
- Team and athlete management
- Performance measurement tracking
- Analytics dashboard with charts
- CSV import/export functionality
- Role-based access control (Site Admin, Org Admin, Coach, Athlete)
- Wellness module with customizable templates
- OCR support for measurement photo uploads

[Unreleased]: https://github.com/johnahull/AthleteMetrics/compare/v0.15.1...HEAD
[0.15.1]: https://github.com/johnahull/AthleteMetrics/compare/v0.15.0...v0.15.1
[0.15.0]: https://github.com/johnahull/AthleteMetrics/compare/v0.2.0...v0.15.0
[0.2.0]: https://github.com/johnahull/AthleteMetrics/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/johnahull/AthleteMetrics/releases/tag/v0.1.0
