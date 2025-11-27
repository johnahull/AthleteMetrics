# Wellness Template Library Seeder - Quick Start Guide

## Overview

The wellness template seeder populates your database with 6 pre-built system templates that coaches can clone from the library.

## Step-by-Step Instructions

### Step 1: Find Your Organization ID

First, you need to get the organization ID where you want to seed the templates.

**Option A: Using psql (recommended)**
```bash
# For testing environment
DATABASE_URL="postgresql://postgres:lgAzCeLICfBEzQzLOrdbnAvyjOXvhils@shuttle.proxy.rlwy.net:34674/railway" \
PGPASSWORD=lgAzCeLICfBEzQzLOrdbnAvyjOXvhils \
psql -h shuttle.proxy.rlwy.net -p 34674 -U postgres -d railway \
-c "SELECT id, name, created_at FROM organizations ORDER BY created_at DESC LIMIT 5;"
```

**Option B: Using the admin UI**
1. Log into the testing environment: https://athletemetrics-testing-testing.up.railway.app/
2. Check the browser network tab or URL to find the organization ID

**Option C: Create a new organization (if needed)**
```bash
# Connect to database
DATABASE_URL="postgresql://postgres:lgAzCeLICfBEzQzLOrdbnAvyjOXvhils@shuttle.proxy.rlwy.net:34674/railway" \
PGPASSWORD=lgAzCeLICfBEzQzLOrdbnAvyjOXvhils \
psql -h shuttle.proxy.rlwy.net -p 34674 -U postgres -d railway

# Inside psql, create a new org
INSERT INTO organizations (id, name, type, created_at, updated_at)
VALUES (gen_random_uuid(), 'System Templates', 'club', now(), now())
RETURNING id, name;
```

### Step 2: Run the Seeder Script

Once you have the organization ID, run the seeder:

```bash
# Navigate to project root
cd /home/hulla/devel/AthleteMetrics

# Run the seeder with your organization ID
DATABASE_URL="postgresql://postgres:lgAzCeLICfBEzQzLOrdbnAvyjOXvhils@shuttle.proxy.rlwy.net:34674/railway" \
tsx scripts/run-wellness-seeder.ts YOUR_ORG_ID_HERE
```

**Example:**
```bash
DATABASE_URL="postgresql://postgres:lgAzCeLICfBEzQzLOrdbnAvyjOXvhils@shuttle.proxy.rlwy.net:34674/railway" \
tsx scripts/run-wellness-seeder.ts 123e4567-e89b-12d3-a456-426614174000
```

### Step 3: Verify Templates Were Seeded

Check that the templates were created:

```bash
DATABASE_URL="postgresql://postgres:lgAzCeLICfBEzQzLOrdbnAvyjOXvhils@shuttle.proxy.rlwy.net:34674/railway" \
PGPASSWORD=lgAzCeLICfBEzQzLOrdbnAvyjOXvhils \
psql -h shuttle.proxy.rlwy.net -p 34674 -U postgres -d railway \
-c "SELECT name, category, is_system_seeded, array_length(tags, 1) as tag_count FROM wellness_templates WHERE is_system_seeded = true;"
```

Expected output:
```
             name              |  category   | is_system_seeded | tag_count
-------------------------------+-------------+------------------+-----------
 Daily Wellness Check-in       | general     | t                |         3
 Modified Hooper Index         | recovery    | t                |         5
 Post-Training Recovery        | recovery    | t                |         4
 Pre-Competition Readiness     | performance | t                |         4
 Weekly Injury Screening       | injury      | t                |         5
 Session RPE                   | training    | t                |         4
(6 rows)
```

### Step 4: View Templates in the UI

1. Navigate to testing environment: https://athletemetrics-testing-testing.up.railway.app/
2. Login with testing credentials
3. Go to **Wellness** → **Library** tab
4. You should see all 6 system templates with sparkle (✨) badges

---

## Quick Reference

### Testing Environment Database
```bash
# Connection details
Host: shuttle.proxy.rlwy.net
Port: 34674
Database: railway
User: postgres
Password: lgAzCeLICfBEzQzLOrdbnAvyjOXvhils

# Full connection string
DATABASE_URL="postgresql://postgres:lgAzCeLICfBEzQzLOrdbnAvyjOXvhils@shuttle.proxy.rlwy.net:34674/railway"
```

### Staging Environment Database
```bash
# Connection details
Host: maglev.proxy.rlwy.net
Port: 29985
Database: railway
User: postgres
Password: rdnrfZfXPiZWKbahqepvoYnYerNoLiRG

# Full connection string
DATABASE_URL="postgresql://postgres:rdnrfZfXPiZWKbahqepvoYnYerNoLiRG@maglev.proxy.rlwy.net:29985/railway"
```

