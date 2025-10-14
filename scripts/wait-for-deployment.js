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

if (!RAILWAY_SERVICE_ID) {
  console.error('❌ RAILWAY_SERVICE_ID environment variable is required');
  process.exit(1);
}

if (!process.env.RAILWAY_TOKEN) {
  console.error('❌ RAILWAY_TOKEN environment variable is required');
  process.exit(1);
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

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Railway CLI exited with code ${code}: ${stderr}`));
      } else {
        // Check for empty output before parsing
        if (!stdout || stdout.trim().length === 0) {
          reject(new Error(`Railway CLI returned empty output. stderr: ${stderr}`));
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (err) {
          // Include partial stdout for debugging
          const preview = stdout.length > 200 ? stdout.substring(0, 200) + '...' : stdout;
          reject(new Error(`Failed to parse Railway CLI output: ${err.message}\nOutput preview: ${preview}`));
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
      'deployments',
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
  console.log('⏳ Waiting for Railway deployment to complete...');
  console.log(`   Poll interval: ${POLL_INTERVAL / 1000}s`);
  console.log(`   Timeout: ${TIMEOUT / 1000}s`);

  // Initial delay to allow Railway API to register the new deployment
  // Without this, we may poll the previous deployment instead of the new one
  const INITIAL_DELAY = 10000; // 10 seconds
  console.log(`⏸️  Initial delay: ${INITIAL_DELAY / 1000}s (waiting for Railway to register new deployment)`);
  await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));

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
