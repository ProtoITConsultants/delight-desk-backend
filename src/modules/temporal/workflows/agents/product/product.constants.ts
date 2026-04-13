export const PRODUCT_CLASSIFICATION_CONFIDENCE_THRESHOLD = 60;
export const PRODUCT_VERY_LOW_SIMILARITY_THRESHOLD = 0.55;
export const PRODUCT_RELAXED_SIMILARITY_THRESHOLD = 0.5;
export const PRODUCT_RECOMMENDATION_SIMILARITY_THRESHOLD = 0.45;
export const PRODUCT_MIN_CONTEXT_TOKENS = 120;
export const PRODUCT_MIN_CONTEXT_TOKENS_RELAXED = 50;
export const PRODUCT_RELAXED_CONTEXT_SIMILARITY_THRESHOLD = 0.6;
export const PRODUCT_MIN_TOKENS_FOR_SIMILARITY_RELAXATION = 100;
export const PRODUCT_MIN_CHUNKS_FOR_SIMILARITY_RELAXATION = 2;
export const PRODUCT_MIN_TOKENS_FOR_RECOMMENDATION_SIMILARITY = 80;

export const PRODUCT_RETRIEVAL_DEFAULTS = {
  topK: 20,
  minSimilarity: 0.5,
  maxTokens: 5000,
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
