# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Principles (Design Phase)

Applied **before** TDD begins. Sequence: **Ask → Agree → Test → Code**. Adapted from Andrej Karpathy's observations on LLM coding pitfalls.

1. **Think Before Coding** — State assumptions explicitly. If requirements are ambiguous, surface concrete interpretations and **ask** — do not silently pick one. Hidden confusion is worse than a clarifying question.
2. **Simplicity First** — Minimum code for the stated problem. No speculative abstractions, no unrequested features, no error handling for scenarios that cannot occur within trusted boundaries.
3. **Surgical Changes** — Touch only what the task requires. Preserve existing style, naming, and structure even if you would write it differently. Refactoring unbroken code is out of scope unless the task explicitly calls for it. Clean up only what *your* change introduced.
4. **Goal-Driven Execution** — Define verifiable success criteria **before** writing code or tests. "Done" means criteria are demonstrably met, not that the code compiles or the test passes.

### Interaction with the TDD Policy

These principles govern the **design phase**. The TDD policy (below) governs the **implementation phase**. They do not conflict — they run in sequence.

| Phase | Authority | What it enforces |
|-------|-----------|------------------|
| Design | Karpathy principles (this section) | Surface ambiguity, agree on approach, define success criteria |
| Red → Green → Refactor | TDD policy (below) | Encode agreed behavior as a failing test, minimum implementation, safe cleanup |

**If the request is ambiguous, stop before writing the test.** A test encodes behavior — encoding the wrong behavior costs more rework than asking a clarifying question.

## Specialized Agent Integration

**STATUS: ENABLED** _(Change to "DISABLED" to turn off automatic agent usage)_

Claude Code should proactively use specialized agents for domain-specific tasks in AthleteMetrics. These agents have deep expertise in specific areas and should be invoked automatically when tasks match their domains.

### Agent Usage Control

**To DISABLE automatic agents:** Change the STATUS above to "DISABLED"
**To ENABLE automatic agents:** Change the STATUS above to "ENABLED"

When DISABLED:
- Claude will work normally without invoking specialized agents
- You can still manually invoke agents using `/agent <agent-name> "task"`
- All existing functionality remains available

When ENABLED:
- Claude automatically invokes appropriate agents based on task context
- Multiple agents are coordinated in parallel when needed
- Enhanced domain-specific expertise is applied automatically

### Primary Entry Point: Lead Developer Agent

#### Lead Developer Agent (`lead-developer-agent`) 🎯
**Auto-invoke:** ALL development requests — features, bug fixes, refactors, architectural decisions, code review, sprint planning
**Role:** Project-intelligent first responder. Brings architectural judgment, enforces conventions, translates intent into phased plans, and coordinates specialist agents. Routes to other agents with enriched context.

**Invoke first for:**
- Any feature request or new functionality
- Bug fixes requiring more than a single-file change
- Architectural or design questions
- Sprint and milestone planning
- Code review and PR assessment
- Any request where the right approach isn't immediately obvious

**The lead developer agent then coordinates:**
- Specialist agents for domain-specific implementation
- `athletemetrics-orchestrator` for multi-domain tasks
- GSD skills for roadmap/milestone planning
- `pr-lifecycle-agent` for detailed code review

---

### Available Specialized Agents

#### PR Lifecycle Agent (`pr-lifecycle-agent`) 🔄
**Auto-invoke:** PR review, automated fixes, multi-iteration review→fix cycles, merge assessment
**Keywords:** `pull request`, `PR review`, `code review`, `merge`, `@claude fix`, `@claude merge`

#### QA Lead Agent (`qa-lead-agent`) 🧪
**Auto-invoke:** Test coverage assessment, quality gates, bug triage, regression planning, test strategy ownership
**Keywords:** `test coverage`, `quality gate`, `regression`, `bug triage`, `ready to ship`, `qa`, `test strategy`, `untested`

#### Release Manager Agent (`release-manager-agent`) 🚢
**Auto-invoke:** develop→main releases, changelog generation, semantic versioning, GitHub releases, hotfix workflows, release readiness
**Keywords:** `release`, `changelog`, `version`, `hotfix`, `ship`, `tag`, `github release`, `release notes`, `ready to release`

#### Documentation Agent (`documentation-agent`) 📝
**Auto-invoke:** API docs, ADRs, JSDoc/TSDoc, README updates, CLAUDE.md maintenance, onboarding documentation
**Keywords:** `document`, `docs`, `readme`, `adr`, `jsdoc`, `tsdoc`, `api docs`, `architecture decision`, `onboarding`

