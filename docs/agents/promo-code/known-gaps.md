# Promo Code Agent — Known Gaps & Future Hardening

Tracks anti-abuse and correctness gaps that are NOT yet implemented but should be tackled
in subsequent iterations. The six critical guards are enforced in
`pcCheckRefundEligibility` (see `promo-code.activities.ts`):

1. ✅ **Order status whitelist** — only `completed`, `processing`, `on-hold` are eligible.
2. ✅ **Idempotency** — refused if the order already has any "Promo code refund …" entry.
3. ✅ **No coupon stacking** — refused if order has any `coupon_lines` from checkout.
4. ✅ **Subscription eligibility** — refused if order is a WC Subscriptions order
   (parent / renewal / resubscribe / switch) AND the promo's `appliesToSubscriptions=false`.
5. ✅ **Order date within validity window** — refused if `order.date_created_gmt` is
   outside `[validFrom, validUntil]`.
6. ✅ **WooCommerce product restrictions** — fetches the live coupon and classifies
   each line item against `product_ids` / `excluded_product_ids`:
   - All eligible → proceed with full discount.
   - None eligible → SOFT REFUSAL (`product_not_eligible`); polite reply naming the
     items the customer ordered, no refund.
   - Mixed → ESCALATES with `PROMO_CODE_PARTIAL_REFUND_REQUIRES_REVIEW`. Per merchant
     policy the agent never auto-issues partial refunds; a human reviewer decides.
   - **Note:** category-based restrictions (`product_categories`,
     `excluded_product_categories`) are NOT yet enforced — they require an extra
     `GET /products/{id}` per line item and remain in the unsupported list, keeping
     such coupons inactive on import. Tracked as a follow-up.

For first-time-only promos, an additional check runs in step 6 of the resolution
sub-workflow: `pcAssessFirstTimeCustomer` looks up prior orders by the **order's
billing email** (the canonical customer identity), not the inbound sender. This means
a customer can email support from a different inbox than the one they used at checkout
and still be evaluated correctly.

### Application guidance is grounded in product knowledge

Scenario 3 (customer asks "where do I enter the promo code?") no longer reads from a
static `promoCodeApplicationGuidance` system setting. Instead the resolution sub-workflow:

1. Augments the customer's question with a hint phrase ("Customer is asking how to apply
   a promo code or coupon at checkout. Their question: …") to bias the vector search.
2. Calls `retrieveProductKnowledgeContext` (the same activity the Product Agent uses)
   against the merchant's AI Team Center knowledge base.
3. Passes any retrieved chunks to `pcGenerateApplicationGuidanceFromKnowledge`, which
   answers the customer using ONLY the retrieved snippets as source of truth.
4. If retrieval returns zero chunks, OR if the top similarity is below
   `PROMO_KNOWLEDGE_MIN_TOP_SIMILARITY` (0.45), the workflow escalates with
   `EscalationType.PROMO_CODE_APPLICATION_GUIDANCE_NOT_FOUND`. The merchant should add
   a knowledge doc covering checkout / coupon application to fix the gap once and for all.

The legacy `system_settings.promoCodeApplicationGuidance` column has been removed.

### Identity & order discovery

The agent does NOT enforce an "inbound email == order's billing email" check. Customers
regularly contact support from a different inbox than the one they used at checkout, and
that should not be a refusal. Identity protection comes from:

- The order itself (refunds always go back to the original payment method, not to the requester).
- The first-time-customer check, which uses the order's billing email.
- The idempotency guard (one promo refund per order, ever).

If the agent cannot identify an order from the email body or by looking up the inbound
email in WooCommerce, it sends a follow-up "what's your order number?" reply and waits
up to `MAX_CUSTOMER_REPLY_WAIT_DAYS` for the customer's response (action step 5.1 in
the resolution sub-workflow). Only if the customer doesn't reply (or replies without
an order number) does the workflow escalate to a human.

## Deferred

### Gap A — `maxUsageCount` is never enforced

The schema field `promo_code_configurations.maxUsageCount` is set by the merchant but
the agent does not enforce it. A merchant who configures "max 100 redemptions" still
receives unlimited agent-initiated refunds.

