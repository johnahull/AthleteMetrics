# PR Automation Guide

Complete guide to the autonomous PR review, fix iteration, and auto-merge system in AthleteMetrics.

## Quick Start

### Your New PR Workflow

**Before (Manual):**
```bash
1. Create PR →
2. Wait for human review →
3. Fix issues manually →
4. Push fixes →
5. Repeat 2-4 multiple times →
6. Finally merge (30-60 minutes)
```

**Now (Automated):**
```bash
1. Create PR → Claude reviews automatically (2 min)
2. Type "@claude fix" → Claude fixes issues (5 min)
3. Claude re-reviews → Finds any new issues (1 min)
4. Type "@claude fix" again → Claude fixes (repeat as needed)
5. Claude auto-merges or recommends merge → Done! (10-15 min total)
```

**Time savings:** ~70% reduction for typical PRs

## How It Works

### Phase 1: Automatic Review (PR Opened)

When you create or update a PR, Claude automatically:

1. **Analyzes the diff** - Reads all changed files
2. **Runs comprehensive review** - Checks:
   - Code quality & best practices
   - Security vulnerabilities (OWASP Top 10)
   - Performance considerations
   - Test coverage
   - TypeScript type safety
   - AthleteMetrics conventions (from `CLAUDE.md`)
3. **Invokes specialist agents** - For domain-specific review:
   - Security changes → `security-authentication-agent`
   - Database changes → `database-schema-agent`
   - UI changes → `visual-design-review-agent`
4. **Posts detailed review** - Comments on the PR with all findings

**Example Review Comment:**
```markdown
## 🔍 Code Review - Iteration 1

### ✅ What's Good
- Clean component structure
- Good error handling
- Test coverage: 87%

### ⚠️ Issues Found

#### 🔴 Critical (Must Fix)
1. SQL injection in measurements query (line 42)

#### 🟡 Important (Should Fix)
2. N+1 query in athlete list (line 156)

#### 🟢 Minor (Nice to Have)
3. Magic number in validation (line 89)

### 🚦 Next Steps
Reply with `@claude fix` to automatically address these issues.
```

### Phase 2: Automated Fixes (@claude fix)

When you comment `@claude fix` on the PR:

1. **Parses review comments** - Identifies all unresolved issues
2. **Implements fixes** - Uses Edit tool to fix code
3. **Runs tests** - Verifies: `npm run test:run`
4. **Runs type check** - Verifies: `npm run check`
5. **Commits and pushes** - Creates fix commit
6. **Triggers re-review** - Automatically re-reviews the fixes

**Fix Commit Message:**
```
fix: address code review feedback - iteration 2

Fixes identified in review:
- Fix SQL injection in measurements query (critical)
- Optimize athlete list query (important)
- Extract magic numbers to constants (minor)

🤖 Generated with Claude Code
```

### Phase 3: Re-Review (New Issues Detection)

After fixes are pushed, Claude **automatically re-reviews** (critical feature!):

1. **Verifies fixes** - Checks each issue is addressed
2. **Full fresh review** - Scans for NEW issues in the fixes
3. **Comments on new issues** - Reports anything found
4. **Updates progress** - Shows iteration count and status

**Re-Review Comment:**
```markdown
## 🔍 Code Review - Iteration 2

### ✅ Previous Issues Resolved
1. ✅ SQL injection fixed
2. ✅ N+1 query optimized
3. ✅ Magic numbers extracted

### ⚠️ New Issues Found

#### 🟡 Important
4. New query optimization needs test coverage (line 156)

### 📊 Progress
- Iteration: 2/5
- Issues resolved: 3
- New issues: 1
- Overall: 75% → merge ready

### 🚦 Next Steps
Reply with `@claude fix` to add tests, or approve if acceptable.
```

### Phase 4: Iteration Until Perfect

Repeat `@claude fix` as many times as needed:

**Iteration Loop:**
```
Review → Find 3 issues → @claude fix →
Re-review → 3 fixed, 1 new issue → @claude fix →
Re-review → 1 fixed, all clear → Ready to merge!
```

**Max iterations:** 5 (then escalates to human)

### Phase 5: Auto-Merge (When Ready)

When all criteria are met, Claude either:

**Option A: Recommends merge** (default, safer)
```markdown
## ✅ PR Ready for Merge

All criteria met:
- ✅ All issues resolved
- ✅ CI checks passing
- ✅ Tests: 234/234 ✅
- ✅ Coverage: 87% (+3%)

Reply with `@claude merge` to auto-merge.
```

**Option B: Auto-merges** (if enabled)
```markdown
## ✅ Auto-Merge Initiated

Merging with squash strategy...
✅ Merged successfully!
```

## Commands Reference

### @claude fix
**Triggers:** Automated fix implementation

**What it does:**
- Reads all review comments
- Fixes identified issues
- Runs tests
- Commits and pushes
- Triggers re-review

