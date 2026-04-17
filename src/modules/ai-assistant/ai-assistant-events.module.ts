import { Module } from '@nestjs/common';
import { AiAssistantEventsService } from './ai-assistant-events.service';

/**
 * Standalone module that owns the AI Assistant SSE event bus.
 *
 * It's kept separate from `AiAssistantModule` so `InfraModule`
 * (Temporal activities) and the OAuth modules (Gmail / Outlook
 * webhook services) can import just the event bus without pulling
 * in the AI Assistant controllers/services — which would create a
 * circular dependency. Same pattern as `ApprovalQueueEventsModule`
 * and `ActivityLogEventsModule`.
 */
@Module({
  providers: [AiAssistantEventsService],
  exports: [AiAssistantEventsService],
})
export class AiAssistantEventsModule {}
