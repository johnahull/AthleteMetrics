#!/usr/bin/env tsx
/**
 * SendGrid Email Testing Script
 *
 * This script tests your SendGrid email configuration by sending a test email.
 * It validates environment variables and provides detailed feedback.
 *
 * Usage:
 *   npm run test:sendgrid
 *   npm run test:sendgrid -- --email your@email.com
 *   npm run test:sendgrid -- --email your@email.com --type welcome
 *
 * Options:
 *   --email  Email address to send test email to (optional, defaults to SENDGRID_FROM_EMAIL)
 *   --type   Email type: invitation, welcome, verification, password-reset (default: invitation)
 */

// Load environment variables BEFORE importing email service
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' }); // Load .env.local for local testing

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function printHeader(text: string) {
  console.log('\n' + colorize('═'.repeat(60), 'cyan'));
  console.log(colorize(`  ${text}`, 'bright'));
  console.log(colorize('═'.repeat(60), 'cyan') + '\n');
}

function printSuccess(text: string) {
  console.log(colorize('✓ ', 'green') + text);
}

function printError(text: string) {
  console.log(colorize('✗ ', 'red') + text);
}

function printWarning(text: string) {
  console.log(colorize('⚠ ', 'yellow') + text);
}

function printInfo(text: string) {
  console.log(colorize('ℹ ', 'blue') + text);
}

// Parse command line arguments
const args = process.argv.slice(2);
let recipientEmail = process.env.SENDGRID_FROM_EMAIL || '';
let emailType: 'invitation' | 'welcome' | 'verification' | 'password-reset' = 'invitation';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--email' && args[i + 1]) {
    recipientEmail = args[i + 1];
    i++;
  } else if (args[i] === '--type' && args[i + 1]) {
    const type = args[i + 1];
    if (['invitation', 'welcome', 'verification', 'password-reset'].includes(type)) {
      emailType = type as typeof emailType;
    } else {
      printError(`Invalid email type: ${type}`);
      process.exit(1);
    }
    i++;
  }
}