#### Test-Driven Feature Agent (`test-driven-feature-agent`) 🤖
**Auto-invoke:** Test-first/TDD feature implementation, unit/integration tests, test coverage, mocking, autonomous workflows
**Keywords:** `implement feature`, `TDD`, `test-first`, `implement with tests`, `unit test`, `integration test`, `test coverage`, `mock`

#### Database Schema Agent (`database-schema-agent`) 🔵
**Auto-invoke:** `packages/shared/schema.ts` changes, migrations, Drizzle ORM, table/column modifications
**Keywords:** `schema`, `database`, `drizzle`, `migration`, `table`, `postgres`, `measurements`, `users`, `teams`

#### Analytics & Visualization Agent (`analytics-visualization-agent`) 🟢
**Auto-invoke:** Charts in `packages/web/src/components/charts/`, Chart.js, statistical analysis, data visualization
**Keywords:** `chart`, `analytics`, `visualization`, `statistics`, `percentile`, `MultiLineChart`, `BoxPlotChart`

#### Security & Authentication Agent (`security-authentication-agent`) 🔴
**Auto-invoke:** `packages/api/auth/` files, permissions, RBAC, rate limiting, session management, user roles
**Keywords:** `auth`, `authentication`, `authorization`, `permission`, `role`, `rbac`, `session`, `mfa`, `login`

#### OCR & Image Processing Agent (`ocr-image-processing-agent`) 🟡
**Auto-invoke:** `packages/api/ocr/` files, image upload, text extraction, measurement pattern recognition
**Keywords:** `ocr`, `tesseract`, `image processing`, `text extraction`, `photo upload`, `pattern recognition`

#### Data Import/Export Agent (`data-import-export-agent`) 🟠
**Auto-invoke:** CSV import/export, bulk operations, data transformation, athlete matching
**Keywords:** `csv`, `import`, `export`, `bulk`, `data transformation`, `athlete matching`, `validation`

#### Form & Validation Agent (`form-validation-agent`) 🟣
**Auto-invoke:** React Hook Form, Zod validation, form components, input validation
**Keywords:** `form`, `validation`, `zod`, `react hook form`, `schema validation`, `form state`, `submit`

#### API & Route Architecture Agent (`api-route-architecture-agent`) ⚪
**Auto-invoke:** `packages/api/routes/` files, REST API design, middleware, endpoint organization
**Keywords:** `routes`, `api`, `endpoint`, `express`, `middleware`, `request`, `response`, `REST`

#### UI Development Agent (`ui-development-agent`) 🎯
**Auto-invoke:** Building UI components with live visual feedback, shadcn/ui, Tailwind CSS, design system, accessibility, responsive design
**Keywords:** `build component`, `create ui`, `visual feedback`, `develop component`, `shadcn`, `tailwind`, `ui component`, `styling`, `a11y`

#### Performance Optimization Agent (`performance-optimization-agent`) 🟨
**Auto-invoke:** React Query optimization, database performance, render optimization, bundle size
**Keywords:** `performance`, `optimization`, `slow`, `cache`, `query optimization`, `bundle size`

#### Notification & Communication Agent (`notification-communication-agent`) 🩷
**Auto-invoke:** Email notifications, user invitations, password reset, alerts, templates
**Keywords:** `email`, `notification`, `invitation`, `alert`, `communication`, `password reset`, `notify`

#### UI Testing Agent (`ui-testing-agent`) 🎭
**Auto-invoke:** E2E testing, Playwright, user flows, browser testing, visual regression
**Keywords:** `e2e`, `end-to-end`, `user flow`, `browser test`, `playwright`, `visual test`

#### Visual Design Review Agent (`visual-design-review-agent`) 🎨
**Auto-invoke:** UI/UX review, WCAG accessibility, responsive design verification, design consistency
**Keywords:** `design review`, `accessibility`, `wcag`, `responsive`, `ui review`, `visual qa`, `a11y audit`

#### Feature Flag & Settings Agent (`feature-flag-settings-agent`) 🎛️
**Auto-invoke:** Feature flags, org/team settings pages, A/B testing, rollout strategies, settings inheritance
**Keywords:** `feature flag`, `feature toggle`, `a/b testing`, `rollout`, `org settings`, `feature configuration`

