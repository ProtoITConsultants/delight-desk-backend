# Subscription Agent — Marketing & Portfolio Content

**For use by the marketing team in case studies, portfolio, and sales materials.**

---

## One-liner (elevator pitch)

The **Subscription agent** handles subscription modification requests—pause, resume, cancel, or modify—by finding and validating the subscription in WooCommerce, executing the action, syncing with Stripe for billing changes, and confirming to the customer with optional human approval.

---

## Short description (2–3 sentences)

The Subscription agent processes subscription change requests from customers. It extracts or looks up the subscription ID, validates it in WooCommerce, determines the action (pause/resume/cancel/modify), executes it, and—for modify actions—updates the billing schedule in Stripe. Safety checks (e.g. payment method, product availability) prevent invalid changes; when they fail, the agent escalates and notifies the customer. Moderation lets teams review actions before confirmation is sent.

---

## Key value propositions

| Benefit | Description |
|--------|-------------|
| **Four actions** | Pause, resume, cancel, and modify—all handled in one agent. |
| **Subscription discovery** | Extracts subscription ID from the email or looks up by customer email. |
| **WooCommerce + Stripe** | Executes in WooCommerce; syncs billing changes with Stripe for modify actions. |
| **Safety checks** | Validates payment method, product availability, and subscription status before confirming. |
| **Audit trail** | Logs steps and maintains an audit trail for compliance. |
| **Optional moderation** | Queue actions for review before sending confirmation. |
| **Escalation by design** | Invalid subscription, expired card, discontinued product, or errors trigger escalation. |

---

## How it works (customer-facing summary)

1. **Customer sends an email** requesting a subscription change (pause, resume, cancel, or modify).
2. **AI classifies** the email as subscription_changes (confidence ≥ 60%) and routes to the Subscription agent.
3. **The agent finds** the subscription—by ID or by customer email lookup.
4. **The agent validates** the subscription in WooCommerce (active, email match).
5. **The agent executes** the action in WooCommerce and, for modify, updates Stripe.
6. **Safety checks** run before confirmation; if they fail, the agent escalates and notifies the customer.
7. **If moderation is on**, the action is queued for approval before the confirmation is sent.

---

## Features list (for website / datasheet)

- **AI subscription extraction** — Pattern matching to extract subscription ID from the email.
- **Email lookup** — Lookup by customer email when ID is not provided.
- **WooCommerce integration** — Validate and update subscription in WooCommerce.
- **Stripe integration** — Update billing schedule for modify actions.
- **Action types** — Pause, resume, cancel, modify.
- **Safety checks** — Payment method validity, product availability, subscription status.
- **Optional approval queue** — Review action details before sending confirmation.
- **Audit trail** — Log steps for compliance and debugging.
- **Customer notification** — Notify when no subscription found or when an issue is detected.

---

## Use cases

- **Subscription businesses** — Automate pause, resume, cancel, and modify requests.
- **WooCommerce + Stripe** — Keep subscription and billing in sync when customers modify plans.
- **Teams that want control** — Use moderation to review high-impact actions before confirming.

---

## Suggested tagline options

- **Subscription changes—pause, resume, cancel, modify—automated.**
- **WooCommerce + Stripe: subscription modifications handled end-to-end.**
- **Let AI handle subscription changes—with safety checks and your approval.**

---

*Document generated for Delight Desk Subscription Agent. Update as product and positioning evolve.*
