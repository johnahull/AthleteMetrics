# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### Available Specialized Agents

#### PR Lifecycle Agent (`pr-lifecycle-agent`) 🔄
**Color:** Arrows (Lifecycle)
**Auto-invoke when tasks involve:**
- Pull request review and code quality assessment
- Automated fix implementation from review feedback
- Multi-iteration review → fix cycles
- Merge readiness assessment
- PR-related automation

**Keywords that trigger:** `pull request`, `PR review`, `code review`, `fix review feedback`, `merge`, `review iteration`, `@claude fix`, `@claude merge`

**Special Capabilities:**
- Autonomous review-fix-merge workflow
- Detects new issues in fixes (full re-review after each iteration)
- Multi-turn iteration (up to 10 turns configurable)
- Invokes domain specialists for targeted reviews
- Runs tests after every fix
- Safety controls for security-sensitive files
- Auto-merge with configurable safeguards

**Workflow:**
1. PR opened/updated → Automatic comprehensive review
2. `@claude fix` → Implements fixes, commits, pushes
3. Auto re-review → Finds any new issues in fixes
4. Repeat fix-review cycle until merge-ready
5. Recommends or executes merge when criteria met

**When to use:**
- Every pull request (runs automatically)
- When you want automated fix iterations
- To accelerate PR → merge cycle

**When NOT to use:**
- Already handled automatically by GitHub Actions
- No manual invocation needed

#### Test-Driven Feature Agent (`test-driven-feature-agent`) 🤖
**Color:** Robot
**Auto-invoke when tasks involve:**
- Feature implementation with "test-first" or "TDD" approach
- Autonomous development workflows
- Complex features requiring multiple agents
- "Implement X with tests" requests
- Bug fixes with regression testing

**Keywords that trigger:** `implement`, `feature`, `TDD`, `test-first`, `test-driven`, `autonomous`, `with tests`, `comprehensive testing`, `end-to-end implementation`

**Special Capabilities:**
- Writes tests BEFORE implementation (TDD methodology)
- Automatically runs tests and iterates on failures
- Coordinates multiple specialized agents in parallel
- Self-limits to 5 iteration attempts before escalation
- Uses TodoWrite to track multi-step progress
- Handles full feature lifecycle: plan → test → implement → verify

**When NOT to use:**
- Simple code changes without new features
- Documentation updates
- Configuration changes
- When you want to implement without tests

#### Database Schema Agent (`database-schema-agent`) 🔵
**Color:** Blue
**Auto-invoke when tasks involve:**
- Modifying `shared/schema.ts`
- Database migrations or `npm run db:push`
- Adding/modifying tables, columns, or relationships
- Drizzle ORM queries or schema validation
- Data integrity issues or constraints
- Performance measurement schema changes

**Keywords that trigger:** `schema`, `database`, `drizzle`, `migration`, `table`, `postgres`, `validation`, `measurements`, `users`, `teams`, `organizations`, `zod`, `relations`

#### Analytics & Data Visualization Agent (`analytics-visualization-agent`) 🟢
**Color:** Green
**Auto-invoke when tasks involve:**
- Chart components in `client/src/components/charts/`
- Chart.js, react-chartjs-2, or statistical analysis
- Performance analytics or data visualization
- Files matching `*Chart.tsx` or analytics-related components
- Statistical calculations (percentiles, z-scores, etc.)

**Keywords that trigger:** `chart`, `analytics`, `visualization`, `graph`, `plot`, `performance`, `statistics`, `box plot`, `line chart`, `scatter`, `swarm`, `percentile`, `MultiLineChart`, `BoxPlotChart`

#### Security & Authentication Agent (`security-authentication-agent`) 🔴
**Color:** Red
**Auto-invoke when tasks involve:**
- Authentication flows or `server/auth/` files
- Permission systems or role-based access control
- Security hardening, rate limiting, or session management
- User roles (Site Admin, Org Admin, Coach, Athlete)
- Organization-based data isolation
- MFA, password policies, or security vulnerabilities

