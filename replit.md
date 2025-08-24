# Athlete Performance Hub

## Overview

The Athlete Performance Hub is a comprehensive full-stack web application designed for tracking and analyzing athlete performance data. The platform focuses specifically on two key metrics: 10-yard fly time and vertical jump measurements. It provides team management, player tracking, data entry, analytics, and comprehensive import/export functionality for coaches and performance analysts.

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

### Database Architecture
- **Drizzle ORM**: Type-safe database operations with PostgreSQL support
- **Schema Design**: Normalized relational structure with teams, players, and measurements tables
- **UUID Primary Keys**: Secure, non-sequential identifiers for all entities
- **Referential Integrity**: Foreign key constraints ensuring data consistency
- **Computed Fields**: Full name generation and automatic unit assignment

### Data Management
- **CSV Import/Export**: Bulk data operations with validation and error reporting
- **Flexible Import Modes**: Support for both matching existing players and creating new ones
- **Data Validation**: Comprehensive validation using Zod schemas at both client and server levels
- **Real-time Analytics**: Dynamic filtering and aggregation for performance insights

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