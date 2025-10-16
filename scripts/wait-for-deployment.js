#!/usr/bin/env node

/**
 * Wait for Railway deployment to reach a stable state
 * Polls deployment status instead of using fixed sleep duration
 *
 * Usage: node scripts/wait-for-deployment.js
 *
 * Required environment variables:
 * - RAILWAY_TOKEN: Railway API token
 * - RAILWAY_SERVICE_ID: Service ID to monitor
 *
 * Optional environment variables:
 * - DEPLOYMENT_POLL_INTERVAL: Seconds between status checks (default: 5)
 * - DEPLOYMENT_TIMEOUT: Maximum seconds to wait (default: 300)
 */

import { spawn } from 'child_process';

const POLL_INTERVAL = parseInt(process.env.DEPLOYMENT_POLL_INTERVAL || '5', 10) * 1000;
const TIMEOUT = parseInt(process.env.DEPLOYMENT_TIMEOUT || '300', 10) * 1000;
const RAILWAY_SERVICE_ID = process.env.RAILWAY_SERVICE_ID;
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB limit to prevent memory exhaustion

/**
 * Sanitize output to prevent command injection via control characters
 * Removes ANSI escape sequences and control characters
 *
 * ANSI sequences: \x1B[ followed by parameters and command letter
 * Control chars: 0x00-0x1F (except \n, \t), 0x7F-0x9F
 */
function sanitizeOutput(str) {
  if (!str) return '';
  // Remove ANSI escape sequences (color codes, cursor control, etc.)
  // Pattern: ESC [ <parameters> <command>
  str = str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  // Remove other ANSI sequences: ESC followed by any character
  str = str.replace(/\x1B./g, '');
  // Remove control characters (0x00-0x1F, 0x7F-0x9F) except newlines and tabs
  return str.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');
}

if (!RAILWAY_SERVICE_ID) {
  console.error('❌ RAILWAY_SERVICE_ID environment variable is required');
  process.exit(1);
}

if (!process.env.RAILWAY_TOKEN) {
  console.error('❌ RAILWAY_TOKEN environment variable is required');
  process.exit(1);
}

/**
 * Verify Railway CLI is installed
 */
function checkRailwayCLI() {
  return new Promise((resolve, reject) => {
    const proc = spawn('railway', ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('Railway CLI not found. Install with: npm install -g @railway/cli'));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(new Error('Railway CLI not found. Install with: npm install -g @railway/cli'));
    });
  });
}

/**
 * Verify Railway CLI authentication
 */
