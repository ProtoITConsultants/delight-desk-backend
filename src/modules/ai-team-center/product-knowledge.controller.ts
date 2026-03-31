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
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SessionGuard } from '../../guards/session.guard';
import { CurrentUserId } from '../../decorators/current-user.decorator';
import { ProductKnowledgeService } from './product-knowledge.service';
import {
  IngestManualProductKnowledgeDto,
  IngestUrlProductKnowledgeDto,
  ListProductKnowledgeSourcesDto,
  RetrieveProductKnowledgeDto,
} from './dto/product-knowledge.dto';

@ApiTags('AI Team Center - Product Knowledge')
@ApiCookieAuth('connect.sid')
@UseGuards(SessionGuard)
@Controller('ai-team-center/product-knowledge')
export class ProductKnowledgeController {
  constructor(private readonly productKnowledgeService: ProductKnowledgeService) {}

  @Post('manual')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Ingest manual product knowledge',
    description:
      'Ingest title/content provided manually and build searchable vector knowledge chunks.',
  })
  @ApiBody({ type: IngestManualProductKnowledgeDto })
  @ApiResponse({ status: 202, description: 'Manual ingestion accepted and queued for processing' })
  @ApiResponse({ status: 400, description: 'Invalid payload or content too large' })
  ingestManual(@CurrentUserId() userId: string, @Body() dto: IngestManualProductKnowledgeDto) {
    return this.productKnowledgeService.ingestManualSource(userId, dto);
  }

  @Post('url')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Ingest product knowledge from URL',
    description: 'Fetch and ingest a single webpage URL into product knowledge storage.',
  })
  @ApiBody({ type: IngestUrlProductKnowledgeDto })
  @ApiResponse({ status: 202, description: 'URL ingestion accepted and queued for processing' })
  @ApiResponse({ status: 400, description: 'Invalid URL or URL content could not be fetched' })
  ingestUrl(@CurrentUserId() userId: string, @Body() dto: IngestUrlProductKnowledgeDto) {
    return this.productKnowledgeService.ingestUrlSource(userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List product knowledge sources',
    description: 'List all ingested product knowledge sources for the current user.',
  })
  @ApiResponse({ status: 200, description: 'Knowledge sources fetched successfully' })
  listSources(@CurrentUserId() userId: string, @Query() query: ListProductKnowledgeSourcesDto) {
    return this.productKnowledgeService.listSources(userId, query);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a product knowledge source',
    description: 'Delete a source and all related chunks/embeddings via cascade.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Knowledge source ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Source deleted successfully' })
  @ApiResponse({ status: 404, description: 'Knowledge source not found' })
  deleteSource(@CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.productKnowledgeService.deleteSource(userId, id);
  }

  @Post('retrieve')
  @ApiOperation({
    summary: 'Retrieve relevant product knowledge context',
    description:
      'Runs vector similarity retrieval for a query and returns top context chunks constrained by token budget.',
  })
  @ApiBody({ type: RetrieveProductKnowledgeDto })
  @ApiResponse({ status: 200, description: 'Knowledge retrieved successfully' })
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
