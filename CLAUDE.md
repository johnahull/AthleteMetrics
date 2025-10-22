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
**Auto-invoke:** PR review, automated fixes, multi-iteration review→fix cycles, merge assessment
**Keywords:** `pull request`, `PR review`, `code review`, `merge`, `@claude fix`, `@claude merge`

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

## Development Commands

### Core Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build both frontend and backend for production
- `npm run start` - Start production server
- `npm run check` - Run TypeScript type checking
- `npm run db:push` - Push database schema changes to PostgreSQL

### Database Operations
- `npm run db:push` - Apply schema changes from `packages/shared/schema.ts` to database
- Database migrations are handled through Drizzle Kit configuration in `drizzle.config.ts`

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

### Railway Configuration

#### Deployment Configuration (`railway.json`)
- **Healthcheck Timeout**: 90 seconds (reduced from 300s)
  - **Rationale**: Express server typically starts in 5-15s, Neon WebSocket connection takes 2-5s
  - **Safety Margin**: 90s provides 6x safety margin for cold starts
  - **Platform Alignment**: Railway's default timeout is 100s, so 90s aligns with platform limits
  - **Documentation**: See `railway.json` for current configuration