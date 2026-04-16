import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { PlansRepository } from './repos/plans.repository';
import { UserRepository } from './repos/users.repository';
import { EmailsRepository } from './repos/emails.repository';
import { AgentsRepository } from './repos/agents.repository';
import { ContactUsRepository } from './repos/contact-us.repository';
import { GoogleOauthRepository } from './repos/google-oauth.repository';
import { SubscriptionRepository } from './repos/subscription.repository';
import { UserAgentsRepository } from './repos/user-agents.repository';
import { EmailThreadsRepository } from './repos/email-threads.repository';
import { EscalationsRepository } from './repos/escalations.repository';
import { ApprovalQueueRepository } from './repos/approval-queue.repository';
import { ApprovalQueueActionsRepository } from './repos/approval-queue-actions.repository';
import { ApiRateLimitRepository } from './repos/api-rate-limit.repository';
import { SystemSettingsRepository } from './repos/system-settings.repository';
import { MicrosoftOauthRepository } from './repos/microsoft-oauth.repository';
import { UserStoreConnectionsRepository } from './repos/user-store-connections.repository';
import { AiAssistantEmailSignatureRepository } from './repos/ai-assistant-email-signature.repository';
import { AiIdentityRepository } from './repos/ai-identity.repository';
import { ProductKnowledgeSourcesRepository } from './repos/product-knowledge-sources.repository';
import { ProductKnowledgeChunksRepository } from './repos/product-knowledge-chunks.repository';
import { ProductKnowledgeEmbeddingsRepository } from './repos/product-knowledge-embeddings.repository';
import { PromoCodeConfigurationsRepository } from './repos/promo-code-configurations.repository';
import { DashboardAnalyticsRepository } from './repos/dashboard-analytics.repository';
import { ActivityLogRepository } from './repos/activity-log.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    UserRepository,
    PlansRepository,
    EmailsRepository,
    AgentsRepository,
    ContactUsRepository,
    UserAgentsRepository,
    GoogleOauthRepository,
    EscalationsRepository,
    SubscriptionRepository,
    EmailThreadsRepository,
    ApiRateLimitRepository,
    ApprovalQueueRepository,
    ApprovalQueueActionsRepository,
    SystemSettingsRepository,
    MicrosoftOauthRepository,
    UserStoreConnectionsRepository,
    UserStoreConnectionsRepository,
    AiAssistantEmailSignatureRepository,
    AiIdentityRepository,
    ProductKnowledgeSourcesRepository,
    ProductKnowledgeChunksRepository,
    ProductKnowledgeEmbeddingsRepository,
    PromoCodeConfigurationsRepository,
    DashboardAnalyticsRepository,
    ActivityLogRepository,
  ],
  exports: [
    EmailsRepository,
    UserStoreConnectionsRepository,
    EmailThreadsRepository,
    AgentsRepository,
    ContactUsRepository,
    GoogleOauthRepository,
    MicrosoftOauthRepository,
    PlansRepository,
    SubscriptionRepository,
    SystemSettingsRepository,
    UserAgentsRepository,
    UserStoreConnectionsRepository,
    UserRepository,
    EscalationsRepository,
    ApprovalQueueRepository,
    ApprovalQueueActionsRepository,
    AiAssistantEmailSignatureRepository,
    ApiRateLimitRepository,
    AiIdentityRepository,
    ProductKnowledgeSourcesRepository,
    ProductKnowledgeChunksRepository,
    ProductKnowledgeEmbeddingsRepository,
    PromoCodeConfigurationsRepository,
    DashboardAnalyticsRepository,
    ActivityLogRepository,
  ],
})
export class RepositoriesModule {}
