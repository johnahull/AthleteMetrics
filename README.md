# Athlete Performance Hub

A full-stack web application for tracking and analyzing athlete performance data, specifically focused on 10-yard fly time and vertical jump measurements.

## Features

- **Dashboard**: Overview of key performance metrics and recent activity
- **Team Management**: Create and manage teams with different levels (Club, HS, College)
- **Player Management**: Add players with team assignments and personal details
- **Data Entry**: Record measurements with validation and quick-add functionality
- **Analytics**: Advanced filtering, leaderboards, percentile analysis, and interactive charts
- **Import/Export**: CSV import with validation and preview, plus data export functionality
- **Authentication**: Simple admin login system

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **shadcn/ui** component library
- **Chart.js** via react-chartjs-2 for data visualization
- **React Query** for data fetching and caching
- **Wouter** for routing
- **React Hook Form** with Zod validation

### Backend
- **Node.js** with Express
- **TypeScript** throughout
- **Prisma ORM** with PostgreSQL/SQLite support
- **Session-based authentication**
- **CSV parsing and generation**
- **Comprehensive REST API**

### Database
- **PostgreSQL** (production) / **SQLite** (development)
- **Drizzle ORM** for type-safe database access
- **Schema validation** with Zod

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   