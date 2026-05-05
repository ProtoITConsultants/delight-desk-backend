---
name: Delight Desk Cloud agent starter
description: Use this when a Cloud agent needs to run, test, or debug the Delight Desk NestJS backend.
---

# Delight Desk Cloud agent starter

## Start here

- Work from `/workspace`; the app is a NestJS backend with PostgreSQL, Drizzle, Temporal, OpenAI, SendGrid, OAuth providers, and WooCommerce integrations.
- Use Node 20+ and run `npm install` only if `node_modules` is missing or stale.
- Cloud VMs may export production-like env vars. Before running local app commands, set:

```bash
export NODE_ENV=development
export DATABASE_URL=postgres://delight_desk:delight_desk_dev@localhost:5432/delight_desk
export DD_API=http://localhost:3000
```

- Start Postgres before DB-backed workflows:

```bash
pg_ctlcluster 16 main start
npm run db:migrate
npm run seed:billingPlans
npm run seed:agents
```

- Start the API in a tmux-backed shell so the agent or user can reconnect:

```bash
npm run start:dev
```

- Smoke the process with `curl -i "$DD_API/"`; a 404 on `/` still proves the Nest app is listening.

## Logging in and testing guarded routes

Most app APIs use cookie sessions. Signup and login create a session cookie:

```bash
EMAIL="cloud-agent-$(date +%s)@example.test"
PASSWORD="Password12345!"
curl -i -c /tmp/dd-cookie.txt \
  -H "content-type: application/json" \
  -d "{\"firstName\":\"Cloud\",\"lastName\":\"Agent\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"company\":\"Delight Desk\"}" \
  "$DD_API/auth/signup"

curl -i -b /tmp/dd-cookie.txt "$DD_API/dashboard/analytics"
```

For development-only bypass testing, set `DEV_USER_ID` to a real user UUID before starting or restarting the server:

```bash
export DEV_USER_ID="$(psql "$DATABASE_URL" -tAc "select id from users where email='$EMAIL'")"
npm run start:dev
curl -i "$DD_API/dashboard/analytics"
```

Use the cookie flow when testing production-like auth behavior. Use `DEV_USER_ID` only when the change is not about session creation, cookies, or authorization.

## Feature flags and env toggles

There is no central feature-flag service in this repo. Mock behavior with env vars or seeded data, and remove temporary overrides before committing.

- Required for app boot when Temporal modules load: `TEMPORAL_NAMESPACE`, `TEMPORAL_API_KEY`, `TEMPORAL_ENDPOINT`, `TEMPORAL_TASK_QUEUE`. Placeholder values can prove startup; real workflow execution needs real Temporal credentials.
- Sentry local test: set `SENTRY_DSN`, `SENTRY_ENABLE_LOCAL=true`, and `SENTRY_DEBUG_ENDPOINT=true`, then hit `GET /debug/sentry/error`.
- AI/product knowledge tests that call models need `OPENAI_API_KEY`.
- Password reset and contact email paths need `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, and related frontend/contact URL env vars.
- CORS only matters for browser clients; local `curl` requests usually have no `Origin` header.

## Codebase-area workflows

### Baseline quality and build

Run these for broad backend changes and before handing off:

```bash
npm run build
npm run format:check
```

There is no ESLint config and no `npm test` script. Do not assume `npm run test:pipeline` works unless `tests/test-email-pipeline.ts` exists in the current tree.

### Database, migrations, and seeds

Use this after schema/repository/seed changes:

```bash
pg_ctlcluster 16 main start
export DATABASE_URL=postgres://delight_desk:delight_desk_dev@localhost:5432/delight_desk
npm run db:migrate
npm run seed:billingPlans
npm run seed:agents
psql "$DATABASE_URL" -c "select count(*) from users;"
```

If changing schema, generate migrations with `npm run db:generate`, inspect the generated SQL, then run `npm run db:migrate`.

### Auth, dashboard, billing, accounts, approval queue

Use cookie login for end-to-end behavior:

```bash
curl -i -c /tmp/dd-cookie.txt \
  -H "content-type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  "$DD_API/auth/login"
