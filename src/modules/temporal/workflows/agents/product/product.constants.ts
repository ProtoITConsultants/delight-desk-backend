export const PRODUCT_CLASSIFICATION_CONFIDENCE_THRESHOLD = 60;
export const PRODUCT_VERY_LOW_SIMILARITY_THRESHOLD = 0.55;
export const PRODUCT_MIN_CONTEXT_TOKENS = 120;

export const PRODUCT_RETRIEVAL_DEFAULTS = {
  topK: 8,
  minSimilarity: 0.65,
  maxTokens: 1200,
} as const;

export const ACTIVITY_TIMEOUTS = {
  EMAIL: {
    startToCloseTimeout: '2 minutes',
    retry: {
      initialInterval: '10s',
      maximumAttempts: 3,
    },
  },
  AI_IDENTITY: {
    startToCloseTimeout: '30 seconds',
    retry: {
      initialInterval: '5s',
      maximumAttempts: 3,
    },
  },
  PRODUCT: {
    startToCloseTimeout: '3 minutes',
    retry: {
      initialInterval: '10s',
      maximumAttempts: 3,
    },
  },
} as const;
