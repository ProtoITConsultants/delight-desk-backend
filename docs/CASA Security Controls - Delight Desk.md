# CASA Security Controls - Delight Desk

## Purpose

This document provides CASA evidence for backend security controls implemented in Delight Desk. It maps trust boundaries, data classes, and required protections for Google verification and internal review.

## Trust Boundaries and Data Flows

### Boundary A: Public Internet -> Backend API
- Entry points: REST endpoints exposed by NestJS service.
- Primary controls:
  - CORS allow-list enforcement.
  - Session cookie authentication (`httpOnly`, secure in production).
  - ValidationPipe with whitelist/forbidNonWhitelisted.
  - Public endpoint rate limiting for auth/contact endpoints.
  - Sensitive query parameter blocking middleware.

### Boundary B: Backend API -> PostgreSQL
- Data paths:
  - User records, sessions, OAuth linkage, product knowledge metadata.
- Primary controls:
  - Server-side authorization checks before data access.
  - Password hashing with bcrypt before persistence.
  - Session invalidation after password change/reset.
  - Database TLS configured via driver options.

### Boundary C: Backend API -> External OAuth / Provider APIs
- Integrations:
  - Google OAuth / Gmail API.
  - Microsoft OAuth / Graph API.
  - WooCommerce and shipping providers.
- Primary controls:
  - Token lifecycle managed server-side.
  - No token values in URL parameters for app APIs.
  - Reduced sensitive logging and no raw email-body logging.

### Boundary D: Backend API -> User-Supplied URL Fetching
- Feature:
  - Product knowledge URL ingestion.
- Primary controls:
  - Protocol restriction to `http/https`.
  - Port restriction to `80/443`.
  - Local/private hostname and IP rejection.
  - DNS resolution checks and redirect/resource blocking for private targets.

## Sensitive Data Classification

### Level P0 (Public / Low Sensitivity)
- Billing plan catalog metadata.
- Non-sensitive static docs.
- Protection requirements:
  - Integrity in source control and CI.

### Level P1 (Business Internal)
- Product knowledge metadata/chunks.
- Operational metrics and non-PII logs.
- Protection requirements:
  - Access by authenticated user scope.
  - No sensitive payload logging.

### Level P2 (Personal / Account Data)
- User profile data (name, email, company, phone).
- OAuth account linkage metadata.
- Protection requirements:
  - Authenticated access only.
  - User-level authorization scoping.
  - No-cache headers for authenticated responses.
  - Encrypted transport (TLS).

### Level P3 (Credential / Secret Material)
- Password hashes.
- Session identifiers.
- OAuth access/refresh tokens.
- Service API keys and deployment secrets.
- Protection requirements:
  - Passwords: salted hash (bcrypt).
  - Tokens and credentials never logged in plaintext.
  - Secrets stored in environment and planned migration to external secret manager.
  - Session invalidation on sensitive account changes.

## Protection Requirements Matrix

- Encryption in transit:
  - HTTPS/TLS required for production ingress and provider calls.
- Encryption at rest:
  - Database and storage encryption required at infrastructure layer.
- Integrity:
  - CI/CD deployment workflow.
  - Security integrity checksum report generated in CI.
- Access control:
  - Server-side SessionGuard and role checks.
  - Resource ownership checks for user-scoped data.
- Availability and abuse resistance:
  - Rate limiting for high-risk and public endpoints.
- Privacy and logging:
  - Security audit logging for authenticated requests (metadata only).
  - Query-string secret blocking.

## Verification and Runbook Notes

- Before release:
  - Run `npm run build`.
  - Run `npm run security:integrity`.
  - Run `npm run security:dns-check`.
  - Confirm `ENABLE_SWAGGER_IN_PRODUCTION` is unset or false.
  - Confirm `CORS_ORIGINS` is explicitly set in production.
- During deployment:
  - Verify SSH host keys are pinned in GitHub Actions run.
  - Verify PM2 process health after restart.

## Remaining Non-Code Operational Controls

- Enforce MFA for admin/operator identities at IAM/IdP level.
- Validate TLS certificate policy and OCSP stapling at load balancer/CDN.
- Use managed secret store (e.g., cloud secret manager) for runtime key material.
- Periodic domain/subdomain checks are automated with `npm run security:dns-check`
  and the scheduled GitHub Action `Security DNS Monitor`; maintain
  `docs/dns-inventory.json` as the source of truth.