#### Dependency Management Agent (`dependency-management-agent`) 📦
**Auto-invoke:** npm audit, security vulnerabilities, dependency updates, breaking changes, package conflicts
**Keywords:** `npm`, `dependencies`, `package.json`, `npm audit`, `security vulnerability`, `npm update`

#### DevOps & Infrastructure Agent (`devops-infrastructure-agent`) 🚀
**Auto-invoke:** GitHub Actions workflows, CI/CD pipelines, GitHub releases, Railway deployments, repo settings, branch protection
**Keywords:** `github actions`, `workflow`, `ci/cd`, `pipeline`, `release`, `deploy`, `railway`, `production`, `staging`, `rollback`, `github issue`, `github project`, `branch protection`

#### Multi-Tenant Profiles Agent (`multi-tenant-profiles-agent`) 🏢
**Auto-invoke:** Org type profiles (College/HS/Club), white-labeling, tenant isolation, org-specific workflows
**Keywords:** `multi-tenant`, `org type`, `white-label`, `tenant isolation`, `college org`, `high school`, `branding`

#### Custom Metric Config Agent (`custom-metric-config-agent`) 📊
**Auto-invoke:** Dynamic metric definitions, custom test builders, sport-specific measurements, validation rules
**Keywords:** `custom metric`, `test configuration`, `validation rules`, `sport-specific`, `metric builder`

### Agent Usage Rules

1. **Proactive**: Auto-invoke agents when task keywords match
2. **Parallel**: Use multiple Task() calls for multi-domain tasks
3. **Context-Rich**: Include AthleteMetrics-specific context in prompts
4. **File-Based**: Auto-invoke when working with domain-specific files

### Task Patterns → Agent Triggers

| Task Type | Agent(s) |
|-----------|----------|
| TDD/test-first implementation, unit/integration tests | `test-driven-feature-agent` |
| `packages/shared/schema.ts` changes, migrations | `database-schema-agent` |
| Charts in `packages/web/src/components/charts/` | `analytics-visualization-agent` |
| `packages/api/auth/` files, permissions, RBAC | `security-authentication-agent` |
| `packages/api/ocr/` files, photo uploads | `ocr-image-processing-agent` |
| CSV import/export, bulk operations | `data-import-export-agent` |
| Forms, React Hook Form, Zod validation | `form-validation-agent` |
| `packages/api/routes/`, API endpoints | `api-route-architecture-agent` |
| UI component development, shadcn/ui, Tailwind | `ui-development-agent` |
| Performance issues, caching, query optimization | `performance-optimization-agent` |
| Email notifications, invitations | `notification-communication-agent` |
| E2E testing, user flows, Playwright | `ui-testing-agent` |
| Design review, WCAG compliance, UI/UX audit | `visual-design-review-agent` |
| Feature flags, org settings, A/B testing | `feature-flag-settings-agent` |
| npm audit, security vulnerabilities, dependency updates | `dependency-management-agent` |
| CI/CD, GitHub Actions, releases, Railway deployments, repo settings | `devops-infrastructure-agent` |
| Org types, white-labeling, tenant isolation | `multi-tenant-profiles-agent` |
| Custom metrics, sport-specific tests, metric builder | `custom-metric-config-agent` |
| Test strategy, coverage gaps, quality gates, bug triage | `qa-lead-agent` |
| Releases, changelogs, versioning, hotfixes, GitHub releases | `release-manager-agent` |
| API docs, ADRs, JSDoc, README, CLAUDE.md maintenance | `documentation-agent` |

## Git Workflow

### Branching Strategy

This repository uses a **develop → main** branching model:

```
feature/xyz ──┐
fix/abc ──────┼──► develop ──────► main
chore/123 ────┘
```

**Rules:**
1. **All feature branches** (`feature/*`, `fix/*`, `chore/*`, etc.) must open PRs against `develop`
2. **Only `develop`** may open a PR against `main`
3. **Never PR directly** from a feature branch to `main`

### Branch Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| New feature | `feature/<description>` | `feature/athlete-dashboard` |
| Bug fix | `fix/<description>` | `fix/rbac-requirerole-bug` |
| Maintenance | `chore/<description>` | `chore/update-dependencies` |
| Documentation | `docs/<description>` | `docs/api-reference` |
| Refactoring | `refactor/<description>` | `refactor/auth-middleware` |

### Creating PRs

When creating a PR, always specify `develop` as the base branch:

```bash
# Create PR against develop (correct)
gh pr create --base develop --title "feat: add new feature"

# Never do this for feature branches
gh pr create --base main  # ❌ Wrong for feature branches
```

