# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

We take security seriously at AthleteMetrics. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. Email your findings to the project maintainers (see repository contact info)
3. Include the following in your report:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 7 days
- **Resolution Timeline**: Critical vulnerabilities will be addressed within 30 days
- **Credit**: We will credit reporters in our release notes (unless you prefer anonymity)

### Scope

The following are in scope for security reports:

- Authentication and authorization bypasses
- SQL injection, XSS, CSRF vulnerabilities
- Sensitive data exposure
- Session management issues
- Rate limiting bypasses
- File upload vulnerabilities

### Out of Scope

- Denial of Service (DoS) attacks
- Social engineering
- Physical security
- Issues in dependencies (report these to the dependency maintainers)

## Security Best Practices for Contributors

When contributing to AthleteMetrics, please follow these security guidelines:

1. **Never commit secrets** - Use environment variables for all credentials
2. **Validate all input** - Use Zod schemas for runtime validation
3. **Use parameterized queries** - Drizzle ORM handles this automatically
4. **Follow the principle of least privilege** - Request only necessary permissions
5. **Keep dependencies updated** - Run `npm audit` regularly

## Security Features

AthleteMetrics implements the following security measures:

- **Authentication**: Session-based authentication with secure cookies
- **Authorization**: Role-based access control (RBAC)
- **Input Validation**: Zod schemas for all API inputs
- **SQL Injection Prevention**: Drizzle ORM with parameterized queries
- **XSS Prevention**: React's built-in escaping + DOMPurify
- **CSRF Protection**: SameSite cookies + origin validation
- **Rate Limiting**: Configurable rate limits on sensitive endpoints
- **Security Headers**: Helmet.js middleware

For more details, see [docs/SECURITY.md](../docs/SECURITY.md).