**Keywords that trigger:** `auth`, `authentication`, `security`, `permission`, `role`, `rbac`, `session`, `mfa`, `password`, `login`, `admin`, `coach`, `athlete`, `organization`, `access control`

#### OCR & Image Processing Agent (`ocr-image-processing-agent`) 🟡
**Color:** Yellow
**Auto-invoke when tasks involve:**
- OCR service in `server/ocr/` directory
- Image upload and processing workflows
- Text extraction from athletic performance images
- Measurement pattern recognition and parsing
- Image preprocessing and validation
- Photo upload components and OCR results display

**Keywords that trigger:** `ocr`, `tesseract`, `image processing`, `text extraction`, `photo upload`, `image preprocessing`, `measurement patterns`, `data parser`, `OCR service`, `pattern recognition`

#### Data Import/Export Agent (`data-import-export-agent`) 🟠
**Color:** Orange
**Auto-invoke when tasks involve:**
- CSV import/export functionality
- Bulk data operations and validation
- Data transformation and athlete matching
- Import preview and error handling
- Files in `import-export.tsx` or bulk operation types
- Data validation pipelines and error reporting

**Keywords that trigger:** `csv`, `import`, `export`, `bulk`, `data transformation`, `athlete matching`, `validation`, `preview`, `bulk operations`, `data parsing`

#### Form & Validation Agent (`form-validation-agent`) 🟣
**Color:** Purple
**Auto-invoke when tasks involve:**
- React Hook Form implementations
- Zod schema definitions and validation
- Form components (athlete, team, measurement, user forms)
- Input validation and error handling
- Form state management and submission flows
- Custom form components and validation patterns

**Keywords that trigger:** `form`, `validation`, `zod`, `react hook form`, `input`, `schema validation`, `form state`, `field validation`, `submit`, `form errors`

#### API & Route Architecture Agent (`api-route-architecture-agent`) ⚪
**Color:** Gray
**Auto-invoke when tasks involve:**
- Express route definitions in `server/routes/`
- REST API endpoint design and organization
- Middleware implementation and error handling
- Request/response patterns and API structure
- Route parameter validation
- API versioning and endpoint consolidation

**Keywords that trigger:** `routes`, `api`, `endpoint`, `express`, `middleware`, `request`, `response`, `REST`, `route handler`, `API design`

#### UI/UX Component Library Agent (`ui-component-library-agent`) 🔷
**Color:** Cyan
**Auto-invoke when tasks involve:**
- shadcn/ui component usage and customization
- Tailwind CSS styling and design system
- Component composition and reusability patterns
- Accessibility (a11y) best practices
- Responsive design and mobile optimization
- Design consistency across the application

**Keywords that trigger:** `shadcn`, `tailwind`, `ui component`, `styling`, `accessibility`, `responsive`, `design system`, `component library`, `a11y`, `mobile`

#### Performance Optimization Agent (`performance-optimization-agent`) 🟨
**Color:** Gold
**Auto-invoke when tasks involve:**
- React Query optimization and caching strategies
- Database query performance and indexing
- Component render optimization (useMemo, useCallback)
- Bundle size analysis and code splitting
- Performance profiling and bottleneck identification
- Lazy loading and data fetching optimization

**Keywords that trigger:** `performance`, `optimization`, `slow`, `cache`, `query optimization`, `render`, `bundle size`, `lazy load`, `profiling`, `bottleneck`

#### Testing & Quality Assurance Agent (`testing-qa-agent`) 🧪
**Color:** Teal
**Auto-invoke when tasks involve:**
- Unit test creation and maintenance in `__tests__` directories
- Integration testing strategies
- Test coverage analysis and improvement
- Mocking patterns for API and database calls
- E2E testing scenarios
- Bug fix verification and regression testing
- **NEW**: Test-Driven Development (TDD) - writing tests BEFORE implementation