async function testSendGrid() {
  printHeader('SendGrid Email Configuration Test');

  // Step 1: Check environment variables
  console.log(colorize('Step 1: Checking Environment Variables', 'bright'));
  console.log(colorize('─'.repeat(60), 'cyan'));

  const requiredVars = {
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
    SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME,
  };

  const optionalVars = {
    APP_URL: process.env.APP_URL || 'http://localhost:5000',
    INVITATION_EXPIRY_DAYS: process.env.INVITATION_EXPIRY_DAYS || '7',
  };

  let hasAllRequired = true;

  for (const [key, value] of Object.entries(requiredVars)) {
    if (value) {
      if (key === 'SENDGRID_API_KEY') {
        const masked = value.substring(0, 10) + '...' + value.substring(value.length - 4);
        printSuccess(`${key}: ${masked}`);
      } else {
        printSuccess(`${key}: ${value}`);
      }
    } else {
      printError(`${key}: NOT SET`);
      hasAllRequired = false;
    }
  }

  console.log('');
  for (const [key, value] of Object.entries(optionalVars)) {
    printInfo(`${key}: ${value} (optional)`);
  }

  if (!hasAllRequired) {
    console.log('');
    printError('Missing required environment variables!');
    console.log('');
    console.log('Please add the following to your .env file:');
    console.log('');
    console.log('  SENDGRID_API_KEY="your-api-key-here"');
    console.log('  SENDGRID_FROM_EMAIL="noreply@yourdomain.com"');
    console.log('  SENDGRID_FROM_NAME="AthleteMetrics"');
    console.log('');
    console.log('See docs/sendgrid-setup.md for detailed setup instructions.');
    console.log('');
    process.exit(1);
  }

  // Step 2: Validate recipient email
  console.log('');
  console.log(colorize('Step 2: Validating Recipient Email', 'bright'));
  console.log(colorize('─'.repeat(60), 'cyan'));

  if (!recipientEmail) {
    printError('No recipient email specified!');
    console.log('');
    console.log('Usage: npm run test:sendgrid -- --email your@email.com');
    console.log('');
    process.exit(1);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    printError(`Invalid email format: ${recipientEmail}`);
    process.exit(1);
  }

  printSuccess(`Recipient email: ${recipientEmail}`);
  printInfo(`Email type: ${emailType}`);

  // Step 3: Load email service (dynamic import ensures env vars are available)
  console.log('');
  console.log(colorize('Step 3: Loading Email Service', 'bright'));
  console.log(colorize('─'.repeat(60), 'cyan'));

  const { emailService } = await import('../packages/api/services/email-service.js');
  printSuccess('Email service loaded successfully');

  // Step 4: Send test email
  console.log('');
  console.log(colorize('Step 4: Sending Test Email', 'bright'));
  console.log(colorize('─'.repeat(60), 'cyan'));

  try {
    let emailSent = false;

    switch (emailType) {
      case 'invitation': {
        printInfo('Preparing invitation email...');
        const crypto = await import('crypto');
        const invitationToken = `test-invitation-${crypto.randomBytes(8).toString('hex')}`;
        const appUrl = process.env.APP_URL || 'http://localhost:5000';
        const testInvitationData = {
          recipientName: 'Test User',
          inviterName: 'Admin User',
          organizationName: 'Test Organization',
          invitationLink: `${appUrl}/accept-invitation?token=${invitationToken}`,
          expiryDays: 7,
          role: 'coach'
        };
        emailSent = await emailService.sendInvitation(recipientEmail, testInvitationData);
        break;
      }

      case 'welcome': {
        printInfo('Preparing welcome email...');
        const testWelcomeData = {
          userName: 'Test User',
          organizationName: 'Test Organization',
          role: 'coach'
        };
        emailSent = await emailService.sendWelcome(recipientEmail, testWelcomeData);
        break;
      }

      case 'verification': {
        printInfo('Preparing email verification email...');
        const crypto = await import('crypto');
        const verificationToken = `test-verification-${crypto.randomBytes(8).toString('hex')}`;
        const appUrl = process.env.APP_URL || 'http://localhost:5000';
        const testVerificationData = {
          userName: 'Test User',
          verificationLink: `${appUrl}/verify-email?token=${verificationToken}`
        };
        emailSent = await emailService.sendEmailVerification(recipientEmail, testVerificationData);
        break;
      }

      case 'password-reset': {
        printInfo('Preparing password reset email...');
        const crypto = await import('crypto');
        const resetToken = `test-reset-${crypto.randomBytes(8).toString('hex')}`;
        const appUrl = process.env.APP_URL || 'http://localhost:5000';
        const testResetData = {
          userName: 'Test User',
          resetLink: `${appUrl}/reset-password?token=${resetToken}`
        };
        emailSent = await emailService.sendPasswordReset(recipientEmail, testResetData);
        break;
      }
    }

    console.log('');

    if (emailSent) {
      printSuccess(`Test ${emailType} email sent successfully!`);
      console.log('');
      console.log(colorize('Next Steps:', 'bright'));
      console.log('  1. Check your inbox at: ' + colorize(recipientEmail, 'cyan'));
      console.log('  2. Check spam/junk folder if not found');
      console.log('  3. Verify SendGrid Activity Feed:');
      console.log('     ' + colorize('https://app.sendgrid.com/email_activity', 'blue'));
      console.log('');
      printSuccess('SendGrid is configured correctly!');
    } else {
      printWarning('Email service returned false - likely not configured');
      console.log('');
      console.log('This usually means:');
      console.log('  - SENDGRID_API_KEY is not set or invalid');
      console.log('  - Email was logged to console but not sent');
      console.log('');
      printInfo('Check the console output above for email details');
    }

    console.log('');

  } catch (error) {
    console.log('');
    printError('Failed to send test email!');
    console.log('');
    console.log(colorize('Error Details:', 'red'));
    console.log(error instanceof Error ? error.message : 'Unknown error');
    console.log('');
    console.log(colorize('Troubleshooting Tips:', 'yellow'));
    console.log('  1. Verify your SendGrid API key is correct');
    console.log('  2. Check that sender email is verified in SendGrid');
    console.log('  3. Review SendGrid Activity Feed for delivery errors:');
    console.log('     ' + colorize('https://app.sendgrid.com/email_activity', 'blue'));
    console.log('  4. Check SendGrid dashboard for any account issues');
    console.log('');
    process.exit(1);
  }
}

// Run the test
testSendGrid().catch((error) => {
  console.error('');
  printError('Unexpected error:');
  console.error(error);
  console.error('');
  process.exit(1);
});
