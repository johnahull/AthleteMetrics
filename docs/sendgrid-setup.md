# SendGrid Email Service Configuration

## Overview

AthleteMetrics uses SendGrid for transactional email delivery. The integration is fully implemented with professional HTML email templates and graceful degradation when SendGrid is unavailable.

**Current Status**: SendGrid integration is code-complete but requires configuration to enable email sending.

## Email Features

### Currently Active
- ✅ **User Invitations** - Send invitation emails with secure tokens (`routes.ts:2972`)
- ✅ **Welcome Emails** - Onboard new users after signup (`routes.ts:3788`)
- ✅ **Email Verification** - Verify user email addresses (`routes.ts:3411`)

### Planned (TODO)
- ⚠️ **Password Reset Emails** - Currently commented out (`auth/password-reset.ts:74`)
- ⚠️ **Additional Verification Flows** - On-demand email verification (`auth/password-reset.ts:210`)

### Email Templates
All templates are professionally designed with:
- Responsive HTML layout (mobile-friendly)
- Gradient purple header branding
- Clear call-to-action buttons
- Proper HTML escaping (XSS protection)
- Plain text fallback
- Security warnings for unexpected emails

**Template Source**: `packages/api/services/email-service.ts:175-460`

## Graceful Degradation

**Without SendGrid configured**, the application:
- ✅ Continues to function normally
- ⚠️ Logs email attempts to console instead of sending
- 📧 Outputs: `"Email sending disabled (no API key). Would have sent: {...}"`

This allows development without email service and prevents failures in email-optional workflows.

---

## Setup Instructions

### Step 1: Create SendGrid Account

1. **Sign up**: https://sendgrid.com/
2. **Verify your email address**
3. **Complete account setup**

**Pricing Tiers**:
| Tier | Cost | Volume | Best For |
|------|------|--------|----------|
| Free | $0 | 100/day | Development, small teams (<200 users) |
| Essentials | $19.95/mo | 50,000/mo | Growing teams (200-1,000 users) |
| Pro | $89.95/mo | 100,000/mo | Large organizations (1,000+ users) |

**Volume Estimation**:
- 10 teams × 20 athletes = 200 users
- Onboarding: 2 emails/user (invitation + welcome) = 400 emails
- Ongoing: ~5 password resets/month = 60/year
- **Total Year 1**: ~500 emails (fits in free tier)

---

### Step 2: Create API Key

1. Log into SendGrid dashboard
2. Navigate to: **Settings** → **API Keys**
3. Click **"Create API Key"**

**Configuration**:
```
Name: AthleteMetrics [Environment]
  - Examples: "AthleteMetrics Production", "AthleteMetrics Development"

Access Level: Restricted Access (Recommended)
  - Permissions: Enable "Mail Send" only
  - This follows least-privilege principle
```

4. Click **"Create & View"**
5. **CRITICAL**: Copy the API key immediately (shown only once)
   ```
   SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

**Security Notes**:
- ⚠️ API key is shown only once - store securely
- 🔒 Never commit API keys to version control
- 🔄 Rotate keys every 6 months
- 🔐 Use different keys for staging and production

---

### Step 3: Verify Sender Email

SendGrid requires sender verification to prevent spam. Choose one approach:

#### Option A: Single Sender Verification (Easiest)

**Best for**: Development, small deployments, personal domains

1. Go to: **Settings** → **Sender Authentication** → **Single Sender Verification**
2. Click **"Create New Sender"**
3. Fill in verification form:
   ```
   From Name: AthleteMetrics
   From Email: noreply@yourdomain.com
   Reply To: support@yourdomain.com (or your actual email)

   Address: [Your business/personal address]
   City: [City]
   State: [State]
   Zip: [Zip code]
   Country: [Country]
   ```

4. **Verify email**: SendGrid sends verification link to `noreply@yourdomain.com`
5. **Click verification link** in that email

**If you don't own a domain**, use a personal email with a plus alias:
```
From Email: your.email+athletemetrics@gmail.com
```

**Limitations**:
- Can only send from verified addresses
- Manual process for each sender
- Lower deliverability vs domain authentication

#### Option B: Domain Authentication (Recommended for Production)

**Best for**: Production deployments, professional sender reputation

1. Go to: **Settings** → **Sender Authentication** → **Authenticate Your Domain**
2. Select your DNS host (e.g., Cloudflare, GoDaddy, etc.)
3. Follow DNS setup instructions
4. Add CNAME records to your domain's DNS:
   ```
   # Example records (actual values provided by SendGrid)
   Host: em1234.yourdomain.com
   Type: CNAME
   Value: u1234567.wl123.sendgrid.net

   Host: s1._domainkey.yourdomain.com
   Type: CNAME
   Value: s1.domainkey.u1234567.wl123.sendgrid.net

   Host: s2._domainkey.yourdomain.com
   Type: CNAME
   Value: s2.domainkey.u1234567.wl123.sendgrid.net
   ```

5. Wait for DNS propagation (5 minutes to 48 hours)
6. Return to SendGrid dashboard and click **"Verify"**

**Benefits**:
- ✅ Better email deliverability
- ✅ Professional sender reputation
- ✅ Can send from any `@yourdomain.com` address
- ✅ SPF and DKIM authentication included
- ✅ No per-address verification needed

---

### Step 4: Configure Environment Variables

#### Local Development (`.env`)

Create or update `.env` file in project root:

```bash
# SendGrid Email Service Configuration
# API Key from SendGrid dashboard (Settings → API Keys)
SENDGRID_API_KEY="SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Sender email must be verified in SendGrid
# Single Sender: Use exact verified address
# Domain Auth: Can use any @yourdomain.com address
SENDGRID_FROM_EMAIL="noreply@yourdomain.com"