**Keywords that trigger:** `test`, `testing`, `coverage`, `mock`, `unit test`, `integration test`, `e2e`, `bug fix`, `quality assurance`, `regression`, `TDD`, `test-first`

**TDD Mode:** When invoked by `test-driven-feature-agent`, this agent writes comprehensive failing tests before any implementation begins.

#### Notification & Communication Agent (`notification-communication-agent`) 🩷
**Color:** Pink
**Auto-invoke when tasks involve:**
- Email notification systems
- User invitation workflows
- Password reset communication flows
- Alert and notification triggers
- Communication templates and formatting
- Delivery tracking and error handling

**Keywords that trigger:** `email`, `notification`, `invitation`, `alert`, `communication`, `password reset`, `notify`, `message`, `template`, `send`

#### UI Testing Agent (`ui-testing-agent`) 🎭
**Color:** Theater Masks
**Auto-invoke when tasks involve:**
- End-to-end testing with Playwright MCP
- Complete user flow verification
- Browser-based integration testing
- Visual regression testing with screenshots
- Console error monitoring
- Network request inspection

**Keywords that trigger:** `e2e`, `end-to-end`, `user flow`, `browser test`, `playwright`, `visual test`, `integration test`, `screenshot verification`

#### Visual Design Review Agent (`visual-design-review-agent`) 🎨
**Color:** Artist Palette
**Auto-invoke when tasks involve:**
- UI/UX quality assurance and design review
- WCAG 2.1 AA accessibility compliance
- Responsive design verification (7 viewports)
- Interactive state testing (hover, focus, etc.)
- Design system consistency checks
- Visual regression detection

**Keywords that trigger:** `design review`, `accessibility`, `wcag`, `responsive`, `ui review`, `visual qa`, `design consistency`, `a11y audit`

#### UI Development Agent (`ui-development-agent`) 🎯
**Color:** Target
**Auto-invoke when tasks involve:**
- Building UI components with live visual feedback
- Component development with Playwright verification
- Real-time responsive testing during development
- Visual iteration and debugging
- Dark mode verification
- Accessibility checks during build

**Keywords that trigger:** `build component`, `create ui`, `visual feedback`, `develop component`, `ui development`, `live testing`, `component iteration`

#### Code Quality & Linting Agent (`code-quality-linting-agent`) 🧹
**Color:** Broom (Code Cleanup)
**Auto-invoke when tasks involve:**
- Setting up ESLint, Prettier, or code formatting tools
- Configuring TypeScript strict mode or compiler options
- Adding code style enforcement and pre-commit hooks
- Fixing linting violations across the codebase
- Code smell detection and refactoring suggestions
- Import organization and sorting
- Configuring Husky or lint-staged

**Keywords that trigger:** `eslint`, `prettier`, `code style`, `formatting`, `lint`, `code quality`, `husky`, `pre-commit`, `typescript strict`, `code standards`, `import sorting`, `linter`

**Special Capabilities:**
- ESLint configuration for React, TypeScript, and accessibility
- Prettier integration with ESLint
- Automatic code formatting and fix application
- Import sorting and organization
- Pre-commit hook implementation (Husky + lint-staged)
- Incremental migration to stricter linting rules
- Custom rule configuration for project-specific patterns
- Integration with CI/CD for automated checks

**When to use:**
- Setting up new linting infrastructure (PRIORITY: currently missing!)
- Enforcing code standards across team
- Automating code quality checks
- Migrating to stricter TypeScript settings

**When NOT to use:**
- One-off manual formatting tasks
- Simple style preference discussions

#### Feature Flag & Settings Management Agent (`feature-flag-settings-agent`) 🎛️
**Color:** Control Knobs
**Auto-invoke when tasks involve:**
- Implementing feature flag systems
- Creating organization/team settings pages
- Building settings inheritance hierarchies
- Permission-based feature access control
- A/B testing infrastructure
- Feature rollout strategies
- Percentage-based feature releases
- User segment targeting

