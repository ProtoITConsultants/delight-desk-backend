# WISMO Agent — Marketing & Portfolio Content

**For use by the marketing team in case studies, portfolio, and sales materials.**

---

## One-liner (elevator pitch)

**WISMO** (Where Is My Order) is an AI-powered customer support agent that automatically handles “where is my order?” inquiries from inbox to delivery—from identifying the order and sending acknowledgements to tracking shipments and notifying customers at every step, with optional human-in-the-loop moderation.

---

## Short description (2–3 sentences)

WISMO automates end-to-end “Where Is My Order?” support for e‑commerce. When a customer emails asking about their order, the agent classifies the intent, finds or requests the order number, fetches order and tracking data from WooCommerce and AfterShip, and keeps the customer updated via the same email thread—including acknowledgements, in-transit updates, and a final delivery confirmation. Teams can turn on moderation to review or edit AI-generated replies before they’re sent.

---

## Key value propositions

| Benefit | Description |
|--------|-------------|
| **Fully automated WISMO handling** | From first email to “delivered” notification without manual triage or copy-paste. |
| **One conversation, one thread** | All replies go in the same email thread so customers see a single, coherent conversation. |
| **Smart order discovery** | If the order number isn’t in the email, the agent asks the customer once and waits for their reply (with configurable timeout). |
| **Real-time tracking updates** | Integrates with AfterShip to poll status and send proactive updates (e.g. “Shipped,” “Out for delivery,” “Delivered”) by email. |
| **Human-in-the-loop when you want it** | Optional moderation lets staff approve or edit AI-generated messages before they’re sent. |
| **Escalation by design** | Low confidence, distressed customers, missing orders, problematic order status (e.g. cancelled/refunded), or shipping exceptions automatically escalate to humans. |
| **Built for reliability** | Workflow runs on Temporal; long waits (e.g. for tracking or customer reply) don’t block the system and survive restarts. |

---

## How it works (customer-facing summary)

1. **Customer sends an email** asking where their order is (e.g. “Where’s my order #12345?” or “I haven’t received my package yet”).
2. **AI classifies** the email as a WISMO request and routes it to the WISMO agent.
3. **The agent finds the order**—either from the message (e.g. order number or email) or by sending a single follow-up to ask for the order number.
4. **The agent fetches order and tracking** from your store (WooCommerce) and, when available, from the carrier via AfterShip.
5. **The customer gets updates in the same thread**: an acknowledgement, then status updates (e.g. “Shipped,” “Out for delivery”), and finally a “Your order has been delivered” message.
6. **If something needs a human**—e.g. order not found, cancelled order, or shipping exception—the conversation is escalated and the customer can be notified that the team is looking into it.

---

## Features list (for website / datasheet)

- **Automatic classification** — Incoming emails are classified so WISMO handles only “where is my order?”-type requests.
- **Order resolution** — Extracts order number from the email or looks up the most recent order by customer email; if needed, sends one follow-up and waits for the customer’s reply (e.g. up to 2 days).
- **WooCommerce integration** — Fetches order details and tracking info from your WooCommerce store.
- **AfterShip integration** — Creates and monitors tracking; sends status updates (e.g. every 2 hours until delivered).
- **Thread-based email replies** — All agent replies are sent in the same Gmail thread for a single, continuous conversation.
- **Optional moderation** — Review or edit AI-generated messages (acknowledgement, status updates, delivery confirmation) before sending.
- **Distress detection** — Urgent or frustrated language can trigger immediate escalation to a human.
- **Configurable timeouts** — Control how long to wait for tracking (e.g. up to 7 days) and for customer reply (e.g. 2 days).
- **End-to-end visibility** — Workflow state and approval queues give teams full visibility and control.

---

## Use cases

- **E‑commerce support** — Handle high volume of “where is my order?” emails without scaling support headcount proportionally.
- **D2C and SMB brands** — Offer proactive, tracking-based updates without building custom integrations.
- **Teams that want AI with guardrails** — Use automation for routine WISMO while keeping humans in the loop for sensitive or complex cases.

---

## Technical highlights (for technical audience / case study)

- **Temporal workflows** — Durable, long-running workflow (days/weeks) with signals and queries (e.g. human approval, customer reply).
- **Four-phase design** — Preparation → Order discovery → Order processing → Tracking; each phase can fail or escalate independently.
- **Signals** — `humanResponseSignal` for approvals/edits; `customerReplySignal` for real-time customer replies (webhook-driven).
- **Integrations** — Gmail (send/reply in thread), WooCommerce (orders + tracking metadata), AfterShip (tracking creation and status polling).
- **Escalation types** — Low confidence, customer distress, order not found, problematic order status, tracking retry exceeded, AfterShip exceptions, manual escalation.

---

## Suggested tagline options

- **“Where is my order?” — answered automatically.**
- **From inbox to delivery: WISMO handles it.**
- **WISMO: One agent, one thread, end-to-end order visibility.**
- **Let AI handle “where’s my order?” so your team can focus on what matters.**

---

## FAQ (for marketing / support)

**What does WISMO stand for?**  
Where Is My Order. It’s the industry term for “where’s my order?”-type customer inquiries.

**Does the customer notice they’re talking to an AI?**  
Replies are written in your brand voice (AI identity). You can disclose that you use AI assistance in your support policy if desired.

**What if the customer doesn’t give an order number?**  
The agent sends one follow-up email asking for it (or their email address to look up the last order) and waits for a reply (e.g. up to 2 days). If there’s no reply or the order still can’t be found, the case is escalated.

**Can we edit the AI’s messages?**  
Yes. With moderation enabled, proposed messages (e.g. acknowledgement, delivery confirmation) are shown in an approval queue where staff can approve, reject, or edit before sending.

**What happens if the order is cancelled or refunded?**  
The agent detects problematic statuses (e.g. cancelled, refunded, failed), sends a short explanation to the customer, and escalates the case for human follow-up.

**How long does the workflow run?**  
It can run for days or weeks: e.g. wait up to 7 days for a tracking number, then poll status until delivery. The workflow engine (Temporal) is built for long-running, reliable execution.

---

*Document generated for Delight Desk WISMO Agent. Update as product and positioning evolve.*
