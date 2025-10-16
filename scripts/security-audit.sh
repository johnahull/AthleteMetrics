#!/bin/bash
set -e

# Security Audit Script
# Runs npm audit and fails on critical or high severity vulnerabilities
# Usage: ./scripts/security-audit.sh

echo "🔍 Running npm security audit..."

# Run audit and capture output
# Note: npm audit returns non-zero exit codes even for informational output,
# so we use `|| true` to prevent script termination while we parse the JSON results.
# Exit codes: 0 = no vulnerabilities, 1+ = vulnerabilities found (severity-dependent)
npm audit --audit-level=moderate --json > audit-results.json || true

# Validate that audit results were generated
if [ ! -f "audit-results.json" ] || [ ! -s "audit-results.json" ]; then
  echo "❌ Failed to generate audit results"
  echo "This may indicate npm is not properly installed or configured"
  exit 1
fi

# Check for vulnerabilities using jq (should be available in GitHub Actions)
if command -v jq &> /dev/null; then
  CRITICAL_COUNT=$(jq '.metadata.vulnerabilities.critical // 0' audit-results.json)
  HIGH_COUNT=$(jq '.metadata.vulnerabilities.high // 0' audit-results.json)
  MODERATE_COUNT=$(jq '.metadata.vulnerabilities.moderate // 0' audit-results.json)

  echo "📊 Security Audit Results:"
  echo "  Critical: $CRITICAL_COUNT"
  echo "  High: $HIGH_COUNT"
  echo "  Moderate: $MODERATE_COUNT"

  # Fail on critical or high vulnerabilities
  if [ "$CRITICAL_COUNT" -gt 0 ] || [ "$HIGH_COUNT" -gt 0 ]; then
    echo "❌ Found $CRITICAL_COUNT critical and $HIGH_COUNT high severity vulnerabilities"
    echo ""
    echo "🔍 Vulnerability Details:"
    npm audit --audit-level=high
    exit 1
  fi

  if [ "$MODERATE_COUNT" -gt 0 ]; then
    echo "⚠️  Found $MODERATE_COUNT moderate severity vulnerabilities"
    echo "Consider updating dependencies, but not blocking PR"
  fi

  echo "✅ No high or critical vulnerabilities found"
else
  # Fallback if jq is not available
  # Note: Uses --audit-level=high (not moderate) because we cannot parse JSON
  # to differentiate between blocking (critical/high) and non-blocking (moderate)
  # This is intentionally stricter than the main path to ensure security
  echo "⚠️  jq not found, falling back to npm audit without JSON parsing"
  echo "⚠️  Using --audit-level=high (stricter than main path due to no JSON parsing)"
  npm audit --audit-level=high
fi