**Keywords that trigger:** `feature flag`, `settings`, `configuration`, `feature toggle`, `a/b testing`, `rollout`, `settings inheritance`, `org settings`, `feature control`, `settings page`, `enable feature`, `disable feature`

**Special Capabilities:**
- Multi-level feature flags (global → org → team → user)
- Settings inheritance and override logic
- Feature flag UI with preview mode
- Percentage-based rollouts (e.g., 50% of users)
- User segment targeting (e.g., college orgs only)
- Feature analytics and usage tracking
- Graceful degradation when features disabled
- Middleware for feature checking
- React context for client-side feature access

**Database Schema Examples:**
```sql
feature_flags (id, name, description, default_enabled, requires_tier, rollout_percentage)
organization_settings (id, organization_id, feature_overrides JSONB, custom_settings JSONB)
```

**When to use:**
- Implementing org-customizable features
- Building settings management interfaces
- Creating tier-based feature access
- Rolling out experimental features

**When NOT to use:**
- Simple boolean flags in environment variables
- One-time configuration changes

#### Dependency Management Agent (`dependency-management-agent`) 📦
**Color:** Package Box
**Auto-invoke when tasks involve:**
- Running `npm audit` or security vulnerability scans
- Updating dependencies in `package.json` or `package-lock.json`
- Resolving dependency conflicts and peer dependency issues
- Security vulnerability remediation
- Breaking change migrations when upgrading major versions
- Lockfile maintenance and cleanup
- Analyzing dependency tree and bundle impact

**Keywords that trigger:** `npm`, `dependencies`, `package.json`, `security audit`, `vulnerability`, `npm update`, `breaking changes`, `semver`, `package upgrade`, `dependency conflict`, `npm audit`, `security patch`

**Special Capabilities:**
- Automated security patch application
- Breaking change impact analysis across codebase
- Dependency conflict resolution strategies
- Version compatibility checking
- Automated changelog review for upgrades
- Test suite verification after updates
- Incremental upgrade strategies for major versions
- Bundle size impact analysis

**When to use:**
- Security vulnerabilities detected in CI
- Upgrading major dependencies
- Resolving npm install errors
- Regular dependency maintenance

**When NOT to use:**
- Adding a single new dependency
- Trivial patch version updates

#### Deployment & Release Management Agent (`deployment-release-agent`) 🚀
**Color:** Rocket (Deployment)
**Auto-invoke when tasks involve:**
- Creating GitHub releases and release notes
- Managing Railway deployments and environments
- Running deployment scripts (backup, smoke tests, health checks)
- Updating deployment documentation
- Managing environment variables across staging/production
- Rollback operations and incident response
- Pre-deployment validation checklists
- Zero-downtime deployment strategies

**Keywords that trigger:** `release`, `deploy`, `railway`, `production`, `staging`, `rollback`, `environment variables`, `smoke test`, `health check`, `deployment`, `release notes`, `environment parity`, `deploy script`

**Special Capabilities:**
- Automated release note generation from commits
- Pre-deployment checklist validation
- Environment parity verification (staging vs prod)
- Automated rollback on health check failures
- Database backup verification before migrations
- Deployment status monitoring and alerting
- Railway CLI automation
- Semantic versioning enforcement
- Deployment workflow orchestration

**Integration with existing scripts:**
- `scripts/backup-database.js` - Pre-deployment backups
- `scripts/smoke-tests.js` - Post-deployment verification
- `scripts/health-check.js` - Service health validation
- `scripts/validate-env.js` - Environment configuration checks

**When to use:**
- Creating production releases
- Deployment automation improvements
- Rollback procedures
- Environment configuration management

**When NOT to use:**
- Local development builds
- Simple git operations

#### Multi-Tenant Configuration Agent (`multi-tenant-profiles-agent`) 🏢
**Color:** Building (Organizations)
**Auto-invoke when tasks involve:**
- Implementing organization type profiles (College, HS, Club, Youth, Pro)
- Creating type-specific workflows and dashboards
- Building customizable experiences per org type
- White-labeling and custom branding features
- Tenant isolation strategies and data boundaries
- Cross-tenant data policies
- Org type migration tools
- Template libraries per organization type