# Displayed name in recipient's inbox
SENDGRID_FROM_NAME="AthleteMetrics"

# Application URL (used for generating email links)
# Local: http://localhost:5000
# Production: Your actual domain
APP_URL="http://localhost:5000"

# Invitation link expiry (days)
# Default: 7 days
INVITATION_EXPIRY_DAYS=7
```

**Example for different environments**:

```bash
# Development
APP_URL="http://localhost:5000"
SENDGRID_FROM_EMAIL="dev@yourdomain.com"

# Staging
APP_URL="https://athletemetrics-staging.up.railway.app"
SENDGRID_FROM_EMAIL="staging@yourdomain.com"

# Production
APP_URL="https://yourdomain.com"
SENDGRID_FROM_EMAIL="noreply@yourdomain.com"
```

#### Railway Deployment

**Production Environment**:

1. Go to Railway project → **Production service** → **Variables** tab
2. Click **"New Variable"** and add:

```
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=AthleteMetrics
APP_URL=https://athletemetrics-production.up.railway.app
INVITATION_EXPIRY_DAYS=7
```

**Staging Environment**:

1. Go to Railway project → **Staging service** → **Variables** tab
2. Add same variables with staging-specific values:

```
SENDGRID_API_KEY=[can reuse production key or create separate]
SENDGRID_FROM_EMAIL=staging@yourdomain.com
SENDGRID_FROM_NAME=AthleteMetrics Staging
APP_URL=https://athletemetrics-staging.up.railway.app
INVITATION_EXPIRY_DAYS=7
```

**Best Practice**: Use separate API keys for staging and production to isolate usage and simplify key rotation.

---

## Testing & Verification

### Step 1: Verify Configuration

**Start/restart your server**:

```bash
# Local development
npm run dev

# Railway (automatic on variable change)
```

**Check server logs** on startup:

```bash
✅ Success: (no warning message about SendGrid)
❌ Not configured: "⚠️ SendGrid API key not configured. Email sending is disabled."
```

### Step 2: Test Email Sending

**Test User Invitation Flow**:

1. Log into AthleteMetrics as admin
2. Navigate to team/user management
3. Create a new invitation
4. Check recipient's email inbox (including spam/junk folder)
5. Verify:
   - ✅ Email received
   - ✅ Formatting looks professional
   - ✅ Invitation link works
   - ✅ Link expires after configured days

**Test Welcome Email** (after invitation acceptance):

1. Accept an invitation
2. Complete signup
3. Check email for welcome message
4. Verify branding and content

### Step 3: Monitor SendGrid Dashboard

1. Log into SendGrid dashboard
2. Navigate to: **Activity** → **Email Activity**
3. View sent emails with:
   - Delivery status (Delivered, Bounced, Deferred)
   - Open rates (if tracking enabled)
   - Bounce reasons
   - Spam reports

**Metrics to watch**:
- Bounce rate (should be <5%)
- Spam reports (should be <0.1%)
- Delivery rate (should be >95%)

---

## Development Testing Without Real Emails

### Option 1: SendGrid Sandbox Mode

**Temporarily modify `email-service.ts` for testing**:

```typescript
// packages/api/services/email-service.ts
// Add after sgMail.setApiKey(apiKey)