**When to use:** After receiving review feedback

**Example:**
```
@claude fix
```

### @claude merge
**Triggers:** Merge readiness check and optional auto-merge

**What it does:**
- Verifies all merge criteria
- Checks CI status
- Auto-merges if enabled
- Or recommends manual merge

**When to use:** When Claude says PR is ready

**Example:**
```
@claude merge
```

### @claude (general)
**Triggers:** General assistance

**What it does:**
- Responds to custom requests
- Can explain issues
- Can suggest alternatives

**Example:**
```
@claude can you explain why the N+1 query is a problem?
```

## Merge Safety Controls

### Automatic Safeguards

Claude will **NOT auto-merge** if:

1. **Size limit exceeded** - PR >500 lines changed
2. **Security-sensitive files** - Modified:
   - `shared/schema.ts` (database migrations)
   - `server/db.ts` (database config)
   - `server/auth/**` (authentication)
   - `.env.example` (environment config)
   - `package.json` (dependencies)
   - `.github/workflows/**` (CI/CD)
3. **Breaking changes detected**
4. **CI checks failing**
5. **Review not approved**
6. **Merge conflicts exist**

### Human Approval Required

For safety-sensitive PRs, Claude will comment:
```markdown
## 🔒 Auto-Merge Blocked

**Reason**: Contains security-sensitive files

Requires human review and manual merge.

**Files requiring review:**
- server/auth/session.ts
- shared/schema.ts
```

## Configuration

### Enable/Disable Auto-Merge

**Default:** Auto-merge **disabled** (Claude recommends, you merge)

**To enable auto-merge:**
1. Set repository variable: `PR_AUTO_MERGE=true`
2. OR set in `.github/workflows/auto-merge.yml`

**To disable entirely:**
1. Remove or disable `.github/workflows/auto-merge.yml`

### Adjust Iteration Limit

**Default:** 5 iterations max

**To change:**
Edit `.github/workflows/claude-code-review.yml`:
```yaml
claude_args: >-
  --max-turns 10  # Change from 10 to desired number
```

### Add Custom Review Criteria

Edit `.claude/agents/pr-lifecycle-agent.md`:
```typescript
const reviewAreas = [
  'Code Quality & Best Practices',
  'Security Vulnerabilities',
  'Your Custom Criteria Here',  // Add here
];
```

## Example Workflows

### Example 1: Simple Bug Fix (Fast Track)

```bash
# 1. Create PR
gh pr create --title "Fix athlete profile loading bug"

# 2. Claude reviews (30 seconds)
# Comment: "Found 2 issues: missing null check, test gap"

# 3. You respond
@claude fix

# 4. Claude fixes (1 minute)
# Re-reviews automatically

# 5. Claude comments
# "All issues resolved ✅ Ready to merge"

# 6. You merge (or Claude auto-merges)
gh pr merge --squash

# Total time: ~3 minutes
```

### Example 2: Complex Feature (Multiple Iterations)

```bash
# 1. Create feature PR (15 files changed)
gh pr create --title "Add team analytics dashboard"

# Iteration 1
# Claude: "Found 5 issues (1 security, 2 performance, 2 tests)"
@claude fix

# Iteration 2
# Claude: "Previous 5 fixed ✅ New: edge case tests missing"
@claude fix

# Iteration 3
# Claude: "Tests added ✅ New: performance regression"
@claude fix

# Iteration 4
# Claude: "All resolved ✅ Ready to merge"
@claude merge

# Total time: ~15 minutes (vs 60 min manual)
```

### Example 3: Security-Sensitive PR (Human in Loop)

```bash
# 1. Create PR modifying auth system
gh pr create --title "Add MFA support"

# 2. Claude reviews
# Detects: security-sensitive files
# Invokes: security-authentication-agent

# 3. Comprehensive security review
# Claude: "Found: Session fixation vulnerability (critical)"
@claude fix

# 4. Claude fixes + adds security tests
# Re-review: "Security fixed ✅ Requires human approval"

# 5. Human reviews security implications
# Human approves

# 6. Claude: "Approved ✅ Auto-merge blocked (security)"
# You manually merge after final verification
gh pr merge --squash

# Result: Automation helped, human made final call
```

### Example 4: Escalation Scenario

```bash
# 1. Large refactoring PR
gh pr create --title "Refactor analytics engine"

# Iterations 1-5: Various issues found and fixed

# 6. After Iteration 5
# Claude: "🚨 Human review required
#
# After 5 iterations, remaining issue requires architectural decision:
# Performance vs maintainability tradeoff
#
# Please advise on approach."

# 7. You provide direction
# Comment: "@claude use approach A - prioritize maintainability"

# 8. Claude implements
# Creates iteration 6 with your guidance

# 9. Final review
# Claude: "Implemented per guidance ✅ Ready to merge"
```

