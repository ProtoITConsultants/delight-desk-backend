# Subscription Agent — Video Explanation Script

**Purpose:** Record a clear, concise video explaining how the Subscription agent works.  
**Suggested length:** 5–6 minutes.  
**Tone:** Professional but approachable.

**Recorded video:** [Subscription Agent - Delight Desk](https://www.awesomescreenshot.com/video/50520696?key=0a8ba181d58e29679374fff9a5cefdfc)

**Diagram:** Use `docs/agents/subscription/workflow.mmd` — render at [mermaid.live](https://mermaid.live) and export as PNG/SVG for the video. The sequence diagram shows the flow from customer email to subscription modification.

---

## Segment 1: Intro (≈30 sec)

**[Screen: Title slide or product UI]**

> Hi, I'm [Name], and in this video I'll walk you through how our **Subscription agent** works.
>
> The Subscription agent handles subscription modification requests—pause, resume, cancel, or modify. It finds the subscription, validates it, executes the action in WooCommerce, and—for modify actions—syncs with Stripe billing. If something needs a human—like an expired payment method or discontinued product—it escalates.

---

## Segment 2: Routing and subscription discovery (≈1 min 15 sec)

**[Screen: Show sequence diagram — highlight Email Processing → Classification → Routing → Extract Subscription ID]**

> Everything starts with an **inbound customer email**—for example, "Please pause my subscription" or "I want to cancel my monthly plan."
>
> Our system **classifies** the email as "subscription_changes" with a confidence score. If confidence is at least 60% and the request isn't too complex, it routes to the Subscription agent. Otherwise it escalates to the AI Assistant.
>
> The agent **extracts the subscription ID** using AI pattern matching. If the customer doesn't provide an ID, the agent **looks up by customer email** in WooCommerce. If no active subscription is found, it escalates and notifies the customer.

---

## Segment 3: Validation and action determination (≈1 min)

**[Screen: Show sequence diagram — highlight Validate Subscription → Determine Action]**

> The agent **validates the subscription** in WooCommerce—checking that it's active and that the email matches the customer. If the subscription is invalid, it escalates.
>
> Next, the agent **determines the action**—pause, resume, cancel, or modify—based on the customer's request. It then **executes the action** in WooCommerce, updating the subscription accordingly.

---

## Segment 4: Stripe sync and safety checks (≈1 min)

**[Screen: Show sequence diagram — highlight Modify Action → Stripe, Safety Check Failure]**

> For **modify** actions—like changing the billing date or plan—the agent also **updates the billing schedule** in Stripe. That keeps WooCommerce and Stripe in sync.
>
> Before sending a confirmation, the agent runs **safety checks**—for example, payment method validity or product availability. If the payment method is expired, the product is discontinued, or another issue is detected, the agent **escalates** and notifies the customer about the problem (e.g. "Your card has expired—please update your payment method").

---

## Segment 5: Approval and delivery (≈45 sec)

**[Screen: Show sequence diagram — highlight Approval Queue → Response System → Customer]**

> When **automation approval** is required, the agent queues the action for review—including action details, customer context, and metadata. A team member can approve or reject. Once approved, the response system sends a **confirmation** to the customer—for example, "Your subscription has been paused" or "Your subscription has been cancelled."
>
> The agent **logs steps** and maintains an **audit trail**. On errors—API failure, system error—it escalates with priority and can notify the customer of a service issue.

---

## Segment 6: Wrap-up (≈30 sec)

**[Screen: Full sequence diagram or summary slide]**

> So in summary: the **Subscription agent** handles pause, resume, cancel, and modify requests. It finds and validates the subscription, executes the action in WooCommerce, syncs with Stripe for modify actions, and runs safety checks before confirming. Moderation lets you review before sending.
>
> The diagram is in the repo at `docs/agents/subscription/workflow.mmd`. Thanks for watching.

---

## Tips for recording

- **Show the sequence diagram:** Render at mermaid.live, export as PNG/SVG, and highlight each section as you narrate.
- **Optional:** Show a real (anonymized) subscription modification request and confirmation.
- **Pace:** Speak clearly; the WooCommerce + Stripe integration is a key differentiator.