if (process.env.NODE_ENV === 'development') {
  sgMail.setMailSettings({
    sandboxMode: {
      enable: true
    }
  });
}
```

**Behavior**: Emails are validated but not sent. Check SendGrid Activity for validation results.

### Option 2: Use Mailtrap.io

**Free email testing service** that intercepts all outgoing emails:

1. Sign up at https://mailtrap.io
2. Get SMTP credentials
3. **Note**: AthleteMetrics uses SendGrid API (not SMTP), so this requires code modification

### Option 3: Test with Personal Email

**Simplest approach**:

```bash
# .env
SENDGRID_FROM_EMAIL="your.verified.email@gmail.com"
```

Send test invitations to yourself or team members.

### Option 4: Console Logging Only

**Remove SendGrid API key** to enable graceful degradation:

```bash
# .env - comment out or remove
# SENDGRID_API_KEY="..."
```

**Behavior**: Emails logged to console instead of sent.

---

## Troubleshooting

### Emails Not Being Sent

**Symptoms**: No emails received, no errors in logs

**Solutions**:
1. ✅ Check server logs for SendGrid errors
2. ✅ Verify `SENDGRID_API_KEY` is set correctly (no extra spaces)
3. ✅ Ensure `SENDGRID_FROM_EMAIL` matches verified sender
4. ✅ Check SendGrid dashboard → Activity for delivery attempts
5. ✅ Verify API key has "Mail Send" permission
6. ✅ Restart server after adding environment variables

**Debugging**:
```bash
# Check environment variable is loaded
node -e "console.log(process.env.SENDGRID_API_KEY?.substring(0, 10))"
# Should output: SG.xxxxxxx
```

### Emails Go to Spam/Junk

**Symptoms**: Emails delivered but marked as spam

**Solutions**:
1. ✅ Complete domain authentication (Step 3, Option B)
2. ✅ Add SPF and DKIM DNS records
3. ✅ Warm up your domain gradually
   - Start with 10-20 emails/day
   - Increase slowly over 2-4 weeks
4. ✅ Ensure recipients expect emails (invitation-based)
5. ✅ Add unsubscribe links (future enhancement)
6. ✅ Maintain low bounce and spam report rates

**Sender Reputation**:
- Check: https://senderscore.org
- Monitor: SendGrid dashboard → Statistics

### "Sender Address Not Verified" Error

**Symptoms**: SendGrid rejects emails with verification error

**Solutions**:
1. ✅ Complete Single Sender Verification (Step 3, Option A)
2. ✅ Ensure `SENDGRID_FROM_EMAIL` matches verified address exactly
3. ✅ Check email for verification link from SendGrid
4. ✅ Wait up to 10 minutes after verification for propagation
5. ✅ Re-verify in SendGrid if verification expired

### "API Key Not Found" or "Invalid API Key"

**Symptoms**: SendGrid returns 401 Unauthorized

**Solutions**:
1. ✅ Verify `.env` file has `SENDGRID_API_KEY=SG...`
2. ✅ Ensure no quotes inside the API key value
3. ✅ Check for typos or truncation
4. ✅ Regenerate API key if unsure of validity
5. ✅ Restart server after updating `.env`

**Railway-specific**:
- Go to Variables tab and confirm key is set
- Check for extra spaces or newlines
- Variables update immediately, but may need manual redeploy

### High Bounce Rate

**Symptoms**: Many emails bouncing back

**Types of bounces**:
- **Hard Bounce**: Invalid email address (remove from list)
- **Soft Bounce**: Temporary issue (retry automatically)

**Solutions**:
1. ✅ Validate email addresses before sending
2. ✅ Remove hard bounces from invitation list
3. ✅ Check for typos in email addresses
4. ✅ Monitor SendGrid Activity for bounce reasons

---

## Security Best Practices

### ✅ Already Implemented

**Email Service** (`packages/api/services/email-service.ts`):
- HTML escaping with `escapeHtml()` function prevents XSS attacks
- API key loaded from environment (not hardcoded)
- Graceful degradation when SendGrid unavailable
- Plain text fallback for all HTML emails

**Application**:
- Invitation tokens are cryptographically secure
- Email verification tokens expire after 24 hours
- Password reset tokens expire after 1 hour
- All email links include secure tokens

### 🔒 Recommendations

#### 1. Restrict API Key Permissions
```
SendGrid Dashboard → API Keys → [Your Key] → Edit
Permissions: "Mail Send" ONLY (not Full Access)
```

**Benefits**: Limits damage if key is compromised

#### 2. Rotate API Keys Regularly
```
Recommended schedule: Every 6 months
Process:
1. Create new API key in SendGrid
2. Update environment variables
3. Deploy/restart services
4. Delete old API key after verification
```

#### 3. Use Different Keys per Environment
```
Development: dev-api-key-xxx
Staging: staging-api-key-xxx
Production: prod-api-key-xxx
```

**Benefits**: Isolates usage, simplifies troubleshooting, limits blast radius

#### 4. Monitor SendGrid Activity
```
Check weekly for:
- Unusual send volume spikes
- High bounce rates (>5%)
- Spam reports (>0.1%)
- Unrecognized recipient addresses
```

**Alert on**: Suspicious patterns that might indicate compromise

#### 5. Implement Rate Limiting
```typescript
// Future enhancement: Add to email-service.ts
const EMAIL_RATE_LIMIT = 100; // emails per hour
const EMAIL_RATE_WINDOW = 60 * 60 * 1000; // 1 hour
```

**Prevents**: API abuse and quota exhaustion

#### 6. Add Unsubscribe Links (Future Enhancement)

**Legal requirement** in many countries (CAN-SPAM, GDPR):
- Add unsubscribe link to marketing emails
- Honor unsubscribe requests within 10 days
- Currently not needed for transactional emails (invitations, password resets)

---

## Cost Management

### Free Tier Limits

**SendGrid Free Tier**:
- 100 emails/day
- 3,000 emails/month
- Forever free
- No credit card required

**When you'll hit limits**:
- Onboarding 50+ users in one day
- Sending bulk announcements
- High password reset activity

### Monitoring Usage

**SendGrid Dashboard**:
1. Navigate to: **Statistics** → **Usage**
2. View daily send volume
3. Track approaching limits

**Set up alerts**:
1. Navigate to: **Settings** → **Mail Settings** → **Event Webhook**
2. Configure webhook for send volume alerts
3. Receive notifications before hitting limits

### Upgrade Planning

**Upgrade triggers**:
| Users | Monthly Emails | Recommended Tier |
|-------|----------------|------------------|
| <200 | <3,000 | Free |
| 200-1,000 | 3,000-10,000 | Essentials ($19.95) |
| 1,000-5,000 | 10,000-50,000 | Essentials ($19.95) |
| 5,000+ | 50,000+ | Pro ($89.95) |

**Cost optimization**:
- Batch similar emails when possible
- Remove inactive users from invitation lists
- Use email verification to reduce bounces
- Monitor and optimize send patterns

---

## Email Template Customization

### Current Templates

**Location**: `packages/api/services/email-service.ts:175-460`

**Templates**:
1. **Invitation** - Lines 175-255
2. **Welcome** - Lines 260-314
3. **Email Verification** - Lines 319-387
4. **Password Reset** - Lines 392-460

### Customization Guide

**Branding Colors**:
```css
/* Current purple gradient */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* To customize: Update in all 4 templates */
```

**Logo Addition**:
```html
<!-- Add to header section of each template -->
<tr>
  <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
    <img src="https://yourdomain.com/logo.png" alt="AthleteMetrics" style="max-width: 200px; margin-bottom: 20px;">
    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">AthleteMetrics</h1>
  </td>
