# Report Generation System

Complete implementation of Phases 1, 2, and 3 for coach-generated athlete reports.

## Features Implemented

### Phase 1: Print-Optimized Web Reports ✅
- **Print CSS** (`client/src/styles/print.css`): Professional print layouts with page breaks, proper sizing
- **ReportHeader Component**: Branding, metadata, date ranges
- **ReportView Component**: Main container with print/download/share actions
- **ReportStats & ReportTable**: Data display components
- Print-optimized styling with @media print rules
- Support for both portrait and landscape orientations
- **Chart Integration**: All latest chart components (ConnectedScatter, MultiLine, TimeSeriesBoxSwarm, Swarm)

### Phase 2: Server-Side PDF Generation ✅
- **Puppeteer Integration**: Installed and configured for headless PDF generation
- **Report Service** (`server/reports.ts`):
  - `generateReport()`: Main report generation with PDF option
  - `generatePdf()`: Puppeteer-based PDF rendering
  - `getReport()`: Fetch report by ID
  - `getReportByShareToken()`: Public sharing support
  - `deleteReport()`: Clean up reports and files
- **API Endpoints** (`server/routes/report-routes.ts`):
  - `POST /api/reports/generate`: Create new report
  - `GET /api/reports/:id`: Get report metadata
  - `GET /api/reports/:id/download`: Download PDF
  - `GET /api/reports/shared/:shareToken`: Public access
  - `GET /api/reports/organization/:orgId`: List reports
  - `DELETE /api/reports/:id`: Delete report
- **Report Templates** (updated with latest chart components):
  - `IndividualReport.tsx`: Connected scatter, multi-line, and radar charts
  - `TeamReport.tsx`: Time series box swarm, box plot, and swarm charts
  - `MultiAthleteReport.tsx`: Bar and radar comparison charts
  - `RecruitingReport.tsx`: Radar, connected scatter, and multi-line charts

### Phase 3: Report Management & Templates ✅
- **Database Schema** (`shared/schema.ts`):
  - `report_templates` table: Saved report configurations
  - `generated_reports` table: Report history with metadata
  - Relations and validation schemas
- **Report Builder UI** (`client/src/pages/ReportBuilder.tsx`):
  - Interactive report type selection
  - Athlete/team picker
  - PDF generation toggle
  - Configuration options
- **Report History** (`client/src/pages/ReportHistory.tsx`):
  - List all generated reports
  - Download, share, and delete actions
  - Filterable by organization
- **Routing**: Added `/reports/builder` and `/reports/history` routes
- **Integration**: "Generate Report" and "View Reports" buttons on CoachAnalytics page

## Usage

### For Coaches

1. **Generate a Report**:
   - Go to `/reports/builder` or click "Generate Report" from Coach Analytics
   - Select report type (Individual, Team, Multi-Athlete, or Recruiting)
   - Choose athletes or teams
   - Click "Generate Report"
   - PDF will be generated and available for download

2. **View Report History**:
   - Go to `/reports/history` or click "View Reports" from Coach Analytics
   - See all past generated reports
   - Download PDFs or delete old reports

3. **Print Reports**:
   - Use browser print (Ctrl+P / Cmd+P) for any report view
   - Print CSS automatically optimizes layout

### Database Setup

Before using the report system, push the database schema:

```bash
npm run db:push
```

This creates the `report_templates` and `generated_reports` tables.

## File Structure

```
client/src/
├── components/reports/
│   ├── ReportHeader.tsx          # Header and footer components
│   ├── ReportView.tsx             # Main report container
│   └── templates/
│       ├── IndividualReport.tsx   # Individual athlete template
│       ├── TeamReport.tsx         # Team performance template
│       ├── MultiAthleteReport.tsx # Multi-athlete comparison
│       └── RecruitingReport.tsx   # Recruiting package template
├── pages/
│   ├── ReportBuilder.tsx          # Report creation UI
│   └── ReportHistory.tsx          # Report management
└── styles/
    └── print.css                  # Print-optimized styles

server/
├── reports.ts                     # Report service (PDF generation)
└── routes/
    └── report-routes.ts           # API endpoints

shared/
├── report-types.ts                # TypeScript types and defaults
└── schema.ts                      # Database schema (updated)
```

