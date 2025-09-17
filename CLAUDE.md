# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Note: Rate limiting is automatically skipped for site admins in development mode.