**To fix:**
- Option 1 (cheap, eventually consistent): on each refund, increment a new
  `redemptionCount` column on the configuration. Refuse if `redemptionCount >= maxUsageCount`.
- Option 2 (accurate, expensive): query WooCommerce for orders that have this coupon
  in their `coupon_lines` plus refunds with the canonical reason. Requires pagination
  and adds latency to every eligibility check.

Recommendation: Option 1, with the redemption count visible in the UI per coupon.

### Gap B — No max claim age

A customer can email today asking for a missed-promo refund on a 2-year-old order.
Currently we will honor it as long as the order date falls within the promo's validity
window. Most merchants want a tighter "claim within 30/60/90 days of order date" policy.

**To fix:**
- Add `maxClaimAgeDays` (integer, nullable) to `promo_code_configurations`.
- In `pcCheckRefundEligibility`, refuse if
  `(now - order.date_created_gmt) > maxClaimAgeDays * 86400000`.

### Gap C — Polite ineligibility auto-replies

**Status: partially implemented.** The architecture for "soft refusals" — ineligibility
reasons the agent answers directly with a polite reply instead of escalating — is now in
place. Implemented soft refusals so far:

- ✅ `subscription_excluded` — promo applies only to one-time orders, customer requested
  refund on a subscription order. Sent via `pcGenerateSubscriptionExcludedMessage`.
- ✅ `already_refunded` — customer asked us (often a second time) for a refund on an
  order that already has an agent-issued promo refund. The reply confirms the prior
  refund and amount. Sent via `pcGenerateAlreadyRefundedMessage`.
- ✅ `product_not_eligible` — the order's items don't qualify under the coupon's
  WooCommerce product restrictions. The reply names the customer's items and explains
  the mismatch. Sent via `pcGenerateProductNotEligibleMessage`. Mixed orders (some
  eligible, some not) deliberately escalate instead of soft-refusing — see Guard 6.

Each ineligibility case carries a `kind` discriminator on `PromoCodeRefundEligibility`.
Soft kinds are listed in `SOFT_REFUSAL_KINDS` (in `promo-code.constants.ts`); the
resolution sub-workflow's `handleMissedPromoRefund` dispatches each soft kind to a
dedicated reply helper. Hard kinds (security/data anomalies) continue to escalate.

**Still escalating, candidates to soften next:**
- `outside_validity_window` — "WELCOME10 was active from X to Y, but order #N was placed on Z."
- `below_minimum` — "WELCOME10 needs an order of at least $25."
- `no_stacking` — "Order #N already had a coupon applied at checkout."

**Should remain escalations (security/anomaly cases):**
- `status_ineligible` — cancelled/failed/pending orders need human review.
- `order_not_found` / `zero_amount` — data anomaly.

(Note: `ownership_mismatch` was previously listed here. The check has been removed —
see "Identity & order discovery" above.)

To add another soft refusal: extend `SOFT_REFUSAL_KINDS`, add a generator activity
modeled on `pcGenerateSubscriptionExcludedMessage`, and add a new branch in the
post-eligibility dispatcher inside `handleMissedPromoRefund`.

### Gap D — Billing-address fallback for first-time check requires customer to volunteer their address

`pcAssessFirstTimeCustomer` falls back to address-based matching only when the caller
passes a `candidateBillingAddress`. The Promo Code Agent never extracts an address from
the inbound email, so the fallback is dormant in practice.

**To fix:**
- Extend the AI intent classifier to also extract billing address fragments from the
  email body.
- Pass the extracted address into `pcAssessFirstTimeCustomer`.

### Gap E — Workflow restart after partial refund

If `pcProcessRefund` succeeds but the subsequent `Send Promo Code Response` action
fails (e.g., email provider auth error), the workflow ends in a failed state. A new
inbound email on the same thread starts a brand-new workflow that has no memory of the
prior partial completion. The idempotency guard (Gap 1 above, now fixed) catches this
case correctly: the second workflow's eligibility check sees the prior refund and refuses.

No further action needed — the existing idempotency guard covers this.
