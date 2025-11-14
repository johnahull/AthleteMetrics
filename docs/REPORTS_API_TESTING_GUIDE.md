# Reports API Testing Guide

This guide provides manual API testing commands to verify the backend implementation is working correctly. Use this to test the reports feature before the frontend is built.

---

## Prerequisites

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Login to get session cookie:**
   ```bash
   # Login and save cookies
   curl -c cookies.txt -X POST http://localhost:5000/api/login \
     -H "Content-Type: application/json" \
     -d '{
       "username": "admin",
       "password": "password"
     }'

   # Verify login
   curl -b cookies.txt http://localhost:5000/api/user
   ```

3. **Get your organization ID:**
   ```bash
   curl -b cookies.txt http://localhost:5000/api/organizations | jq '.[] | {id, name}'
   ```

4. **Export variables for easier testing:**
   ```bash
   export ORG_ID="your-org-id-here"
   export BASE_URL="http://localhost:5000"
   ```

---

## Test Sequence

### 1. Create a Coach Report

```bash
curl -b cookies.txt -X POST $BASE_URL/api/reports \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Team Performance Report - Q4 2024\",
    \"description\": \"Quarterly performance analysis for varsity team\",
    \"reportType\": \"coach\",
    \"organizationId\": \"$ORG_ID\",
    \"config\": {
      \"timeframe\": {
        \"type\": \"preset\",
        \"preset\": \"season\"
      },
      \"metrics\": [\"FLY10_TIME\", \"VERTICAL_JUMP\"],
      \"compositeIndex\": {
        \"enabled\": true,
        \"weights\": {
          \"FLY10_TIME\": 0.6,
          \"VERTICAL_JUMP\": 0.4
        }
      }
    }
  }" | jq '.'

# Save the report ID
export REPORT_ID="copy-the-id-from-response"
```

**Expected Response:**
```json
{
  "id": "cm3...",
  "organizationId": "...",
  "createdBy": "...",
  "name": "Team Performance Report - Q4 2024",
  "description": "Quarterly performance analysis for varsity team",
  "reportType": "coach",
  "config": { ... },
  "isTemplate": false,
  "createdAt": "2025-11-08T...",
  "updatedAt": null
}
```

### 2. List All Reports

```bash
curl -b cookies.txt "$BASE_URL/api/reports?organizationId=$ORG_ID" | jq '.'
```

**Expected:** Array of reports for your organization

### 3. Get Specific Report

```bash
curl -b cookies.txt "$BASE_URL/api/reports/$REPORT_ID" | jq '.'
```

**Expected:** Full report configuration

### 4. Generate Report (Live Data)

```bash
curl -b cookies.txt -X POST "$BASE_URL/api/reports/$REPORT_ID/generate" \
  -H "Content-Type: application/json" | jq '.'
```

**Expected Response Structure:**
```json
{
  "reportType": "coach",
  "reportConfig": { ... },
  "teamStatistics": [
    {
      "metric": "FLY10_TIME",
      "average": 1.45,
      "median": 1.43,
      "min": 1.28,
      "max": 1.67,
      "standardDeviation": 0.12,
      "topPerformer": {
        "userId": "...",
        "userName": "John Doe",
        "value": 1.28
      }
    }
  ],
  "athleteRankings": [
    {
      "userId": "...",
      "userName": "John Doe",
      "measurements": {
        "FLY10_TIME": 1.28,
        "VERTICAL_JUMP": 32.5
      },
      "percentiles": {
        "FLY10_TIME": 95.2,
        "VERTICAL_JUMP": 87.3
      },
      "compositeIndex": 92.1,
      "benchmarkComparisons": {}
    }
  ],
  "generatedAt": "2025-11-08T...",
  "teamIds": [],
  "athleteCount": 15
}
```

### 5. Update Report

```bash
curl -b cookies.txt -X PUT "$BASE_URL/api/reports/$REPORT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Team Performance Report - UPDATED",
    "description": "Updated description"
  }' | jq '.'
```

**Expected:** Updated report with new `updatedAt` timestamp

### 6. Create Public Snapshot

```bash
curl -b cookies.txt -X POST "$BASE_URL/api/reports/$REPORT_ID/snapshots" \
  -H "Content-Type: application/json" \
  -d '{
    "expirationDays": 30
  }' | jq '.'

# Save the public token
export PUBLIC_TOKEN="copy-the-publicToken-from-response"
```