**Keywords that trigger:** `multi-tenant`, `org type`, `organization profiles`, `white-label`, `tenant isolation`, `customizable workflows`, `org-specific features`, `organization type`, `college org`, `high school`, `club team`, `branding`, `custom theme`

**Special Capabilities:**
- Org type taxonomy with inheritance (College, HS, Club, Youth, Pro)
- Type-specific default configurations and feature sets
- Custom workflow definitions per org type
- White-label branding (logo, colors, custom domain)
- Feature access by org type/tier
- Data isolation and security boundaries (RLS policies)
- Org type migration wizards
- Dashboard customization per org type
- Role variations per org type

**Database Schema Examples:**
```sql
organization_types (id, name, default_features JSONB, default_settings JSONB)
organization_profiles (id, organization_id, type_id, custom_branding JSONB, workflow_overrides JSONB)
```

**Integration Points:**
- Works with `feature-flag-settings-agent` for type-specific features
- Coordinates with `security-authentication-agent` for role variations
- Uses `ui-component-library-agent` for themed interfaces

**When to use:**
- Building org type differentiation
- Implementing white-label features
- Creating org-specific workflows
- Multi-tenant architecture design

**When NOT to use:**
- Single-tenant applications
- Simple user preferences

#### Custom Metric Configuration Agent (`custom-metric-config-agent`) 📊
**Color:** Chart with Gear
**Auto-invoke when tasks involve:**
- Implementing dynamic metric definition systems
- Creating custom test/measurement builders
- Building validation rule engines for custom metrics
- Implementing sport-specific measurement types
- Custom data collection workflows
- Metric versioning and schema evolution
- Unit conversion systems
- Formula-based derived metrics

**Keywords that trigger:** `custom metric`, `test configuration`, `dynamic form`, `validation rules`, `sport-specific`, `measurement types`, `metric builder`, `custom test`, `define metric`, `measurement configuration`, `custom measurement`, `metric definition`

**Special Capabilities:**
- Dynamic schema for custom metrics (JSONB/JSON columns)
- Visual metric builder UI (drag-and-drop form creation)
- Validation rule engine (min/max, data type, regex, custom logic)
- Unit conversion system (meters/feet, seconds/milliseconds)
- Custom metric versioning (track definition changes over time)
- Migration tools when metric definitions change
- Sport-specific metric templates
- Formula-based calculated metrics
- Bulk metric import/export

**Database Schema Examples:**
```sql
custom_metrics (
  id, organization_id, name, data_type, unit,
  validation_rules JSONB, calculation_formula, sport_specific, version
)
custom_metric_values (id, measurement_id, custom_metric_id, value, validated)
```

**Integration Points:**
- Coordinates with `form-validation-agent` for dynamic validation
- Works with `database-schema-agent` for flexible data models
- Uses `ui-component-library-agent` for metric builder UI
- Integrates with `analytics-visualization-agent` for custom charts

**When to use:**
- Allowing orgs to define custom tests
- Building sport-specific measurement systems
- Creating flexible data collection
- Metric configuration interfaces

**When NOT to use:**
- Standard built-in metrics
- Simple form field additions

### Proactive Agent Usage Guidelines

#### Autonomous Feature Development
For feature implementation with tests, automatically invoke the test-driven-feature-agent:

```typescript
// Example: User requests "Implement broad jump tracking with tests"
// Claude should automatically use: Task(subagent_type: "test-driven-feature-agent", ...)

// Example: User requests "TDD approach for RSI calculation"
// Claude should automatically use: Task(subagent_type: "test-driven-feature-agent", ...)

// The test-driven-feature-agent will:
// 1. Write tests first
// 2. Coordinate specialized agents for implementation
// 3. Run tests and iterate on failures
// 4. Complete when all tests pass
```

