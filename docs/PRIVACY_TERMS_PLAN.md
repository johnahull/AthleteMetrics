# Privacy Policy & Terms of Service Implementation Plan

## Overview

Add privacy policy and terms of service pages to AthleteMetrics with:
1. Footer links accessible on all pages
2. Acceptance checkbox during account creation (invitation flow, registration, OAuth)
3. Database tracking of policy acceptance timestamps with audit logging

## Key Decisions

- **Policy Source**: Use generator templates (Termly.io or GetTerms.io recommended)
- **Age Handling**: Basic checkbox "I confirm I am 18+ or have parental consent" (full parental workflow deferred to Phase 2)
- **Acceptance**: Both footer links AND signup checkbox with timestamp tracking
- **UX**: Single combined checkbox for both Terms and Privacy Policy (users accept both simultaneously)
- **Existing Users**: Grandfather existing users with audit note; re-acceptance prompt deferred to Phase 2
- **Policy Content**: Hardcoded in TSX files with `LAST_UPDATED` constant for Phase 1

---

## Industry Standards Research Summary

### Legal Requirements

| Regulation | Applies To | Key Requirements |
|------------|------------|------------------|
| **COPPA** | Users under 13 (US) | Verifiable parental consent, data minimization, parent access rights |
| **CCPA** | California residents | Under 13: parental consent, 13-15: youth opt-in, 16+: standard |
| **GDPR** | EU users | Explicit consent, right to be forgotten, data portability |

### Recommended Policy Generators

1. **Termly.io** - Free, comprehensive, COPPA/CCPA/GDPR templates
2. **GetTerms.io** - SaaS-focused bundle (Privacy + ToS together)
3. **TermsFeed** - Up-to-date templates, multi-format output

### Required Policy Sections

**Privacy Policy:**
- Data collection (what, how, why)
- Data use & processing
- Data sharing & recipients
- Data retention & deletion
- User rights (access, correction, deletion)
- Parental rights (for youth sports)
- Security measures
- Cookies & tracking
- Contact information

**Terms of Service:**
- Acceptance of terms
- User accounts & responsibilities
- Acceptable use policy
- Intellectual property
- Limitation of liability
- Disclaimers (not medical advice)
- Termination
- Governing law & dispute resolution

---

## Implementation Steps

### Step 1: Create Policy Pages

**Create `/packages/web/src/pages/privacy-policy.tsx`**
- Public page (no auth required)
- Simple card layout matching welcome.tsx style
- Placeholder content with sections for generated policy
- Link back to home/login
- "Last updated" date display via `LAST_UPDATED` constant

**Create `/packages/web/src/pages/terms-of-service.tsx`**
- Same structure as privacy policy
- Placeholder for generated ToS content
- `LAST_UPDATED` constant for version tracking

### Step 2: Add Routes

**Modify `/packages/web/src/App.tsx`**
- Add lazy imports for new pages
- Add routes: `/privacy` and `/terms`

**Modify `/packages/web/src/components/layout.tsx`**
- Add `/privacy` and `/terms` to PUBLIC_ROUTES array (lines 33-44)

### Step 3: Create Footer Component

**Create `/packages/web/src/components/footer.tsx`**
- Simple footer with Privacy Policy | Terms of Service links
- Copyright notice with current year
- Minimal styling (gray text, small font)
- Reusable across public and authenticated pages

**Footer Placement Strategy:**
- **Desktop**: Footer at bottom of scrollable content area (not fixed)
- **Mobile**: Footer in scrollable content, positioned above `MobileBottomNav` with appropriate spacing

**Modify `/packages/web/src/pages/welcome.tsx`**
- Add Footer component after CardContent (around line 108)
- Position at bottom of the card or below it

**Modify `/packages/web/src/pages/login.tsx`**
- Add same Footer component

**Modify `/packages/web/src/components/layout.tsx`**
- Add Footer to authenticated layout (before MobileBottomNav, line 165)
- Add `pb-16` padding on mobile to prevent footer from being hidden by bottom nav

### Step 4: Add Acceptance to Signup Flows

#### 4a. Invitation Flow

**Modify `/packages/web/src/pages/accept-invitation.tsx`**
- Add checkbox before submit button (around line 440):
  ```
  [ ] I am 18+ or have parental consent, and I agree to the
      Privacy Policy and Terms of Service
  ```
- Checkbox must be checked to enable submit button
- Links open in new tabs (`target="_blank"`)
- Add `termsAccepted` boolean to form state

**Modify `/packages/api/routes/invitation-routes.ts`**
- Accept `legalAcceptedAt` timestamp in POST body
- **Validate acceptance is required** - reject with 400 if not provided:
  ```typescript
  if (!legalAcceptedAt) {
    return res.status(400).json({ error: "Terms and privacy policy acceptance required" });
  }
  ```
- Pass timestamp to user creation
- Add audit log entry for legal acceptance

#### 4b. Registration Flow (if exists)

**Modify `/packages/web/src/pages/register.tsx`** (if self-registration is enabled)
- Add same acceptance checkbox as invitation flow
- Same validation requirements

