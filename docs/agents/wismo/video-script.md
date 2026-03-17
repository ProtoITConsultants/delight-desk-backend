# WISMO Agent — Video Explanation Script

**Purpose:** Record a clear, concise video explaining how the WISMO agent works.  
**Suggested length:** 5–6 minutes.  
**Tone:** Professional but approachable.

**Recorded video:** [WISMO Agent - Delight Desk](https://www.awesomescreenshot.com/video/50519916?key=38dad097fafdc3f48a96f86022de1911)

**Diagram:** Use `docs/agents/wismo/workflow-sequence.mmd` — a sequence diagram showing the flow between components. Render at [mermaid.live](https://mermaid.live) and export as PNG/SVG. The script below follows the diagram step by step.

---

## Segment 1: Intro (≈30 sec)

**[Screen: Title slide or product UI]**

> Hi, I'm [Name], and in this video I'll walk you through how our **WISMO agent** works—that's "Where Is My Order."
>
> WISMO handles "where is my order?" emails from start to finish: it finds the order, fetches tracking data, and delivers a response to the customer. I'll walk through the sequence diagram so you can see how each component—Email Processing, AI Classification, the Router, the WISMO Agent, WooCommerce, AfterShip, and the Response System—work together.

---

## Segment 2: Email reception and classification (≈1 min)

**[Screen: Show sequence diagram — highlight Customer → Email Processing → AI Classifier → Smart Router]**

> Everything starts when the **customer sends a support email**—for example, "Where's my order?" or "I haven't received my package yet."
>
> **Email Processing** receives the email via Gmail or Outlook—with a 15-minute polling backup—and **deduplicates** by message and thread ID so we don't process the same email twice. It then sends the email to the **AI Classifier**.
>
> The classifier runs **GPT-4o** to determine the category—in this case, "wismo"—plus a confidence score and priority. It also runs **Amazon Comprehend** for sentiment analysis and **retrieves the full thread history** for context. The classified email is then sent to the **Smart Router**.

---

## Segment 3: Intelligent routing (≈45 sec)

**[Screen: Show sequence diagram — highlight Smart Router → WooCommerce lookup → Route to WISMO Agent / Escalate]**

> The **Smart Router** first does a **lookup in WooCommerce** for customer and order data. That gives the router context before deciding where to send the email.
>
> If the **confidence is at least 60%** and the **category is WISMO**, the router sends the email to the **WISMO Agent**. You can see that on the diagram—the "Route to WISMO Agent" path.
>
> If confidence is lower or escalation is needed—for example, the customer seems distressed or the request is ambiguous—the router **escalates to the AI Assistant** instead. A human can then take over.

---

## Segment 4: WISMO agent processing — order discovery (≈1 min 15 sec)

**[Screen: Show sequence diagram — highlight WISMO Agent: Extract Order Number → WooCommerce search / AfterShip fetch]**

> The **WISMO Agent** does AI processing—retrieving relevant data, generating a response, and applying response moderation. It first **extracts the order number** from the email using GPT-4o.
>
> If the **order number is found**, the agent goes straight to **AfterShip** to fetch tracking data. You can see that path on the diagram.
>
> If the **order number is not found**, the agent doesn't escalate immediately. It **searches WooCommerce for the customer's most recent order by email**. If an order is found, it fetches tracking from AfterShip. If no order is found, it **escalates to the AI Assistant** so a human can help.

---

## Segment 5: Tracking data processing and response (≈1 min)

**[Screen: Show sequence diagram — highlight Generate Smart Response → Auto-Send / Approval Queue → Response System → Customer]**

> Once the agent has tracking data, it **generates a smart response** based on the tracking status—for example, "Your order has shipped" or "Out for delivery."
>
> If **auto-send is enabled**, the agent sends the response immediately to the **Response System**. If the message **needs review**, the agent queues it in the **Approval Queue**. A team member can approve, edit, or reject. Once approved, the Approval Queue passes it to the Response System.
>
> If **tracking data is unavailable** or there's an error—for example, the carrier hasn't updated yet—the agent **escalates to the AI Assistant** instead of sending an incomplete response.

---

## Segment 6: Response delivery and error handling (≈45 sec)

**[Screen: Show sequence diagram — highlight Response System → Customer, Error Handling note]**

> The **Response System** validates the message and sends it via Gmail or Outlook—with SendGrid as a backup. It delivers the response to the **customer** and **tracks delivery** and updates the thread history.
>
> Throughout the flow, we **log metrics, steps, and save to the database**. If there are errors—config issues, API failure, timeout, or outage—we **escalate with priority** to the AI Assistant so the team can intervene.

---

## Segment 7: Wrap-up (≈30 sec)

**[Screen: Full sequence diagram]**

> So in summary: the **WISMO agent** takes a support email, gets it classified and routed, extracts or finds the order, fetches tracking from AfterShip, generates a response, and—when moderation is on—queues it for approval before sending. Low confidence, order not found, or tracking issues trigger escalation to the AI Assistant.
>
> The sequence diagram is in the repo at `docs/agents/wismo/workflow-sequence.mmd`. Thanks for watching.

---

## Tips for recording

- **Show the sequence diagram:** Render at mermaid.live, export as PNG/SVG, and highlight each section as you narrate—Customer → Email Processing → AI Classifier → Router → WISMO Agent → WooCommerce/AfterShip → Approval Queue → Response System → Customer.
- **Follow the arrows:** The diagram shows the flow between components; point to each participant as you describe its role.
- **Optional:** Show a real (anonymized) email thread to make the flow concrete.
- **Pace:** Speak clearly; pause after each major step so viewers can follow the diagram.
