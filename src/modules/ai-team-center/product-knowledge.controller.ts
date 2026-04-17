import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { SessionGuard } from '../../guards/session.guard';
import { CurrentUserId } from '../../decorators/current-user.decorator';
import { ProductKnowledgeService } from './product-knowledge.service';
import {
  IngestManualProductKnowledgeDto,
  IngestUrlProductKnowledgeDto,
  ListProductKnowledgeSourcesDto,
  RetrieveProductKnowledgeDto,
} from './dto/product-knowledge.dto';

@UseGuards(SessionGuard)
@Controller('ai-team-center/product-knowledge')
export class ProductKnowledgeController {
  constructor(private readonly productKnowledgeService: ProductKnowledgeService) {}

  @Post('manual')
  @HttpCode(202)
  ingestManual(@CurrentUserId() userId: string, @Body() dto: IngestManualProductKnowledgeDto) {
    return this.productKnowledgeService.ingestManualSource(userId, dto);
  }

  @Post('url')
  @HttpCode(202)
  ingestUrl(@CurrentUserId() userId: string, @Body() dto: IngestUrlProductKnowledgeDto) {
    return this.productKnowledgeService.ingestUrlSource(userId, dto);
  }

  @Get()
  listSources(@CurrentUserId() userId: string, @Query() query: ListProductKnowledgeSourcesDto) {
    return this.productKnowledgeService.listSources(userId, query);
  }

  @Delete(':id')
  deleteSource(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.productKnowledgeService.deleteSource(userId, id);
  }

  @Post('retrieve')
  retrieve(@CurrentUserId() userId: string, @Body() dto: RetrieveProductKnowledgeDto) {
    return this.productKnowledgeService.retrieveForQuery({
      userId,
      query: dto.query,
      topK: dto.topK,
      minSimilarity: dto.minSimilarity,
      maxTokens: dto.maxTokens,
    });
  }
}
