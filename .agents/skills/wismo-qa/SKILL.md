---
name: Delight Desk WISMO QA (Codex)
description: Codex-native staging-first QA skill for running end-to-end WISMO validation with WooCommerce, mailbox simulation, approvals, Temporal visibility, evidence, and rollback.
---

# Delight Desk WISMO QA (Codex-native)

## Mission

Run WISMO QA end-to-end using **staging backend APIs** (preferred) and customer-like email flows, while keeping full evidence and safe rollback for any WooCommerce mutations.

## Continuous improvement loop (required)

This skill is **recursive by design**. Every run must improve future runs when new information appears.

When you encounter an undocumented blocker, edge case, or scenario and successfully resolve it:

1. Add the new case to this skill (scenario/workflow/preflight/blocker policy sections).
2. Add exact detection signals (API response, log pattern, workflow state, timeout shape).
3. Add the remediation path that worked.
4. Record evidence references in the run report.
5. Commit the skill update in the same cycle as the QA execution outcome.

Apply the same recursive pattern to future skills created in `.agents/skills/`.

## Execution mode (required)

- Primary mode: **staging URL** in `DD_API` (non-localhost).
- Avoid local backend startup unless explicitly requested.
- Never use production systems or production customer data.

## Required environment variables

```bash
DD_API
DD_STAGING_EMAIL
DD_STAGING_PASSWORD
WISMO_SUPPORT_INBOX_EMAIL
WOO_STORE_URL
WOO_CONSUMER_KEY
WOO_CONSUMER_SECRET
WISMO_CUSTOMER_GMAIL_EMAIL
WISMO_CUSTOMER_GMAIL_APP_PASSWORD
```

## Optional environment variables

```bash
DD_COOKIE                         # default: /tmp/dd-wismo-qa-cookie.txt
WISMO_REPLY_TIMEOUT_SECONDS       # default: 900
QA_RUN_ID                         # default: wismo-qa-<timestamp>
TEMPORAL_CLI_ADDRESS
TEMPORAL_CLI_NAMESPACE
TEMPORAL_CLI_TLS_SERVER_NAME
TEMPORAL_CLI_API_KEY
```

## Preflight (must run first)

```bash
export DD_COOKIE="${DD_COOKIE:-/tmp/dd-wismo-qa-cookie.txt}"
export WISMO_REPLY_TIMEOUT_SECONDS="${WISMO_REPLY_TIMEOUT_SECONDS:-900}"
export QA_RUN_ID="${QA_RUN_ID:-wismo-qa-$(date +%Y%m%d-%H%M%S)}"

required_vars=(
  DD_API DD_STAGING_EMAIL DD_STAGING_PASSWORD
  WISMO_SUPPORT_INBOX_EMAIL WOO_STORE_URL WOO_CONSUMER_KEY WOO_CONSUMER_SECRET
  WISMO_CUSTOMER_GMAIL_EMAIL WISMO_CUSTOMER_GMAIL_APP_PASSWORD
)
missing=()
for v in "${required_vars[@]}"; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
if [ "${#missing[@]}" -gt 0 ]; then
  printf 'Missing required vars: %s\n' "${missing[*]}"
  exit 1
fi

if [[ "$DD_API" == *"localhost"* || "$DD_API" == *"127.0.0.1"* ]]; then
  echo "Blocked: this skill is staging-first; provide staging DD_API instead of localhost."
  exit 1
fi
```

## Core workflow

1. **Auth & access validation**
   - Login (`/auth/login`) and persist cookie.
   - Validate agents/settings endpoints include WISMO availability.
   - Validate Woo connectivity with a lightweight orders query.
   - Validate approval/workflow visibility endpoints used by your tenant.
2. **Scenario order selection**
   - Auto-select recent staging orders matching each scenario shape.
3. **Snapshot before mutation**
   - Save full order JSON for each mutated order to `/tmp/${QA_RUN_ID}-<orderId>-before.json`.
4. **Send customer-like emails**
   - SMTP from QA mailbox to connected support inbox.
5. **Approvals + recursive polling**
   - Poll for workflow progress and approval queue transitions until terminal or timeout.
6. **Evidence capture**
   - Persist case logs (timestamps, thread IDs, workflow IDs, order IDs, approval IDs, reply message IDs).
7. **Rollback**
   - Restore every mutated Woo record from saved snapshots.
8. **Case report**
   - Produce pass/fail by case with explicit blockers and command output excerpts.

## Minimum evidence per case

- `case_id`
- test subject token (`[WISMO-QA <run-id> <case-id>]`)
- staging thread/email IDs
- workflow ID + run ID
- approval queue item IDs (if enabled)
- Woo order ID(s)
- outbound reply message ID
- final status (`pass` / `fail` / `blocked`)

## Blocker policy

When blocked, output:

1. Exact command executed
2. Exact error output
3. Why it blocks progression
4. Concrete remediation variable/value class needed (never print secret values)

If the blocker is resolved during the run, immediately fold that resolution back into this skill using the continuous improvement loop above.
