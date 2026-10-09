#!/bin/bash
set -e

# Security Audit Script
# Runs npm audit and fails on critical or high severity vulnerabilities
# Usage: ./scripts/security-audit.sh
#
# Excluded vulnerabilities: none. Every advisory that was excluded earlier (glob CLI, claude-code
# workspace trust, esbuild Deno, the undici/jsdom chain) no longer matches anything in the
# audit output, so the exclusions were pruned (issues #523, #562). To exclude an advisory again, add
# its GHSA id to EXCLUDED_ADVISORIES below and document here why it does not apply to this project
# (reachability, dev-only, no upstream fix) and when to revisit it.
#
# package.json overrides added for audit fixes (remove when no longer needed):
# - tinypool: drop once vitest >= 4 (vitest 4 no longer depends on tinypool; 3.x pins ^1).
# - postcss-selector-parser: still needed after the Tailwind 4 migration (issue #523): @tailwindcss/typography
#   pins 6.0.10 exactly (GHSA-rj75-hqrm-r3gf, moderate); the override forces the patched 7.x. Drop it once typography widens its range.
#
# Each run warns about an EXCLUDED_ADVISORIES ID that matches no current advisory,
# so stale exclusions are noticed and pruned.

echo "🔍 Running npm security audit..."

# Run audit and capture output
# Note: npm audit returns non-zero exit codes even for informational output,
# so we use `|| true` to prevent script termination while we parse the JSON results.
# Exit codes: 0 = no vulnerabilities, 1+ = vulnerabilities found (severity-dependent)
npm audit --audit-level=moderate --json > audit-results.json || true

# List of excluded vulnerability advisory IDs (false positives)
# These are vulnerabilities that don't affect our usage patterns
EXCLUDED_ADVISORIES=""

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

  # Count HIGH vulnerabilities fully attributable to excluded advisories.
  # npm audit records a transitively-affected package with a STRING `via` that
  # names its source package (e.g. vite's via is ["esbuild"]), while only the
  # source package carries the advisory OBJECT. A package is therefore excluded
  # only if EVERY advisory at the root of its `via` chain is in the excluded
  # list — this both catches transitive dependents (the previous URL-only match
  # missed them) and never hides a package that also has a non-excluded advisory.
  # Example (hypothetical): excluding an advisory on esbuild also covers the packages that only
  # depend on it (vite, vitest, tsx, drizzle-kit), but not one that has another advisory of its own.
  EXCLUDED_VULN_COUNT=$(EXCLUDED_ADVISORIES="$EXCLUDED_ADVISORIES" node -e '
    const audit = require("./audit-results.json");
    const excluded = (process.env.EXCLUDED_ADVISORIES || "").split(/\s+/).filter(Boolean);
    const vulns = audit.vulnerabilities || {};
    const rootIds = (name, seen = new Set()) => {
      if (seen.has(name)) return [];
      seen.add(name);
      const v = vulns[name]; if (!v) return [];
      const ids = [];
      for (const via of v.via || []) {
        if (typeof via === "object") ids.push(via.url || "");
        else ids.push(...rootIds(via, seen));
      }
      return ids;
    };
    let n = 0;
    for (const [name, v] of Object.entries(vulns)) {
      if (v.severity !== "high") continue;
      const ids = rootIds(name).filter(Boolean);
      if (ids.length && ids.every(id => excluded.some(e => id.includes(e)))) n++;
    }
    console.log(n);
  ' 2>/dev/null || echo "0")

  # Warn about excluded advisory IDs that no longer match any reported advisory
  STALE_EXCLUSIONS=$(EXCLUDED_ADVISORIES="$EXCLUDED_ADVISORIES" node -e '
    const audit = require("./audit-results.json");
    const urls = Object.values(audit.vulnerabilities || {})
      .flatMap(v => (v.via || []).filter(via => typeof via === "object").map(via => via.url || ""));
    const excluded = (process.env.EXCLUDED_ADVISORIES || "").split(/\s+/).filter(Boolean);
    console.log(excluded.filter(id => !urls.some(url => url.includes(id))).join(" "));
  ' 2>/dev/null || echo "")
  for advisory in $STALE_EXCLUSIONS; do
    echo "⚠️  Excluded advisory $advisory matched nothing in this audit; remove it from EXCLUDED_ADVISORIES if it is fixed."
  done

  # Adjust high count by excluding false positives (see header for rationale).
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
