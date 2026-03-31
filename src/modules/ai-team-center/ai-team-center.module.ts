import { Module } from '@nestjs/common';
import { AiIdentityController } from './ai-identity.controller';
import { AiIdentityService } from './ai-identity.service';
import { AiIdentityRepository } from '../../database/repos/ai-identity.repository';
import { OpenAIModule } from '../openai/openai.module';
import { DatabaseModule } from '../../database/database.module';
import { ProductKnowledgeController } from './product-knowledge.controller';
import { ProductKnowledgeService } from './product-knowledge.service';
import { ProductKnowledgeRetrievalService } from './product-knowledge-retrieval.service';
import { ProductKnowledgeSourcesRepository } from '../../database/repos/product-knowledge-sources.repository';
import { ProductKnowledgeChunksRepository } from '../../database/repos/product-knowledge-chunks.repository';
import { ProductKnowledgeEmbeddingsRepository } from '../../database/repos/product-knowledge-embeddings.repository';

@Module({
  imports: [DatabaseModule, OpenAIModule],
  controllers: [AiIdentityController, ProductKnowledgeController],
  providers: [
    AiIdentityService,
    AiIdentityRepository,
    ProductKnowledgeService,
    ProductKnowledgeRetrievalService,
    ProductKnowledgeSourcesRepository,
    ProductKnowledgeChunksRepository,
    ProductKnowledgeEmbeddingsRepository,
  ],
  exports: [AiIdentityService, AiIdentityRepository, ProductKnowledgeService],
})
export class AiTeamCenterModule {}
