# Solo Dev Workflow Bootstrap

## Setup
1. Ensure GitHub CLI is authenticated: `gh auth login`.
2. Create your repo or use an existing one.
3. Run labels setup:
   ```bash
   ./scripts/setup_github_labels.sh <owner/repo>
   ```
4. Enable Release Drafter by merging this `.github/` folder into your repo's default branch.
5. (Optional) Create a classic Project board:
   ```bash
   export GH_TOKEN=<personal-access-token-with-repo-scope>
   ./scripts/create_repo_project_classic.sh <owner> <repo> "Delivery"
   ```

## Board columns
Inbox → Next → In progress → Review → Done

## Issue rules
- Title = user outcome first.
- Body = steps to reproduce or acceptance criteria.
- Size = S/M/L. Split L.