**Expected Response:**
```json
{
  "id": "cm3...",
  "reportId": "...",
  "publicToken": "X4j8k2L9mP3qR5sT7vW1Y", // 21 characters
  "snapshotData": {
    "reportType": "coach",
    "reportConfig": { ... },
    "teamStatistics": [ ... ],
    "athleteRankings": [ ... ],
    "generatedAt": "2025-11-08T..."
  },
  "createdBy": "...",
  "expiresAt": "2025-12-08T...",
  "isActive": true,
  "viewCount": 0,
  "createdAt": "2025-11-08T..."
}
```

### 7. Access Public Snapshot (NO AUTH)

```bash
# No cookies needed - this is public!
curl "$BASE_URL/api/public/reports/$PUBLIC_TOKEN" | jq '.'
```

**Expected:** Same snapshot data, viewCount incremented

### 8. List All Snapshots for Report

```bash
curl -b cookies.txt "$BASE_URL/api/reports/$REPORT_ID/snapshots" | jq '.'
```

**Expected:** Array of snapshots (ordered by creation date)

### 9. Download PDF (Authenticated)

```bash
curl -b cookies.txt "$BASE_URL/api/reports/$REPORT_ID/pdf" -o report.pdf

# Verify PDF was created
file report.pdf
# Expected: report.pdf: PDF document, version 1.3

# Open PDF (macOS)
open report.pdf

# Open PDF (Linux)
xdg-open report.pdf
```

**Expected:** PDF with:
- Report title and description
- Generation timestamp
- Team statistics table
- Athlete rankings table (top 20)
- Professional styling (blue headers, striped rows)

### 10. Download Public PDF (NO AUTH)

```bash
curl "$BASE_URL/api/public/reports/$PUBLIC_TOKEN/pdf" -o public-report.pdf

file public-report.pdf
# Expected: public-report.pdf: PDF document, version 1.3
```

### 11. Revoke Snapshot

```bash
# Get snapshot ID
export SNAPSHOT_ID=$(curl -b cookies.txt "$BASE_URL/api/reports/$REPORT_ID/snapshots" | jq -r '.[0].id')

# Revoke it
curl -b cookies.txt -X DELETE "$BASE_URL/api/reports/$REPORT_ID/snapshots/$SNAPSHOT_ID" | jq '.'
```

**Expected:** Success message

**Verify revocation:**
```bash
curl "$BASE_URL/api/public/reports/$PUBLIC_TOKEN" | jq '.'
# Expected: {"message": "Snapshot has been revoked"}
```

### 12. Delete Report

```bash
curl -b cookies.txt -X DELETE "$BASE_URL/api/reports/$REPORT_ID" | jq '.'
```

**Expected:** Success message

**Verify deletion:**
```bash
curl -b cookies.txt "$BASE_URL/api/reports/$REPORT_ID" | jq '.'
# Expected: {"message": "Report not found"}
```

---

## Individual Report Testing

### 1. Create Individual Report

```bash
# Get an athlete ID first
export ATHLETE_ID=$(curl -b cookies.txt "$BASE_URL/api/users" | jq -r '.[0].id')

curl -b cookies.txt -X POST $BASE_URL/api/reports \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"John Doe - Performance Analysis\",
    \"reportType\": \"individual\",
    \"organizationId\": \"$ORG_ID\",
    \"config\": {
      \"timeframe\": {
        \"type\": \"preset\",
        \"preset\": \"all_time\"
      },
      \"metrics\": [\"FLY10_TIME\", \"VERTICAL_JUMP\"],
      \"benchmarks\": {
        \"userDefined\": [
          {
            \"metricCode\": \"FLY10_TIME\",
            \"value\": 1.30,
            \"label\": \"Elite Target\"
          }
        ]
      }
    }
  }" | jq '.'

export INDIVIDUAL_REPORT_ID="copy-the-id"
```

### 2. Generate Individual Report

```bash
curl -b cookies.txt -X POST "$BASE_URL/api/reports/$INDIVIDUAL_REPORT_ID/generate" \
  -H "Content-Type: application/json" \
  -d "{
    \"athleteId\": \"$ATHLETE_ID\"
  }" | jq '.'
```

