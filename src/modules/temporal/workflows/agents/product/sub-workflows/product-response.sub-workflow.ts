import { log, proxyActivities } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import type { AiIdentityActivities } from '../../../../activities/shared/ai-identity.activities';
import type { ProductActivities } from '../../../../activities/agents/product/product.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  ProductActionType,
} from '../../../types';
import { extractCustomerName, executeWorkflowAction } from '../../../workflow-action.helpers';
import {
  PRODUCT_CLASSIFICATION_CONFIDENCE_THRESHOLD,
  PRODUCT_MIN_CHUNKS_FOR_SIMILARITY_RELAXATION,
  PRODUCT_MIN_TOKENS_FOR_RECOMMENDATION_SIMILARITY,
  PRODUCT_MIN_TOKENS_FOR_SIMILARITY_RELAXATION,
  PRODUCT_RECOMMENDATION_SIMILARITY_THRESHOLD,
  PRODUCT_RELAXED_SIMILARITY_THRESHOLD,
  PRODUCT_RETRIEVAL_DEFAULTS,
  PRODUCT_VERY_LOW_SIMILARITY_THRESHOLD,
  ACTIVITY_TIMEOUTS,
} from '../product.constants';
import { ProductPhaseResult, ProductWorkflowState } from '../product.types';
import { buildProductFailureResult } from './product-subworkflow.helpers';

const emailActivities = proxyActivities<typeof EmailActivities.prototype>(ACTIVITY_TIMEOUTS.EMAIL);
const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);
const productActivities = proxyActivities<typeof ProductActivities.prototype>(
  ACTIVITY_TIMEOUTS.PRODUCT,
);

const { markEmailAsRead, sendCustomerNotificationViaThread } = emailActivities;
const { getAiIdentity } = aiIdentityActivities;
const { retrieveProductKnowledgeContext, generateProductKnowledgeResponse } = productActivities;

