#!/bin/bash
set -e

# Security Audit Script
# Runs npm audit and fails on critical or high severity vulnerabilities
# Usage: ./scripts/security-audit.sh
#
# Excluded vulnerabilities (false positives or deferred fixes for this project):
# - GHSA-5j98-mcp5-4vw2 (glob CLI command injection)
#   This vulnerability only affects glob's CLI mode with -c/--cmd flag.
#   AthleteMetrics uses glob programmatically through tailwindcss/sucrase,
#   never as a CLI tool. No upstream fix available.
#   Dependency chain: tailwindcss → sucrase → glob
# - GHSA-mmgp-wc2j-qcv7 (@anthropic-ai/claude-code workspace trust bypass)
#   Dev-only CLI tool, not shipped in production. Does not affect app security.
# - GHSA-gpj5-g38j-94v9 (drizzle-orm SQL injection via improperly escaped identifiers)
#   Fix requires drizzle-orm >=0.45.2 which is a breaking major version upgrade.
#   AthleteMetrics uses parameterized queries via Drizzle's query builder (no raw
#   SQL identifiers from user input), so the attack vector does not apply.
#   Tracked for upgrade: https://github.com/johnahull/AthleteMetrics/issues/354

echo "🔍 Running npm security audit..."

# Run audit and capture output
# Note: npm audit returns non-zero exit codes even for informational output,
# so we use `|| true` to prevent script termination while we parse the JSON results.
# Exit codes: 0 = no vulnerabilities, 1+ = vulnerabilities found (severity-dependent)
npm audit --audit-level=moderate --json > audit-results.json || true

# List of excluded vulnerability advisory IDs (false positives)
# These are vulnerabilities that don't affect our usage patterns
EXCLUDED_ADVISORIES="GHSA-5j98-mcp5-4vw2 GHSA-mmgp-wc2j-qcv7 GHSA-gpj5-g38j-94v9"

# Validate that audit results were generated
if [ ! -f "audit-results.json" ] || [ ! -s "audit-results.json" ]; then
  echo "❌ Failed to generate audit results"
  echo "This may indicate npm is not properly installed or configured"
  exit 1
fi

# Check for vulnerabilities using jq (should be available in GitHub Actions)
if command -v jq &> /dev/null; then
  # Get raw counts from audit
  RAW_CRITICAL=$(jq '.metadata.vulnerabilities.critical // 0' audit-results.json)
  RAW_HIGH=$(jq '.metadata.vulnerabilities.high // 0' audit-results.json)
  RAW_MODERATE=$(jq '.metadata.vulnerabilities.moderate // 0' audit-results.json)

  # Count vulnerabilities that match excluded advisories
  # Each excluded advisory can affect multiple packages in the dependency tree
  EXCLUDED_VULN_COUNT=0
  for advisory in $EXCLUDED_ADVISORIES; do
    # Count how many vulnerabilities reference this advisory URL
    MATCH_COUNT=$(jq --arg adv "$advisory" '
      [.vulnerabilities // {} | to_entries[] |
       select(.value.via[]? | type == "object" and (.url // "" | contains($adv)))] | length
    ' audit-results.json 2>/dev/null || echo "0")
    EXCLUDED_VULN_COUNT=$((EXCLUDED_VULN_COUNT + MATCH_COUNT))
  done

  # Adjust high count by excluding false positives
  # The glob CLI vulnerability (GHSA-5j98-mcp5-4vw2) shows as 5 high vulns
  # because it affects: glob, sucrase, tailwindcss, @tailwindcss/typography, tailwindcss-animate
  HIGH_COUNT=$((RAW_HIGH - EXCLUDED_VULN_COUNT))
  if [ "$HIGH_COUNT" -lt 0 ]; then
    HIGH_COUNT=0
  fi
  CRITICAL_COUNT=$RAW_CRITICAL
  MODERATE_COUNT=$RAW_MODERATE

  echo "📊 Security Audit Results:"
  echo "  Critical: $CRITICAL_COUNT"
  echo "  High: $HIGH_COUNT (raw: $RAW_HIGH, excluded: $EXCLUDED_VULN_COUNT)"
  echo "  Moderate: $MODERATE_COUNT"

  if [ "$EXCLUDED_VULN_COUNT" -gt 0 ]; then
    echo ""
    echo "📋 Excluded false positives:"
    for advisory in $EXCLUDED_ADVISORIES; do
      echo "  - $advisory (excluded — see script header for rationale)"
    done
  fi

  # Fail on critical or high vulnerabilities
  if [ "$CRITICAL_COUNT" -gt 0 ] || [ "$HIGH_COUNT" -gt 0 ]; then
    echo ""
    echo "❌ Found $CRITICAL_COUNT critical and $HIGH_COUNT high severity vulnerabilities"
    echo ""
    echo "🔍 Vulnerability Details:"
    npm audit --audit-level=high
    exit 1
  fi

  if [ "$MODERATE_COUNT" -gt 0 ]; then
    echo ""
    echo "⚠️  Found $MODERATE_COUNT moderate severity vulnerabilities"
    echo "Consider updating dependencies, but not blocking PR"
  fi

  echo ""
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
