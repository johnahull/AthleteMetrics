#!/usr/bin/env bash
# Create a classic repo Project board via REST v3 (GitHub still supports classic boards).
# Requires: env var GH_TOKEN with repo scope.
# Usage: ./scripts/create_repo_project_classic.sh <owner> <repo> [Project Name]
set -euo pipefail
OWNER="${1:-}"
REPO="${2:-}"
NAME="${3:-Delivery}"
if [[ -z "$OWNER" || -z "$REPO" ]]; then
  echo "Usage: $0 <owner> <repo> [Project Name]" >&2
  exit 1
fi
API="https://api.github.com"
HDRS=(-H "Accept: application/vnd.github.inertia-preview+json" -H "Authorization: token $GH_TOKEN" -H "X-GitHub-Api-Version: 2022-11-28")
# Create project
proj=$(curl -s "${HDRS[@]}" -X POST "$API/repos/$OWNER/$REPO/projects" -d "$(jq -n --arg name "$NAME" '{name:$name}')" )
pid=$(echo "$proj" | jq -r .id)
if [[ "$pid" == "null" || -z "$pid" ]]; then
  echo "Failed to create project. Response:"
  echo "$proj"
  exit 1
fi
echo "Project created: $pid"
# Add columns
for col in Inbox "Next" "In progress" Review Done; do
  curl -s "${HDRS[@]}" -X POST "$API/projects/$pid/columns" -d "$(jq -n --arg name "$col" '{name:$name}')" >/dev/null
done
echo "Columns created."
echo "Tip: Add issues to the board via the UI or API."
