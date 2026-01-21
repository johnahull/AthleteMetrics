# Contributing to AthleteMetrics

Thank you for your interest in contributing to AthleteMetrics! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [E2E Testing Requirements](#e2e-testing-requirements)
- [Coding Standards](#coding-standards)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) code of conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/AthleteMetrics.git
   cd AthleteMetrics
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/johnahull/AthleteMetrics.git
   ```

## Development Setup

For detailed setup instructions, see [docs/LOCAL_DEVELOPMENT_SETUP.md](docs/LOCAL_DEVELOPMENT_SETUP.md).

### Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

3. **Set up local PostgreSQL database:**
   ```bash
   createdb athletemetrics_dev
   npm run db:push
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

### Running Tests

```bash
# Unit tests (no database required)
npm run test:unit

# Integration tests (requires local PostgreSQL)
npm run test:integration

# All tests
npm test
```

## Making Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our [coding standards](#coding-standards)

3. **Write or update tests** as needed

4. **Run the test suite:**
   ```bash
   npm test
   npm run check  # TypeScript type checking
   ```

5. **Commit your changes:**
   ```bash
   git commit -m "feat: add your feature description"
   ```

   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New features
   - `fix:` - Bug fixes
   - `docs:` - Documentation changes
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

6. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

## Pull Request Process

1. **Update your branch** with the latest main:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Open a Pull Request** against the `main` branch

3. **Fill out the PR template** completely, including:
   - Description of changes
   - Type of change (bug fix, feature, etc.)
   - Testing checklist
   - E2E test verification (for user-facing changes)

4. **Wait for CI checks** to pass

5. **Address review feedback** promptly

6. **Squash and merge** once approved

## E2E Testing Requirements

**All user-facing features MUST have E2E test coverage before merging.**

### When E2E Tests Are Required

- New user-facing pages or routes
- New forms or data entry workflows
- CRUD operations (Create, Read, Update, Delete)
- Authentication or authorization changes
- Changes to existing user workflows

### When E2E Tests May Be Skipped

- Pure CSS/styling changes with no UX impact
- Internal refactoring with identical UX
- Backend-only changes (use integration tests instead)
- Documentation updates

### Running E2E Tests

```bash
# Run against staging environment
npm run test:staging

# Run specific test file
npx playwright test tests/e2e/your-test.spec.ts --config=playwright.staging.config.ts
```

See [docs/E2E_TESTING.md](docs/E2E_TESTING.md) for detailed E2E testing documentation.

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict type checking
- Avoid `any` types when possible
- Use Zod schemas for runtime validation

### React

- Use functional components with hooks
- Follow existing component patterns
- Use React Query for server state
- Use React Hook Form for forms

### Styling

- Use Tailwind CSS for styling
- Follow existing shadcn/ui patterns
- Maintain responsive design

### Database

- Use Drizzle ORM for all database operations
- Never write raw SQL (use Drizzle's query builder)
- Add appropriate indexes for new queries

### Testing

- Write unit tests for utilities and pure functions
- Write integration tests for API endpoints
- Write E2E tests for user workflows

## Reporting Bugs

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) to report bugs. Include:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (browser, OS, etc.)
- Screenshots if applicable

## Suggesting Features

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) to suggest features. Include:

- Clear description of the problem you're solving
- Proposed solution
- Alternative approaches considered
- Additional context

## Questions?

- Check existing [issues](https://github.com/johnahull/AthleteMetrics/issues)
- Review [documentation](docs/)
- Open a [discussion](https://github.com/johnahull/AthleteMetrics/discussions)

Thank you for contributing to AthleteMetrics!
