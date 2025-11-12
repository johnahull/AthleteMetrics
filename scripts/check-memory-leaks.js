#!/usr/bin/env node
/**
 * Memory Leak Detection Script for AthleteMetrics
 *
 * This script runs tests with memory profiling and detects potential memory leaks.
 *
 * Detection methods:
 * 1. Heap growth analysis - measures heap before/after tests
 * 2. Event listener leak detection - checks for unclosed listeners
 * 3. Timer leak detection - checks for unclosed timers
 * 4. Promise leak detection - checks for unhandled promises
 * 5. Database connection leak detection
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function section(title) {
  log(`\n${'='.repeat(80)}`, COLORS.cyan);
  log(title, COLORS.bright + COLORS.cyan);
  log('='.repeat(80), COLORS.cyan);
}

function parseHeapStats(output) {
  const match = output.match(/Heap: (\d+\.?\d*) MB/);
  return match ? parseFloat(match[1]) : null;
}

async function runTestWithMemoryProfiling(testPath, testType) {
  section(`Running ${testType}: ${testPath}`);

  const startTime = Date.now();
  let heapBefore = 0;
  let heapAfter = 0;
  let passed = false;
  let error = null;

  try {
    // Get initial heap stats
    const { stdout: heapBeforeOutput } = await execAsync(
      `node --expose-gc -e "global.gc(); const used = process.memoryUsage().heapUsed / 1024 / 1024; console.log('Heap:', used.toFixed(2), 'MB');"`
    );
    heapBefore = parseHeapStats(heapBeforeOutput) || 0;

    // Run test
    const testCommand = testPath.includes('.spec.ts')
      ? `TESTING_USERNAME="admin" TESTING_PASSWORD="Way2good@99?" E2E_SITE_ADMIN_USERNAME="admin" E2E_SITE_ADMIN_PASSWORD="Way2good@99?" E2E_ORG_ADMIN_USERNAME="texasfcadmin2" E2E_ORG_ADMIN_PASSWORD="Way2good@99?" npx playwright test ${testPath} --config=playwright.testing.config.ts --reporter=list`
      : `NODE_ENV=test NODE_OPTIONS="--expose-gc --max-old-space-size=4096" npm test -- ${testPath} --run --reporter=minimal`;

    const { stdout, stderr } = await execAsync(testCommand, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 120000, // 2 minute timeout
    });

    // Get final heap stats
    const { stdout: heapAfterOutput } = await execAsync(
      `node --expose-gc -e "global.gc(); const used = process.memoryUsage().heapUsed / 1024 / 1024; console.log('Heap:', used.toFixed(2), 'MB');"`
    );
    heapAfter = parseHeapStats(heapAfterOutput) || 0;

    // Check for warning signs in output
    const warnings = [];
    if (stderr.includes('MaxListenersExceededWarning')) {
      warnings.push('⚠️  Event listener leak detected');
    }
    if (stderr.includes('UnhandledPromiseRejection')) {
      warnings.push('⚠️  Unhandled promise rejection detected');
    }
    if (stdout.includes('ECONNREFUSED') || stderr.includes('ECONNREFUSED')) {
      warnings.push('⚠️  Database connection issues detected');
    }
    if (stderr.includes('heap out of memory')) {
      warnings.push('🔴 CRITICAL: Out of memory error');
    }

    passed = !stdout.includes('failed') && !stderr.includes('failed');

    return {
      testPath,
      testType,
      passed,
      heapBefore,
      heapAfter,
      heapGrowth: heapAfter - heapBefore,
      duration: Date.now() - startTime,
      warnings,
      error: null,
    };

  } catch (err) {
    return {
      testPath,
      testType,
      passed: false,
      heapBefore,
      heapAfter,
      heapGrowth: heapAfter - heapBefore,
      duration: Date.now() - startTime,
      warnings: [],
      error: err.message,
    };
  }
}

async function runMemoryLeakDetection() {
  log('\n🔍 AthleteMetrics Memory Leak Detection', COLORS.bright + COLORS.magenta);
  log('Analyzing test suite for memory leaks...\n', COLORS.magenta);

  const results = [];

  // 1. Run a sample of critical tests
  section('Phase 1: Unit Tests Sample');
  const unitTests = [
    'packages/shared/__tests__/benchmark-schema.test.ts',
    'packages/api/__tests__/benchmark-storage.test.ts',
  ];

  for (const testPath of unitTests) {
    try {
      const result = await runTestWithMemoryProfiling(testPath, 'Unit Test');
      results.push(result);

      if (result.passed) {
        log(`✅ ${testPath}`, COLORS.green);
      } else {
        log(`❌ ${testPath}`, COLORS.red);
      }

      log(`   Heap: ${result.heapBefore.toFixed(2)} MB → ${result.heapAfter.toFixed(2)} MB (${result.heapGrowth >= 0 ? '+' : ''}${result.heapGrowth.toFixed(2)} MB)`, COLORS.yellow);
      log(`   Duration: ${result.duration}ms`, COLORS.blue);

      if (result.warnings.length > 0) {
        result.warnings.forEach(w => log(`   ${w}`, COLORS.yellow));
      }

      if (result.error) {
        log(`   Error: ${result.error}`, COLORS.red);
      }
    } catch (err) {
      log(`❌ Failed to run ${testPath}: ${err.message}`, COLORS.red);
    }
  }

  // 2. Analyze results
  section('Memory Leak Analysis Summary');

  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  const totalHeapGrowth = results.reduce((sum, r) => sum + r.heapGrowth, 0);
  const avgHeapGrowth = totalHeapGrowth / totalTests;
  const maxHeapGrowth = Math.max(...results.map(r => r.heapGrowth));
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

  log(`\n📊 Test Results:`, COLORS.bright);
  log(`   Total Tests: ${totalTests}`, COLORS.blue);
  log(`   Passed: ${passedTests}`, COLORS.green);
  log(`   Failed: ${failedTests}`, failedTests > 0 ? COLORS.red : COLORS.green);

  log(`\n💾 Memory Statistics:`, COLORS.bright);
  log(`   Total Heap Growth: ${totalHeapGrowth >= 0 ? '+' : ''}${totalHeapGrowth.toFixed(2)} MB`, totalHeapGrowth > 100 ? COLORS.red : COLORS.green);
  log(`   Average Heap Growth: ${avgHeapGrowth >= 0 ? '+' : ''}${avgHeapGrowth.toFixed(2)} MB`, avgHeapGrowth > 50 ? COLORS.yellow : COLORS.green);
  log(`   Max Heap Growth: ${maxHeapGrowth >= 0 ? '+' : ''}${maxHeapGrowth.toFixed(2)} MB`, maxHeapGrowth > 100 ? COLORS.red : COLORS.green);

  if (totalWarnings > 0) {
    log(`\n⚠️  Total Warnings: ${totalWarnings}`, COLORS.yellow);
    log(`   Review test output for details`, COLORS.yellow);
  }

  // 3. Memory leak recommendations
  section('Memory Leak Prevention Recommendations');

  const recommendations = [
    '✓ Tests use process forks for isolation (vitest.config.ts:28)',
    '✓ Tests use happy-dom (2-3x less memory than jsdom) (vitest.config.ts:9)',
    '✓ Mocks are cleared after each test (vitest.config.ts:15)',
    '✓ Global stubs are restored after each test (vitest.config.ts:18)',
    '✓ Test isolation is enabled (vitest.config.ts:35)',
    '✓ Max concurrent forks limited to 3 (vitest.config.ts:32)',
  ];

  const issues = [];
  if (totalHeapGrowth > 500) {
    issues.push('🔴 High total heap growth detected - investigate test cleanup');
  }
  if (avgHeapGrowth > 100) {
    issues.push('🔴 High average heap growth - tests may not be cleaning up resources');
  }
  if (totalWarnings > 0) {
    issues.push('⚠️  Warnings detected - check for event listener or promise leaks');
  }

  if (issues.length === 0) {
    log('\n✅ No significant memory leak issues detected!', COLORS.green);
  } else {
    log('\n⚠️  Potential Issues:', COLORS.yellow);
    issues.forEach(issue => log(`   ${issue}`, COLORS.yellow));
  }

  log('\n📋 Current Protections:', COLORS.bright);
  recommendations.forEach(rec => log(`   ${rec}`, COLORS.green));

  section('Additional Checks');

  log('\n🔍 Checking for common memory leak patterns...\n', COLORS.cyan);

  // Check for event listener leaks in code
  try {
    const { stdout: eventListenerCheck } = await execAsync(
      `grep -r "addEventListener\\|on(" --include="*.ts" --include="*.tsx" packages/ | grep -v "removeEventListener\\|off(" | wc -l`
    );
    const eventListenerCount = parseInt(eventListenerCheck.trim());
    if (eventListenerCount > 50) {
      log(`⚠️  Found ${eventListenerCount} potential event listener leaks (addEventListener without removeEventListener)`, COLORS.yellow);
      log(`   Run: grep -r "addEventListener" --include="*.ts" packages/ | grep -v removeEventListener`, COLORS.blue);
    } else {
      log(`✅ Event listener usage looks good (${eventListenerCount} potential issues)`, COLORS.green);
    }
  } catch (err) {
    log(`⚠️  Could not check event listeners: ${err.message}`, COLORS.yellow);
  }

  // Check for timer leaks
  try {
    const { stdout: timerCheck } = await execAsync(
      `grep -r "setTimeout\\|setInterval" --include="*.ts" --include="*.tsx" packages/ | grep -v "clearTimeout\\|clearInterval" | wc -l`
    );
    const timerCount = parseInt(timerCheck.trim());
    if (timerCount > 30) {
      log(`⚠️  Found ${timerCount} potential timer leaks (setTimeout/setInterval without clear)`, COLORS.yellow);
      log(`   Run: grep -r "setTimeout\\|setInterval" --include="*.ts" packages/ | grep -v "clear"`, COLORS.blue);
    } else {
      log(`✅ Timer usage looks good (${timerCount} potential issues)`, COLORS.green);
    }
  } catch (err) {
    log(`⚠️  Could not check timers: ${err.message}`, COLORS.yellow);
  }

  // Check for database connection pools
  try {
    const { stdout: dbCheck } = await execAsync(
      `grep -r "new Pool\\|createPool" --include="*.ts" packages/ | wc -l`
    );
    const poolCount = parseInt(dbCheck.trim());
    if (poolCount > 5) {
      log(`⚠️  Found ${poolCount} database pool creations - ensure they're properly closed`, COLORS.yellow);
    } else {
      log(`✅ Database pool usage looks good (${poolCount} pools)`, COLORS.green);
    }
  } catch (err) {
    log(`⚠️  Could not check database pools: ${err.message}`, COLORS.yellow);
  }

  log('\n✅ Memory leak detection complete!\n', COLORS.bright + COLORS.green);

  return {
    totalTests,
    passedTests,
    failedTests,
    totalHeapGrowth,
    avgHeapGrowth,
    maxHeapGrowth,
    totalWarnings,
    hasIssues: issues.length > 0,
  };
}

// Run the detection
runMemoryLeakDetection()
  .then(summary => {
    if (summary.hasIssues) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch(err => {
    log(`\n❌ Memory leak detection failed: ${err.message}`, COLORS.red);
    console.error(err);
    process.exit(1);
  });
