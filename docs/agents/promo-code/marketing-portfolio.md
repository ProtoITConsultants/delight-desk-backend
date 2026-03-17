# Promo Code Agent — Marketing & Portfolio Content

**For use by the marketing team in case studies, portfolio, and sales materials.**

---

## One-liner (elevator pitch)

The **Promo Code agent** handles discount requests and promo code issues automatically—evaluating eligibility from order history and active promo configs, providing codes or declining with alternatives, with optional human approval before sending.

---

## Short description (2–3 sentences)

The Promo Code agent supports two flows: **discount inquiries** (customers asking for a promo code) and **promo refunds** (issues with a specific code). It classifies customers as first-time, returning, or VIP, looks up active promo configs, and evaluates eligibility using first-time, general, and loyalty rules. It either provides a code, sends a decline with alternatives, requests clarification, or escalates when needed. Moderation lets teams review proposed responses before sending.

---

## Key value propositions

| Benefit | Description |
|--------|-------------|
| **Dual-path handling** | Handles both discount requests and promo code troubleshooting in one agent. |
| **Eligibility-based** | Uses order history and customer classification (first-time/returning/VIP) to apply rules. |
| **Active promo lookup** | Only offers promos that are active and eligible for automation. |
| **Decline with alternatives** | When ineligible, suggests alternatives instead of leaving the customer without options. |
| **Code troubleshooting** | For promo refunds, looks up the code and troubleshoots; escalates if not found. |
| **Optional moderation** | Queue proposed codes or declines for review before sending. |
| **Escalation by design** | Vague requests, unknown issues, code not found, or abuse trigger escalation. |

---

## How it works (customer-facing summary)

1. **Customer sends an email** asking for a discount or reporting a promo code issue.
2. **AI classifies** the email as discount_inquiries or promo_refund (confidence ≥ 60%) and routes to the Promo Code agent.
3. **The agent retrieves** order history and classifies the customer (first-time/returning/VIP).
4. **For discount requests:** Evaluates eligibility; if eligible, selects a code; if not, declines with alternatives.
5. **For promo refunds:** Extracts the code, looks it up, troubleshoots—or sends clarification or escalates.
6. **If moderation is on**, the response is queued for approval before sending.

---

## Features list (for website / datasheet)

- **Dual classification** — Handles discount_inquiries and promo_refund categories.
- **Customer classification** — First-time, returning, VIP based on order history.
- **Active promo configs** — Looks up promos with isActive and eligibleForAutomation.
- **Eligibility rules** — First-time, general, and loyalty rules for discount requests.
- **Code troubleshooting** — AI code extraction and lookup for promo refund issues.
- **Decline with alternatives** — Suggests alternatives when customer is ineligible.
- **Clarification flow** — Asks for more details when the request is vague.
- **Optional approval queue** — Review proposed codes or declines before sending.
- **Abuse detection** — Escalates when abuse is detected.

---

## Use cases

- **E‑commerce support** — Automate "do you have a discount code?" and "my code isn't working" inquiries.
- **Loyalty and retention** — Apply first-time, returning, and VIP rules consistently.
- **Teams that want control** — Use moderation to review codes before they're sent.

---

## Suggested tagline options

- **Discount requests and promo issues—handled automatically.**
- **The right code for the right customer—eligibility-based, under your control.**
- **Promo codes, delivered or declined—with alternatives when ineligible.**

---

*Document generated for Delight Desk Promo Code Agent. Update as product and positioning evolve.*
