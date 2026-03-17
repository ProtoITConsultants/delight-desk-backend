# Promo Code Agent — Video Explanation Script

**Purpose:** Record a clear, concise video explaining how the Promo Code agent works.  
**Suggested length:** 5–6 minutes.  
**Tone:** Professional but approachable.

**Recorded video:** [Promo Code Agent - Delight Desk](https://www.awesomescreenshot.com/video/50521139?key=9f5fecd30ec3728da64d66abb6b1803a)

**Diagram:** Use `docs/agents/promo-code/workflow.mmd` — render at [mermaid.live](https://mermaid.live) and export as PNG/SVG for the video. The sequence diagram shows the flow from customer email to promo code or decline.

---

## Segment 1: Intro (≈30 sec)

**[Screen: Title slide or product UI]**

> Hi, I'm [Name], and in this video I'll walk you through how our **Promo Code agent** works.
>
> The Promo Code agent handles two types of inquiries: **discount requests**—customers asking for a promo code—and **promo refunds**—when a customer has an issue with a specific code. It evaluates eligibility, looks up active promos, and either provides a code, declines with alternatives, or escalates when needed.

---

## Segment 2: Routing and customer context (≈1 min)

**[Screen: Show sequence diagram — highlight Email Processing → Classification → Routing → WooCommerce]**

> Everything starts with an **inbound customer email**—for example, "Do you have any discount codes?" or "My promo code isn't working."
>
> Our system **classifies** the email—either "discount_inquiries" or "promo_refund"—with a confidence score. If confidence is at least 60%, it routes to the Promo Code agent. Otherwise it escalates to the AI Assistant.
>
> The agent **retrieves the customer's order history** from WooCommerce and **classifies the customer**—first-time, returning, or VIP. It also **looks up active promo configs**—promos that are active and eligible for automation. This context drives the eligibility rules.

---

## Segment 3: Discount inquiries path (≈1 min 30 sec)

**[Screen: Show sequence diagram — highlight PromoCodeService branch]**

> For **discount inquiries**, the agent evaluates eligibility using first-time, general, and loyalty rules.
>
> If the customer is **eligible**, the agent selects an appropriate promo code—first-time, general, or loyalty—based on the rules.
>
> If the customer is **not eligible**, the agent sends a **decline email** with suggested alternatives—for example, "We don't have a code right now, but here's how to get notified of future sales."
>
> The proposed response—whether a code or a decline—goes to the approval queue when moderation is on.

---

## Segment 4: Promo refund path (≈1 min 30 sec)

**[Screen: Show sequence diagram — highlight EnhancedPromoRefundService branch]**

> For **promo refund** inquiries, the agent uses AI to extract the code and classify the request.
>
> If it's an **explicit discount request**, the agent provides an available promo code.
>
> If it's a **specific code problem**—"My code XYZ isn't working"—the agent looks up the code and troubleshoots. If the code isn't found, it escalates to the AI Assistant.
>
> If the request is **vague**, the agent sends a **clarification email** asking for more details.
>
> If the request is **unknown**, it escalates to the AI Assistant.

---

## Segment 5: Approval and delivery (≈45 sec)

**[Screen: Show sequence diagram — highlight Approval Queue → Response System → Customer]**

> When **automation approval** is required, the agent queues the response for review—including customer context, eligibility, and the proposed code. A team member can approve, edit, or reject. Once approved, the response goes to the customer.
>
> The agent sends one of: a **promo code**, a **decline** with alternatives, or a **clarification** request. On errors—config issues, no data, or abuse detected—the agent escalates with priority and can notify the customer of a service issue.

---

## Segment 6: Wrap-up (≈30 sec)

**[Screen: Full sequence diagram or summary slide]**

> So in summary: the **Promo Code agent** handles discount requests and promo refund issues, evaluates eligibility using order history and active promo configs, and either provides a code, declines with alternatives, or escalates. Moderation lets you review before sending.
>
> The diagram is in the repo at `docs/agents/promo-code/workflow.mmd`. Thanks for watching.

---

## Tips for recording

- **Show the sequence diagram:** Render at mermaid.live, export as PNG/SVG, and highlight each branch as you narrate.
- **Optional:** Show a real (anonymized) discount request and response.
- **Pace:** Speak clearly; the two paths (discount vs promo refund) are the key differentiator.
