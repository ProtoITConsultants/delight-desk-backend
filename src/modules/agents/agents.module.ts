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

@Module({
  imports: [DatabaseModule, OpenAIModule, RepositoriesModule, WooCommerceModule, AftershipModule],
  controllers: [AgentsController],
  providers: [AgentsService, RateLimitGuard, RateLimitInterceptor],
  exports: [AgentsService],
})
export class AgentsModule {}
