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

### Codex Cloud secret injection (recommended)

For browser-based Codex Cloud runs, provide sensitive values through project/environment secrets instead of chat text or committed files:

1. Open the Codex project settings for this repo.
2. Add each secret as an environment variable (for example `DD_STAGING_PASSWORD`, `WOO_CONSUMER_SECRET`, `WISMO_CUSTOMER_GMAIL_APP_PASSWORD`, `TEMPORAL_API_KEY`).
3. Re-run the agent so the variables are injected into the runtime.
4. Verify with `env | rg "^(DD_|WOO_|WISMO_|TEMPORAL_)"` and confirm values are present (do not print full secret values in logs).

Never paste raw secrets into PRs, markdown skill files, or chat transcripts.

- Delight Desk staging account with WISMO enabled and a connected support inbox.
- Staging WooCommerce REST credentials with permission to read and update orders/customers.
- QA customer Gmail mailbox access via app password for SMTP and IMAP. This mailbox simulates the other side of the conversation and must be different from the connected Delight Desk support inbox.
- QA sender/customer mailbox should preferably support plus-address aliases such as `wismo-qa+case-001@example.test`.
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
export WISMO_SUPPORT_INBOX_EMAIL="support-inbox@example.test"

export WOO_STORE_URL="https://staging-store.example.test"
export WOO_CONSUMER_KEY="ck_replace_me"
export WOO_CONSUMER_SECRET="cs_replace_me"

export WISMO_CUSTOMER_GMAIL_EMAIL="wismo-customer@example.test"
export WISMO_CUSTOMER_GMAIL_APP_PASSWORD="gmail-app-password"
export WISMO_REPLY_TIMEOUT_SECONDS="900"

export QA_RUN_ID="wismo-qa-$(date +%Y%m%d-%H%M%S)"
```

`WISMO_SUPPORT_INBOX_EMAIL` is the Gmail or Outlook account already connected inside Delight Desk. `WISMO_CUSTOMER_GMAIL_EMAIL` is the separate Gmail account used to act as the customer. Never use the same mailbox for both sides of the simulation.

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

Use the QA customer Gmail account through SMTP so Cloud agents can send customer-like messages without needing browser access. Keep actual app passwords in Cursor Cloud secrets or local environment variables only; never commit them.

Every test email must include:

- From: `WISMO_CUSTOMER_GMAIL_EMAIL`, or a plus alias of that mailbox matching the staging Woo order when the scenario requires email lookup.
- To: `WISMO_SUPPORT_INBOX_EMAIL`, the inbox connected to Delight Desk.
- Subject: `[WISMO-QA <run-id> <case-id>] <plain customer subject>`.
- Body: realistic customer language, one scenario per email.

Send an initial customer email:

```bash
export CASE_ID="case-001"
export SUBJECT="[WISMO-QA ${QA_RUN_ID} ${CASE_ID}] Where is my order #56789?"
export BODY="Hi, can you tell me where order 56789 is and when it will be delivered?

Thanks."

python3 - <<'PY'
import os, smtplib
from email.message import EmailMessage

msg = EmailMessage()
msg["From"] = os.environ["WISMO_CUSTOMER_GMAIL_EMAIL"]
msg["To"] = os.environ["WISMO_SUPPORT_INBOX_EMAIL"]
msg["Subject"] = os.environ["SUBJECT"]
msg.set_content(os.environ["BODY"])

with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
    smtp.starttls()
    smtp.login(
        os.environ["WISMO_CUSTOMER_GMAIL_EMAIL"],
        os.environ["WISMO_CUSTOMER_GMAIL_APP_PASSWORD"],
    )
    smtp.send_message(msg)
PY
```

Poll the QA customer Gmail inbox through IMAP to verify Delight Desk sent the reply to the other side of the conversation:

```bash
python3 - <<'PY'
import email, imaplib, os, sys, time

subject_token = os.environ["QA_RUN_ID"]
deadline = time.time() + int(os.environ.get("WISMO_REPLY_TIMEOUT_SECONDS", "900"))

while time.time() < deadline:
    with imaplib.IMAP4_SSL("imap.gmail.com", 993) as imap:
        imap.login(
            os.environ["WISMO_CUSTOMER_GMAIL_EMAIL"],
            os.environ["WISMO_CUSTOMER_GMAIL_APP_PASSWORD"],
        )
        imap.select("INBOX")
        _, data = imap.search(None, "SUBJECT", f'"{subject_token}"')
        ids = data[0].split()
        if ids:
            latest_id = ids[-1]
            _, msg_data = imap.fetch(latest_id, "(RFC822)")
            msg = email.message_from_bytes(msg_data[0][1])
            print("found_id=" + latest_id.decode())
            print("message_id=" + (msg.get("Message-ID") or ""))
            print("from=" + (msg.get("From") or ""))
            print("subject=" + (msg.get("Subject") or ""))
            sys.exit(0)
    time.sleep(30)