#### Single Domain Tasks
When a task clearly falls into one domain, automatically invoke the appropriate agent:

```typescript
// Example: User requests "Add a new measurement type for RSI"
// Claude should automatically use: Task(subagent_type: "database-schema-agent", ...)
```

#### Multi-Domain Tasks
For tasks spanning multiple domains, invoke relevant agents in parallel:

```typescript
// Example: User requests "Implement coach dashboard with team analytics"
// Claude should automatically use multiple Task() calls in parallel:
// - database-schema-agent (optimize queries)
// - security-authentication-agent (coach permissions)
// - analytics-visualization-agent (dashboard charts)
// - performance-optimization-agent (caching strategy)

// Example: User requests "Add CSV import for measurements with OCR fallback"
// Claude should automatically use multiple Task() calls in parallel:
// - data-import-export-agent (CSV processing)
// - ocr-image-processing-agent (OCR fallback)
// - form-validation-agent (import form)
// - database-schema-agent (bulk insert optimization)
```

#### Context-Rich Prompts
When invoking agents, provide AthleteMetrics-specific context:

**Good:**
"Optimize the measurement aggregation queries for the analytics dashboard. Focus on the measurements table joins with users and teams, considering the temporal team membership patterns and archived team handling."

**Avoid:**
"Optimize database queries"

### Agent Integration Rules

1. **Proactive Usage**: Use agents automatically when task keywords match, don't wait for explicit requests
2. **Parallel Execution**: Use multiple Task() calls in single response when multiple domains are involved
3. **Context Enhancement**: Always provide AthleteMetrics-specific context in agent prompts
4. **File-Based Triggers**: Auto-invoke agents when working with their domain-specific files
5. **Error Handling**: If a task might affect multiple domains, prefer including more agents rather than fewer

### Task Patterns That Always Trigger Agents

#### Autonomous Feature Development (NEW)
- "Implement X with tests" → `test-driven-feature-agent`
- "Use TDD approach" → `test-driven-feature-agent`
- "Test-first development" → `test-driven-feature-agent`
- "Autonomous mode" → `test-driven-feature-agent`
- Complex features requiring multiple agents → `test-driven-feature-agent`
- Bug fixes with "write regression test first" → `test-driven-feature-agent`

#### Database Schema Changes
- Any modification to `shared/schema.ts` → `database-schema-agent`
- Running `npm run db:push` → `database-schema-agent`
- Adding new measurement types → `database-schema-agent` + `analytics-visualization-agent`

#### Chart/Analytics Work
- Any file in `client/src/components/charts/` → `analytics-visualization-agent`
- Statistical calculations or performance analysis → `analytics-visualization-agent`
- Dashboard or reporting features → `analytics-visualization-agent` + others

#### Security/Auth Changes
- Any file in `server/auth/` → `security-authentication-agent`
- Permission or role changes → `security-authentication-agent`
- Organization or team access → `security-authentication-agent`

#### Cross-Cutting Features
- New user types or roles → `database-schema-agent` + `security-authentication-agent` + `form-validation-agent`
- Organization management → `database-schema-agent` + `security-authentication-agent` + `api-route-architecture-agent`
- Performance measurement features → `database-schema-agent` + `analytics-visualization-agent` + `form-validation-agent`

#### OCR/Image Processing Work
- Any file in `server/ocr/` → `ocr-image-processing-agent`
- Photo upload features → `ocr-image-processing-agent` + `form-validation-agent`
- Measurement extraction from images → `ocr-image-processing-agent` + `data-import-export-agent`

#### Data Import/Export Work
- CSV import/export features → `data-import-export-agent`
- Bulk operations → `data-import-export-agent` + `database-schema-agent`
- Import validation → `data-import-export-agent` + `form-validation-agent`

#### Form Development
- New forms or form components → `form-validation-agent`
- Complex validation rules → `form-validation-agent` + `database-schema-agent`
- Multi-step forms → `form-validation-agent` + `ui-component-library-agent`

