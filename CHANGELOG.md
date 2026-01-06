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

[Unreleased]: https://github.com/johnahull/AthleteMetrics/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/johnahull/AthleteMetrics/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/johnahull/AthleteMetrics/releases/tag/v0.1.0
