import { EscalationDetails, WorkflowState } from '../../types';

export interface ProductKnowledgeContext {
  query: string;
  totalMatches: number;
  usedTokens: number;
  selectedChunks: Array<{
    chunkId: string;
    sourceId: string;
    sourceTitle: string;
    sourceUrl: string | null;
    sourceType: string;
    content: string;
    tokenCount: number;
    similarity: number;
  }>;
  skippedBySimilarity: number;
  skippedByTokenBudget: number;
}

export interface ProductWorkflowState extends WorkflowState {
  retrievedKnowledge?: ProductKnowledgeContext;
  generatedResponse?: string;
}

export interface ProductPhaseResult {
  success: boolean;
  state: ProductWorkflowState;
  escalation?: EscalationDetails;
  responseSent: boolean;
}
