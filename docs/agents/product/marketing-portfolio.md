# Product Agent — Marketing & Portfolio Content

**For use by the marketing team in case studies, portfolio, and sales materials.**

---

## One-liner (elevator pitch)

The **Product agent** answers product-related questions automatically using a RAG-powered knowledge base—delivering accurate, source-attributed responses grounded in your training URLs and manual content, with optional human approval before sending.

---

## Short description (2–3 sentences)

The Product agent handles product inquiries—features, specs, compatibility, usage—by searching a user-isolated knowledge base with vector similarity (OpenAI embeddings, 0.70 threshold). It generates grounded, source-attributed responses to reduce hallucination. When moderation is on, proposed answers go to an approval queue; low confidence or missing data triggers escalation to the AI Assistant.

---

## Key value propositions

| Benefit | Description |
|--------|-------------|
| **RAG-powered accuracy** | Answers are grounded in your knowledge base—training URLs and manual content—not generic web data. |
| **Source attribution** | Responses cite sources so customers and agents know where the information came from. |
| **Hallucination prevention** | Confidence-based generation and similarity thresholds reduce incorrect or fabricated answers. |
| **User isolation** | Each customer's knowledge base is isolated; no cross-tenant data leakage. |
| **Optional moderation** | Queue responses for review before sending when you want human oversight. |
| **Escalation by design** | Low confidence, no relevant data, or errors trigger escalation to the AI Assistant. |

---

## How it works (customer-facing summary)

1. **Customer sends an email** with a product question (e.g. "What's the warranty?" or "Does this work with Android?").
2. **AI classifies** the email as a product inquiry (confidence ≥ 60%) and routes it to the Product agent.
3. **The agent searches** the knowledge base using vector similarity and retrieves relevant chunks.
4. **The agent generates** a grounded, source-attributed response.
5. **If moderation is on**, the response is queued for approval; otherwise it's sent.
6. **The customer receives** accurate product information. If the agent can't find enough data, the case is escalated.

---

## Features list (for website / datasheet)

- **Vector similarity search** — OpenAI embeddings with configurable threshold (default 0.70).
- **User-isolated knowledge base** — Training URLs and manual content per customer.
- **Source-attributed responses** — Answers cite where the information came from.
- **Confidence-based generation** — Reduces hallucination by tying output to retrieved chunks.
- **Optional approval queue** — Review and edit proposed responses before sending.
- **Escalation paths** — Low confidence, no data, or errors escalate to the AI Assistant.
- **Logging and audit** — Steps logged for isolation and hallucination prevention.

---

## Use cases

- **Product support** — Answer FAQs about features, specs, compatibility, and usage without manual lookup.
- **E‑commerce and SaaS** — Scale product inquiry handling with accurate, branded answers.
- **Teams that want AI with guardrails** — Use RAG for grounding and moderation for oversight.

---

## Suggested tagline options

- **Product questions, answered from your knowledge base.**
- **RAG-powered product support—accurate, attributed, and under your control.**
- **Let AI answer product questions—grounded in your content, reviewed when you want.**

---

*Document generated for Delight Desk Product Agent. Update as product and positioning evolve.*
