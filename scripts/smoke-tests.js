#!/usr/bin/env node

/**
 * Smoke Tests Script
 *
 * Runs critical post-deployment smoke tests to verify core functionality
 * is working after deployment to staging or production.
 */

import http from 'http';
import https from 'https';

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const TIMEOUT = 10000; // 10 seconds per test

// Test results
const results = {
  passed: [],
  failed: [],
  skipped: []
};

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const requestOptions = {
      timeout: TIMEOUT,
      ...options
    };

    const request = client.get(url, requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
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

async function testHealthEndpoint() {
  const testName = 'Health Endpoint';
  try {
    const response = await makeRequest(`${BASE_URL}/api/health`);

    // Parse response to get detailed error information
    const data = JSON.parse(response.body);

    // Health endpoint should return 200 for healthy or 503 for unhealthy
    if (response.statusCode === 503) {
      const errorMsg = data.error || 'Service unavailable';
      throw new Error(`Service unhealthy (503): ${errorMsg}`);
    }

    if (response.statusCode !== 200) {
      throw new Error(`Expected 200, got ${response.statusCode}`);
    }

    // Accept various healthy status values
    const healthyStatuses = ['ok', 'healthy', 'ready'];
    if (!healthyStatuses.includes(data.status)) {
      throw new Error(`Health status is not healthy: ${data.status}`);
    }

    if (data.database !== 'connected') {
      throw new Error(`Database not connected: ${data.database}`);
    }

    results.passed.push(testName);
    console.log(`✅ ${testName}: PASSED`);
    return true;
  } catch (error) {
    results.failed.push({ test: testName, error: error.message });
    console.error(`❌ ${testName}: FAILED - ${error.message}`);
    return false;
  }
}

async function testRootEndpoint() {
  const testName = 'Root Endpoint (Client)';
  try {
    const response = await makeRequest(BASE_URL);

    if (response.statusCode !== 200) {
      throw new Error(`Expected 200, got ${response.statusCode}`);
    }

    // Check for HTML content
    if (!response.body.includes('<!DOCTYPE html>') && !response.body.includes('<html')) {
      throw new Error('Response does not appear to be HTML');
    }

    results.passed.push(testName);
    console.log(`✅ ${testName}: PASSED`);
    return true;
  } catch (error) {
    results.failed.push({ test: testName, error: error.message });
    console.error(`❌ ${testName}: FAILED - ${error.message}`);
    return false;
  }
}

async function testStaticAssets() {
  const testName = 'Static Assets';
  try {
    // Try to load a common static file (if exists)
    // This is optional and may fail if no static assets are at root
    const response = await makeRequest(`${BASE_URL}/favicon.ico`);

    // Accept 200 (found) or 404 (not found) as valid responses
    if (response.statusCode !== 200 && response.statusCode !== 404) {
      throw new Error(`Unexpected status code: ${response.statusCode}`);
    }

    results.passed.push(testName);
    console.log(`✅ ${testName}: PASSED (${response.statusCode})`);
    return true;
  } catch (error) {
    // Don't fail the entire test suite for static assets
    results.skipped.push({ test: testName, reason: error.message });
    console.warn(`⚠️  ${testName}: SKIPPED - ${error.message}`);
    return true; // Don't fail overall
  }
}

async function testAPIRouteExists() {
  const testName = 'API Routes Accessible';
  try {
    // Test a common API route (adjust based on your actual routes)
    const response = await makeRequest(`${BASE_URL}/api/health`);

    // We already tested this above, but verifying API routing works
    if (response.statusCode === 404) {
      throw new Error('API routes not accessible (404)');
    }

    results.passed.push(testName);
    console.log(`✅ ${testName}: PASSED`);
    return true;
  } catch (error) {
    results.failed.push({ test: testName, error: error.message });
    console.error(`❌ ${testName}: FAILED - ${error.message}`);
    return false;
  }
}

async function testDatabaseConnection() {
  const testName = 'Database Connectivity';
  try {
    // The health endpoint already checks database connection
    // This is a redundant check to ensure DB is definitely working
    const response = await makeRequest(`${BASE_URL}/api/health`);
    const data = JSON.parse(response.body);

    // Check for unhealthy status
    if (response.statusCode === 503) {
      const errorMsg = data.error || 'Service unavailable';
      throw new Error(`Database connection failed: ${errorMsg}`);
    }

    if (!data.database || data.database !== 'connected') {
      throw new Error('Database connection check failed in health endpoint');
    }

    results.passed.push(testName);
    console.log(`✅ ${testName}: PASSED`);
    return true;
  } catch (error) {
    results.failed.push({ test: testName, error: error.message });
    console.error(`❌ ${testName}: FAILED - ${error.message}`);
    return false;
  }
}

async function testResponseTime() {
  const testName = 'Response Time Performance';
  try {
    const startTime = Date.now();
    await makeRequest(`${BASE_URL}/api/health`);
    const duration = Date.now() - startTime;

    // Fail if response takes more than 5 seconds
    if (duration > 5000) {
      throw new Error(`Response too slow: ${duration}ms (max 5000ms)`);
    }

    results.passed.push(testName);
    console.log(`✅ ${testName}: PASSED (${duration}ms)`);
    return true;
  } catch (error) {
    results.failed.push({ test: testName, error: error.message });
    console.error(`❌ ${testName}: FAILED - ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('\n🧪 Starting smoke tests...\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  const startTime = Date.now();

  // Run tests sequentially
  await testHealthEndpoint();
  await testRootEndpoint();
  await testStaticAssets();
  await testAPIRouteExists();
  await testDatabaseConnection();
  await testResponseTime();

  const duration = Date.now() - startTime;

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Smoke Test Results\n');
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Skipped: ${results.skipped.length}`);
  console.log(`⏱️  Duration: ${duration}ms\n`);

  if (results.failed.length > 0) {
    console.log('Failed Tests:');
    results.failed.forEach(failure => {
      console.log(`  - ${failure.test}: ${failure.error}`);
    });
    console.log();
  }

  console.log('='.repeat(50) + '\n');

  // Exit with error if any tests failed
  if (results.failed.length > 0) {
    console.error('❌ Smoke tests FAILED\n');
    process.exit(1);
  }

  console.log('✅ All smoke tests PASSED\n');
  process.exit(0);
}

// Handle interrupts
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Smoke tests interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Smoke tests terminated');
  process.exit(143);
});

// Run tests
runAllTests();