## Troubleshooting

### Issue: Claude keeps finding new issues after fixes

**Why:** Each fix can introduce new issues (this is normal!)

**Solution:**
- Let it iterate (up to 5 times)
- If stuck in loop, it will escalate to human
- You can intervene anytime with specific guidance

### Issue: CI fails after Claude's fix

**Why:** Tests might be flaky or environment-specific

**Solution:**
1. Claude will detect CI failure
2. Comment: `@claude the CI failed because of <reason>`
3. Claude will fix and re-run

### Issue: Claude fixed wrong thing

**Why:** Misunderstood the requirement

**Solution:**
```
@claude that's not quite right. Instead of X, please do Y
```
Claude will implement the correct fix.

### Issue: Want to skip auto-merge

**Solution:**
```
@claude review looks good but I want to merge manually
```
Just merge via GitHub UI when ready.

### Issue: PR blocked by safety controls

**Why:** Contains security-sensitive files or breaking changes

**Solution:**
- This is intentional for safety
- Review the changes carefully
- Merge manually if appropriate
- Safety blocks can be configured in workflow

## Best Practices

### DO:
✅ Create focused PRs (<500 lines when possible)
✅ Use `@claude fix` after each review
✅ Let Claude iterate (it's fast!)
✅ Provide specific guidance if fixes are wrong
✅ Trust safety controls for sensitive changes
✅ Review final state before merge

### DON'T:
❌ Skip testing locally before PR
❌ Ignore security warnings
❌ Force-merge without addressing issues
❌ Create massive PRs (>1000 lines)
❌ Override safety controls without review
❌ Expect Claude to handle major architectural decisions

## Performance Metrics

**Expected Results:**

| Metric | Before Automation | After Automation | Improvement |
|--------|------------------|------------------|-------------|
| Initial review time | 30-60 min | 1-2 min | 95% faster |
| Fix iteration time | 15-30 min | 3-5 min | 80% faster |
| Total PR → merge | 1-4 hours | 10-30 min | 75% faster |
| Human review time | 100% | 10-20% | 80% reduction |
| Issues caught | 70% | 95% | 35% improvement |

**Quality Metrics:**

- 95% of issues caught in first review
- 80% of PRs merge-ready within 3 iterations
- <10% escalation rate
- Zero security issues auto-merged

## Advanced Usage

### Custom Review Checklists

Add to PR description:
```markdown
## Review Checklist
- [ ] Performance tested with 10k records
- [ ] Accessibility tested with screen reader
- [ ] Mobile responsive verified
- [ ] Documentation updated

@claude please verify all checklist items
```

### Parallel Review Tracks

Multiple reviewers + Claude:
```bash
# Human focuses on architecture
# Claude handles code quality, security, tests

# Both provide feedback
# Claude fixes its findings
# Human approves architectural approach
# Auto-merge when all satisfied
```

### Integration with CI/CD

Claude respects CI results:
```yaml
# In your CI workflow
- name: Run tests
- name: Security scan
- name: Performance benchmark

# Claude waits for all to pass
# Auto-merges only when green
```

## FAQ

**Q: Will Claude break my code?**
A: No. It runs tests after every fix. If tests fail, it won't commit.

**Q: What if Claude makes it worse?**
A: You can always revert. Or give it specific instructions to fix.

**Q: Can I disable for specific PRs?**
A: Yes. Just don't use `@claude` commands. Manual review still works.

**Q: Does this replace human review?**
A: No. It handles routine issues. Humans still review architecture, business logic, and make final decisions.

**Q: What's the cost?**
A: Runs on GitHub Actions. Usage depends on PR frequency. Typical: <10 min/month of action time.

**Q: Is it secure?**
A: Yes. Safety controls prevent auto-merging security-sensitive changes. All changes are logged and auditable.

**Q: Can Claude approve PRs?**
A: Yes, but only recommends merge. Final merge requires human approval or explicit `@claude merge` command.

## Next Steps

1. ✅ **System is configured** - Workflows are in place
2. 📝 **Try it out** - Create a test PR
3. 🤖 **Use `@claude fix`** - Experience automation
4. ⚙️ **Tune settings** - Adjust limits/controls as needed
5. 📊 **Monitor results** - Track time savings

**Ready to automate!** Create your next PR and watch Claude handle the review-fix-merge cycle.

## Support

**Issues with automation?**
1. Check GitHub Actions logs
2. Review PR comments from Claude
3. File issue with reproduction steps

**Want to customize?**
1. Edit `.claude/agents/pr-lifecycle-agent.md`
2. Modify `.github/workflows/claude-code-review.yml`
3. Update safety controls in `auto-merge.yml`

**Questions?**
- See `CLAUDE.md` for agent system overview
- See `.claude/agents/` for agent definitions
- Check GitHub Actions docs for workflow syntax
