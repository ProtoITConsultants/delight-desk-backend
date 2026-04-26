import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { DatabaseModule } from 'src/database/database.module';
import { OpenAIModule } from '../openai/openai.module';
import { RepositoriesModule } from '../../database/repositories.module';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';
import { AftershipModule } from '../aftership/aftership.module';
import { RateLimitGuard } from 'src/guards/rate-limit.guard';
import { RateLimitInterceptor } from 'src/interceptors/rate-limit.interceptor';
import { AiTeamCenterModule } from '../ai-team-center/ai-team-center.module';
import { ProductAgentPreviewService } from './product-agent-preview.service';
import { WooCommerceCouponSyncService } from './woocommerce-coupon-sync.service';
import { ClassificationUtil } from '../temporal/utils/classification.util';
import { MessageFormattingHelper } from '../temporal/activities/shared/message-formatting.helper';

@Module({
  imports: [
    DatabaseModule,
    OpenAIModule,
    RepositoriesModule,
    WooCommerceModule,
    AftershipModule,
    AiTeamCenterModule,
  ],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    ProductAgentPreviewService,
    WooCommerceCouponSyncService,
    ClassificationUtil,
    MessageFormattingHelper,
    RateLimitGuard,
    RateLimitInterceptor,
  ],
  exports: [AgentsService, ProductAgentPreviewService, WooCommerceCouponSyncService],
})
export class AgentsModule {}
