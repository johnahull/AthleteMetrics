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
# - GHSA-gv7w-rqvm-qjhr (esbuild missing binary integrity verification in Deno module)
#   Affects esbuild's Deno installation path, which downloads platform binaries from
#   NPM_CONFIG_REGISTRY without integrity verification. AthleteMetrics installs esbuild
#   via npm only (vite, vitest, tsx, drizzle-kit); the @esbuild/* platform binaries are
#   pinned and integrity-verified in package-lock.json. The Deno install path is never
#   used, so the attack vector does not apply. Dev/build-time tooling, not shipped.
#   Upstream fix (esbuild 0.28.1) is a major bump that conflicts with vite (^0.27.0) and
#   drizzle-kit (^0.25.4) declared esbuild ranges; deferred until those tools widen them.
#   Affected (transitively): esbuild, vite, vite-node, vitest, @vitest/*, tsx,
#   drizzle-kit, @esbuild-kit/*, @vitejs/plugin-react.
# - undici advisories (GHSA-vmh5-mc38-953g, GHSA-vxpw-j846-p89q, GHSA-hm92-r4w5-c3mj,
#   GHSA-p88m-4jfj-68fv, GHSA-pr7r-676h-xcf6, GHSA-35p6-xmwp-9g52, GHSA-g8m3-5g58-fq7m)
#   undici reaches this project ONLY transitively as jsdom's HTTP client:
#   isomorphic-dompurify -> jsdom -> undici. isomorphic-dompurify uses jsdom solely to
#   provide a DOM for sanitizing HTML strings (DOMPurify); it issues no network requests,
#   so undici's HTTP-client vulnerabilities (SOCKS5/proxy routing, WebSocket DoS,
#   keep-alive/cache/Set-Cookie handling) are not reachable in our usage. jsdom@29 pins
#   undici to ^7; the patched line is 7.28.0 but npm's `overrides` does not move the
#   nested resolution off 7.25.0 (npm 10.x quirk), and undici 8.x would break jsdom's
#   ^7 peer range. All seven undici advisory IDs are listed so the audit gate treats the
#   undici/jsdom/isomorphic-dompurify chain as fully attributable to excluded advisories.
#   Revisit when jsdom widens its undici range or isomorphic-dompurify ships a fixed jsdom.

echo "🔍 Running npm security audit..."

# Run audit and capture output
# Note: npm audit returns non-zero exit codes even for informational output,
# so we use `|| true` to prevent script termination while we parse the JSON results.
# Exit codes: 0 = no vulnerabilities, 1+ = vulnerabilities found (severity-dependent)
npm audit --audit-level=moderate --json > audit-results.json || true

# List of excluded vulnerability advisory IDs (false positives)
# These are vulnerabilities that don't affect our usage patterns
EXCLUDED_ADVISORIES="GHSA-5j98-mcp5-4vw2 GHSA-mmgp-wc2j-qcv7 GHSA-gv7w-rqvm-qjhr GHSA-vmh5-mc38-953g GHSA-vxpw-j846-p89q GHSA-hm92-r4w5-c3mj GHSA-p88m-4jfj-68fv GHSA-pr7r-676h-xcf6 GHSA-35p6-xmwp-9g52 GHSA-g8m3-5g58-fq7m"

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
  # Example: GHSA-5j98-mcp5-4vw2 (glob) affects glob, sucrase, tailwindcss, etc.;
  # GHSA-gv7w-rqvm-qjhr (esbuild) affects esbuild, vite, vitest, tsx, drizzle-kit.
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