async function checkRailwayAuth() {
  return new Promise((resolve, reject) => {
    const proc = spawn('railway', ['whoami'], {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    proc.stdout.on('data', (data) => {
      if (stdout.length < MAX_BUFFER_SIZE) {
        stdout += data.toString();
      } else if (!stdoutTruncated) {
        stdoutTruncated = true;
        console.warn('⚠️  stdout buffer limit reached, output truncated');
      }
    });

    proc.stderr.on('data', (data) => {
      if (stderr.length < MAX_BUFFER_SIZE) {
        stderr += data.toString();
      } else if (!stderrTruncated) {
        stderrTruncated = true;
        console.warn('⚠️  stderr buffer limit reached, output truncated');
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Railway CLI authentication failed. Please check RAILWAY_TOKEN environment variable. Error: ${sanitizeOutput(stderr)}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to verify Railway authentication: ${sanitizeOutput(err.message)}`));
    });
  });
}

/**
 * Execute Railway CLI command and parse JSON output
 */
async function railwayCommand(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('railway', args, {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    proc.stdout.on('data', (data) => {
      if (stdout.length < MAX_BUFFER_SIZE) {
        stdout += data.toString();
      } else if (!stdoutTruncated) {
        stdoutTruncated = true;
        console.warn('⚠️  stdout buffer limit reached, output truncated');
      }
    });

    proc.stderr.on('data', (data) => {
      if (stderr.length < MAX_BUFFER_SIZE) {
        stderr += data.toString();
      } else if (!stderrTruncated) {
        stderrTruncated = true;
        console.warn('⚠️  stderr buffer limit reached, output truncated');
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Railway CLI exited with code ${code}: ${sanitizeOutput(stderr)}`));
      } else {
        // Check for empty output before parsing
        if (!stdout || stdout.trim().length === 0) {
          reject(new Error(`Railway CLI returned empty output. stderr: ${sanitizeOutput(stderr)}`));
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (err) {
          // Include partial stdout for debugging (sanitized)
          const preview = stdout.length > 200 ? stdout.substring(0, 200) + '...' : stdout;
          reject(new Error(`Failed to parse Railway CLI output: ${sanitizeOutput(err.message)}\nOutput preview: ${sanitizeOutput(preview)}`));
        }
      }
    });
  });
}

/**
 * Get the latest deployment status
 */
async function getLatestDeploymentStatus() {
  try {
    const result = await railwayCommand([
      'deployment',
      'list',
      '--service',
      RAILWAY_SERVICE_ID,
      '--json'
    ]);

    if (!result || !result.data || result.data.length === 0) {
      throw new Error('No deployments found');
    }

    const latestDeployment = result.data[0];
    return {
      id: latestDeployment.id,
      status: latestDeployment.status,
      createdAt: latestDeployment.createdAt
    };
  } catch (error) {
    throw new Error(`Failed to get deployment status: ${error.message}`);
  }
}

/**
 * Wait for deployment to reach SUCCESS or FAILED state
 */
async function waitForDeployment() {
  // Verify Railway CLI is installed before proceeding
  console.log('🔍 Checking Railway CLI installation...');
  await checkRailwayCLI();
  console.log('✅ Railway CLI found');

  // Verify Railway CLI authentication before waiting
  // This provides faster feedback if auth is misconfigured
  console.log('🔐 Verifying Railway authentication...');
  await checkRailwayAuth();
  console.log('✅ Authenticated successfully');

  // Initial delay to allow Railway API to register the new deployment
  // Without this, we may poll the previous deployment instead of the new one
  const INITIAL_DELAY = 10000; // 10 seconds
  console.log(`⏸️  Initial delay: ${INITIAL_DELAY / 1000}s (waiting for Railway to register new deployment)`);
  await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));

  console.log('⏳ Waiting for Railway deployment to complete...');
  console.log(`   Poll interval: ${POLL_INTERVAL / 1000}s`);
  console.log(`   Timeout: ${TIMEOUT / 1000}s`);

  const startTime = Date.now();
  let lastStatus = null;
  let consecutiveErrors = 0;
  let trackedDeploymentId = null;
  const MAX_CONSECUTIVE_ERRORS = 5;

  while (Date.now() - startTime < TIMEOUT) {
    try {
      const deployment = await getLatestDeploymentStatus();

      // Track the first deployment ID we see to ensure we monitor the correct one
      if (!trackedDeploymentId) {
        trackedDeploymentId = deployment.id;
        console.log(`🎯 Tracking deployment: ${trackedDeploymentId}`);
      } else if (deployment.id !== trackedDeploymentId) {
        console.warn(`⚠️  Deployment ID changed! Was ${trackedDeploymentId}, now ${deployment.id}`);
        console.warn(`   This may indicate we started monitoring the wrong deployment`);
      }

      // Reset consecutive error counter on successful status check
      consecutiveErrors = 0;

      if (deployment.status !== lastStatus) {
        console.log(`📊 Deployment ${deployment.id} status: ${deployment.status}`);
        lastStatus = deployment.status;
      }

      // Terminal states
      if (deployment.status === 'SUCCESS') {
        console.log('✅ Deployment completed successfully');
        return 0;
      }

      if (deployment.status === 'FAILED' || deployment.status === 'CRASHED') {
        console.error(`❌ Deployment ${deployment.status.toLowerCase()}`);
        return 1;
      }

      // In-progress states: BUILDING, DEPLOYING, INITIALIZING
      // Keep polling
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

    } catch (error) {
      consecutiveErrors++;
      console.error(`⚠️  Error checking deployment status: ${error.message}`);

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`❌ ${MAX_CONSECUTIVE_ERRORS} consecutive API errors - failing fast`);
        console.error('   This may indicate Railway CLI authentication or network issues');
        return 1;
      }

      console.log(`   Retrying in ${POLL_INTERVAL / 1000}s... (attempt ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }

  // Timeout reached
  console.error(`❌ Deployment timeout after ${TIMEOUT / 1000}s`);
  console.error('   Last status:', lastStatus || 'unknown');
  return 1;
}

// Run the script
waitForDeployment()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
