#!/usr/bin/env bash
# Create common labels using GitHub CLI
# Usage: ./scripts/setup_github_labels.sh <owner/repo>
set -eu pipefail
REPO="${1:-}"
if [[ -z "$REPO" ]]; then
  echo "Usage: $0 <owner/repo>" >&2
  exit 1
fi

create_label() {
  local name="$1" color="$2" desc="$3"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null || gh label edit "$name" --repo "$REPO" --color "$color" --description "$desc"
}

# Types
create_label "type:bug" "d73a4a" "Bug or defect"
create_label "type:feature" "0052cc" "User-facing feature"
create_label "type:chore" "c5def5" "Internal maintenance"

# Priority
create_label "priority:P0" "b60205" "Hotfix: crash, data loss, security"
create_label "priority:P1" "d93f0b" "Blocks common user path"
create_label "priority:P2" "fbca04" "Nice-to-have"

# Size
create_label "size:S" "0e8a16" "≤ 2 hours"
create_label "size:M" "5319e7" "≤ 1 day"
create_label "size:L" "1d76db" "> 1 day. Split if possible"

# Area
create_label "area:ui" "c2e0c6" "User interface"
create_label "area:api" "bfdadc" "Backend/API"
create_label "area:db" "fef2c0" "Database"

# Status
create_label "status:blocked" "000000" "Blocked by dependency"
echo "Labels ensured for $REPO"
