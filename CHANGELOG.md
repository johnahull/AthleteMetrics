# Changelog

All notable changes to AthleteMetrics will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Organization custom metrics feature (#291)
- Sport and position filters for benchmarks (#290)

### Changed
- Split schema.ts into domain-based file structure (#289)

### Fixed
- Benchmark sport/position filter bugs

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
