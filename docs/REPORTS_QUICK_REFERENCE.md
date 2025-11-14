# Reports Feature - Quick Reference

**Status:** ✅ Backend Complete | ⏳ Frontend Pending
**Phase:** 3 of 6 Complete
**Last Updated:** 2025-11-08

---

## 📁 Files Created/Modified

### Backend (✅ Complete)
```
packages/api/services/report-service.ts          (984 lines) ✅
packages/api/routes/report-routes.ts             (776 lines) ✅
packages/api/routes/index.ts                     (modified) ✅
packages/shared/schema.ts                        (modified) ✅
```

### Tests (✅ Written, ⏳ Pending Frontend)
```
tests/e2e/coach-report-creation.spec.ts          (345 lines) ✅
tests/e2e/individual-report-creation.spec.ts     (299 lines) ✅
tests/e2e/report-pdf-export.spec.ts              (249 lines) ✅
tests/e2e/report-public-sharing.spec.ts          (11 tests)  ✅
```

### Documentation (✅ Complete)
```
docs/BACKEND_IMPLEMENTATION_COMPLETE.md          ✅
docs/REPORTS_API_TESTING_GUIDE.md                ✅
docs/REPORTS_FEATURE_PROGRESS.md                 ✅
docs/PHASE_3_SUMMARY.md                          ✅
docs/REPORTS_QUICK_REFERENCE.md                  ✅ (this file)
```

### Frontend (⏳ Pending)
```
packages/web/src/pages/reports/index.tsx         ❌ TODO
packages/web/src/pages/reports/[id].tsx          ❌ TODO
packages/web/src/pages/public/reports/[token].tsx ❌ TODO
packages/web/src/components/reports/*            ❌ TODO
```

---

## 🚀 API Endpoints (12 Total)

### Report CRUD
```
POST   /api/reports                    Create report
GET    /api/reports                    List reports
GET    /api/reports/:id                Get report
PUT    /api/reports/:id                Update report
DELETE /api/reports/:id                Delete report
```

### Report Generation
```
POST   /api/reports/:id/generate       Generate with live data
```

### Snapshot Management
```
POST   /api/reports/:id/snapshots      Create public snapshot
GET    /api/reports/:id/snapshots      List snapshots
DELETE /api/reports/:id/snapshots/:snapshotId  Revoke snapshot
```

### Public Access (NO AUTH)
```
GET    /api/public/reports/:token      Get public snapshot
```

### PDF Export
```
GET    /api/reports/:id/pdf            Download PDF (auth required)
GET    /api/public/reports/:token/pdf  Download public PDF (no auth)
```

---

## 📊 Database Schema

### Tables (3 new)
```sql
reports              -- Report configurations (10 columns, 4 indexes)
report_snapshots     -- Public shareable snapshots (12 columns, 5 indexes)
report_benchmarks    -- User-defined benchmarks (11 columns, 2 indexes)
```

### Key Fields
```typescript
// reports
{
  id: string,
  organizationId: string,
  createdBy: string,
  name: string,
  description: string,
  reportType: 'coach' | 'individual',
  config: JSONB,  // Flexible configuration
  isTemplate: boolean
}

// report_snapshots
{
  id: string,
  reportId: string,
  publicToken: string,  // 21-char nanoid
  snapshotData: JSONB,  // Frozen report data
  expiresAt: timestamp,
  isActive: boolean,
  viewCount: number
}
```

---

## 🧪 Testing

### E2E Tests Status
```
Total: 34 tests
Status: ❌ FAILING (expected - no frontend)

coach-report-creation.spec.ts          9 tests  ❌
individual-report-creation.spec.ts     7 tests  ❌
report-pdf-export.spec.ts              7 tests  ❌
report-public-sharing.spec.ts         11 tests  ❌
```

### Manual Testing
```bash
# See: docs/REPORTS_API_TESTING_GUIDE.md
curl -b cookies.txt -X POST http://localhost:5000/api/reports \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Report", "reportType": "coach", ...}'
```

---

## 📦 Dependencies

```json
{
  "simple-statistics": "^7.8.8",      // Percentile calculations
  "nanoid": "^5.1.6",                 // Short tokens
  "jspdf": "^2.5.2",                  // PDF generation
  "jspdf-autotable": "^5.0.2",        // PDF tables
  "@react-pdf/renderer": "^4.3.1",    // Alt PDF (future)
  "chartjs-node-canvas": "^5.0.0"     // Charts (future)
}
```

---

## 🎯 Core Methods (ReportService)

### Report Generation
```typescript
generateCoachReport(reportId, userId)           // Team-level analysis
generateIndividualReport(reportId, userId, athleteId)  // Athlete analysis
```

### Statistical Calculations
```typescript
calculateCompositeIndex(performances, weights, percentiles)
calculatePercentiles(athleteId, orgId, metrics, performances, ...)
getBenchmarkComparisons(athleteId, orgId, reportId, performances)
```

### Snapshot Management
```typescript
createSnapshot(reportId, userId, expirationDays)
getPublicSnapshot(token)                        // NO AUTH
revokeSnapshot(snapshotId, userId)
```

---

## 🔒 Security