</tr>
```

**Footer Customization**:
```html
<!-- Add social links, support info, etc. -->
<tr>
  <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
    <p style="margin: 0 0 10px; color: #a0aec0; font-size: 12px;">
      Questions? Contact us at support@yourdomain.com
    </p>
    <p style="margin: 0; color: #a0aec0; font-size: 12px;">
      AthleteMetrics - Athletic Performance Tracking
    </p>
  </td>
</tr>
```

**Testing Templates**:
1. Make changes to `email-service.ts`
2. Restart server
3. Send test invitation
4. Check email rendering in:
   - Gmail (desktop & mobile)
   - Outlook (desktop & web)
   - Apple Mail
   - Mobile email clients

---

## Advanced Configuration

### Tracking Opens and Clicks

**Enable in SendGrid**:
1. Navigate to: **Settings** → **Tracking**
2. Enable:
   - Open Tracking (adds invisible pixel)
   - Click Tracking (rewrites URLs)

**View metrics**:
- SendGrid Dashboard → Statistics
- Per-email: Activity → Email Activity → [Click email]

**Privacy considerations**:
- Some users block tracking pixels
- Click tracking may alarm security-conscious users
- Consider opt-in/opt-out mechanisms

### Webhook Integration (Future)

**SendGrid Event Webhook** delivers real-time notifications for:
- Email delivered
- Email opened
- Link clicked
- Email bounced
- Spam report

**Setup**:
1. Create endpoint: `/api/webhooks/sendgrid`
2. Configure in SendGrid: Settings → Mail Settings → Event Webhook
3. Add webhook URL: `https://yourdomain.com/api/webhooks/sendgrid`
4. Select events to track
5. Verify signature for security

**Use cases**:
- Update user invitation status in database
- Alert on bounce/spam patterns
- Track email engagement metrics