### Comparing Branches (Squash Merge Workflow)

This repository uses **squash merges** when merging `develop` → `main`. This keeps `main` clean (one commit per release) but means commit SHAs differ between branches.

**Important:** When checking what's different between `develop` and `main`, use the correct commands:

```bash
# ❌ MISLEADING - counts ancestor commits, not actual differences
git log main..develop --oneline | wc -l  # Shows 150+ commits even if branches are similar

# ✅ CORRECT - shows actual file/content differences
git diff main develop --stat              # Summary of changed files
git diff main develop                     # Full diff
```

**Why this matters:**
- `git log main..develop` lists commits reachable from `develop` but not `main`
- After a squash merge, individual commits remain "not in main" even though their *changes* are
- `git diff` compares the actual tree state, ignoring commit history

**When creating release PRs** (develop → main), always use `git diff` to assess the true scope of changes.

## Development Commands

### Core Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build both frontend and backend for production
- `npm run start` - Start production server
- `npm run check` - Run TypeScript type checking
- `npm run db:push` - Push database schema changes to PostgreSQL

> **Note — peer-dep conflict:** `drizzle-orm >=0.44` declares optional React Native SQLite peer deps that conflict with this project's React 18. Run `npm install --legacy-peer-deps` (or `npm install --force`) when doing a fresh install. CI is unaffected (`npm ci` installs directly from the lockfile).

### Database Operations
- `npm run db:push` - Apply schema changes from `packages/shared/schema.ts` to database (development only)
- `npm run db:migrate` - Run drizzle migrations (0000-0013)
- `npm run db:migrate:manual` - Run manual SQL migrations (0014-0021)
- `npm run db:migrate:all` - Run all migrations (drizzle + manual)
- `npm run db:validate` - Validate migration safety before applying

#### Migration System Architecture

This project uses a **dual migration system**:

1. **Drizzle migrations (0000-0013)**: Applied via `npm run db:migrate`
   - Uses drizzle-orm's migrate() function
   - Requires both SQL files and snapshot JSON files
   - Tracked in `drizzle.__drizzle_migrations` table

2. **Manual SQL migrations (0014-0021)**: Applied via `npm run db:migrate:manual`
   - Pure SQL migrations without drizzle snapshots
   - Applied using scripts/apply-manual-migrations.js
   - Tracked in `manual_migrations` table

**Why two systems?** Migrations 0014-0021 were created without drizzle snapshot files and cannot be applied by drizzle's migrate() function. See `docs/MIGRATION_SYSTEM_REMEDIATION.md` for full details.

**For new migrations**: Always use drizzle-kit to generate migrations with proper snapshots:
```bash
npm run db:generate  # Generate migration from schema changes
npm run db:migrate   # Apply drizzle migrations
```

## Test-Driven Development (TDD) — Universal Policy

**CRITICAL**: TDD is the **default development process** for ALL code changes in AthleteMetrics — new features, bug fixes, refactors, and API changes alike. No production code is written before a failing test exists.

### The Red-Green-Refactor Cycle

Every change follows this cycle without exception:

```
1. RED    → Write a failing test that describes the desired behavior
2. GREEN  → Write the minimum code to make the test pass
3. REFACTOR → Clean up code while keeping tests green
```

### Test Layers

AthleteMetrics uses three test layers. Choose the **lowest layer** that adequately tests the behavior:

| Layer | Location | When to Use | Agent |
|-------|----------|-------------|-------|
| **Unit** | `packages/*/src/**/*.test.ts` | Pure functions, utilities, business logic | `test-driven-feature-agent` |
| **Integration** | `tests/integration/` | API routes, DB queries, service interactions | `test-driven-feature-agent` |
| **E2E** | `tests/e2e/` | User-facing workflows, full UI flows | `ui-testing-agent` |

### When Each Test Type Is Required

✅ **Unit tests ALWAYS required for:**
- New utility functions or helpers
- Business logic (calculations, transformations, validations)
- Zod schema changes
- Shared type guards or formatters

✅ **Integration tests ALWAYS required for:**
- New API routes or middleware
- Database query logic
- Authentication and permission logic
- Service layer functions

✅ **E2E tests ALWAYS required for:**
- New user-facing pages or routes
- New forms or data entry workflows
- New CRUD operations (Create, Read, Update, Delete)
- Authentication or authorization user flows
- Critical user workflows (signup, login, data import, etc.)
- Changes to existing user workflows

