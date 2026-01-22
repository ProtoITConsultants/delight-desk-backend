import { Module } from '@nestjs/common';
import { EmailsRepository } from './repos/emails.repository';
import { UserStoreConnectionsRepository } from './repos/user-store-connections.repository';
import { AuditRepository } from './repos/audit.repository';
import { AgentsRepository } from './repos/agents.repository';
import { MetricsRepository } from './repos/metrics.repository';
import { DatabaseModule } from './database.module';
import { ContactUsRepository } from './repos/contact-us.repository';
import { GoogleOauthRepository } from './repos/google-oauth.repository';
import { MicrosoftOauthRepository } from './repos/microsoft-oauth.repository';
import { PlansRepository } from './repos/plans.repository';
import { SubscriptionRepository } from './repos/subscription.repository';
import { SystemSettingsRepository } from './repos/system-settings.repository';
import { UserAgentsRepository } from './repos/user-agents.repository';
import { UserRepository } from './repos/users.repository';
import { EmailThreadsRepository } from './repos/email-threads.repository';
import { EscalationsRepository } from './repos/escalations.repository';
import { ApprovalQueueRepository } from './repos/approval-queue.repository';
import { AiAssistantEmailSignatureRepository } from './repos/ai-assistant-email-signature.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    EmailsRepository,
    UserStoreConnectionsRepository,
    EmailThreadsRepository,
    AuditRepository,
    AgentsRepository,
    MetricsRepository,
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
    AiAssistantEmailSignatureRepository,
  ],
  exports: [
    EmailsRepository,
    UserStoreConnectionsRepository,
    EmailThreadsRepository,
    AuditRepository,
    AgentsRepository,
    MetricsRepository,
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
    AiAssistantEmailSignatureRepository,
  ],
})
export class RepositoriesModule {}