raise SystemExit("Timed out waiting for Delight Desk reply in QA customer inbox")
PY
```

For follow-up scenarios, reply from the QA customer mailbox to the Delight Desk response in the same thread. First capture the `message_id` from the IMAP poll above, then send the customer clarification with `In-Reply-To` and `References` headers:

```bash
export DD_REPLY_MESSAGE_ID="<message-id-from-imap-poll>"
export FOLLOWUP_BODY="It is order 56789."

python3 - <<'PY'
import os, smtplib
from email.message import EmailMessage

msg = EmailMessage()
msg["From"] = os.environ["WISMO_CUSTOMER_GMAIL_EMAIL"]
msg["To"] = os.environ["WISMO_SUPPORT_INBOX_EMAIL"]
msg["Subject"] = "Re: " + os.environ["SUBJECT"]
msg["In-Reply-To"] = os.environ["DD_REPLY_MESSAGE_ID"]
msg["References"] = os.environ["DD_REPLY_MESSAGE_ID"]
msg.set_content(os.environ["FOLLOWUP_BODY"])

with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
    smtp.starttls()
    smtp.login(
        os.environ["WISMO_CUSTOMER_GMAIL_EMAIL"],
        os.environ["WISMO_CUSTOMER_GMAIL_APP_PASSWORD"],
    )
    smtp.send_message(msg)
PY
```

If Gmail does not thread the follow-up, retry with the exact original subject from the Delight Desk reply and confirm the IMAP `Message-ID` belongs to the support inbox reply, not the customer's own sent message.

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
- Poll `WISMO_CUSTOMER_GMAIL_EMAIL` until the follow-up request arrives, then reply to the same thread with `It is order 56789`.
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
- QA customer inbox IMAP evidence for outbound replies, including `Message-ID` when the scenario requires a same-thread follow-up.
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

### Continuous in-cycle skill maintenance (required pattern)

During an active QA run, update this skill in parallel with testing whenever reality differs from the documented runbook.

Trigger an update in the same cycle when any of these happen:

- A new scenario appears (new WISMO behavior, provider edge case, or escalation path).
- A documented step is incomplete, wrong, or out of date.
- A polling cadence, timeout, or approval flow needs adjustment.
- A restore/rollback step is missing for a mutation performed in staging.

Minimum update workflow per discovery:

1. Capture evidence in the run log (what happened, timestamp, identifiers, expected vs actual).
2. Patch this skill immediately with the corrected or new runbook step/case.
3. Commit and open a PR for the skill change in the same QA cycle.
4. Continue remaining test cases with the updated skill as the source of truth.

This establishes a recursive QA loop: run tests -> detect drift -> update skill -> continue tests -> repeat.


## Recursive execution model for long-running workflows

Use this loop for non-instant workflows (for example two-hour tracking waits):

1. Start a QA run and assign a fixed `QA_RUN_ID`.
2. Persist case state in a run log file (`/tmp/wismo-qa-<run-id>.jsonl`) after every poll.
3. Poll in intervals (30s for immediate replies, 5m for approval/workflow transitions, 2h for tracking wait cases).
4. On each poll, classify each case as `pending`, `needs-human-action`, `passed`, or `failed`.
5. Continue recursively until all cases are terminal or SLA timeout is reached.

Reference polling skeleton:

```bash
cat > /tmp/wismo-qa-poller.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
: "${DD_API:?}" "${DD_COOKIE:?}" "${QA_RUN_ID:?}"
OUT="/tmp/wismo-qa-${QA_RUN_ID}.jsonl"
while true; do
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  wf_json="$(curl -s -b "$DD_COOKIE" "$DD_API/approval-queue/workflows?limit=50")"
  approvals_json="$(curl -s -b "$DD_COOKIE" "$DD_API/approval-queue?limit=50")"
  printf '{"ts":"%s","workflow":%s,"approvals":%s}
' "$ts" "$wf_json" "$approvals_json" >> "$OUT"
  sleep 300
  # Stop externally when all tracked cases are terminal.
done
SH
chmod +x /tmp/wismo-qa-poller.sh
nohup /tmp/wismo-qa-poller.sh >/tmp/wismo-qa-poller.log 2>&1 &
```

For waits longer than one session, relaunch polling with the same `QA_RUN_ID` and continue appending evidence to the same log.
