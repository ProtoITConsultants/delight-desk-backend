---
name: Delight Desk WISMO QA agent
description: Use this when a Cloud agent needs to run end-to-end QA for the WISMO agent with staging WooCommerce, customer-like emails, Temporal workflows, and inbox replies.
---

# Delight Desk WISMO QA agent

## Mission

Act like a real customer asking "Where is my order?" and verify that Delight Desk's WISMO agent handles the request correctly end to end:

1. Prepare staging data in WooCommerce and connected email accounts.
2. Send customer-like emails into the monitored support inbox.
3. Wait for ingestion, classification, Temporal execution, approvals if enabled, and outbound replies.
4. Compare the response against WooCommerce, AfterShip, and workflow state.
5. Record pass/fail evidence and update this skill when new QA tricks are discovered.

The WISMO implementation runs through preparation, order discovery, order processing, and tracking. It can mark emails read, classify WISMO confidence, detect customer distress, extract or request order data, fetch WooCommerce orders, wait for tracking, create AfterShip tracking, monitor shipment status, and send final delivery notifications.

## Required access

Ask the user or staging owner for these before running real email QA:

- Delight Desk staging account with WISMO enabled and a connected support inbox.
- Staging WooCommerce REST credentials with permission to read and update orders/customers.
- QA sender mailbox access, preferably with plus-address aliases such as `wismo-qa+case-001@example.test`.
- Temporal namespace/API access for workflow visibility.
- OpenAI key, email-provider credentials, WooCommerce connection, and AfterShip credentials already configured in staging.
- Permission to mutate staging WooCommerce order billing names/emails, tracking metadata, and order statuses.

Never use production customers or production inboxes for these simulations.

## Safety rules

- Only mutate staging WooCommerce records selected for QA.
- Snapshot every order/customer field you change and restore it at the end unless the staging owner says the data can remain modified.
- Use unique subject prefixes like `[WISMO-QA yyyy-mm-dd case-id]` so inbox and workflow searches are reliable.
- Do not send high-volume tests through real provider APIs. Start with one case per scenario.
- Keep long-running checks in tmux or a scheduled runner. Do not claim a daily QA cadence exists unless a scheduler actually runs it.

## Environment setup

Use the starter Cloud skill for local backend setup, then add the QA-specific variables:

```bash
export NODE_ENV=development
export DATABASE_URL=postgres://delight_desk:delight_desk_dev@localhost:5432/delight_desk
export DD_API=http://localhost:3000
export DD_COOKIE=/tmp/dd-wismo-qa-cookie.txt

export DD_STAGING_EMAIL="staging-user@example.test"
export DD_STAGING_PASSWORD="replace-me"

export WOO_STORE_URL="https://staging-store.example.test"
export WOO_CONSUMER_KEY="ck_replace_me"
export WOO_CONSUMER_SECRET="cs_replace_me"

export QA_RUN_ID="wismo-qa-$(date +%Y%m%d-%H%M%S)"
```

Log in to Delight Desk and keep the cookie:

```bash
curl -i -c "$DD_COOKIE" \
  -H "content-type: application/json" \
  -d "{\"email\":\"$DD_STAGING_EMAIL\",\"password\":\"$DD_STAGING_PASSWORD\"}" \
  "$DD_API/auth/login"
```

Confirm WISMO is available for the staging user:

```bash
curl -s -b "$DD_COOKIE" "$DD_API/agents" | jq '.[] | select(.agentType=="wismo" or .type=="wismo" or .slug=="wismo")'
curl -s -b "$DD_COOKIE" "$DD_API/agents/settings"
```

## Staging WooCommerce data preparation

Find candidate orders. Prefer one order for each status/tracking shape:

```bash
curl -s -u "$WOO_CONSUMER_KEY:$WOO_CONSUMER_SECRET" \
  "$WOO_STORE_URL/wp-json/wc/v3/orders?per_page=20&orderby=date&order=desc"
```

Build a small matrix before sending emails:

