# Product Agent — Video Explanation Script

**Purpose:** Record a clear, concise video explaining how the Product agent works.  
**Suggested length:** 4–5 minutes.  
**Tone:** Professional but approachable.

**Recorded video:** [Product Agent - Delight Desk](https://www.awesomescreenshot.com/video/50521569?key=1a654e05b932b2569540b6138ae4f6b4)

**Diagram:** Use `docs/agents/product/workflow.mmd` — render at [mermaid.live](https://mermaid.live) and export as PNG/SVG for the video. The sequence diagram shows the flow from customer email to response.

---

## Segment 1: Intro (≈30 sec)

**[Screen: Title slide or product UI]**

> Hi, I'm [Name], and in this video I'll walk you through how our **Product agent** works.
>
> The Product agent handles product-related inquiries—questions about features, specifications, compatibility, or how to use a product. It uses a **knowledge base** powered by RAG—Retrieval Augmented Generation—to give accurate, source-attributed answers. If it doesn't have enough information or confidence is low, it escalates to a human.

---

## Segment 2: How a product inquiry gets routed (≈45 sec)

**[Screen: Show sequence diagram — highlight Email Processing → Classification → Routing]**

> Everything starts with an **inbound customer email**—for example, "What's the warranty on this product?" or "Does this work with iOS?"
>
> Our system **receives** the email via Gmail push notification, **extracts and normalizes** the content, and sends it to the **AI classifier**. The classifier uses GPT-4o to determine the category—in this case, "product"—and a confidence score. It also runs Amazon Comprehend for sentiment analysis.
>
> If the category is "product" and confidence is **at least 60%**, the **router** sends the email to the Product agent. If confidence is lower or escalation is needed, it goes to the AI Assistant instead.

---

## Segment 3: Knowledge base and response generation (≈1 min 30 sec)

**[Screen: Show sequence diagram — highlight Product Agent → Knowledge Base → Generate Response]**

> The Product agent performs a **vector similarity search** on the knowledge base. We use OpenAI embeddings with a similarity threshold of 0.70. The knowledge base is **user-isolated**—it pulls from your training URLs and manual content, so each customer only sees answers grounded in their own data.
>
> If **no relevant data** is found or similarity is too low, the agent escalates to the AI Assistant. We can optionally send a short "we don't have enough info" message, but we generally prefer to escalate so a human can help.
>
> If **relevant chunks** are found, the agent builds context from them and **generates a response** that's grounded, source-attributed, and confidence-based. This helps prevent hallucination—the answer is tied to real content from your knowledge base.

---

## Segment 4: Approval and delivery (≈45 sec)

**[Screen: Show sequence diagram — highlight Approval Queue → Response System → Customer]**

> If **automation approval** is required, the planned response—along with confidence score and metadata—goes to the **approval queue**. A team member can review, edit, or approve. Once approved, the response system sends the reply to the customer.
>
> Throughout the process we **log steps** and ensure isolation and hallucination prevention. If there are errors—no data, low confidence—the agent escalates with priority.

---

## Segment 5: Wrap-up (≈30 sec)

**[Screen: Full sequence diagram or summary slide]**

> So in summary: the **Product agent** takes product inquiries, searches your knowledge base with RAG, generates grounded and source-attributed responses, and—when moderation is on—queues them for approval before sending. Low confidence or missing data triggers escalation.
>
> The diagram is in the repo at `docs/agents/product/workflow.mmd`. Thanks for watching.

---

## Tips for recording

- **Show the sequence diagram:** Render at mermaid.live, export as PNG/SVG, and highlight each section as you narrate.
- **Optional:** Show a real (anonymized) product inquiry and response to make the flow concrete.
- **Pace:** Speak clearly; pause after each major step.