⚠️ **Usually Required:**
- UI component changes affecting user interaction (E2E or component test)
- API endpoint changes that impact frontend behavior (integration + E2E)
- Navigation or routing modifications (E2E)
- Form validation rule changes (unit + E2E)

❌ **Not Required:**
- Pure CSS/styling changes with no UX impact
- Internal refactoring with identical behavior (tests must still pass)
- Documentation updates

### TDD Workflow for Every Task

**Use `test-driven-feature-agent` for all development work:**

1. **Write failing test(s) first**
   - Unit test for the logic being added/changed
   - Integration test if an API route or DB query is involved
   - E2E test if user interaction is affected
   - Tests should fail because the behavior doesn't exist yet (not due to syntax errors)

2. **Implement minimum code to pass**
   - Write only what the test demands — no speculative code
   - Follow existing architectural patterns in this codebase

3. **Verify tests pass (green phase)**
   - Run relevant test suite(s) — see commands below
   - Fix any issues
   - Ensure tests are stable and not flaky

4. **Refactor**
   - Improve code quality, naming, structure
   - All tests must remain green

### TDD for Bug Fixes

Bug fixes MUST start with a **regression test** that reproduces the bug:

```
1. Write a test that FAILS because of the bug (proves the bug exists)
2. Fix the bug (minimum change)
3. Test now passes — bug is provably fixed and won't regress
```

### How to Invoke Test Agents

**Automatic (when keywords detected):**
- "implement feature with tests"
- "add e2e test for..."
- "test-first implementation"
- "fix bug in..."
- "add unit test for..."
- "write integration test for..."

**Manual invocation:**
```bash
# For TDD feature/fix development (all layers)
@claude use test-driven-feature-agent to implement [feature/fix] with tests

# For E2E testing specifically
@claude use ui-testing-agent to create E2E tests for [workflow]
```

### Test File Locations

- **Unit tests**: Co-located with source — `packages/*/src/**/*.test.ts`
- **Integration tests**: `tests/integration/[domain].test.ts`
- **E2E CRUD tests**: `tests/e2e/[entity]-crud.spec.ts`
- **E2E Workflow tests**: `tests/e2e/[workflow-name].spec.ts`
- **E2E Auth tests**: `tests/e2e/auth-flows.spec.ts`
- **E2E Permission tests**: `tests/e2e/permissions.spec.ts`

### Running Tests

```bash
# Unit + integration tests
npm run test

# Run tests in watch mode (during TDD)
npm run test:watch

# E2E tests against staging
npm run test:staging

# E2E tests against testing environment
npm run test:testing

# Specific E2E test file
npx playwright test tests/e2e/athlete-crud.spec.ts --config=playwright.staging.config.ts

# E2E with UI (debugging)
npx playwright test --ui --config=playwright.staging.config.ts
```

**Multi-Environment Setup**: See [TESTING_ENV_SETUP.md](TESTING_ENV_SETUP.md) for configuring the testing environment with credentials and database connection.

## Project Architecture

### Monorepo Structure
This is a full-stack TypeScript application organized as an npm workspaces monorepo:

- **`packages/api/`** (workspace: `@athletemetrics/api`) - Express.js backend API server
- **`packages/web/`** (workspace: `@athletemetrics/web`) - React frontend built with Vite
- **`packages/shared/`** (workspace: `@athletemetrics/shared`) - Shared types, schemas, and database definitions

Each workspace has its own `package.json` and `tsconfig.json` for proper dependency isolation and TypeScript configuration.

### Path Aliases
- `@/*` → `packages/web/src/*` (frontend components, pages, utils)
- `@shared/*` → `packages/shared/*` (database schema, types)
- `@assets/*` → `attached_assets/*` (static assets)

### Frontend Route Naming Conventions

The application follows a **flat route structure** without `/admin` prefixes for site-admin features. Security is enforced through middleware, not URL structure.

#### Current Route Structure

**Site Admin Features** (protected by `requireSiteAdmin` middleware):
- `/organizations` - Organization management
- `/user-management` - User account management
- `/wellness-templates` - Global wellness template library
- `/metrics` - Site-wide metric configuration
- `/benchmarks` - Site-wide benchmark configuration
- `/admin` - Site settings (AI model, wellness module toggle)