| Case                        | Woo condition                                         | Why it matters                                       |
| --------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| `delivered-with-tracking`   | order has tracking and AfterShip can report delivered | proves happy path and final notification             |
| `in-transit`                | order has tracking but not delivered                  | proves tracking update behavior                      |
| `no-tracking-yet`           | order exists without tracking                         | proves two-hour tracking wait path                   |
| `no-order-number`           | customer email matches a Woo customer/order           | proves lookup by sender email                        |
| `missing-order-followup`    | sender/order number cannot resolve                    | proves WISMO asks for order info and waits for reply |
| `cancelled-refunded-failed` | order status is `cancelled`, `refunded`, or `failed`  | proves customer notification plus escalation         |
| `distressed-customer`       | urgent/frustrated wording                             | proves immediate distress escalation                 |
| `wrong-order-number`        | plausible order number not in store                   | proves order-not-found handling                      |

To align a Woo order with a QA sender, patch the staging order billing identity and record the old value first:

```bash
ORDER_ID="56789"
QA_EMAIL="wismo-qa+${QA_RUN_ID}-case-001@example.test"

curl -s -u "$WOO_CONSUMER_KEY:$WOO_CONSUMER_SECRET" \
  "$WOO_STORE_URL/wp-json/wc/v3/orders/$ORDER_ID" > "/tmp/${QA_RUN_ID}-${ORDER_ID}-before.json"

curl -s -X PUT -u "$WOO_CONSUMER_KEY:$WOO_CONSUMER_SECRET" \
  -H "content-type: application/json" \
  -d "{\"billing\":{\"first_name\":\"Wismo\",\"last_name\":\"QA\",\"email\":\"$QA_EMAIL\"}}" \
  "$WOO_STORE_URL/wp-json/wc/v3/orders/$ORDER_ID"
```

Restore changed orders after the run using the saved `/tmp/${QA_RUN_ID}-*-before.json` files.

## Sending customer emails

Use the QA sender mailbox UI/API or an approved SMTP/API client. The exact send command depends on the mailbox provider, so keep provider-specific commands in a private runbook or environment setup, not in git.

Every test email must include:

- From: QA sender email matching the staging Woo order when the scenario requires email lookup.
- To: connected Delight Desk support inbox.
- Subject: `[WISMO-QA <run-id> <case-id>] <plain customer subject>`.
- Body: realistic customer language, one scenario per email.

## Scenario catalog

### Case 1: explicit order number, normal tone

Subject: `[WISMO-QA ${QA_RUN_ID} case-001] Where is my order #56789?`

Body:

```text
Hi, can you tell me where order 56789 is and when it will be delivered?
Thanks.
```

Expected:

- Classified as `wismo` with confidence at or above the WISMO threshold.
- Order number is extracted without asking a follow-up question.
- WooCommerce order details are fetched.
- If moderation is on, acknowledgement/final messages appear in the approval queue; approve or edit-and-approve them.
- Reply includes grounded order/tracking details and does not invent data missing from WooCommerce/AfterShip.

### Case 2: no order number, sender email matches Woo order

Subject: `[WISMO-QA ${QA_RUN_ID} case-002] Package update?`

Body:

```text
Hey, I placed an order recently and want to know when it will arrive.
```

Expected:

- WISMO resolves the most recent WooCommerce order by sender email.
- No unnecessary request for order number is sent.
- Response references the correct most recent order.

### Case 3: missing order details, customer reply required

Subject: `[WISMO-QA ${QA_RUN_ID} case-003] Need delivery update`

Body:

```text
Can you check my delivery status? I do not have the order number handy.
```

Expected:

- If no Woo order matches the sender email, WISMO sends a follow-up requesting order information.
- Reply to the same thread with `It is order 56789`.
- Workflow receives the customer reply signal, resolves the order, and continues.

### Case 4: tracking not available yet

Subject: `[WISMO-QA ${QA_RUN_ID} case-004] Tracking for order #<no-tracking-order>`

Body:

```text
Can you send me tracking for order <no-tracking-order>?
```

