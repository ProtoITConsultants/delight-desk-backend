# Contributing Guide

Thanks for contributing to Delight Desk Backend.

## Before You Start

- Read `README.md` for setup instructions.
- Use Node.js v20+.
- Ensure PostgreSQL is running and reachable.
- Create and configure your local `.env`.

## Branching and Pull Requests

- Create a feature branch from `main`.
- Keep PRs focused and small when possible.
- Link related issues in the PR description.
- Use clear commit messages that explain intent.

## Local Development

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run start:dev
```

## Database Changes (Drizzle)

When changing schema:

1. Update files in `src/database/schema/`.
2. Generate migration:

   ```bash
   npm run db:generate
   ```

3. Apply migration:

   ```bash
   npm run db:migrate
   ```

Do not manually edit generated files in `drizzle/` or `drizzle/meta/`.

## Code Style and Quality

Format code:

```bash
npm run format
```

Check formatting:

```bash
npm run format:check
```

Run tests if available for your changes and include test notes in the PR.

## Commit Message Guidance

Use concise, descriptive messages. A common pattern:

- `feat: add X`
- `fix: handle Y`
- `docs: update Z`

## Pull Request Checklist

Before requesting review, confirm:

- [ ] The branch is up to date with `main`.
- [ ] New and changed behavior is tested locally.
- [ ] Relevant docs are updated.
- [ ] Schema changes include generated migrations.
- [ ] No secrets or credentials are committed.

## Reporting Security Issues

Do not open public issues for security vulnerabilities.

Please follow the process in `SECURITY.md`.