---

## One-Line Commands (Copy & Paste)

### Get All Organizations
```bash
DATABASE_URL="postgresql://postgres:lgAzCeLICfBEzQzLOrdbnAvyjOXvhils@shuttle.proxy.rlwy.net:34674/railway" PGPASSWORD=lgAzCeLICfBEzQzLOrdbnAvyjOXvhils psql -h shuttle.proxy.rlwy.net -p 34674 -U postgres -d railway -c "SELECT id, name FROM organizations;"
```

### Run Seeder (replace ORG_ID)
```bash
DATABASE_URL="postgresql://postgres:lgAzCeLICfBEzQzLOrdbnAvyjOXvhils@shuttle.proxy.rlwy.net:34674/railway" tsx scripts/run-wellness-seeder.ts ORG_ID
```

### Check Seeded Templates
```bash
DATABASE_URL="postgresql://postgres:lgAzCeLICfBEzQzLOrdbnAvyjOXvhils@shuttle.proxy.rlwy.net:34674/railway" PGPASSWORD=lgAzCeLICfBEzQzLOrdbnAvyjOXvhils psql -h shuttle.proxy.rlwy.net -p 34674 -U postgres -d railway -c "SELECT name, category, is_system_seeded FROM wellness_templates WHERE is_system_seeded = true;"
```

### Delete Seeded Templates (if you need to re-seed)
```bash
DATABASE_URL="postgresql://postgres:lgAzCeLICfBEzQzLOrdbnAvyjOXvhils@shuttle.proxy.rlwy.net:34674/railway" PGPASSWORD=lgAzCeLICfBEzQzLOrdbnAvyjOXvhils psql -h shuttle.proxy.rlwy.net -p 34674 -U postgres -d railway -c "DELETE FROM wellness_templates WHERE is_system_seeded = true;"
```

---

## The 6 System Templates

### 1. Daily Wellness Check-in
- **Category:** General
- **Tags:** daily, wellness, readiness
- **Use:** Quick daily assessment for overall wellness
- **Questions:** 5 (sleep, energy, mood, stress, soreness)

### 2. Modified Hooper Index
- **Category:** Recovery
- **Tags:** fatigue, hooper, daily, recovery, validated
- **Use:** Validated fatigue monitoring (sum-based)
- **Questions:** 4 (sleep, fatigue, stress, soreness)

### 3. Post-Training Recovery
- **Category:** Recovery
- **Tags:** training, recovery, post-session, fatigue
- **Use:** Assess recovery after training sessions
- **Questions:** 4 (fatigue, soreness, recovery, readiness)

### 4. Pre-Competition Readiness
- **Category:** Performance
- **Tags:** competition, readiness, game-day, performance
- **Use:** Pre-game assessment for athlete readiness
- **Questions:** 5 (physical, mental, sleep, confidence, injuries)

### 5. Weekly Injury Screening
- **Category:** Injury
- **Tags:** injury, screening, weekly, pain, body-map
- **Use:** Weekly check-in to identify and monitor injuries
- **Questions:** 5 (injuries, pain, body-map, severity, notes)

### 6. Session RPE
- **Category:** Training
- **Tags:** rpe, training-load, monitoring, intensity
- **Use:** Rate of Perceived Exertion for training load
- **Questions:** 4 (RPE, duration, session type, notes)

---

## Troubleshooting

### Error: "Organization with ID not found"
- Double-check the organization ID
- Make sure you're connected to the correct database
- Run the "Get All Organizations" command to see available orgs

### Error: "Permission denied"
- Verify the DATABASE_URL is correct
- Check that the password is correct
- Ensure you have network access to the database

### Error: "Duplicate key value violates unique constraint"
- Templates already exist in this organization
- Delete existing system templates first (see one-line command above)
- Or use a different organization ID

### Templates don't show in UI
- Clear browser cache and refresh
- Check that you're logged into the correct organization
- Verify templates were created with `is_system_seeded = true`

---

## Next Steps After Seeding

1. **Test the Library:** Navigate to Wellness → Library tab
2. **Clone a Template:** Click "Preview" then "Clone" on any template
3. **Verify Cloning:** Check that the cloned template appears in Templates tab
4. **Test Editing:** Edit the cloned template to ensure it's independent
5. **Create Custom Template:** Try adding category/tags to a new template

---

**Created:** 2025-11-24
**For:** AthleteMetrics Wellness Template Library Feature