curl -i -b /tmp/dd-cookie.txt "$DD_API/dashboard/analytics"
curl -i -b /tmp/dd-cookie.txt "$DD_API/plans"
curl -i -b /tmp/dd-cookie.txt "$DD_API/approval-queue/stats"
```

When login fails during signup, check that `seed:billingPlans` ran; signup creates a manual subscription on the `solopreneur` plan.

### Agents, system settings, promo codes, and previews

Seed agents first, then test read/update endpoints with a logged-in cookie or `DEV_USER_ID`:

```bash
curl -i -b /tmp/dd-cookie.txt "$DD_API/agents"
curl -i -b /tmp/dd-cookie.txt "$DD_API/agents/settings"
curl -i -b /tmp/dd-cookie.txt \
  -X PATCH -H "content-type: application/json" \
  -d '{"hasTrackingPluginForWoocommerce":true}' \
  "$DD_API/agents/settings"
curl -i -b /tmp/dd-cookie.txt "$DD_API/agents/promo-code/configurations"
```

Preview endpoints may call OpenAI and provider services; only run them with the needed keys and realistic test data.

### WooCommerce, provider integrations, and webhooks

OAuth and manual provider connections need real or mocked provider credentials. For local route wiring, prefer safe negative tests first:

```bash
curl -i -b /tmp/dd-cookie.txt "$DD_API/woocommerce/order?status=processing&page=1&perPage=5"
curl -i -X POST "$DD_API/woocommerce/webhooks/coupons?u=$DEV_USER_ID" \
  -H "content-type: application/json" \
  -H "x-wc-webhook-topic: coupon.updated" \
  -d '{}'
```

The webhook call should reject missing signatures while proving the route is reachable. Full webhook tests require the per-user WooCommerce webhook secret and an HMAC-SHA256 signature over the exact raw JSON body.

### AI team center, product knowledge, OpenAI, and pgvector

Use this when changing knowledge ingestion, retrieval, embeddings, or product-agent logic:

```bash
curl -i -b /tmp/dd-cookie.txt \
  -X POST -H "content-type: application/json" \
  -d '{"title":"Test return policy","content":"Customers can return unopened items within 30 days with the order number and original payment method."}' \
  "$DD_API/ai-team-center/product-knowledge/manual"

curl -i -b /tmp/dd-cookie.txt \
  -X POST -H "content-type: application/json" \
  -d '{"query":"What is the return window?","topK":3,"minSimilarity":0,"maxTokens":500}' \
  "$DD_API/ai-team-center/product-knowledge/retrieve"
```

This area needs `OPENAI_API_KEY` for embeddings/completions and a migrated database with pgvector.

### Temporal email workflows and AI agents

App startup validates Temporal env vars and auto-starts the worker. For workflow changes:

- Verify `npm run build` catches deterministic workflow import/type errors.
- Start the app with the Temporal env quad set.
- Exercise the API path that schedules or previews the changed workflow when practical.
- Use real Temporal credentials only when the test needs actual workflow execution; otherwise document that validation was limited to build/startup and the related API smoke.

### Sentry and security scripts

For Sentry changes, use the local debug endpoint only with explicit env toggles:

```bash
export SENTRY_ENABLE_LOCAL=true
export SENTRY_DEBUG_ENDPOINT=true
curl -i "$DD_API/debug/sentry/error"
```

For security script changes, run the touched script plus the integrity check:

```bash
npm run security:integrity
npm run security:audit-default-accounts
npm run security:dns-check
npm run security:iam-mfa-check
```

Some security checks may require cloud or DNS context; report those as environment-limited instead of treating them as app failures.

## Updating this skill

- Add a new command or caveat as soon as a Cloud runbook trick is discovered and verified.
- Keep recipes short, copyable, and tied to the code area they test.
- Note missing or broken scripts here so future agents do not waste time rediscovering them.
- If a workflow requires real external credentials, say which env vars are required and what can still be tested with mocks or safe negative cases.