**Rationale:**
- **Security by Middleware**: The `requireSiteAdmin` middleware in `packages/api/middleware.ts` enforces permissions at the API level, making URL-based security unnecessary
- **Consistency**: All site-admin features use simple, descriptive names without prefixes
- **Clean URLs**: Shorter, more readable URLs improve UX and are easier to remember
- **The Exception**: `/admin` is retained for "Site Settings" specifically because it contains cross-cutting configuration (AI model, wellness module toggle) that affects all other admin features

#### Route Security Model

```typescript
// Backend: Protection via middleware (packages/api/routes/)
app.get('/api/site-settings', requireAuth, requireSiteAdmin, handler);
app.get('/api/organizations', requireAuth, requireSiteAdmin, handler);

// Frontend: Protection via auth context (packages/web/src/lib/auth.tsx)
if (!user?.isSiteAdmin) {
  return <Navigate to="/" />;
}
```

**Key Principles:**
1. **Never rely on URL structure for security** - Always use middleware
2. **Use flat, descriptive routes** - `/organizations` not `/admin/organizations`
3. **Protect routes at both API and UI levels** - Defense in depth
4. **Document exceptions** - `/admin` is an exception for historical reasons and site-wide settings

#### Adding New Site Admin Routes

When adding new site-admin features, follow this pattern:

```typescript
// ✅ CORRECT: Flat route with middleware protection
// Backend: packages/api/routes/new-feature-routes.ts
app.get('/api/new-feature', requireAuth, requireSiteAdmin, handler);

// Frontend: packages/web/src/App.tsx
<Route path="/new-feature" component={NewFeaturePage} />

// Frontend protection: packages/web/src/pages/new-feature.tsx
export default function NewFeaturePage() {
  const { user } = useAuth();
  if (!user?.isSiteAdmin) return <Navigate to="/" />;
  // ... rest of component
}

// ❌ INCORRECT: Don't use /admin prefix for new features
<Route path="/admin/new-feature" component={NewFeaturePage} />
```

#### Permission Middleware Module

The unified permission module in `packages/api/permissions/` provides consistent RBAC middleware:

```typescript
import {
  requirePermission,
  requireRole,
  requireOrgAccess,
  requireResourceAccess,
} from '../permissions';

// Permission-based (legacy PERMISSIONS matrix)
router.post('/teams', requireAuth, requirePermission('CREATE_TEAM'), handler);

// Role-based (minimum role level)
router.get('/coach-dashboard', requireAuth, requireRole('coach'), handler);

// Organization access (validates org membership)
router.get('/org/:orgId/data', requireAuth, requireOrgAccess(), handler);

// Resource-action based (granular control)
router.put('/athletes/:id', requireAuth, requireResourceAccess('athlete', 'update'), handler);
```

**Role Hierarchy (higher = more privileges):**
- `site_admin` (100) - Full system access
- `org_admin` (80) - Organization management
- `coach` (60) - Team and athlete management
- `athlete` (40) - Self-access only
- `guest` (20) - Read-only access

**Specialized Permission Helpers:**
- `canCreateMeasurementFor()` - Measurement creation authorization
- `canModifyMeasurement()` - Update authorization with verified check
- `canVerifyMeasurement()` - Verification authorization
- `canAccessLeaderboard()` - Coach-only analytics features

**Migration Note:** `RoleManager.requirePermission()` and `RoleManager.requireRole()` are deprecated. Use the `permissions` module instead.

### Database Schema Architecture
The application uses Drizzle ORM with PostgreSQL and follows a normalized relational design:

- **Teams** - Sports teams with levels (Club, HS, College)
- **Players** - Athletes with personal details, sports, and contact info
- **PlayerTeams** - Many-to-many relationship allowing players on multiple teams
- **Measurements** - Performance data (10-yard fly time, vertical jump, agility tests)
- **Users** - Simple admin authentication

Key schema features:
- UUID primary keys for all entities
- Automatic full name generation from first/last name
- Age calculation from birth year and measurement date
- Support for array fields (sports, emails, phone numbers)
- Flexible player assignment (can exist without teams as "Independent Players")

### Authentication System
- Simple environment-based admin authentication
- Session management using Express sessions
- Protected routes on frontend with automatic login redirects
- Credentials: `ADMIN_USER` and `ADMIN_PASS` environment variables

### OAuth Authentication
AthleteMetrics supports Google and Apple OAuth authentication via Passport.js as an **alternative login method** for athletes. Username/password remains the **primary authentication method**, with OAuth buttons offered as a convenience option.

