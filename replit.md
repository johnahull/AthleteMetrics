# Athlete Performance Hub

## Overview

The Athlete Performance Hub is a comprehensive full-stack web application designed for tracking and analyzing athlete performance data. The platform focuses specifically on two key metrics: 10-yard fly time and vertical jump measurements. It provides team management, player tracking, data entry, analytics, and comprehensive import/export functionality for coaches and performance analysts.

The system supports flexible player management where athletes can be assigned to multiple teams, participate in multiple sports, or exist as independent players without any team affiliations.

## Recent Changes

### Publish Page Team Display Fix (September 30, 2025)
- **Resolved Athletes Showing as "Independent"**: Fixed issue where all athletes on the Publish page were displaying as "Independent Athlete" instead of showing their actual team names
- **Root Cause**: The getMeasurements function was filtering teams based on the measurement date, excluding teams where the athlete joined after the measurement was recorded
- **Solution**: Modified team filtering logic to display athletes with their current active teams rather than teams active at measurement time
- **Impact**: Publish page now correctly displays team affiliations for all athletes with active team memberships

### Authentication and Data Access Fixes (September 17, 2025)
- **Resolved Session Organization Context Issue**: Fixed critical authentication bug where `primaryOrganizationId` was missing from user sessions, causing teams and athletes pages to show empty data
- **Fixed Login Route**: Added proper `primaryOrganizationId` field to session during login to ensure organization context is maintained
- **Fixed Impersonation Route**: Enhanced target user role determination and organization context for proper impersonation functionality
- **Fixed Team Distribution Display**: Removed hardcoded `.slice(0, 5)` limitation in dashboard Team Distribution section to display all teams instead of just the first 5
- **Verified Data Access**: Confirmed coaches can now properly access teams, athletes, and measurements within their organization scope

### Critical Bug Fixes (September 16, 2025)
- **Resolved Empty Measurements Display**: Fixed analytics page showing no measurements by removing overly restrictive default filters (birthYear=2009, dateRange=last30) that were filtering out most data
- **Fixed Team Assignment Display**: Corrected athletes showing as "Independent" instead of their actual team names by ensuring proper organization context in API requests
- **Enhanced Organization Filtering**: Added organization context to measurements API requests to ensure users only see data from their organization
- **Improved Cache Management**: Added cache-busting headers to prevent stale data from being served, ensuring fresh data retrieval
- **Verified Data Integrity**: Confirmed 95 measurements and 129 users exist in database with proper team assignments and organization memberships

### Performance Optimization (September 5, 2025)
- **Resolved N+1 Query Issue**: Fixed performance bottleneck in `getAthletes()` method that was making individual database calls for each athlete's team data
- **Implemented Batched Query Approach**: Replaced individual `getUserTeams()` calls with a single batched query using `inArray()` to fetch all athlete-team relationships at once
- **Improved Type Safety**: Updated IStorage interface return type for `getAthletes()` to properly include teams property, eliminating need for "any" type casts
- **Reduced Database Load**: Significantly reduced database round trips when loading athlete lists, improving response times and scalability

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React 18 with TypeScript**: Modern component-based architecture using functional components and hooks
- **Vite Build System**: Fast development server and optimized production builds
- **Tailwind CSS + shadcn/ui**: Utility-first styling with a comprehensive component library for consistent UI
- **Wouter Routing**: Lightweight client-side routing solution
- **React Query**: Sophisticated data fetching, caching, and synchronization with the backend
- **React Hook Form + Zod**: Type-safe form handling with comprehensive validation
- **Chart.js Integration**: Interactive data visualization for performance analytics

### Backend Architecture
- **Express.js with TypeScript**: RESTful API server with type safety throughout
- **Session-based Authentication**: Simple admin authentication using environment variables
- **Multer File Upload**: Handles CSV file uploads for bulk data import
- **Comprehensive REST API**: Full CRUD operations for teams, players, and measurements
- **Optimized Query Performance**: Batched data fetching to prevent N+1 query issues

### Database Architecture
- **Drizzle ORM**: Type-safe database operations with PostgreSQL support
- **Schema Design**: Normalized relational structure with teams, players, and measurements tables
- **UUID Primary Keys**: Secure, non-sequential identifiers for all entities
- **Referential Integrity**: Foreign key constraints ensuring data consistency
- **Computed Fields**: Full name generation and automatic unit assignment
- **Performance Optimizations**: Batched queries for athlete-team relationships to minimize database round trips

### Data Management
- **CSV Import/Export**: Bulk data operations with validation and error reporting
- **Flexible Import Modes**: Support for both matching existing players and creating new ones
- **Data Validation**: Comprehensive validation using Zod schemas at both client and server levels
- **Real-time Analytics**: Dynamic filtering and aggregation for performance insights
- **Multi-Value Support**: Players can have multiple teams, sports, and contact methods
- **Independent Players**: Support for players without team assignments, labeled as "Independent Players"

### Authentication & Security
- **Environment-based Admin Credentials**: Simple admin login using ADMIN_USER and ADMIN_PASS
- **Session Management**: Secure session handling with HTTP-only cookies
- **Protected Routes**: Client-side route protection with automatic redirects

## External Dependencies

### Core Infrastructure
- **PostgreSQL Database**: Primary data storage via DATABASE_URL environment variable
- **Neon Database Service**: Serverless PostgreSQL hosting with connection pooling

### Frontend Libraries
- **Radix UI Components**: Accessible, unstyled UI primitives for the component system
- **Chart.js**: Comprehensive charting library for performance data visualization
- **React Query**: Advanced server state management and caching
- **Date-fns**: Date manipulation and formatting utilities

### Backend Services
- **Express Session Management**: User authentication and session persistence
- **CSV Parser**: File processing for bulk data imports
- **Multer**: Multipart form data handling for file uploads

### Development Tools
- **TypeScript**: Type safety across the entire application stack
- **Vite**: Development server and build tooling
- **Drizzle Kit**: Database migration and schema management
- **ESBuild**: Fast JavaScript bundling for production builds

### Deployment & Hosting
- **Replit Environment**: Development and hosting platform with integrated database provisioning
- **Environment Variables**: Configuration management for database connections and admin credentials