### Email Templates with Dynamic Content

**SendGrid Dynamic Templates** (alternative to inline HTML):

1. Create template in SendGrid dashboard
2. Use Handlebars syntax: `{{firstName}}`
3. Store template ID in environment:
   ```bash
   SENDGRID_INVITATION_TEMPLATE_ID="d-xxxxxxxxxxxxx"
   ```
4. Modify email service to use template:
   ```typescript
   await sgMail.send({
     templateId: process.env.SENDGRID_INVITATION_TEMPLATE_ID,
     dynamicTemplateData: { firstName, lastName, invitationLink }
   });
   ```

**Benefits**:
- Visual template editor
- Version control in SendGrid
- A/B testing capabilities
- No code deploys for template changes

---

## Quick Start Checklist

### Initial Setup
- [ ] Create SendGrid account (free tier)
- [ ] Generate API key with "Mail Send" permission
- [ ] Copy API key securely
- [ ] Choose verification method (Single Sender or Domain)
- [ ] Complete sender verification
- [ ] Wait for verification email and confirm

### Local Development
- [ ] Add `SENDGRID_API_KEY` to `.env`
- [ ] Add `SENDGRID_FROM_EMAIL` to `.env` (verified address)
- [ ] Add `SENDGRID_FROM_NAME` to `.env`
- [ ] Add `APP_URL="http://localhost:5000"` to `.env`
- [ ] Add `INVITATION_EXPIRY_DAYS=7` to `.env`
- [ ] Restart development server
- [ ] Verify no warning message in logs

### Testing
- [ ] Create test invitation
- [ ] Check email received (including spam folder)
- [ ] Verify email formatting looks professional
- [ ] Test invitation link works
- [ ] Check SendGrid Activity dashboard
- [ ] Verify delivery status

### Production Deployment (Railway)
- [ ] Add all environment variables to Railway (Production service)
- [ ] Update `SENDGRID_FROM_EMAIL` to production sender
- [ ] Update `APP_URL` to production domain
- [ ] Deploy changes
- [ ] Test invitation flow in production
- [ ] Monitor SendGrid dashboard for delivery

### Staging Environment (Optional)
- [ ] Create separate API key for staging
- [ ] Add variables to Railway (Staging service)
- [ ] Use staging-specific sender email
- [ ] Update `APP_URL` to staging domain
- [ ] Test separately from production

### Security Review
- [ ] Confirm API keys not committed to Git
- [ ] Verify API key has minimal permissions
- [ ] Set calendar reminder for key rotation (6 months)
- [ ] Document key rotation procedure
- [ ] Set up SendGrid usage alerts

### Monitoring
- [ ] Bookmark SendGrid Activity dashboard
- [ ] Check weekly for bounce/spam rates
- [ ] Monitor approaching free tier limits
- [ ] Plan upgrade if needed

---

## Additional Resources

### SendGrid Documentation
- Getting Started: https://docs.sendgrid.com/for-developers/sending-email
- API Reference: https://docs.sendgrid.com/api-reference
- Email Best Practices: https://sendgrid.com/resource/email-best-practices/

### Email Deliverability
- MXToolbox: https://mxtoolbox.com (DNS/SPF/DKIM checking)
- Mail Tester: https://www.mail-tester.com (spam score testing)
- Sender Score: https://senderscore.org (reputation monitoring)

### Legal Compliance
- CAN-SPAM Act: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- GDPR Email Rules: https://gdpr.eu/email-marketing/

### Support
- SendGrid Support: https://support.sendgrid.com
- AthleteMetrics Email Service: `packages/api/services/email-service.ts`
- GitHub Issues: [Repository URL]

---

## Changelog

### Current Version (v0.2.0)
- ✅ SendGrid integration fully implemented
- ✅ HTML email templates for invitations, welcome, verification
- ✅ Graceful degradation without API key
- ⚠️ Password reset emails (commented out, ready to enable)
- ⚠️ Email tracking (not configured)
- ⚠️ Unsubscribe links (not implemented)

### Future Enhancements
- [ ] Enable password reset emails
- [ ] Add email event webhooks
- [ ] Implement unsubscribe management
- [ ] Add email engagement metrics to dashboard
- [ ] Support custom email templates
- [ ] Multi-language email support
- [ ] Bulk email campaigns (newsletters)
- [ ] Email scheduling

---

## Conclusion

SendGrid integration is production-ready and requires only configuration to enable. The free tier supports up to 200+ users with typical usage patterns, and the service gracefully degrades without impacting application functionality.

For questions or issues, refer to the troubleshooting section or contact the development team.