**Architecture:**
- Passport.js strategies: `passport-google-oauth20`, `passport-apple`
- Session-based authentication (integrates with existing Express sessions)
- Email-based account linking with confirmation flow for security
- Password field is nullable to support OAuth-only users
- OAuth users can add password backup later in Account Settings

**Key Files:**
- `packages/api/auth/passport-config.ts` - Passport strategy configuration
- `packages/api/services/oauth-service.ts` - OAuth authentication logic and account linking
- `packages/api/routes/oauth-routes.ts` - OAuth route handlers (initiate, callback, linking)
- `packages/web/src/components/auth/oauth-buttons.tsx` - OAuth UI components
- `packages/shared/schema.ts` - OAuth fields: `googleId`, `appleId`, `oauthProvider`, etc.
- `packages/shared/migrations/0022_add_oauth_support.sql` - Database migration

**Environment Variables:**
- `GOOGLE_OAUTH_CLIENT_ID` - Google OAuth client ID from Google Cloud Console
- `GOOGLE_OAUTH_CLIENT_SECRET` - Google OAuth client secret
- `APPLE_OAUTH_CLIENT_ID` - Apple Sign In service ID
- `APPLE_OAUTH_TEAM_ID` - Apple Developer Team ID
- `APPLE_OAUTH_KEY_ID` - Apple Sign In key ID
- `APPLE_OAUTH_PRIVATE_KEY_PATH` - Path to Apple .p8 private key file

**Security Features:**
- CSRF protection via Passport state parameters (automatic)
- Email verification for account linking (prevents account takeover)
- Rate limiting: 10 OAuth attempts per 15 minutes per IP
- One-time use linking tokens with 1-hour expiry
- Trust OAuth provider's MFA/2FA (no duplicate MFA required)

**User Flows:**
1. **New OAuth user** → Creates account as "independent athlete" → Can join org via invitation
2. **Existing email account** → Sends confirmation email → User clicks link → Accounts linked
3. **Returning OAuth user** → Fast login via provider (3-5 seconds)
4. **Hybrid account** → Can login with either OAuth or password

**Documentation:** See `docs/OAUTH_AUTHENTICATION.md` for comprehensive setup guide, user flows, and future enhancements.

### Data Import/Export
- CSV import with comprehensive validation and preview
- Support for matching existing players or creating new ones
- Bulk data operations with error reporting
- Export functionality for analytics data

## Technology Stack

### Frontend
- React 18 with TypeScript and functional components
- Vite for development and building
- Tailwind CSS + shadcn/ui component library
- Wouter for client-side routing (not React Router)
- React Query (@tanstack/react-query) for server state
- React Hook Form + Zod for form handling and validation
- Chart.js via react-chartjs-2 for data visualization

### Backend
- Express.js with TypeScript
- Drizzle ORM with Neon PostgreSQL serverless
- Session-based authentication (not JWT)
- Multer for file uploads
- CSV parsing for bulk imports

### Server Architecture
The application runs as a **single-process Node.js server** without clustering:

- **No Socket Reuse**: The `reusePort` option is intentionally not used because this application runs as a single process. The `reusePort` option is only beneficial when running multiple Node.js processes that need to bind to the same port (Linux-only feature).

- **Load Balancing Strategy**: For production deployments requiring horizontal scaling, use **external load balancers** rather than Node.js clustering:
  - **Cloud Load Balancers**: AWS ALB/NLB, Google Cloud Load Balancing, Azure Load Balancer
  - **Reverse Proxies**: Nginx, HAProxy, Traefik
  - **Container Orchestration**: Kubernetes Services (automatic load balancing across pods)
  - **Platform Services**: Replit's autoscale deployment handles load balancing automatically

- **Port Configuration**: The application uses two ports:
  - **Port 5000**: Main HTTP server (API + client), configured via `PORT` environment variable
  - **Port 43479**: Replit development proxy for external access (port 80), automatically configured by Replit platform

- **Why Single Process Works**: Node.js's event loop efficiently handles concurrent connections without multi-process clustering. Most I/O operations (database queries, API calls) are non-blocking, allowing thousands of concurrent connections on a single process.

### Development Notes
- **TDD is mandatory**: Write failing tests before writing production code — always. See the TDD policy section above.
- All database operations use Drizzle ORM - no raw SQL
- Forms use React Hook Form with Zod schemas from `shared/schema.ts`
- UI components are from shadcn/ui - check existing patterns before creating new ones
- Authentication state is managed through React Context in `lib/auth.tsx`
- Database connection uses Neon serverless with WebSocket support
- **Before writing custom code, always search for and suggest relevant open-source libraries or packages that could solve the problem.**