**Expected Response:**
```json
{
  "reportType": "individual",
  "reportConfig": { ... },
  "athlete": {
    "userId": "...",
    "userName": "John Doe",
    "gender": "Male",
    "age": 18,
    "measurements": {
      "FLY10_TIME": 1.28,
      "VERTICAL_JUMP": 32.5
    },
    "percentiles": {
      "FLY10_TIME": 95.2,
      "VERTICAL_JUMP": 87.3
    },
    "benchmarkComparisons": {
      "FLY10_TIME": [
        {
          "benchmarkName": "Elite Target",
          "benchmarkValue": 1.30,
          "athleteValue": 1.28,
          "meetsTarget": true,
          "percentageDiff": -1.54,
          "comparisonOperator": "lte"
        }
      ]
    }
  },
  "generatedAt": "2025-11-08T..."
}
```

### 3. Download Individual Report PDF

```bash
curl -b cookies.txt "$BASE_URL/api/reports/$INDIVIDUAL_REPORT_ID/pdf?athleteId=$ATHLETE_ID" \
  -o individual-report.pdf

open individual-report.pdf
```

**Expected PDF Contains:**
- Athlete name and details
- Measurements table (metric, value, percentile)
- Benchmark comparisons table (benchmark, target, actual, meets target)

---

## Advanced Testing Scenarios

### Custom Date Range

```bash
curl -b cookies.txt -X POST $BASE_URL/api/reports \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Custom Date Range Report\",
    \"reportType\": \"coach\",
    \"organizationId\": \"$ORG_ID\",
    \"config\": {
      \"timeframe\": {
        \"type\": \"custom\",
        \"customStart\": \"2024-01-01\",
        \"customEnd\": \"2024-12-31\"
      },
      \"metrics\": [\"FLY10_TIME\"]
    }
  }" | jq '.'
```

### With Filters (Team, Gender, Position)

```bash
# Get team ID
export TEAM_ID=$(curl -b cookies.txt "$BASE_URL/api/teams?organizationId=$ORG_ID" | jq -r '.[0].id')

curl -b cookies.txt -X POST $BASE_URL/api/reports \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Filtered Report\",
    \"reportType\": \"coach\",
    \"organizationId\": \"$ORG_ID\",
    \"config\": {
      \"timeframe\": {
        \"type\": \"preset\",
        \"preset\": \"season\"
      },
      \"metrics\": [\"FLY10_TIME\"],
      \"filters\": {
        \"teamIds\": [\"$TEAM_ID\"],
        \"gender\": \"Male\",
        \"positions\": [\"F\", \"M\"]
      }
    }
  }" | jq '.'
```

### With Site Benchmarks

```bash
# Get site benchmark IDs
export BENCHMARK_ID=$(curl -b cookies.txt "$BASE_URL/api/benchmarks/site" | jq -r '.[0].id')

curl -b cookies.txt -X POST $BASE_URL/api/reports \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Report with Site Benchmarks\",
    \"reportType\": \"individual\",
    \"organizationId\": \"$ORG_ID\",
    \"config\": {
      \"timeframe\": {
        \"type\": \"preset\",
        \"preset\": \"season\"
      },
      \"metrics\": [\"FLY10_TIME\"],
      \"benchmarks\": {
        \"site\": [\"$BENCHMARK_ID\"]
      }
    }
  }" | jq '.'
```

---

## Error Testing

### 1. Unauthorized Access (No Session)

```bash
curl -X POST "$BASE_URL/api/reports" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test"}'
# Expected: 401 Unauthorized
```

### 2. Invalid Report Type

```bash
curl -b cookies.txt -X POST $BASE_URL/api/reports \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Invalid Report\",
    \"reportType\": \"invalid_type\",
    \"organizationId\": \"$ORG_ID\",
    \"config\": {}
  }"
# Expected: 400 Validation Error
```

### 3. Missing Required Fields

```bash
curl -b cookies.txt -X POST $BASE_URL/api/reports \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Missing Config\"
  }"
# Expected: 400 Validation Error
```

### 4. Non-Existent Report

```bash
curl -b cookies.txt "$BASE_URL/api/reports/non-existent-id"
# Expected: 404 Not Found
```

### 5. Expired Public Token

