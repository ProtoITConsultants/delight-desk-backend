/**
 * Promo Code Workflow Constants
 * Centralized configuration for the Promo Code Agent workflow.
 */

// AI classification confidence thresholds (top-level + intent sub-classification).
export const PROMO_CODE_CLASSIFICATION_CONFIDENCE_THRESHOLD = 60;
export const PROMO_CODE_INTENT_CONFIDENCE_THRESHOLD = 55;

// Customer distress signals reuse the order-cancellation tuning constants. Keeping a
// local copy means the promo code agent can be tuned independently if a tenant reports
// false positives during refund denials, without affecting other agents.
export const PROMO_DISTRESS_ESCALATION_SCORE_THRESHOLD = 3;
export const PROMO_DISTRESS_SIGNAL_WEIGHTS = {
  PRIORITY_URGENT: 2,
  PRIORITY_HIGH: 1,
  NEGATIVE_SENTIMENT: 1,
  FRUSTRATION_KEYWORD: 1,
  URGENCY_KEYWORD: 1,
  REPEAT_REQUEST_KEYWORD: 1,
} as const;
export const PROMO_DISTRESS_FRUSTRATION_KEYWORDS = [
  'frustrated',
  'angry',
  'upset',
  'disappointed',
  'unacceptable',
  'ripped off',
  'scam',
] as const;
export const PROMO_DISTRESS_URGENCY_KEYWORDS = [
  'asap',
  'urgent',
  'immediately',
  'right now',
  'as soon as possible',
] as const;
export const PROMO_DISTRESS_REPEAT_REQUEST_KEYWORDS = [
  'how many times',
  'again',
  'still waiting',
  'already asked',
  'for the third time',
] as const;

/**
 * Set of refund-ineligibility kinds the Promo Code Agent answers directly with a
 * polite customer reply instead of escalating to a human. Lives in the workflow
 * constants file so it can be imported by sub-workflows (which run in the Temporal
 * sandbox and cannot import runtime values from activity files that pull in NestJS).
 *
 * Each kind in this set MUST have a matching branch in `handleMissedPromoRefund`'s
 * post-eligibility dispatcher AND a corresponding message-generator activity.
 * Adding a kind here without both will trigger the defensive escalation fallback.
 */
export const SOFT_REFUSAL_KINDS: ReadonlySet<string> = new Set([
  'subscription_excluded',
  'already_refunded',
]);

/**
 * Vector retrieval defaults for the application-guidance branch. The agent reuses the
 * Product Agent's `retrieveProductKnowledgeContext` activity to look up merchant-authored
 * docs about how to apply a promo code at checkout.
 *
 * - `topK=10` is enough to cover most "where do I enter the code" walkthroughs.
 * - `minSimilarity=0.4` matches the Product Agent's permissive baseline.
 * - `maxTokens=3000` keeps the prompt to the message generator manageable.
 *
 * `MIN_TOP_SIMILARITY` is the additional floor we enforce after retrieval — even if
 * chunks come back, we escalate when the best one is below this threshold so the
 * customer doesn't get a confidently-wrong answer pulled from unrelated docs.
 */
export const PROMO_KNOWLEDGE_RETRIEVAL_DEFAULTS = {
  topK: 10,
  minSimilarity: 0.4,
  maxTokens: 3000,
} as const;
export const PROMO_KNOWLEDGE_MIN_TOP_SIMILARITY = 0.45;

/**
 * Maximum time the agent waits for a customer reply when asking for an order number.
 * Mirrors the value used by the order-cancellation agent so customers see a consistent
 * cadence across agents on the same thread.
 */
export const MAX_CUSTOMER_REPLY_WAIT_DAYS = 4;

// Refund processing safety net. Although pcCheckRefundEligibility enforces the cap,
// this absolute ceiling is a second line of defense if a misconfigured promo accidentally
// returns a huge amount (e.g. a percentage of a wholesale order). The workflow will
// short-circuit and escalate before calling WooCommerce.
export const PROMO_CODE_HARD_REFUND_CEILING = 500;

export const ACTIVITY_TIMEOUTS = {
  EMAIL: {
    startToCloseTimeout: '2 minutes',
    retry: { initialInterval: '10s', maximumAttempts: 3 },
  },
  AI_IDENTITY: {
    startToCloseTimeout: '30 seconds',
    retry: { initialInterval: '5s', maximumAttempts: 3 },
  },
  ORDER: {
    startToCloseTimeout: '5 minutes',
    retry: { initialInterval: '10s', maximumAttempts: 3 },
  },
  MESSAGE: {
    startToCloseTimeout: '2 minutes',
    retry: { initialInterval: '10s', maximumAttempts: 3 },
  },
  PROMO: {
    startToCloseTimeout: '3 minutes',
    retry: { initialInterval: '10s', maximumAttempts: 3 },
  },
  APPROVAL_QUEUE: { startToCloseTimeout: '1 minute' },
} as const;
