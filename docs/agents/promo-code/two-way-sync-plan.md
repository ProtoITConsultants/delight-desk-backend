# Two-Way Promo Code Sync — Design Draft

**Status:** Draft / Parked. Pick this up after the Promo Code Agent has been validated
end-to-end with the test scenarios in the team handover.

**Current state (as of this draft):** Sync is **one-way only** — Delight Desk → WooCommerce.
See `src/modules/agents/woocommerce-coupon-sync.service.ts`. Coupons created in WooCommerce
directly are invisible to Delight Desk.

---

## Goal

Make the promo code list mutually consistent between Delight Desk and WooCommerce so
that:

- Coupons created/edited/deleted on either side eventually show up on the other side.
- Merchants who already manage coupons in WooCommerce don't have to re-enter them in
  Delight Desk before the agent can use them.
- The Promo Code Agent never tries to refund a coupon whose configuration it doesn't
  fully understand.

## Why this needs more care than one-way sync

Three classic two-way sync hazards apply here:

1. **Conflict resolution.** Same coupon edited on both sides between sync runs → who wins?
2. **Sync loops.** DD pushes to WC, the next pull from WC echoes that change back to DD.
3. **Field mismatch.** DD has fields WC doesn't (`usageType`, `maxRefundAmount`,
   `appliesToSubscriptions`). WC has features DD doesn't model
   (`fixed_product`, `free_shipping`, `email_restrictions`, product/category restrictions).

A naive implementation creates silent data corruption that's painful to debug later.

---

## Recommended architecture (three layers)

### Layer 1 — Initial backfill on agent enable

Trigger: user toggles **Enable Promo Code Agent** to ON.

- Pre-check WooCommerce store is connected (existing `ConflictException` already covers it).
- Background job (fire-and-forget):
  1. Page through every coupon from WC (`GET /coupons?per_page=100`).
  2. Match each WC coupon by `code` (case-insensitive) against existing DD configurations:
     - **No match in DD** → create a new DD row with sensible defaults for DD-only fields.
       Persist `wooCommerceCouponId` immediately.
     - **Match exists in DD** → don't overwrite anything; just record the
       `wooCommerceCouponId` if missing and stamp `lastSyncedAt`. Protects existing
       DD-side configuration from accidental clobber.
  3. Set `system_settings.promoCodeInitialBackfillCompletedAt = now()` so we never re-run
     the import (cron + webhooks take over from here).
- Surface progress via a small status endpoint:
  `GET /agents/promo-code/sync-status` → `{ status, counts: { pulled, created, skipped, failed } }`.

### Layer 2 — Real-time WC → DD sync (webhooks)

WooCommerce native webhooks: `coupon.created`, `coupon.updated`, `coupon.deleted`.

- During initial enable, also call `POST /webhooks` on the merchant's WC store to register
  the three webhooks pointing at `POST /woocommerce/webhooks/coupons`.
- Save the registered webhook IDs on `user_store_connections` so we can clean them up
  on disable / disconnect.
- Verify each incoming webhook with the WC signature header (`x-wc-webhook-signature`).
- On `coupon.created` / `coupon.updated`:
  - Apply sync-loop guard (see below).
  - If we own this coupon (via `_delightdesk_managed` meta marker), only update fields WC
    is authoritative for: `code`, `discount_type`, `amount`, `date_expires`,
    `minimum_amount`, `usage_limit`, `usage_limit_per_user`. Leave DD-only fields
    (`usageType`, `maxRefundAmount`, `appliesToSubscriptions`) untouched.
  - If we don't own it, treat it like the backfill case (insert new DD row or update
    existing match by code).
- On `coupon.deleted`: **soft-delete** (`isActive=false`). See "Soft-delete vs hard-delete"
  below.

### Layer 3 — Periodic reconciliation cron (safety net)

Webhooks fail occasionally. The existing 30-min `reconcileFailedSyncs` cron extends to
also pull from WC.

- For each user with the agent enabled and the backfill flag set:
  - Pull the full WC coupon list.
  - For coupons we've never seen → import.
  - For coupons we have seen → compare WC's `date_modified_gmt` against DD's
    `lastSyncedAt`. If WC is newer, apply changes; if DD is newer, push DD's changes back.
  - For DD rows whose `wooCommerceCouponId` no longer exists in WC → soft-delete on DD.

---

## Conflict resolution policy

**Last-write-wins by timestamp**, with a per-tenant fallback:

- DD's `promo_code_configurations.updatedAt` already exists.
- WC returns `date_modified_gmt` on every coupon.
- When the cron runs, compare the two; newer one wins.
- For ties (impossible in practice with timestamp precision), DD wins.

For the first 30 days after enable, expose a UI toggle:
**"When in doubt, who wins?"** — `Delight Desk` (default) | `WooCommerce`.

---

## Sync-loop prevention (3 layers)

1. **Self-marker.** Every coupon we push from DD includes
   `meta_data: [{ key: '_delightdesk_managed', value: 'true' }, { key: '_delightdesk_config_id', value: '<uuid>' }]`.
   Webhook events for a coupon with our marker AND with `date_modified` within ~10s of
   the DD row's `updatedAt` → skip (it's our own write echoing back).