```bash
# Create snapshot with very short expiration (manual database edit needed)
# Or wait for expiration
curl "$BASE_URL/api/public/reports/expired-token"
# Expected: {"message": "Snapshot has expired"}
```

---

## Validation Checklist

Use this checklist to verify all functionality:

### Report CRUD
- [ ] Create coach report
- [ ] Create individual report
- [ ] List reports (filtered by org)
- [ ] Get specific report
- [ ] Update report
- [ ] Delete report

### Report Generation
- [ ] Generate coach report (live data)
- [ ] Generate individual report (with athleteId)
- [ ] Verify team statistics (mean, median, min, max, std dev)
- [ ] Verify athlete rankings
- [ ] Verify percentile calculations
- [ ] Verify composite index (if enabled)

### Benchmarks
- [ ] User-defined benchmarks in config
- [ ] Site benchmarks (if org enabled)
- [ ] Custom benchmarks (if org has them)
- [ ] Benchmark matching (gender/age/position filters)
- [ ] Benchmark comparison results (meetsTarget flag)

### Public Snapshots
- [ ] Create snapshot
- [ ] Access snapshot without auth
- [ ] View count increments
- [ ] Expiration validation
- [ ] Revoke snapshot
- [ ] Revoked snapshot returns error
- [ ] List snapshots for report

### PDF Export
- [ ] Download authenticated PDF
- [ ] Download public PDF
- [ ] PDF contains title/description
- [ ] PDF contains generation timestamp
- [ ] PDF contains data tables
- [ ] PDF formatting (striped, blue headers)
- [ ] PDF downloads with correct filename

### Security
- [ ] Unauthenticated requests rejected (except public routes)
- [ ] Organization access validated
- [ ] Site admins can access all orgs
- [ ] Regular users limited to their orgs
- [ ] Rate limiting works (20 requests for generation)

### Error Handling
- [ ] Invalid report type rejected
- [ ] Missing fields return validation errors
- [ ] Non-existent reports return 404
- [ ] Expired snapshots handled
- [ ] Revoked snapshots handled

---

## Performance Testing

### Load Testing (Optional)

```bash
# Generate 10 reports in parallel
for i in {1..10}; do
  curl -b cookies.txt -X POST "$BASE_URL/api/reports/$REPORT_ID/generate" &
done
wait

# Should hit rate limit after 20 requests in 15 minutes
```

### Large Dataset Testing

```bash
# Create report with all metrics
curl -b cookies.txt -X POST $BASE_URL/api/reports \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"All Metrics Report\",
    \"reportType\": \"coach\",
    \"organizationId\": \"$ORG_ID\",
    \"config\": {
      \"timeframe\": {
        \"type\": \"preset\",
        \"preset\": \"all_time\"
      },
      \"metrics\": [
        \"FLY10_TIME\",
        \"VERTICAL_JUMP\",
        \"AGILITY_505\",
        \"AGILITY_5105\",
        \"T_TEST\",
        \"DASH_40YD\",
        \"RSI\"
      ]
    }
  }" | jq '.'
```

---

## Troubleshooting

### Session Cookie Issues

If you get 401 errors:
```bash
# Delete old cookies
rm cookies.txt

# Login again
curl -c cookies.txt -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'
```

### Database Connection Issues

```bash
# Verify DATABASE_URL is set
echo $DATABASE_URL

# Check database is accessible
npm run db:migrate:all
```

### Missing Test Data

```bash
# Create test athletes via UI or API
curl -b cookies.txt -X POST "$BASE_URL/api/users" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testathlete1",
    "firstName": "Test",
    "lastName": "Athlete",
    "emails": ["test@example.com"]
  }'

# Create test measurements
curl -b cookies.txt -X POST "$BASE_URL/api/measurements" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "athlete-id",
    "metric": "FLY10_TIME",
    "value": "1.35",
    "date": "2024-11-08"
  }'
```

---

## Next Steps

Once manual testing is complete:
1. Document any bugs found
2. Verify all 12 API endpoints work
3. Test edge cases (empty data, large datasets)
4. Move to Phase 4: Frontend Implementation
5. Re-run E2E tests to verify end-to-end functionality

---

**Last Updated:** 2025-11-08
**Backend Status:** ✅ Ready for testing
**Frontend Status:** ⏳ Pending implementation