## Configuration Options

### Report Types

1. **Individual Report**: Single athlete performance over time
   - **Connected Scatter Chart**: Performance trends with personal bests highlighted
   - **Multi-Line Chart**: Multi-metric progress tracking
   - **Radar Chart**: Athletic profile across performance dimensions
   - Portrait orientation

2. **Team Report**: Team-wide statistics and distributions
   - **Time Series Box Swarm Chart**: Team performance evolution with distributions
   - **Box Plot Chart**: Statistical distribution across metrics
   - **Swarm Chart**: Individual data points visualization
   - Top performers table and roster
   - Landscape orientation for better readability

3. **Multi-Athlete Report**: Compare 2-10 athletes side-by-side
   - **Bar Chart**: Direct performance comparisons
   - **Radar Chart**: Multi-metric athlete profiles overlay
   - Performance data table
   - Portrait orientation

4. **Recruiting Report**: Professional recruiting package
   - **Radar Chart**: Comprehensive athletic profile
   - **Connected Scatter Chart**: Performance progression with trajectory
   - **Multi-Line Chart**: Multi-metric development over time
   - Strengths and highlights sections
   - Coach's assessment area
   - Portrait orientation

### Default Templates

Each report type has a default template configuration in `shared/report-types.ts`:
- `DEFAULT_INDIVIDUAL_TEMPLATE`
- `DEFAULT_TEAM_TEMPLATE`
- `DEFAULT_MULTI_ATHLETE_TEMPLATE`
- `DEFAULT_RECRUITING_TEMPLATE`

These can be customized or saved as organization-specific templates.

## Future Enhancements

### Not Yet Implemented (Optional):
- **Template Customization**: Save custom report templates per organization
- **Scheduled Reports**: Automatic weekly/monthly report generation
- **Email Delivery**: Send reports via email
- **Advanced Sharing**: Expiring share links, password protection
- **Report Analytics**: Track who views shared reports
- **Chart Customization**: Let coaches choose which charts to include
- **Branding**: Organization logos and color schemes

## Technical Details

### PDF Generation
- Uses Puppeteer (headless Chrome) for high-quality rendering
- Supports dynamic content with React server-side rendering
- Charts rendered as static images for PDF inclusion
- Automatic page breaks for multi-page reports
- ~2-5 seconds generation time per report

### Storage
- PDFs stored in `/reports` directory on server
- File paths stored in database
- Automatic cleanup when reports are deleted
- Optional: Move to S3/cloud storage for production

### Security
- Reports require authentication (session-based)
- Users can only access their organization's reports
- Share tokens for public access (optional expiration)
- Permission checks on all endpoints

### Performance
- Lazy-loaded report pages to reduce initial bundle size
- React Query for caching report data
- Pagination on report history (50 per page default)
- Background PDF generation (non-blocking)

## Environment Variables

No new environment variables required. System uses existing:
- `DATABASE_URL`: PostgreSQL connection
- `SESSION_SECRET`: Session encryption

## Testing

To test the report system:

1. Run the development server: `npm run dev`
2. Log in as a coach or org admin
3. Go to `/reports/builder`
4. Select a report type and athletes
5. Generate report
6. Check `/reports/history` for the generated report
7. Download the PDF

## Notes

- **Database migration required**: Run `npm run db:push` before first use
- **Puppeteer dependencies**: May require additional system packages on Linux (libX11, etc.)
- **PDF file storage**: Ensure write permissions for `/reports` directory
- **Chart rendering**: Charts are captured as base64 images in PDFs (future improvement: use Chart.js server-side rendering)

## Support

For issues or questions about the report system:
- Check server logs for Puppeteer errors
- Verify database schema is up to date
- Ensure report permissions are correctly configured
- Check that athletes/teams exist before generating reports