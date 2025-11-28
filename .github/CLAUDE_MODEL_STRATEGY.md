# Claude Code Versioning Strategy

## Overview
This document explains how AthleteMetrics ensures Claude Code workflows always use the latest available versions and models.

## Action Version Strategy

### Current Configuration
All workflows use the **major version tag** for automatic updates:
```yaml
uses: anthropics/claude-code-action@v1
```

### Why Use Major Version Tags?
- **`@v1`** ✅ RECOMMENDED - Automatically gets latest v1.x.x updates (patches, bug fixes, minor features)
- **`@v1.0.5`** ❌ NOT RECOMMENDED - Pinned to specific version, requires manual updates
- **`@main`** ❌ DANGEROUS - Unstable, could break workflows without warning

### Benefits of `@v1`
1. **Automatic Security Patches** - Get security fixes immediately
2. **Bug Fixes** - Benefit from bug fixes without manual intervention
3. **No Breaking Changes** - Major version boundary protects against incompatible changes
4. **Always Latest Stable** - Get new features within v1.x compatibility

### When to Update Action Version
- GitHub will notify in PR checks when v2 is released
- Review [release notes](https://github.com/anthropics/claude-code-action/releases) before upgrading to v2
- Update manually: Change `@v1` to `@v2` when ready for breaking changes

## Model Alias Strategy

### Why Use Aliases?
Instead of hardcoding specific model versions like `claude-sonnet-4-5-20250929`, we use **model aliases** that automatically resolve to the latest version:

```yaml
# ❌ BAD: Hardcoded version (requires manual updates)
claude_args: '--model claude-sonnet-4-5-20250929'

# ✅ GOOD: Alias automatically uses latest version
claude_args: '--model sonnet'
```

### Available Aliases
- **`sonnet`** - Latest Claude Sonnet (currently 4.5)
- **`opus`** - Latest Claude Opus (currently 4.1)
- **`haiku`** - Latest Claude Haiku

### Benefits
1. **Automatic Updates** - Get new model versions without code changes
2. **No Manual Maintenance** - Don't need to update version strings
3. **Always Latest** - Benefit from performance improvements and bug fixes
4. **Consistent Behavior** - All workflows use the same strategy

## Current Configuration

### Interactive Workflows (claude.yml)
- **Trigger**: `@claude` mentions in issues/PRs
- **Model**: `sonnet` (latest Sonnet)
- **Use Case**: Interactive code assistance, bug fixes, feature implementation

### Automated PR Reviews (claude-code-review.yml)
- **Trigger**: PR opened/updated
- **Model**: `sonnet` (latest Sonnet)
- **Configuration**: Optimized with reduced turns (20) and limited tools
- **Use Case**: Automated code review, security scanning, best practices

## When to Use Different Models

### Sonnet (Default) ✅
- **Best for**: Most tasks, balanced performance and cost
- **Use cases**: Code reviews, bug fixes, feature implementation, refactoring
- **Speed**: Fast
- **Cost**: Moderate

### Opus (Premium)
- **Best for**: Complex architectural decisions, critical security reviews
- **Use cases**: Major refactoring, system design, deep analysis
- **Speed**: Slower
- **Cost**: Higher
- **How to use**: Comment `@claude --model opus <your request>`

### Haiku (Fast)
- **Best for**: Simple tasks, quick responses
- **Use cases**: Simple code reviews, documentation updates, minor fixes
- **Speed**: Very fast
- **Cost**: Lower
- **How to use**: Comment `@claude --model haiku <your request>`

## Overriding Models

### In Comments (Interactive)
Users can override the default model in `@claude` mentions:
```
@claude --model opus perform a comprehensive security audit
@claude --model haiku fix this typo in the README
```

### In Workflows (Permanent)
To change the default model for a workflow, edit the `claude_args`:
```yaml
# .github/workflows/claude-code-review.yml
claude_args: --model opus --max-turns 30
```

## Monitoring Model Updates

### How to Check Current Model Versions
1. Visit [Anthropic's Model Documentation](https://docs.anthropic.com/en/docs/about-claude/models)
2. Check [Claude Code Release Notes](https://code.claude.com/docs/en/release-notes)
3. Review GitHub Actions workflow runs for model information

### When Models Update
- Aliases automatically resolve to new versions
- No action required from our side
- Workflows continue using latest capabilities
- Monitor for any behavioral changes in PR reviews

## Troubleshooting

### Model Not Available
If you see errors about model availability:
1. Check if the alias is correct (`sonnet`, `opus`, `haiku`)
2. Verify `CLAUDE_CODE_OAUTH_TOKEN` secret is valid
3. Check Anthropic service status

### Unexpected Behavior After Update
If Claude behaves differently after a model update:
1. Review the [release notes](https://code.claude.com/docs/en/release-notes)
2. Temporarily pin to a specific version if needed: `--model claude-sonnet-4-5-20250929`
3. Report issues to Anthropic or update workflow configuration

### Performance Issues
If automated reviews are slow or timing out:
1. Check current timeout settings (15min job, 12min step)
2. Consider using `haiku` for faster but less thorough reviews
3. Reduce `--max-turns` if too many iterations

## Best Practices

1. **Use aliases by default** - Let Anthropic manage versions
2. **Pin versions only when necessary** - For debugging or regression testing
3. **Document model overrides** - Explain why you're using a specific version
4. **Monitor workflow performance** - Ensure new models don't cause timeouts
5. **Test major changes** - When Anthropic releases new major versions

## Future Considerations

### Potential Improvements
- [ ] Add model selection based on PR size (haiku for small, sonnet for medium, opus for large)
- [ ] Implement cost tracking for different models
- [ ] Create custom prompts optimized for each model's strengths
- [ ] Add fallback to haiku if sonnet times out

### Version Pinning Strategy
Consider pinning to specific versions for:
- Production-critical workflows
- Regression testing
- Reproducible builds
- Cost control

Example:
```yaml
# Pin to specific version for stability
claude_args: '--model claude-sonnet-4-5-20250929'
```

## Related Documentation
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions)
- [Claude Model Capabilities](https://docs.anthropic.com/en/docs/about-claude/models)
- [Workflow Timeout Configuration](.github/workflows/claude-code-review.yml)
