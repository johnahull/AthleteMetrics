## Description

[Provide a clear description of what this PR does]

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)

## Testing Checklist

### Code Quality
- [ ] Code follows the project's style guidelines
- [ ] Self-review of code completed
- [ ] Comments added for complex logic
- [ ] No new warnings generated

### Testing
- [ ] Unit tests added/updated for backend changes
- [ ] Integration tests added/updated if needed
- [ ] **E2E tests added/updated for user-facing changes** ⚠️
- [ ] All tests pass locally
- [ ] Tested in staging environment (if applicable)

### E2E Test Verification (for user-facing changes)

**Required for:**
- ✅ New pages/routes
- ✅ New forms or workflows
- ✅ CRUD operations
- ✅ Auth/permission changes

**Not required for:**
- ❌ Styling-only changes
- ❌ Backend-only changes
- ❌ Documentation updates

If E2E tests were added/updated:
- [ ] Test file(s): `tests/e2e/_____.spec.ts`
- [ ] Tests pass on staging: `npm run test:staging`
- [ ] No flaky tests introduced

If NO E2E tests were added:
- [ ] Changes are not user-facing OR
- [ ] Existing E2E tests cover the changes OR
- [ ] Reason: _____________________________

## Documentation
- [ ] Updated relevant documentation (README, API docs, etc.)
- [ ] Updated CHANGELOG.md (if applicable)
- [ ] Added/updated code comments where necessary

## Screenshots (if applicable)

[Add screenshots for UI changes]

## Deployment Notes

- [ ] Database migrations needed? (if yes, describe below)
- [ ] Environment variables changed? (if yes, document below)
- [ ] Breaking changes? (if yes, describe migration path below)

## Checklist Before Requesting Review

- [ ] PR title is clear and descriptive
- [ ] PR is linked to related issue(s)
- [ ] All CI checks are passing
- [ ] E2E test requirement verified (see Testing Checklist above)
- [ ] Ready for review

---

**For Reviewers**: Please verify E2E test coverage for user-facing changes before approving.