### Authentication
- ✅ All routes except `/api/public/*` require auth
- ✅ Organization access validated
- ✅ Site admins have full access (with audit)

### Rate Limiting
```
Standard endpoints:     100 req/15min
Generation/PDF:          20 req/15min
```

### Public Snapshots
```
Token: 21-char nanoid (128-bit entropy)
Expiration: Enforced on access
Revocation: Sets isActive = false
View Tracking: Increments viewCount
```

---

## 📈 Performance

### Estimated Response Times
```
Report generation (50 athletes):  < 500ms
PDF generation:                   < 500ms
Snapshot creation:                < 1s
Public snapshot access:           < 100ms
```

### Database Queries
```
Indexed fields:  org, type, token, expiration
Optimizations:   Joins, filters, best-per-athlete
```

---

## 🎨 Frontend TODO

### Pages Needed
```
/reports                           -- List + create
/reports/:id                       -- View/generate report
/public/reports/:token             -- Public viewer (no auth)
```

### Components Needed
```
ReportWizard                       -- Multi-step creation form
  ├─ TypeSelector                  -- Coach vs Individual
  ├─ TimeframeSelector             -- Preset + custom dates
  ├─ MetricsSelector               -- Multi-select metrics
  ├─ BenchmarkConfigurator         -- Site + custom + user-defined
  └─ CompositeIndexBuilder         -- Weight assignment

CoachReportView                    -- Team analysis display
  ├─ TeamStatisticsTable           -- Mean, median, top performer
  ├─ MetricRankingsTable           -- Per-metric rankings
  └─ CompositeIndexTable           -- Overall rankings

IndividualReportView               -- Athlete analysis display
  ├─ PerformanceTable              -- Metric + value + percentile
  └─ BenchmarkComparisonsTable     -- vs benchmarks

ShareReportDialog                  -- Public link creation
  ├─ ExpirationPicker              -- 7/30/90 days
  ├─ SnapshotList                  -- Active + revoked
  └─ CopyLinkButton                -- Clipboard
```

### React Query Hooks Needed
```typescript
useReports(orgId)
useReport(id)
useCreateReport()
useUpdateReport()
useDeleteReport()
useGenerateReport()
useCreateSnapshot()
useRevokeSnapshot()
usePublicReport(token)  // No auth
```

---

## 🚦 Next Steps

### Immediate
1. ✅ Backend complete (Phase 3)
2. ⏳ Build frontend UI (Phase 4)
3. ⏳ Run E2E tests
4. ⏳ Fix any integration issues
5. ⏳ Polish and refactor

### Future Enhancements
- [ ] Charts in PDFs (chartjs-node-canvas)
- [ ] Email delivery (SendGrid)
- [ ] Scheduled reports (cron)
- [ ] Report templates
- [ ] Historical comparison
- [ ] Excel/CSV export

---

## 📚 Documentation Index

| Document | Purpose |
|----------|---------|
| `BACKEND_IMPLEMENTATION_COMPLETE.md` | Full technical details |
| `REPORTS_API_TESTING_GUIDE.md` | Manual API testing |
| `REPORTS_FEATURE_PROGRESS.md` | Overall progress tracking |
| `PHASE_3_SUMMARY.md` | Phase 3 summary |
| `REPORTS_QUICK_REFERENCE.md` | This file (quick lookup) |

---

## 🔗 Quick Links

### Code Files
- [Report Service](../packages/api/services/report-service.ts)
- [API Routes](../packages/api/routes/report-routes.ts)
- [Database Schema](../packages/shared/schema.ts)

### Tests
- [Coach Report Tests](../tests/e2e/coach-report-creation.spec.ts)
- [Individual Report Tests](../tests/e2e/individual-report-creation.spec.ts)
- [PDF Export Tests](../tests/e2e/report-pdf-export.spec.ts)
- [Public Sharing Tests](../tests/e2e/report-public-sharing.spec.ts)

### Documentation
- [Backend Complete](./BACKEND_IMPLEMENTATION_COMPLETE.md)
- [API Testing Guide](./REPORTS_API_TESTING_GUIDE.md)
- [Feature Progress](./REPORTS_FEATURE_PROGRESS.md)
- [Phase 3 Summary](./PHASE_3_SUMMARY.md)

---

## ❓ Common Questions

**Q: Can I test the API now?**
A: Yes! See `REPORTS_API_TESTING_GUIDE.md` for curl commands.

**Q: When will E2E tests pass?**
A: After frontend is implemented (Phase 4).

**Q: What's the data structure for report config?**
A: See Zod schema in `packages/shared/schema.ts` (`insertReportSchema`)

**Q: How do public snapshots work?**
A: Generate nanoid token → freeze data in JSONB → share URL with token → access without auth

**Q: What metrics are supported?**
A: Any metric in `siteMetrics` table. Examples: FLY10_TIME, VERTICAL_JUMP, AGILITY_505, etc.

**Q: Can reports be scheduled?**
A: Not yet. Future enhancement using cron jobs.

**Q: Do PDFs include charts?**
A: Not yet. Tables only. Charts planned for future enhancement.

---

**Status:** ✅ Backend 100% Complete
**Next:** Frontend Implementation (Phase 4)
**Questions?** Check documentation links above or ask in Slack.