#### 4c. OAuth Flow

**Modify `/packages/api/routes/oauth-routes.ts`**
- For new OAuth users (first-time Google/Apple sign-in):
  - Redirect to a terms acceptance page before completing account creation, OR
  - Include acceptance checkbox in OAuth callback landing page
- Store `legalAcceptedAt` timestamp for OAuth-created accounts
- Add audit log entry

### Step 5: Add Database Schema Fields

**Modify `/packages/shared/schema.ts`** (users table ~line 65-102)
```typescript
// Legal acceptance tracking (single timestamp since users accept both together)
legalAcceptedAt: timestamp("legal_accepted_at"),
legalAcceptedVersion: text("legal_accepted_version"), // e.g., "2024-01-15" matches LAST_UPDATED
```

**Note**: Using combined fields since the UX is a single checkbox. If separate tracking is needed later, can add individual fields in Phase 2.

**Create migration file** `packages/shared/migrations/00XX_add_legal_acceptance.sql`:
```sql
ALTER TABLE users ADD COLUMN legal_accepted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN legal_accepted_version TEXT;

-- Document existing users as grandfathered
COMMENT ON COLUMN users.legal_accepted_at IS 'NULL for users created before legal acceptance was implemented (grandfathered)';
```

**Run migration**
- `npm run db:push` to apply schema changes (development)
- Create proper migration for production

### Step 6: Add Audit Logging

**Modify user creation flows to include audit log:**
```typescript
await createAuditLog({
  action: 'legal_accepted',
  userId: newUser.id,
  details: {
    version: legalAcceptedVersion,
    acceptedAt: legalAcceptedAt,
    method: 'invitation' | 'registration' | 'oauth'
  }
});
```

### Step 7: Generate Policy Content

**Configure generators for:**
- Youth sports data platform
- Athletic performance metrics collection
- Multi-jurisdiction (US focus, GDPR-ready)
- No advertising/selling of data

**Data to disclose:**
- Performance metrics (10-yard fly, vertical jump, agility tests, etc.)
- Personal info (name, birthdate, contact details)
- Health-adjacent data (injury status, training notes)
- Team/organization associations

---

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `packages/web/src/pages/privacy-policy.tsx` | Create | Privacy policy page |
| `packages/web/src/pages/terms-of-service.tsx` | Create | Terms of service page |
| `packages/web/src/components/footer.tsx` | Create | Footer with legal links |
| `packages/web/src/App.tsx` | Modify | Add routes |
| `packages/web/src/components/layout.tsx` | Modify | Add to PUBLIC_ROUTES, add footer |
| `packages/web/src/pages/welcome.tsx` | Modify | Add footer |
| `packages/web/src/pages/login.tsx` | Modify | Add footer |
| `packages/web/src/pages/accept-invitation.tsx` | Modify | Add acceptance checkbox |
| `packages/web/src/pages/register.tsx` | Modify (if exists) | Add acceptance checkbox |
| `packages/api/routes/invitation-routes.ts` | Modify | Validate & store acceptance |
| `packages/api/routes/oauth-routes.ts` | Modify | Handle OAuth user acceptance |
| `packages/shared/schema.ts` | Modify | Add consent tracking fields |
| `packages/shared/migrations/00XX_add_legal_acceptance.sql` | Create | Database migration |

---

## Existing User Handling

**Phase 1 Approach: Grandfather existing users**
- Users created before this feature have `legal_accepted_at = NULL`
- This is documented in the database column comment
- No action required from existing users in Phase 1

**Phase 2 Enhancement: Re-acceptance prompt**
- Intercept login for users with `legal_accepted_at = NULL`
- Show acceptance modal/page before allowing access
- Update timestamp once accepted

---

## Future Enhancements (Phase 2)

### Full Parental Consent Workflow
- Age verification at signup (ask birthdate or age range)
- Parent email collection for users under 18
- Parent consent email with verification link
- Parent dashboard to manage child's data
- Parent ability to revoke consent

### Policy Version Tracking & Re-acceptance
- Compare user's `legalAcceptedVersion` to current `LAST_UPDATED`
- Prompt re-acceptance when policies update
- Notification system for policy changes
- Full audit trail of all acceptances

### Separate Privacy/Terms Tracking
- Split into `termsAcceptedAt` and `privacyAcceptedAt` if needed
- Independent version tracking for each document

### Data Export (GDPR Compliance)
- User-facing "Download My Data" button
- Export all personal data in portable format (JSON/CSV)
- Include: profile, measurements, team associations

### Cookie Consent Banner
- If analytics are added in future
- GDPR/CCPA compliant banner
- Granular consent options

---

## Resources

- [Termly Privacy Policy Generator](https://termly.io/products/privacy-policy-generator/)
- [GetTerms.io SaaS Bundle](https://getterms.io/privacy-policy-generator/saas)
- [FTC COPPA Compliance Guide](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [CCPA Official Text](https://oag.ca.gov/privacy/ccpa)
