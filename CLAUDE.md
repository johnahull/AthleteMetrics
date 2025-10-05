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

**Keywords that trigger:** `test`, `testing`, `coverage`, `mock`, `unit test`, `integration test`, `e2e`, `bug fix`, `quality assurance`, `regression`

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

### Proactive Agent Usage Guidelines

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

#### Rate Limiting Bypass (Development Only)
- `BYPASS_ANALYTICS_RATE_LIMIT` - Set to "true" to bypass analytics rate limiting for site admins (default: false)
- `BYPASS_GENERAL_RATE_LIMIT` - Set to "true" to bypass general API rate limiting (default: false)

**Security Note**: Rate limiting bypasses are disabled by default and automatically disabled in production environments (NODE_ENV=production) regardless of environment variable settings. This provides an additional safeguard against accidental security vulnerabilities in production deployments.