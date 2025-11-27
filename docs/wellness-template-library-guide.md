# Wellness Template Library - User Guide

## Overview

The Wellness Template Library allows coaches and administrators to browse, search, and clone pre-built wellness questionnaire templates. This feature makes it easy to quickly set up common wellness assessments without building them from scratch.

## Table of Contents

1. [For Coaches: Browsing and Using Templates](#for-coaches-browsing-and-using-templates)
2. [For Organization Admins: Creating Custom Templates](#for-organization-admins-creating-custom-templates)
3. [For Site Administrators: Managing the Global Library](#for-site-administrators-managing-the-global-library)
4. [Pre-Built Templates](#pre-built-templates)
5. [Frequently Asked Questions](#frequently-asked-questions)

---

## For Coaches: Browsing and Using Templates

### Accessing the Template Library

1. Navigate to the **Wellness** page from the main navigation
2. Click the **"Library"** tab in the wellness navigation tabs
3. You'll see the Template Library with all available templates

### Browsing Templates

#### By Category

Templates are organized into 5 categories:

- **General** - Daily wellness check-ins and overall health monitoring
- **Recovery** - Fatigue tracking, sleep quality, and recovery assessments
- **Performance** - Pre-competition readiness and performance indicators
- **Injury** - Injury screening and pain monitoring
- **Training** - Training load, session RPE, and workout feedback

Click on any category tab to filter templates by that category. Click "All" to see all templates.

#### By Tags

Templates are tagged with relevant keywords (e.g., "daily", "fatigue", "rpe", "hooper").

- Tag filters appear below the search bar
- Click on a tag chip to filter templates with that tag
- Click multiple tags to see templates matching any of the selected tags
- Click a selected tag again to deselect it

#### By Search

Use the search bar to find templates by name or description:

1. Type keywords into the search box (e.g., "hooper", "injury", "recovery")
2. Results filter in real-time as you type
3. Clear the search to see all templates again

### Understanding Template Cards

Each template card shows:

- **Template Name** - The title of the questionnaire
- **Description** - What the template is used for
- **Category Badge** - Color-coded category (General, Recovery, Performance, etc.)
- **Tags** - Searchable keywords (shows first 4, with "+X more" if there are additional tags)
- **Question Count** - Number of questions in the template
- **System Template Badge** - Sparkle (✨) icon for pre-built system templates
- **Preview Button** - Opens full template details
- **Clone Button** - Copies template to your organization

### Previewing a Template

Before cloning, you can preview the full template details:

1. Click the **"Preview"** button on any template card
2. A modal will open showing:
   - Template name and description
   - All questions with their types and configurations
   - Status configuration (thresholds for red/yellow/green status)
   - Color configuration for analytics
   - Category and tags
3. Review the template to ensure it meets your needs
4. Click **"Clone to My Organization"** to add it, or **"Cancel"** to close

### Cloning a Template

To add a template to your organization:

1. Click the **"Clone"** button on a template card (or in the preview modal)
2. A success message will appear: "Template cloned successfully"
3. The template is now available in your **Templates** tab
4. You can edit the cloned template as needed

**What Gets Cloned:**
- All questions and their configurations
- Status thresholds and scale orientation
- Color configuration for analytics
- Category and tags
- Calculation method (average vs sum)

**What You Can Modify:**
- Template name and description
- Questions (add, edit, or remove)
- Status thresholds
- Category and tags
- Any other template settings

**Note:** Cloned templates are independent copies. Changes to the original won't affect your copy, and vice versa.

---

## For Organization Admins: Creating Custom Templates

As an organization administrator, you can create your own templates and make them discoverable in your org's library.

### Adding Category and Tags to Custom Templates

When creating or editing a template:

1. Navigate to **Wellness > Templates**
2. Click **"Create Template"** or edit an existing template
3. Scroll to the **"Library Settings"** section (below questions)
4. **Select a Category:**
   - Choose from: General, Recovery, Performance, Injury, or Training
   - Select "None" if you don't want the template in the library
5. **Add Tags:**
   - Type a tag name (e.g., "daily", "fatigue", "post-training")
   - Click **"Add Tag"** or press **Enter**
   - Tags appear as removable badges
   - Click the **X** on a badge to remove a tag
   - **Limits:** Max 20 tags, each up to 30 characters

### Tag Best Practices

**Good Tags:**
- **Descriptive**: "fatigue", "recovery", "readiness"
- **Frequency**: "daily", "weekly", "pre-game"
- **Sport-specific**: "soccer", "basketball", "track"
- **Purpose**: "monitoring", "screening", "assessment"

**Avoid:**
- Duplicate tags
- Overly generic tags ("wellness", "questionnaire")
- Tags longer than 30 characters

### Making Templates Discoverable

Templates with a category and/or tags will appear in your organization's library. Other coaches in your organization can browse and clone these templates.

**Visibility:**
- Templates are only visible within your organization
- System templates (seeded by site admins) are visible to all organizations
- Cloning a template creates an independent copy in your organization

---

## For Site Administrators: Managing the Global Library

Site administrators can seed pre-built templates that are available to all organizations.

### Seeding System Templates

Use the seeder script to populate the 6 pre-built templates:

```typescript
import { seedTemplates } from './scripts/seed-wellness-templates';
import { db } from '@shared/db';

// Seed templates for a specific organization (usually a "System" org)
const organizationId = 'your-system-org-id';
await seedTemplates(organizationId, db);
```

**Pre-Built Templates Included:**
1. **Daily Wellness Check-in** (General)
2. **Modified Hooper Index** (Recovery)
3. **Post-Training Recovery** (Recovery)
4. **Pre-Competition Readiness** (Performance)
5. **Weekly Injury Screening** (Injury)
6. **Session RPE** (Training)

### System Template Properties

System-seeded templates have:
- `isSystemSeeded: true` flag
- Sparkle (✨) badge in the UI
- Full template configurations (questions, thresholds, colors)
- Category and tags for discoverability

### Adding New System Templates

To add a new system template:

1. Edit `/home/hulla/devel/AthleteMetrics/scripts/seed-wellness-templates.ts`
2. Add a new template object to the `templates` array
3. Include all required fields:
   - `name`, `description`, `category`, `tags`
   - `config` (questions, statusConfig, colorConfig)
   - `isSystemSeeded: true`
4. Run the seeder script
5. The new template will appear in all organizations' libraries

### Database Schema

System templates are stored in the `wellness_templates` table with:

- `category` (text) - Category for filtering
- `tags` (text[]) - Array of searchable tags
- `is_system_seeded` (boolean) - Marks pre-built templates
- `source_template_id` (varchar) - Tracks cloning relationships

---

## Pre-Built Templates

### 1. Daily Wellness Check-in
**Category:** General
**Tags:** daily, wellness, readiness, monitoring

**Description:** A comprehensive daily wellness assessment covering sleep quality, mood, energy, stress, and muscle soreness.

**Questions:**
- Sleep Quality (1-5 scale, higher is better)
- Mood (1-5 scale, higher is better)
- Energy Level (1-5 scale, higher is better)
- Stress Level (1-5 scale, lower is better)
- Muscle Soreness (1-5 scale, lower is better)

**Status Thresholds:**
- Red: ≤ 2 (poor wellness)
- Yellow: ≤ 4 (moderate wellness)
- Green: > 4 (good wellness)

**Use Case:** Daily monitoring of athlete wellness to detect fatigue and prevent overtraining.

---

### 2. Modified Hooper Index
**Category:** Recovery
**Tags:** fatigue, hooper, daily, recovery, validated

**Description:** A validated fatigue monitoring tool that sums scores across sleep, fatigue, stress, and muscle soreness.

**Questions:**
- Sleep Quality (1-5 scale, lower is better)
- Fatigue (1-5 scale, lower is better)
- Stress (1-5 scale, lower is better)
- Muscle Soreness (1-5 scale, lower is better)

**Calculation Method:** Sum (e.g., 3+4+2+5 = 14)

**Status Thresholds (Sum of 4-20):**
- Green: 4-9 (low fatigue, good recovery)
- Yellow: 10-14 (moderate fatigue)
- Red: 15-20 (high fatigue, poor recovery)

**Use Case:** Evidence-based recovery monitoring for detecting accumulated fatigue.

---

### 3. Post-Training Recovery
**Category:** Recovery
**Tags:** training, recovery, post-session, fatigue

**Description:** Assess recovery status immediately after training sessions.

**Questions:**
- Overall Fatigue (1-10 scale, lower is better)
- Muscle Soreness (1-10 scale, lower is better)
- Perceived Recovery (1-10 scale, higher is better)
- Readiness for Tomorrow (1-10 scale, higher is better)

**Status Thresholds:**
- Red: High fatigue or poor recovery
- Yellow: Moderate fatigue
- Green: Good recovery

**Use Case:** Track immediate post-training recovery to adjust subsequent training loads.

---

### 4. Pre-Competition Readiness
**Category:** Performance
**Tags:** competition, readiness, game-day, performance

**Description:** Assess athlete readiness before competitions or games.

**Questions:**
- Physical Readiness (1-10 scale, higher is better)
- Mental Readiness (1-10 scale, higher is better)
- Sleep Last Night (1-10 scale, higher is better)
- Confidence Level (1-10 scale, higher is better)
- Any Injuries or Pain (body_map)

**Status Thresholds:**
- Red: Poor readiness or injury present
- Yellow: Moderate readiness
- Green: Optimal readiness

**Use Case:** Pre-game assessment to identify athletes who may need extra attention or rest.

---

### 5. Weekly Injury Screening
**Category:** Injury
**Tags:** injury, screening, weekly, pain, body-map

**Description:** Weekly check-in to identify and monitor injuries or pain.

**Questions:**
- Do you have any injuries? (boolean)
- Do you have any pain? (boolean)
- Pain/Injury Locations (body_map)
- Pain Severity (1-10 scale, lower is better)
- Impact on Training (text)

**Status Thresholds:**
- Red: Injury or pain present
- Yellow: Minor discomfort
- Green: No injuries

**Injury Override:** Enabled (any injury = red status)

**Use Case:** Early detection and monitoring of injuries to prevent worsening.

---

### 6. Session RPE
**Category:** Training
**Tags:** rpe, training-load, monitoring, intensity, session

**Description:** Rate of Perceived Exertion (RPE) to quantify training load.

**Questions:**
- How hard was today's session? (1-10 scale, higher = harder)
- Session Duration (minutes) (text/number input)
- Session Type (multiple_choice: Strength, Cardio, Sport-Specific, Recovery)
- Additional Comments (text)

**Calculation:** RPE × Duration = Training Load

**Status Thresholds:**
- Based on training load accumulation
- Red: Excessive load
- Yellow: High load
- Green: Appropriate load

**Use Case:** Monitor training intensity to balance load and prevent overtraining.

---

## Frequently Asked Questions

### Can I edit a cloned template?

**Yes!** Cloned templates are independent copies. You can modify them however you like:
- Change the name and description
- Add, edit, or remove questions
- Adjust status thresholds
- Change category and tags

### Will my changes affect the original template?

**No.** Cloned templates are completely independent. Changes you make won't affect the original, and updates to the original won't affect your copy.

### Can I clone a template multiple times?

**Yes!** You can clone the same template multiple times. Each clone is an independent copy with its own ID.

### What's the difference between system templates and org templates?

- **System Templates:** Pre-built templates seeded by site administrators, marked with a sparkle (✨) badge, available to all organizations
- **Org Templates:** Custom templates created by coaches or org admins, only visible within your organization

### Can I share my custom templates with other organizations?

**Not directly.** Custom templates are only visible within your organization. To share templates across organizations, a site administrator would need to add them as system templates via the seeder script.

### How do I make my template appear in the library?

Add a **category** and/or **tags** to your template when creating or editing it. Templates without a category won't appear in the library (but will still be available in the Templates tab).

### Can I remove a cloned template?

**Yes.** Cloned templates can be deleted just like any other template:
1. Go to **Wellness > Templates**
2. Find the template in the list
3. Click the delete/trash icon
4. Confirm deletion

Deleting a cloned template won't affect the original.

### What happens if I clone a template that was cloned from another template?

The `source_template_id` field tracks the immediate parent. If you clone a cloned template, your copy will reference the template you cloned from, not the original source.

### Can I search for templates by question content?

Currently, search only looks at template **name** and **description**. Question content is not searchable. Use tags to make templates discoverable by topic (e.g., "body-map", "pain", "fatigue").

### How many tags can I add to a template?

- **Maximum:** 20 tags per template
- **Character limit:** 30 characters per tag
- **Best practice:** 3-8 relevant tags

### What if there are no templates in the library?

If the library is empty:
1. **Site admins:** Run the seeder script to populate pre-built templates
2. **Org admins:** Create custom templates and add category/tags to make them discoverable
3. **Coaches:** Ask your organization administrator to create templates or contact site support

---

## Support

For questions or issues with the Template Library:

- **Technical Issues:** Contact your site administrator
- **Feature Requests:** Submit feedback through your organization's support channel
- **Template Ideas:** Suggest new system templates to site administrators

---

**Last Updated:** 2025-11-24
**Version:** 1.0.0