export async function handleProductResponse(
  context: ActionExecutionContext<ProductWorkflowState>,
): Promise<ProductPhaseResult> {
  let responseSent = false;
  const customerName = extractCustomerName(context.email.fromEmail);

  const markReadResult = await executeWorkflowAction(
    {
      type: ProductActionType.MARK_EMAIL_READ,
      step: 1,
      description: 'Mark incoming email as read',
      actionDetails: `Marking product inquiry email from ${context.email.fromEmail} as read.`,
    },
    () => markEmailAsRead(context.email.userId, context.email.messageId),
    context,
  );
  const markReadFailure = buildProductFailureResult(context.state, markReadResult);
  if (markReadFailure) {
    return { ...markReadFailure, responseSent: false };
  }

  const confidenceResult = await executeWorkflowAction(
    {
      type: ProductActionType.VERIFY_AI_CONFIDENCE,
      step: 2,
      description: `Verify product classification confidence (${context.state.classification.confidence}%)`,
      actionDetails:
        'Validating product intent classification confidence and ensuring inquiry is safe to answer automatically.',
      metadata: {
        confidence: context.state.classification.confidence,
        category: context.state.classification.category,
        threshold: PRODUCT_CLASSIFICATION_CONFIDENCE_THRESHOLD,
      },
    },
    async () => {
      if (context.state.classification.category !== 'product') {
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          `Product workflow received incompatible category: ${context.state.classification.category}`,
          { expected: ['product'], received: context.state.classification.category },
        );
      }

      if (context.state.classification.confidence < PRODUCT_CLASSIFICATION_CONFIDENCE_THRESHOLD) {
        throw new EscalationError(
          EscalationType.LOW_CLASSIFICATION_CONFIDENCE,
          `Product classification confidence (${context.state.classification.confidence}%) is below threshold (${PRODUCT_CLASSIFICATION_CONFIDENCE_THRESHOLD}%)`,
          {
            confidence: context.state.classification.confidence,
            threshold: PRODUCT_CLASSIFICATION_CONFIDENCE_THRESHOLD,
          },
        );
      }

      if (context.state.classification.scenarios?.escalation) {
        throw new EscalationError(
          EscalationType.CUSTOMER_DISTRESS_URGENT,
          'Product inquiry flagged for escalation by classifier scenarios',
          { scenarios: context.state.classification.scenarios },
        );
      }

      return { verified: true };
    },
    context,
  );
  const confidenceFailure = buildProductFailureResult(context.state, confidenceResult);
  if (confidenceFailure) {
    return { ...confidenceFailure, responseSent: false };
  }

  const retrievalResult = await executeWorkflowAction(
    {
      type: ProductActionType.RETRIEVE_PRODUCT_KNOWLEDGE,
      step: 3,
      description: 'Retrieve relevant product knowledge chunks',
      actionDetails:
        'Performing vector retrieval against user-provided product knowledge and validating relevance quality.',
      metadata: {
        retrieval: PRODUCT_RETRIEVAL_DEFAULTS,
      },
    },
    async () => {
      const retrieval = await retrieveProductKnowledgeContext({
        userId: context.email.userId,
        query: context.email.body,
        ...PRODUCT_RETRIEVAL_DEFAULTS,
        enableQueryExpansion: true,
      });

      if (!retrieval.selectedChunks?.length) {
        throw new EscalationError(
          EscalationType.PRODUCT_KNOWLEDGE_NOT_FOUND,
          'No relevant product knowledge found for customer query',
          {
            query: context.email.body,
            totalMatches: retrieval.totalMatches,
            skippedBySimilarity: retrieval.skippedBySimilarity,
            skippedByTokenBudget: retrieval.skippedByTokenBudget,
          },
        );
      }

      const topSimilarity = Math.max(
        ...retrieval.selectedChunks.map((chunk: any) => chunk.similarity),
      );
      const hasStrictSimilarity = topSimilarity >= PRODUCT_VERY_LOW_SIMILARITY_THRESHOLD;
      const hasRelaxedSimilarity =
        topSimilarity >= PRODUCT_RELAXED_SIMILARITY_THRESHOLD &&
        (retrieval.selectedChunks.length >= PRODUCT_MIN_CHUNKS_FOR_SIMILARITY_RELAXATION ||
          retrieval.usedTokens >= PRODUCT_MIN_TOKENS_FOR_SIMILARITY_RELAXATION);
      const isRecommendationQuery =
        /\b(do you recommend|would you recommend|is this good|is it good|worth it|best for)\b/i.test(
          context.email.body,
        );
      const hasRecommendationSimilarity =
        isRecommendationQuery &&
        topSimilarity >= PRODUCT_RECOMMENDATION_SIMILARITY_THRESHOLD &&
        retrieval.usedTokens >= PRODUCT_MIN_TOKENS_FOR_RECOMMENDATION_SIMILARITY;

      if (!hasStrictSimilarity && !hasRelaxedSimilarity && !hasRecommendationSimilarity) {
        throw new EscalationError(
          EscalationType.PRODUCT_KNOWLEDGE_LOW_SIMILARITY,
          `Product knowledge similarity too low (${topSimilarity.toFixed(3)} < ${PRODUCT_VERY_LOW_SIMILARITY_THRESHOLD})`,
          {
            topSimilarity,
            threshold: PRODUCT_VERY_LOW_SIMILARITY_THRESHOLD,
            relaxedThreshold: PRODUCT_RELAXED_SIMILARITY_THRESHOLD,
            recommendationThreshold: PRODUCT_RECOMMENDATION_SIMILARITY_THRESHOLD,
            recommendationQuery: isRecommendationQuery,
            chunkCount: retrieval.selectedChunks.length,
            usedTokens: retrieval.usedTokens,
            query: context.email.body,
          },
        );
      }

      context.state.retrievedKnowledge = retrieval;
      return retrieval;
    },
    context,
  );
  const retrievalFailure = buildProductFailureResult(context.state, retrievalResult);
  if (retrievalFailure) {
    return { ...retrievalFailure, responseSent: false };
  }

  const aiIdentity = await getAiIdentity(context.email.userId);
  const generateResult = await executeWorkflowAction(
    {
      type: ProductActionType.GENERATE_PRODUCT_RESPONSE,
      step: 4,
      description: 'Generate response using retrieved product knowledge',
      actionDetails: 'Generate a store-specific product response grounded in retrieved knowledge.',
    },
    async () => {
      const generatedResponse = await generateProductKnowledgeResponse({
        customerQuery: context.email.body,
        customerName,
        knowledgeChunks: context.state.retrievedKnowledge?.selectedChunks ?? [],
        aiIdentity,
      });

      context.state.generatedResponse = generatedResponse;
      return generatedResponse;
    },
    context,
  );
  const generateFailure = buildProductFailureResult(context.state, generateResult);
  if (generateFailure) {
    return { ...generateFailure, responseSent: false };
  }

  const sendResult = await executeWorkflowAction(
    {
      type: ProductActionType.SEND_PRODUCT_RESPONSE,
      step: 5,
      description: 'Send final product response to customer',
      actionDetails:
        'Send the generated product answer back to the customer thread with store-specific context.',
      proposedEmailBody: context.state.generatedResponse,
    },
    async (humanResponse) => {
      const overrideMessage = humanResponse?.modifiedData?.message;
      const finalMessage = overrideMessage || context.state.generatedResponse || '';
      if (!finalMessage.trim()) {
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          'Generated product response was empty',
          { query: context.email.body },
        );
      }
      return sendCustomerNotificationViaThread(
        context.email.userId,
        context.email.fromEmail,
        context.email.subject || 'Product inquiry response',
        finalMessage,
        context.email.threadId,
      );
    },
    context,
  );
  const sendFailure = buildProductFailureResult(context.state, sendResult);
  if (sendFailure) {
    return { ...sendFailure, responseSent: false };
  }

  responseSent = true;
  log.info('Product response phase completed successfully', {
    emailId: context.email.id,
    selectedChunks: context.state.retrievedKnowledge?.selectedChunks?.length ?? 0,
  });

  return {
    success: true,
    state: context.state,
    responseSent,
  };
}