Expected:

- Order is found.
- Workflow enters the wait-for-tracking action.
- The runbook records that the workflow is parked and will retry every two hours up to seven days.
- If testing a fast path, add tracking in staging WooCommerce, then wait for the next poll or use a test-specific acceleration only if the codebase has one.

### Case 5: problematic order status

Subject: `[WISMO-QA ${QA_RUN_ID} case-005] Where is cancelled order #<cancelled-order>?`

Body:

```text
I need an update on order <cancelled-order>. Why has it not arrived?
```

Expected:

- Order is fetched.
- For `cancelled`, `refunded`, or `failed`, WISMO notifies the customer and escalates for manual review.
- It does not pretend shipment tracking exists.

### Case 6: distressed customer escalation

Subject: `[WISMO-QA ${QA_RUN_ID} case-006] Urgent, I am still waiting again`

Body:

```text
This is urgent and unacceptable. I am angry because I am still waiting again for order 56789. Please fix this right now.
```

Expected:

- Distress detection triggers escalation.
- No fully automated casual response is sent before escalation unless the current implementation explicitly allows it.

### Case 7: wrong or nonexistent order number

Subject: `[WISMO-QA ${QA_RUN_ID} case-007] Where is order #999999999?`

Body:

```text
Please check order 999999999 and tell me when it will be delivered.
```

Expected:

- Workflow cannot fetch the WooCommerce order.
- The outcome is an order-not-found escalation or a customer clarification path, depending on the active implementation.
- Reply and logs do not reveal internals or unrelated customer data.

## Polling and evidence collection

Poll the API and database while waiting for the workflow:

```bash
curl -s -b "$DD_COOKIE" "$DD_API/approval-queue?limit=20"
curl -s -b "$DD_COOKIE" "$DD_API/approval-queue/stats"
curl -s -b "$DD_COOKIE" "$DD_API/approval-queue/workflows?limit=20"
```

When local DB access is available, search by QA subject:

```bash
psql "$DATABASE_URL" -c "select id, subject, from_email, thread_id, created_at from emails where subject like '%WISMO-QA%' order by created_at desc limit 20;"
psql "$DATABASE_URL" -c "select id, workflow_id, created_at, updated_at from email_threads order by updated_at desc limit 20;"
```

For each case, capture:

- Sent email subject/body and timestamp.
- WooCommerce order ID, status, billing email, tracking provider, and tracking number at send time.
- Workflow ID, current state, and final status.
- Approval queue items and decisions if moderation is enabled.
- Outbound reply body and timestamp.
- Pass/fail verdict with the exact mismatch if failed.

For the two-hour WISMO tracking waits, leave a named tmux poller running during an active QA task:

```bash
SESSION_NAME="wismo-qa-${QA_RUN_ID}"
tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_NAME" 2>/dev/null ||
  tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c "$PWD" -- "${SHELL:-bash}" -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_NAME:0.0" \
  'while true; do date; curl -s -b "$DD_COOKIE" "$DD_API/approval-queue/workflows?limit=20"; sleep 7200; done' C-m
```

This is useful for a single Cloud-agent QA run. It is not a replacement for durable daily scheduling.

## Approval queue handling

If WISMO moderation is enabled:

```bash
curl -s -b "$DD_COOKIE" "$DD_API/approval-queue?limit=20"
curl -i -b "$DD_COOKIE" -X POST "$DD_API/approval-queue/actions/<approval-action-id>/approve"
```

Use `edit-and-approve` only when the goal is to test edited copy; otherwise approving unchanged output gives cleaner evidence of the agent's behavior.

## Updating this skill

- Add every newly discovered WISMO scenario as a named case with setup, email text, and expected result.
- Add provider-specific sending or inbox polling steps only when they are safe to store in git and contain no secrets.
- If a test requires a timing shortcut, document the exact code/config flag that makes it safe.
- When a daily QA runner is implemented, replace the automation model with the exact command, required secrets, report location, and failure triage steps.