#### API/Route Development
- New API endpoints → `api-route-architecture-agent`
- Route refactoring → `api-route-architecture-agent` + `database-schema-agent`
- Middleware changes → `api-route-architecture-agent` + `security-authentication-agent`

#### UI/Design Work
- Component library updates → `ui-component-library-agent`
- Accessibility improvements → `ui-component-library-agent` + `form-validation-agent`
- Design system consistency → `ui-component-library-agent`

#### Performance Issues
- Slow queries or rendering → `performance-optimization-agent`
- Caching improvements → `performance-optimization-agent` + `database-schema-agent`
- Bundle size optimization → `performance-optimization-agent`

#### Testing & QA
- Adding tests → `testing-qa-agent`
- Bug fixes → `testing-qa-agent` + relevant domain agent
- Coverage improvements → `testing-qa-agent`

#### Notifications/Communications
- Email features → `notification-communication-agent`
- User invitations → `notification-communication-agent` + `security-authentication-agent`
- Alert systems → `notification-communication-agent`

#### UI/Visual Testing (NEW)
- E2E user flows → `ui-testing-agent`
- Design review/QA → `visual-design-review-agent`
- Component development → `ui-development-agent`
- Accessibility audits → `visual-design-review-agent`
- Responsive testing → `visual-design-review-agent` or `ui-development-agent`
- Visual regression → `ui-testing-agent` + `visual-design-review-agent`

#### Code Quality & Linting (NEW)
- Setting up ESLint/Prettier → `code-quality-linting-agent`
- Pre-commit hooks → `code-quality-linting-agent`
- Code formatting standards → `code-quality-linting-agent`
- TypeScript strict mode → `code-quality-linting-agent`

#### Feature Flags & Settings (NEW)
- Org settings pages → `feature-flag-settings-agent`
- Feature toggles → `feature-flag-settings-agent`
- A/B testing → `feature-flag-settings-agent`
- Tier-based features → `feature-flag-settings-agent` + `multi-tenant-profiles-agent`

#### Dependency Management (NEW)
- Security vulnerabilities → `dependency-management-agent`
- Dependency updates → `dependency-management-agent`
- Breaking changes → `dependency-management-agent`
- npm audit failures → `dependency-management-agent`

#### Deployment & Releases (NEW)
- Creating releases → `deployment-release-agent`
- Railway deployments → `deployment-release-agent`
- Environment variables → `deployment-release-agent`
- Rollback procedures → `deployment-release-agent`

#### Multi-Tenant Features (NEW)
- Org type customization → `multi-tenant-profiles-agent`
- White-labeling → `multi-tenant-profiles-agent`
- College vs HS vs Club → `multi-tenant-profiles-agent`
- Org-specific workflows → `multi-tenant-profiles-agent` + `feature-flag-settings-agent`

#### Custom Metrics (NEW)
- Custom test creation → `custom-metric-config-agent`
- Sport-specific metrics → `custom-metric-config-agent`
- Metric builder UI → `custom-metric-config-agent` + `form-validation-agent`
- Custom benchmarks → `custom-metric-config-agent` + `analytics-visualization-agent`

## Development Commands

### Core Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build both frontend and backend for production
- `npm run start` - Start production server
- `npm run check` - Run TypeScript type checking
- `npm run db:push` - Push database schema changes to PostgreSQL

### Database Operations
- `npm run db:push` - Apply schema changes from `shared/schema.ts` to database
- Database migrations are handled through Drizzle Kit configuration in `drizzle.config.ts`

## Project Architecture

### Monorepo Structure
This is a full-stack TypeScript application with a shared schema approach:

- **`client/`** - React frontend built with Vite
- **`server/`** - Express.js backend API
- **`shared/`** - Shared types, schemas, and database definitions

### Path Aliases
- `@/*` → `client/src/*` (frontend components, pages, utils)
- `@shared/*` → `shared/*` (database schema, types)
- `@assets/*` → `attached_assets/*` (static assets)

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