2. **Recently-pushed cache.** In-memory LRU `Map<couponId, pushedAt>` retained ~60s.
   Webhook events for IDs in this map are dropped.
3. **Hash comparison.** Before applying a webhook update, hash the relevant WC fields and
   compare to last-known hash. Skip if identical. (Belt-and-suspenders; only needed if
   #1 + #2 prove insufficient.)

---

## Field mapping (WC → DD imports)

| WooCommerce | Delight Desk | Default if absent |
|---|---|---|
| `code` | `promoCode` | required |
| `discount_type=percent` | `discountType=percentage` | — |
| `discount_type=fixed_cart` or `fixed_product` | `discountType=fixed_amount` | — |
| `amount` (when percent) | `discountPercentage` | — |
| `amount` (when fixed) | `maxRefundAmount` | also fills the discount value |
| `description` | `description` | null |
| `date_expires_gmt` | `validUntil` | null |
| `minimum_amount` | `minimumOrderValue` | null |
| `usage_limit` | `maxUsageCount` | null |
| `usage_limit_per_user=1` | `usageType=first_time_customer_discount` | else `general_discount_inquiry` |
| `email_restrictions` (non-empty) | (ignore for now, log warning) | — |
| `free_shipping=true` | (skip the coupon entirely with warning) | — |
| `product_ids` / `excluded_*` (non-empty) | (import but log warning; agent doesn't honor product restrictions yet) | — |
| `meta_data` | preserve our `_delightdesk_*` markers if present | — |

**Refund safety:** the agent should NEVER auto-refund a coupon with product/category/email
restrictions that WC owns. Smallest enforcement: add a `wcRestrictionsRaw` JSONB column,
then short-circuit `pcCheckRefundEligibility` with `eligible=false` when restrictions are
present and the order doesn't match.

---

## Soft-delete vs hard-delete

Soft-delete (`isActive=false`) on both sides. Reasons:

- Refund processing references the configuration to write the refund reason.
- Activity log and escalation rows reference promo codes by code.
- A returning customer's email about a 6-month-old promo code should still produce a
  sensible response, not a confused "promo code not configured" escalation.

Hard delete only after 90 days of `isActive=false` AND no related rows referencing it.

---

## Operational concerns

- **Per-tenant rate limits.** Throttle the backfill loop to ~5 requests/sec per tenant.
  Some hosts (Kinsta, WP Engine, Cloudways) impose undocumented limits.
- **Failed webhook delivery.** WC retries failed webhooks but eventually gives up. The
  reconciliation cron is the safety net.
- **Webhook teardown.** When a user disables the agent or disconnects the store, call
  `DELETE /webhooks/<id>` for the registered webhooks.
- **Multi-environment safety.** Webhook URL must be a public HTTPS URL. In dev requires
  ngrok or similar. Use a `WC_WEBHOOK_BASE_URL` env var that defaults to a non-localhost
  config so we never accidentally register a `localhost` URL on a production WC store.

---

## Recommended implementation order

Four PRs, each independently shippable:

1. **PR 1 — Initial backfill on enable.** Layer 1 only.
   - Add `promoCodeInitialBackfillCompletedAt` to system settings.
   - Add `pullCouponsFromWooCommerce` method on the sync service.
   - Hook into `updateUserAgentSettings` when `isEnabled` flips ON for `promo_code`.
   - Add status endpoint.
   - **Lowest risk, biggest UX win.**

2. **PR 2 — Reconciliation cron extended to WC → DD.** Layer 3.
   - Extend existing 30-min cron to also pull from WC.
   - Implement sync-loop guard via `_delightdesk_managed` meta marker + in-memory
     recently-pushed cache.
   - Last-write-wins by timestamp.
   - **Medium risk; safety net for missed webhooks before we even introduce them.**

3. **PR 3 — WooCommerce webhooks for real-time WC → DD.** Layer 2.
   - Webhook registration on enable.
   - Signature verification.
   - Controller endpoint.
   - Sync-loop guard.
   - **Higher risk because of webhook signature edge cases — done after the cron because
     the cron makes us resilient to webhook bugs.**

4. **PR 4 — UI/UX polish.**
   - Source-of-truth toggle in settings.
   - Backfill progress indicator.
   - "Last synced from WC at" badge per coupon.
   - Warning banner for imported coupons with unsupported restrictions.

**Suggested first slice: PR 1 + PR 2 together.** Gives initial backfill on enable,
two-way sync via cron (eventually consistent within 30 min), no webhook complexity yet,
and a foundation we can layer real-time webhooks onto later.

---

## Open questions to resolve before starting implementation

- Do we want to expose the source-of-truth toggle (DD vs WC) in the UI, or hard-code DD
  as the winner? (Recommendation: hard-code DD for v1, add toggle in PR 4 if requested.)
- Should the initial backfill run every time the agent is re-enabled, or only the very
  first time? (Recommendation: only the very first time; subsequent enables rely on the
  cron + webhooks.)
- For coupons with WC-only features we don't model (`free_shipping`, `email_restrictions`,
  product/category restrictions), do we import them and disable the agent for that code,
  or skip the import entirely? (Recommendation: import and mark them as
  `agentEligible=false` so they show in the UI but the agent never refunds them.)