### Performance Metrics Supported
- FLY10_TIME (10-yard fly time in seconds)
- VERTICAL_JUMP (vertical jump in inches)
- AGILITY_505 (5-0-5 agility test in seconds)
- AGILITY_5105 (5-10-5 agility test in seconds)
- T_TEST (T-test agility in seconds)
- DASH_40YD (40-yard dash in seconds)
- TOP_SPEED (top speed in mph)
- RSI (Reactive Strength Index)

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `ADMIN_USER` - Admin username (defaults to "admin")
- `ADMIN_PASS` - Admin password (defaults to "password")
- `SESSION_SECRET` - Session encryption key

### Optional Environment Variables
#### Analytics Rate Limiting
- `ANALYTICS_RATE_WINDOW_MS` - Rate limiting window in milliseconds (default: 900000 / 15 minutes)
- `ANALYTICS_RATE_LIMIT` - Maximum requests per window (default: 50)
- `ANALYTICS_RATE_LIMIT_MESSAGE` - Custom rate limit message (default: "Too many analytics requests, please try again later.")

#### Upload Rate Limiting
- `UPLOAD_RATE_LIMIT` - Maximum file uploads per 15-minute window (default: 20)

**Security Note**: Upload rate limiting protects against abuse of CSV import and photo upload endpoints. The default of 20 uploads per 15 minutes balances legitimate use with DoS protection.

#### File Upload Security
- `MAX_CSV_FILE_SIZE` - Maximum CSV file size in bytes (default: 5242880 / 5MB)
- `MAX_IMAGE_FILE_SIZE` - Maximum image/PDF file size in bytes for OCR (default: 10485760 / 10MB)
- `MAX_CSV_ROWS` - Maximum number of rows in CSV import (default: 10000)

**Security Note**: File upload endpoints validate both MIME types and file extensions to prevent malicious file uploads. Row limits prevent memory exhaustion from large CSV files. For production deployments, consider integrating virus scanning middleware (e.g., ClamAV).

#### Rate Limiting Bypass (Development Only)
- `BYPASS_ANALYTICS_RATE_LIMIT` - Set to "true" to bypass analytics rate limiting for site admins (default: false)
- `BYPASS_GENERAL_RATE_LIMIT` - Set to "true" to bypass general API rate limiting (default: false)

**Security Note**: Rate limiting bypasses are disabled by default and automatically disabled in production environments (NODE_ENV=production) regardless of environment variable settings. This provides an additional safeguard against accidental security vulnerabilities in production deployments.

### Railway Configuration

#### Deployment Configuration (`railway.json`)
- **Healthcheck Timeout**: 90 seconds (reduced from 300s)
  - **Rationale**: Express server typically starts in 5-15s, Neon WebSocket connection takes 2-5s
  - **Safety Margin**: 90s provides 6x safety margin for cold starts
  - **Platform Alignment**: Railway's default timeout is 100s, so 90s aligns with platform limits
  - **Documentation**: See `railway.json` for current configuration

## UI Screenshot Verification (REQUIRED)

When any code change affects the UI (new components, layout changes, styling updates, page modifications, etc.), you **MUST** capture screenshots of the affected pages/components before finishing.

### How
1. Use Playwright to launch the app and screenshot the affected views:
   ```ts
   import { chromium } from 'playwright';
   const browser = await chromium.launch();
   const page = await browser.newPage();
   await page.goto('http://localhost:5173/affected-route');
   await page.screenshot({ path: 'screenshots/<descriptive-name>.png', fullPage: true });
   await browser.close();
   ```
2. Or use the existing Playwright test infrastructure with `page.screenshot()`.
3. Save screenshots to `screenshots/` in the project root (create the dir if needed).
4. Name them descriptively: `screenshots/dashboard-new-chart.png`, `screenshots/athlete-profile-mobile.png`, etc.
5. Include both desktop (1280×720) and mobile (375×667) viewports if the change is layout-related.

### When
- Any new UI component or page
- Any change to existing component layout, styling, or behavior
- Any responsive/mobile changes
- Theme or color changes

### What to capture
- The full page showing the change
- Before/after if modifying existing UI (screenshot the current state first)
- Multiple viewports if layout-related

This is a manual convention — there is no CI automation enforcing it. Include screenshots in the PR description or as committed files so the project owner can review visual changes before merge.