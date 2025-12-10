# SendGrid Email Testing Guide

> **⚠️ DEPRECATED**: This documentation is outdated. AthleteMetrics has migrated from SendGrid to Resend.
> **See**: `docs/TESTING_RESEND.md` for current email testing instructions.
> **Migration PR**: #266 (December 2025)

---

~~This guide provides step-by-step instructions for testing your SendGrid email integration in AthleteMetrics.~~ **This guide is kept for historical reference only. Use Resend testing documentation instead.**

## Table of Contents

- [Prerequisites](#prerequisites)
- [Testing Methods](#testing-methods)
  - [Method 1: CLI Script (Quickest)](#method-1-cli-script-quickest)
  - [Method 2: API Endpoint (Manual Testing)](#method-2-api-endpoint-manual-testing)
  - [Method 3: Real User Workflow](#method-3-real-user-workflow)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Email Templates Reference](#email-templates-reference)

## Prerequisites

Before testing SendGrid, ensure you have:

### 1. SendGrid Account Setup

- SendGrid account created at [https://signup.sendgrid.com/](https://signup.sendgrid.com/)
- API key generated (Settings → API Keys → Create API Key)
- Sender email verified (either Single Sender or Domain Authentication)

For detailed setup instructions, see the [SendGrid Documentation](https://docs.sendgrid.com/ui/account-and-settings/api-keys).

### 2. Environment Variables Configured

Add the following to your `.env` file:

```bash
# Required
SENDGRID_API_KEY="SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
SENDGRID_FROM_EMAIL="noreply@yourdomain.com"  # Must be verified in SendGrid
SENDGRID_FROM_NAME="AthleteMetrics"

# Optional (with defaults)
APP_URL="http://localhost:5000"  # Used for links in emails
INVITATION_EXPIRY_DAYS="7"       # Default: 7 days
```

### 3. Verify Configuration

```bash
# Check environment variables are loaded
npm run test:sendgrid -- --email your@email.com
```

If configuration is missing, the script will provide detailed error messages.

## Testing Methods

### Method 1: CLI Script (Quickest)

**Use this for:** Quick verification of SendGrid configuration and email sending.

#### Basic Usage

```bash
# Send test invitation email to your email address
npm run test:sendgrid -- --email your@email.com

# Send test welcome email
npm run test:sendgrid -- --email your@email.com --type welcome

# Send test email verification
npm run test:sendgrid -- --email your@email.com --type verification

# Send test password reset email
npm run test:sendgrid -- --email your@email.com --type password-reset
```

#### What the Script Does

1. Validates all required environment variables
2. Checks email format
3. Sends test email via SendGrid API
4. Provides detailed output with color-coded status
5. Displays next steps for verification

#### Expected Output

```
═══════════════════════════════════════════════════════════
  SendGrid Email Configuration Test
═══════════════════════════════════════════════════════════

Step 1: Checking Environment Variables
────────────────────────────────────────────────────────────
✓ SENDGRID_API_KEY: SG.xxxxxxxxxx...xxxx
✓ SENDGRID_FROM_EMAIL: noreply@yourdomain.com
✓ SENDGRID_FROM_NAME: AthleteMetrics

ℹ APP_URL: http://localhost:5000 (optional)
ℹ INVITATION_EXPIRY_DAYS: 7 (optional)

Step 2: Validating Recipient Email
────────────────────────────────────────────────────────────
✓ Recipient email: your@email.com
ℹ Email type: invitation

Step 3: Sending Test Email
────────────────────────────────────────────────────────────
ℹ Preparing invitation email...

✓ Test invitation email sent successfully!

Next Steps:
  1. Check your inbox at: your@email.com
  2. Check spam/junk folder if not found
  3. Verify SendGrid Activity Feed:
     https://app.sendgrid.com/email_activity

✓ SendGrid is configured correctly!
```

---

### Method 2: API Endpoint (Manual Testing)

**Use this for:** Testing all email types through the API, simulating real application usage.

#### Prerequisites

- Development server running (`npm run dev`)
- Admin credentials for authentication

#### Step 1: Login to Get Session Cookie

```bash
curl -c cookies.txt -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "password"
  }'
```

#### Step 2: Send Test Email

```bash
# Test invitation email
curl -b cookies.txt -X POST http://localhost:5000/api/test/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "emailType": "invitation",
    "recipientEmail": "your@email.com"
  }'

# Test welcome email
curl -b cookies.txt -X POST http://localhost:5000/api/test/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "emailType": "welcome",
    "recipientEmail": "your@email.com"
  }'

# Test email verification
curl -b cookies.txt -X POST http://localhost:5000/api/test/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "emailType": "verification",
    "recipientEmail": "your@email.com"
  }'

# Test password reset
curl -b cookies.txt -X POST http://localhost:5000/api/test/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "emailType": "password-reset",
    "recipientEmail": "your@email.com"
  }'
```

#### Expected Response (Success)

```json
{
  "success": true,
  "message": "Test invitation email sent successfully",
  "emailType": "invitation",
  "recipientEmail": "your@email.com"
}
```

#### Expected Response (SendGrid Not Configured)

```json
{
  "success": false,
  "message": "SendGrid is not configured. Email was logged to console but not sent.",
  "emailType": "invitation",
  "recipientEmail": "your@email.com",
  "note": "Please configure SENDGRID_API_KEY and SENDGRID_FROM_EMAIL environment variables"
}
```

#### Security Features

- **Authentication Required**: Must be logged in as admin
- **Environment Check**: Endpoint is disabled in production
- **Validation**: Email format and type validation
- **Error Handling**: Graceful handling of SendGrid errors

---

### Method 3: Real User Workflow

**Use this for:** End-to-end testing of email integration in actual user flows.

#### Test Invitation Flow

1. **Create Invitation**
   - Log in as organization admin
   - Navigate to organization/team management
   - Click "Invite User"
   - Enter email address and select role
   - Submit invitation

2. **Verify Email Sent**
   - Check recipient inbox
   - Verify sender is `SENDGRID_FROM_EMAIL`
   - Verify subject line
   - Verify invitation link works
   - Verify branding and styling

3. **Complete Signup**
   - Click invitation link in email
   - Complete signup form
   - Submit

4. **Verify Welcome Email**
   - Check inbox for welcome email
   - Verify organization name is correct
   - Verify role is displayed correctly

#### Test Email Verification Flow

1. **Request Verification**
   - Log in as user
   - Navigate to profile settings
   - Click "Verify Email"

2. **Verify Email Sent**
   - Check inbox for verification email
   - Click verification link
   - Confirm email is verified

#### Test Password Reset Flow

1. **Request Password Reset**
   - Go to login page
   - Click "Forgot Password"
   - Enter email address
   - Submit

2. **Verify Email Sent**
   - Check inbox for password reset email
   - Click reset link
   - Enter new password
   - Confirm password changed

---

## Verification

### 1. Check Inbox

- Email should arrive within 1-2 minutes
- Check spam/junk folder if not found
- Verify sender is `SENDGRID_FROM_EMAIL`

### 2. SendGrid Activity Feed

Visit [https://app.sendgrid.com/email_activity](https://app.sendgrid.com/email_activity) to:

- View delivery status (Delivered, Bounced, Dropped)
- Check for delivery errors
- View email content preview
- See recipient activity (opens, clicks)

### 3. Application Logs

Check server console for email sending logs:

```
✓ Email sent successfully: invitation to your@email.com
```

Or if SendGrid is not configured:

```
⚠️ SendGrid API key not configured. Email sending is disabled.
📧 Email sending disabled (no API key). Would have sent: {...}
```

---

## Troubleshooting

### Issue: "SendGrid API key not configured"

**Symptoms:**
- Test script shows warning about missing configuration
- Emails are logged to console but not sent
- `emailService.sendInvitation()` returns `false`

**Solutions:**
1. Verify `SENDGRID_API_KEY` is set in `.env`
2. Ensure API key starts with `SG.`
3. Restart dev server after adding environment variables

### Issue: "Failed to send email: 401 Unauthorized"

**Symptoms:**
- SendGrid returns 401 error
- Email sending fails

**Causes:**
- Invalid or expired API key
- API key not activated in SendGrid

**Solutions:**
1. Verify API key in SendGrid dashboard (Settings → API Keys)
2. Generate new API key if needed
3. Ensure API key has "Mail Send" permissions

### Issue: "Failed to send email: 403 Forbidden"

**Symptoms:**
- SendGrid returns 403 error
- Error message mentions sender verification

**Causes:**
- `SENDGRID_FROM_EMAIL` not verified in SendGrid
- Sender domain not authenticated

**Solutions:**
1. Verify sender email via Single Sender Verification:
   - Go to Settings → Sender Authentication → Verify a Single Sender
   - Add `SENDGRID_FROM_EMAIL` as verified sender
2. Or authenticate entire domain via Domain Authentication
3. See [SendGrid Sender Authentication Guide](https://docs.sendgrid.com/ui/account-and-settings/how-to-set-up-domain-authentication) for detailed instructions

### Issue: "Emails go to spam"

**Symptoms:**
- Emails delivered but appear in spam/junk folder
- Low deliverability rate

**Solutions:**
1. **Authenticate Domain** (recommended)
   - Settings → Sender Authentication → Authenticate Your Domain
   - Add DNS records to your domain
   - Improves sender reputation

2. **Improve Email Content**
   - Avoid spam trigger words
   - Include plain-text version (already implemented)
   - Add unsubscribe link for bulk emails

3. **Warm Up Sending IP**
   - Start with low volume
   - Gradually increase sending rate
   - Monitor bounce rates

### Issue: "Test endpoint returns 403 in production"

**Symptoms:**
- API endpoint works locally but not in production
- Error: "This endpoint is not available in production environments"

**Expected Behavior:**
- This is intentional! The test endpoint is **disabled in production** for security.

**Solutions:**
- Use real user workflows in production (invitations, password resets, etc.)
- Test endpoint is for development/staging only

### Issue: "Rate limit exceeded"

**Symptoms:**
- SendGrid returns 429 Too Many Requests
- Email sending blocked temporarily

**Causes:**
- Exceeded SendGrid rate limits
- Too many requests in short period

**Solutions:**
1. Check SendGrid plan limits
2. Implement exponential backoff for retries
3. Upgrade SendGrid plan if needed

### Issue: "Email links point to wrong URL"

**Symptoms:**
- Invitation links go to `http://localhost:5000` instead of production URL
- Verification links broken in production

**Solutions:**
1. Set `APP_URL` environment variable:
   ```bash
   APP_URL="https://yourdomain.com"
   ```
2. Restart server after changing

---

## Email Templates Reference

### 1. Invitation Email

**Trigger:** Organization admin invites a user

**Content:**
- Subject: "You're invited to join [Organization Name]"
- Invitation link (expires in 7 days)
- Organization name
- Role assignment
- Expiration warning

**Template Location:** `packages/api/services/email-service.ts` (lines 175-255)

### 2. Welcome Email

**Trigger:** User completes signup from invitation

**Content:**
- Subject: "Welcome to [Organization Name]!"
- Confirmation of account creation
- Organization name
- Role assignment
- Getting started tips

**Template Location:** `packages/api/services/email-service.ts` (lines 260-314)

### 3. Email Verification

**Trigger:** User requests email verification

**Content:**
- Subject: "Verify your email address"
- Verification link (expires in 24 hours)
- Security disclaimer
- Expiration warning

**Template Location:** `packages/api/services/email-service.ts` (lines 319-387)

### 4. Password Reset

**Trigger:** User requests password reset

**Content:**
- Subject: "Reset your password"
- Reset link (expires in 1 hour)
- Security disclaimer
- "Didn't request this?" message

**Template Location:** `packages/api/services/email-service.ts` (lines 392-460)

**Note:** Password reset email sending is currently commented out in `packages/api/auth/password-reset.ts` (lines 74-79). Uncomment to enable.

---

## Best Practices

### 1. Testing Strategy

- **Development:** Use CLI script for quick iteration
- **Staging:** Use API endpoint to test real workflows
- **Production:** Monitor SendGrid Activity Feed

### 2. Email Deliverability

- Always use verified sender email
- Authenticate domain for best deliverability
- Monitor bounce rates and spam complaints
- Include plain-text version (already implemented)

### 3. Security

- Never commit API keys to git
- Use environment variables for all credentials
- Disable test endpoint in production (already implemented)
- Rate limit email sending to prevent abuse

### 4. Monitoring

- Check SendGrid Activity Feed daily
- Set up SendGrid webhooks for delivery events
- Monitor email bounce rates
- Alert on high failure rates

### 5. Cost Management

- Track sending volume
- Set up billing alerts in SendGrid
- Review free tier limits (100 emails/day)
- Upgrade plan as needed

---

## Additional Resources

- [SendGrid Documentation](https://docs.sendgrid.com/) - Official SendGrid docs
- [SendGrid API Keys Guide](https://docs.sendgrid.com/ui/account-and-settings/api-keys) - API key setup
- [SendGrid Sender Authentication](https://docs.sendgrid.com/ui/account-and-settings/how-to-set-up-domain-authentication) - Domain authentication
- [SendGrid API Reference](https://docs.sendgrid.com/api-reference) - API details
- [Email Service Implementation](../packages/api/services/email-service.ts) - Source code

---

## Quick Reference

### Environment Variables Checklist

- [ ] `SENDGRID_API_KEY` - API key from SendGrid dashboard
- [ ] `SENDGRID_FROM_EMAIL` - Verified sender email
- [ ] `SENDGRID_FROM_NAME` - Sender name (e.g., "AthleteMetrics")
- [ ] `APP_URL` - Application URL (for links in emails)
- [ ] `INVITATION_EXPIRY_DAYS` - Invitation expiration (optional, default: 7)

### Testing Commands

```bash
# CLI Script (quickest)
npm run test:sendgrid -- --email your@email.com --type invitation

# API Endpoint (requires dev server running)
curl -X POST http://localhost:5000/api/test/send-email \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"emailType":"invitation","recipientEmail":"your@email.com"}'
```

### Supported Email Types

- `invitation` - User invitation to join organization
- `welcome` - Welcome email after signup
- `verification` - Email address verification
- `password-reset` - Password reset request

---

**Last Updated:** 2025-01-04
