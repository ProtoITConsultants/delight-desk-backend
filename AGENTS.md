# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Delight Desk is an AI-powered customer service automation NestJS backend. It connects email providers (Gmail/Outlook), classifies emails via OpenAI, and orchestrates AI agent workflows via Temporal.

### Prerequisites

- **Node.js v20+** (installed via nvm)
- **PostgreSQL 16** with `pgvector` extension
- Database user `delight_desk` (superuser) with password `delight_desk_dev`, database `delight_desk`

### Key commands

All commands are in `package.json`. The most relevant:

| Task | Command |
|---|---|
| Dev server | `npm run start:dev` |
| Build | `npm run build` |
| Format check | `npm run format:check` |
| Format fix | `npm run format` |
| DB migrate | `npm run db:migrate` |
| Seed billing plans | `npm run seed:billingPlans` |
| Seed agents | `npm run seed:agents` |

### Important caveats

1. **NODE_ENV override**: The VM has `NODE_ENV=production` set globally. You **must** `export NODE_ENV=development` before running `npm run start:dev`, otherwise the app will reject the `.env` file permissions and require `CORS_ORIGINS` to be configured.

2. **DATABASE_URL override**: The VM may have a pre-existing `DATABASE_URL` env var. The local dev database URL uses user `delight_desk` with password `delight_desk_dev` on `localhost:5432/delight_desk`. You must `export DATABASE_URL=<local-url>` before running the app or migrations if the env var is pre-set to a different value. The `.env` file at repo root has the correct value, but `dotenv` does not override existing env vars.

3. **PostgreSQL must be started manually**: Run `pg_ctlcluster 16 main start` before any DB operations.

4. **No ESLint config**: The repository has ESLint devDependencies but no config file. Use `npm run format:check` (Prettier) for code quality checks.

5. **Temporal**: The InfraModule requires `TEMPORAL_NAMESPACE`, `TEMPORAL_API_KEY`, `TEMPORAL_ENDPOINT`, and `TEMPORAL_TASK_QUEUE` env vars. Placeholder values in `.env` allow the app to start and connect (the worker starts but actual workflow execution requires real Temporal Cloud credentials).

6. **Session store**: The session table `user_sessions` is created by drizzle migrations. No need to create it manually.

7. **The dev server listens on port 3000** by default. Test with `curl http://localhost:3000/` (expect 404 on root; use `/auth/signup`, `/auth/login`, `/dashboard/analytics`, etc.).
