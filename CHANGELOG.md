# Changelog

All notable changes to AthleteMetrics will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.34.0] - 2026-11-01

### Added
- 10/5 repeat hop: average jump height (`RSI_105_HEIGHT`, inches) and average ground contact time (`RSI_105_GCT`, seconds) as entered metrics, enabled automatically for every organization that has `RSI_105`. `RSI_105` itself is still entered, not computed from them. Migration `0175` (#714)

### Changed
- The general `/api` rate limit is now 600 requests per 15 minutes per signed-in user (was 100), configurable with the `API_RATE_LIMIT` env var; invalid values fall back to 600 (#712)

### Fixed
- DashR CSV import rejected Pro Agility and 5-10-5 rows with a blank Final Distance as "Invalid or missing final distance". Final Distance is no longer required for those drills or used to tell their attempts apart (#713)

### Deployment notes
- Migration `0175` is new. Apply with `npm run db:migrate:manual`. It is additive only (new `site_metrics` rows plus org enablement); a `_down` script is included.
- Optional: set `API_RATE_LIMIT` on Railway to override the 600 default.

## [0.33.0] - 2026-11-01

### Added
- Single-leg triple hop with a bilateral landing as its own per-leg metrics (`HOP_SL_TRIPLE_BL_L`, `_R`, derived `HOP_SL_TRIPLE_BL_LSI`), enabled for every organization that has the stick-landing triple hop, plus a Bilateral Landing Asymmetry Screening set. Migration `0174` (#707)
- Join-code sign-ups to an Auto-Approve organization are added automatically once the email is verified, instead of instantly before verification (#705)
- Membership-request approvals now live on the User Management page: site admins see every organization, org admins their own (#708)
- Org admins get a User Management link and page access (#704)
- Read-only metric details dialog for coaches and org admins, and a read-only Metrics nav item for coaches (#701)
- Metric and benchmark lists are grouped under collapsible category headers (#702)

### Changed
- Generic age-group 5-10-5 benchmarks per sex replace the sport-specific ones. The old rows and sets are deactivated, not deleted, so saved reports still resolve. Migration `0172` (#699)
- API: `GET /api/organizations-with-users` now returns only organizations the caller administers and 403 otherwise; `POST /api/invitations` rejects `role: "site_admin"` from non-site-admins (#704)
- API: user, invitation and membership-request responses use allowlists. Credential, MFA, lock, OAuth and consent fields and invitation links are no longer returned to org members; member views of the roster drop `birthYear` (#706)

### Fixed
- Enabling a seeded site benchmark (text slug id) for an organization returned 400 "Invalid benchmark ID format" (#700)
- Assigning a user with no organization as site admin failed with 500 because `audit_logs_action_valid` rejected the audit action. Migration `0173` adds the missing actions (#703)
- Auto-join from a join code now applies the login gate's COPPA rules on every path; only `not_applicable` and `consented` users can be admitted (#709)

### Security
- Response-boundary allowlists for user, invitation and membership-request data (#706) and tightened roster and invitation authorization (#704); COPPA allowlist for join-code admission (#709)

### Deployment notes
- Migrations `0172`-`0174` are new. Apply with `npm run db:migrate:manual`. All three are additive or deactivate-only (no destructive up-migrations).
- Staging deploys for #708 and #709 were still running when this release was prepared. Confirm `0172`-`0174` appear in `manual_migrations` on staging before merging.

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
