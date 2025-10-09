#!/usr/bin/env node

/**
 * Health Check Script
 *
 * Performs post-deployment health checks to verify the application
 * is running correctly on Railway staging or production.
 */

const http = require('http');
const https = require('https');

// Configuration from environment variables
const HEALTH_CHECK_URL = process.env.HEALTH_CHECK_URL || 'http://localhost:5000';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 60000; // 60 seconds
const RETRIES = parseInt(process.env.HEALTH_CHECK_RETRIES) || 5;
const RETRY_DELAY = 5000; // 5 seconds between retries

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const healthUrl = url.endsWith('/api/health') ? url : `${url}/api/health`;

    console.log(`🔍 Checking: ${healthUrl}`);

    const request = client.get(healthUrl, { timeout: 10000 }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data,
          headers: res.headers
        });
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function checkHealth() {
  console.log('\n🏥 Starting health check...\n');
  console.log(`URL: ${HEALTH_CHECK_URL}`);
  console.log(`Timeout: ${TIMEOUT}ms`);
  console.log(`Max retries: ${RETRIES}\n`);

  const startTime = Date.now();
  let lastError = null;

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${RETRIES}...`);

      const response = await makeRequest(HEALTH_CHECK_URL);

      // Parse response first (to get more detailed error info)
      let healthData;
      try {
        healthData = JSON.parse(response.body);
      } catch (e) {
        throw new Error(`Invalid JSON response: ${response.body.substring(0, 100)}`);
      }

      // Check status code - accept 200 for healthy, reject 503 for unhealthy
      if (response.statusCode === 503) {
        const errorMsg = healthData.error || 'Service unavailable';
        throw new Error(`Service unhealthy (503): ${errorMsg}`);
      }

      if (response.statusCode !== 200) {
        throw new Error(`Unexpected status code: ${response.statusCode}`);
      }

      // Validate health response structure
      if (!healthData.status) {
        throw new Error('Health check response missing "status" field');
      }

      // Accept various healthy status values for backward compatibility
      const healthyStatuses = ['ok', 'healthy', 'ready'];
      if (!healthyStatuses.includes(healthData.status)) {
        throw new Error(`Health check status is not healthy: ${healthData.status}`);
      }

      // Check database connection if present
      if (healthData.database && healthData.database !== 'connected') {
        throw new Error(`Database not connected: ${healthData.database}`);
      }

      // Success!
      const duration = Date.now() - startTime;
      console.log('\n' + '='.repeat(50));
      console.log('✅ Health check PASSED\n');
      console.log(`Status: ${healthData.status}`);
      console.log(`Database: ${healthData.database || 'not checked'}`);
      console.log(`Version: ${healthData.version || 'unknown'}`);
      console.log(`Timestamp: ${healthData.timestamp || 'unknown'}`);
      console.log(`\nTotal time: ${duration}ms`);
      console.log(`Attempts: ${attempt}/${RETRIES}`);
      console.log('='.repeat(50) + '\n');

      process.exit(0);

    } catch (error) {
      lastError = error;
      const elapsed = Date.now() - startTime;

      console.error(`❌ Attempt ${attempt} failed: ${error.message}`);

      // Check if we've exceeded total timeout
      if (elapsed >= TIMEOUT) {
        console.error(`\n⏱️  Total timeout exceeded (${TIMEOUT}ms)`);
        break;
      }

      // Retry if we haven't reached max attempts
      if (attempt < RETRIES) {
        console.log(`⏳ Retrying in ${RETRY_DELAY / 1000} seconds...\n`);
        await sleep(RETRY_DELAY);
      }
    }
  }

  // All attempts failed
  const totalDuration = Date.now() - startTime;
  console.error('\n' + '='.repeat(50));
  console.error('❌ Health check FAILED\n');
  console.error(`Last error: ${lastError.message}`);
  console.error(`Total attempts: ${RETRIES}`);
  console.error(`Total time: ${totalDuration}ms`);
  console.error('='.repeat(50) + '\n');

  process.exit(1);
}

// Handle interrupts
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Health check interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Health check terminated');
  process.exit(143);
});

// Run health check
checkHealth();
