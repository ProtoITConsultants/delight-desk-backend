import { createHash } from 'crypto';
import { lookup } from 'dns/promises';
import type { LookupAddress } from 'dns';
import { isIP } from 'net';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductKnowledgeSourcesRepository } from '../../database/repos/product-knowledge-sources.repository';
import { ProductKnowledgeChunksRepository } from '../../database/repos/product-knowledge-chunks.repository';
import { ProductKnowledgeEmbeddingsRepository } from '../../database/repos/product-knowledge-embeddings.repository';
import {
  IngestManualProductKnowledgeDto,
  IngestUrlProductKnowledgeDto,
  ListProductKnowledgeSourcesDto,
} from './dto/product-knowledge.dto';
import { OpenAIService } from '../openai/openai.service';
import { ProductKnowledgeRetrievalService } from './product-knowledge-retrieval.service';

type ProcessedChunk = {
  chunkIndex: number;
  content: string;
  tokenCount: number;
};

type UrlExtractionDiagnostics = {
  extractionMode: 'playwright_cheerio';
  finalUrl: string;
  totalTextLength: number;
  sectionCount: number;
  jsonLdItems: number;
  sample: string;
};

@Injectable()
export class ProductKnowledgeService {
  private readonly embeddingModel = 'text-embedding-3-small';
  private readonly maxIngestedCharacters = 100000;

  constructor(
    private readonly sourcesRepository: ProductKnowledgeSourcesRepository,
    private readonly chunksRepository: ProductKnowledgeChunksRepository,
    private readonly embeddingsRepository: ProductKnowledgeEmbeddingsRepository,
    private readonly openaiService: OpenAIService,
    private readonly retrievalService: ProductKnowledgeRetrievalService,
  ) {}

  async ingestManualSource(userId: string, dto: IngestManualProductKnowledgeDto) {
    const title = dto.title.trim();
    const normalizedText = this.normalizeText(dto.content);
    if (!normalizedText) {
      throw new BadRequestException('No readable content found to ingest');
    }
    if (normalizedText.length > this.maxIngestedCharacters) {
      throw new BadRequestException(
        `Input content is too large. Maximum allowed size is ${this.maxIngestedCharacters} characters.`,
      );
    }

    const contentHash = this.hashContent(normalizedText);
    const existingSource = await this.sourcesRepository.findByUserAndHash(userId, contentHash);
    if (existingSource) {
      return {
        sourceId: existingSource.id,
        status: existingSource.status,
        deduplicated: true,
        chunkCount: 0,
      };
    }

    const source = await this.sourcesRepository.create({
      userId,
      sourceType: 'manual',
      title,
      sourceUrl: null,
      contentHash,
      status: 'processing',
      metadata: {
        normalizedCharacterCount: normalizedText.length,
        queuedAt: new Date().toISOString(),
        ingestMode: 'async',
      },
    });

    this.queueIngestionTask(async () => {
      await this.processSourceContent({
        userId,
        sourceId: source.id,
        sourceType: 'manual',
        title,
        sourceUrl: null,
        normalizedText,
        contentHash,
      });
    });

    return {
      sourceId: source.id,
      status: 'processing',
      deduplicated: false,
      chunkCount: 0,
      queued: true,
    };
  }

  async ingestUrlSource(userId: string, dto: IngestUrlProductKnowledgeDto) {
    const parsedUrl = this.parseAndValidateUrl(dto.url);
    await this.assertHostnameResolvesToPublicAddress(parsedUrl.hostname);
    const requestedTitle = dto.title?.trim() || parsedUrl.hostname;
    const existingUrlSource = await this.sourcesRepository.findLatestByUserAndSourceUrl(
      userId,
      parsedUrl.href,
    );

    const source =
      existingUrlSource ??
      (await this.sourcesRepository.create({
        userId,
        sourceType: 'url',
        title: requestedTitle,
        sourceUrl: parsedUrl.href,
        // Temporary hash for queued URL jobs, replaced after extraction.
        contentHash: this.hashContent(`${parsedUrl.href}:queued:${Date.now()}`),
        status: 'processing',
        metadata: {
          queuedAt: new Date().toISOString(),
          ingestMode: 'async',
          queueType: 'url',
        },
      }));

    if (existingUrlSource) {
      await this.sourcesRepository.updateForReingestion({
        userId,
        sourceId: existingUrlSource.id,
        title: requestedTitle,
        sourceUrl: parsedUrl.href,
        contentHash: existingUrlSource.contentHash,
        metadata: {
          ...(existingUrlSource.metadata as Record<string, unknown>),
          queuedAt: new Date().toISOString(),
          ingestMode: 'async',
          queueType: 'url',
        },
      });
    }

    this.queueIngestionTask(async () => {
      await this.processUrlSourceInBackground({
        userId,
        sourceId: source.id,
        sourceUrl: parsedUrl.href,
        requestedTitle,
        fallbackTitle: parsedUrl.hostname,
      });
    });

    return {
      sourceId: source.id,
      status: 'processing',
      deduplicated: false,
      chunkCount: 0,
      queued: true,
      reingesting: Boolean(existingUrlSource),
    };
  }

  async listSources(userId: string, query: ListProductKnowledgeSourcesDto) {
    return this.sourcesRepository.listByUser(userId, query.status);
  }

  async deleteSource(userId: string, sourceId: string) {
    const source = await this.sourcesRepository.findById(userId, sourceId);
    if (!source) {
      throw new NotFoundException('Product knowledge source not found');
    }

    await this.sourcesRepository.deleteById(userId, sourceId);
    return { deleted: true, sourceId };
  }

  async retrieveForQuery(params: {
    userId: string;
    query: string;
    topK?: number;
    minSimilarity?: number;
    maxTokens?: number;
  }) {
    return this.retrievalService.retrieve(params);
  }

  private async processSourceContent(params: {
    userId: string;
    sourceId: string;
    sourceType: 'manual' | 'url';
    title: string;
    sourceUrl: string | null;
    normalizedText: string;
    contentHash: string;
    ingestionMetadata?: Record<string, unknown>;
    skipIfSameHash?: boolean;
  }) {
    try {
      const source = await this.sourcesRepository.findById(params.userId, params.sourceId);
      if (!source) {
        return;
      }

      if (params.skipIfSameHash && source.contentHash === params.contentHash && source.status !== 'failed') {
        await this.sourcesRepository.updateStatus(params.userId, params.sourceId, 'ready', {
          normalizedCharacterCount: params.normalizedText.length,
          ...(params.ingestionMetadata ?? {}),
          unchanged: true,
        });
        return;
      }

      if (params.sourceType === 'url' && params.sourceUrl) {
        await this.sourcesRepository.updateForReingestion({
          userId: params.userId,
          sourceId: params.sourceId,
          title: params.title,
          sourceUrl: params.sourceUrl,
          contentHash: params.contentHash,
          metadata: {
            normalizedCharacterCount: params.normalizedText.length,
            ...(params.ingestionMetadata ?? {}),
          },
        });
      }

      await this.chunksRepository.deleteBySourceId(params.userId, params.sourceId);
      const chunks = this.chunkText(params.normalizedText);
      const insertedChunks = await this.chunksRepository.createMany(
        chunks.map((chunk) => ({
          sourceId: params.sourceId,
          userId: params.userId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          metadata: {
            title: params.title,
            sourceType: params.sourceType,
          },
        })),
      );

      const embeddings = await this.generateEmbeddings(chunks.map((chunk) => chunk.content));

      await this.embeddingsRepository.createMany(
        insertedChunks.map((chunk, index) => ({
          chunkId: chunk.id,
          userId: params.userId,
          embeddingModel: this.embeddingModel,
          embeddingDimensions: embeddings[index]?.length ?? 1536,
          embedding: embeddings[index],
        })),
      );

      await this.sourcesRepository.updateStatus(params.userId, params.sourceId, 'ready', {
        normalizedCharacterCount: params.normalizedText.length,
        chunkCount: insertedChunks.length,
        ...(params.ingestionMetadata ?? {}),
      });
    } catch (error: any) {
      await this.sourcesRepository.updateStatus(params.userId, params.sourceId, 'failed', {
        error: error?.message || 'Unknown ingestion error',
        ...(params.ingestionMetadata ?? {}),
      });
    }
  }

  private async processUrlSourceInBackground(params: {
    userId: string;
    sourceId: string;
    sourceUrl: string;
    requestedTitle: string;
    fallbackTitle: string;
  }) {
    try {
      const { textContent, pageTitle, diagnostics } = await this.fetchRenderedUrlTextContent(
        params.sourceUrl,
      );
      const normalizedText = this.normalizeText(textContent);
      if (!normalizedText) {
        throw new BadRequestException('No readable content found to ingest');
      }
      if (normalizedText.length > this.maxIngestedCharacters) {
        throw new BadRequestException(
          `Input content is too large. Maximum allowed size is ${this.maxIngestedCharacters} characters.`,
        );
      }

      const finalTitle = params.requestedTitle || pageTitle || params.fallbackTitle;
      const contentHash = this.hashContent(normalizedText);
      await this.processSourceContent({
        userId: params.userId,
        sourceId: params.sourceId,
        sourceType: 'url',
        title: finalTitle,
        sourceUrl: params.sourceUrl,
        normalizedText,
        contentHash,
        ingestionMetadata: diagnostics,
        skipIfSameHash: true,
      });
    } catch (error: any) {
      await this.sourcesRepository.updateStatus(params.userId, params.sourceId, 'failed', {
        error: error?.message || 'Unknown ingestion error',
      });
    }
  }

  private queueIngestionTask(task: () => Promise<void>): void {
    setImmediate(() => {
      void task().catch(() => undefined);
    });
  }

  private chunkText(text: string): ProcessedChunk[] {
    const words = text.split(/\s+/).filter(Boolean);
    const chunkSize = 350;
    const overlap = 50;
    const chunks: ProcessedChunk[] = [];

    if (words.length === 0) return chunks;

    let start = 0;
    let chunkIndex = 0;
    while (start < words.length) {
      const end = Math.min(words.length, start + chunkSize);
      const chunkWords = words.slice(start, end);
      const chunkContent = chunkWords.join(' ').trim();

      if (chunkContent.length > 0) {
        chunks.push({
          chunkIndex,
          content: chunkContent,
          tokenCount: this.estimateTokens(chunkContent),
        });
        chunkIndex += 1;
      }

      if (end >= words.length) break;
      start = end - overlap;
    }

    return chunks;
  }

  private estimateTokens(content: string): number {
    const words = content.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words * 1.3));
  }

  private normalizeText(input: string): string {
    return input
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private async generateEmbeddings(contents: string[]): Promise<number[][]> {
    if (contents.length === 0) return [];

    const response = await this.openaiService.createEmbeddings(contents, this.embeddingModel);
    return response.data.map((entry) => entry.embedding);
  }

  private parseAndValidateUrl(url: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL provided');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Only HTTP and HTTPS URLs are supported');
    }

    if (parsed.port && !['80', '443'].includes(parsed.port)) {
      throw new BadRequestException('Only standard HTTP/HTTPS ports are allowed');
    }

    if (this.isLocalOrSpecialUseHostname(parsed.hostname)) {
      throw new BadRequestException(
        'URL points to a private or local network host and is not allowed',
      );
    }

    return parsed;
  }

  private async fetchRenderedUrlTextContent(url: string): Promise<{
    textContent: string;
    pageTitle?: string;
    diagnostics: UrlExtractionDiagnostics;
  }> {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

    try {
      const requestHostPolicyCache = new Map<string, boolean>();
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: 'DelightDeskKnowledgeBot/1.0',
      });

      await context.route('**/*', async (route) => {
        const resourceType = route.request().resourceType();
        const requestUrl = route.request().url();

        if (!(await this.isAllowedCrawlUrl(requestUrl, requestHostPolicyCache))) {
          return route.abort();
        }

        if (resourceType === 'image' || resourceType === 'font' || resourceType === 'media') {
          return route.abort();
        }
        return route.continue();
      });

      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(1200);

      const html = await page.content();
      const finalUrl = page.url();
      const finalParsedUrl = this.parseAndValidateUrl(finalUrl);
      await this.assertHostnameResolvesToPublicAddress(finalParsedUrl.hostname);
      const extraction = this.extractStructuredContent(html);

      if (!extraction.textContent) {
        throw new BadRequestException('No readable content found on the provided URL');
      }

      return {
        textContent: extraction.textContent,
        pageTitle: extraction.pageTitle,
        diagnostics: {
          extractionMode: 'playwright_cheerio',
          finalUrl,
          totalTextLength: extraction.textContent.length,
          sectionCount: extraction.sectionCount,
          jsonLdItems: extraction.jsonLdItems,
          sample: extraction.textContent.slice(0, 300),
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const message = String((error as Error)?.message || '');

      if (message.includes('Executable doesn\'t exist')) {
        throw new BadRequestException(
          'Playwright Chromium is not installed on the server. Run: npx playwright install chromium',
        );
      }

      if (message.toLowerCase().includes('timeout')) {
        throw new BadRequestException(
          'Timed out while rendering the provided URL. The page may be slow or protected by bot checks.',
        );
      }

      if (message.includes('net::ERR_')) {
        throw new BadRequestException(
          'Unable to access the provided URL from the server environment.',
        );
      }

      throw new BadRequestException('Unable to render and parse the provided URL');
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private async isAllowedCrawlUrl(url: string, cache: Map<string, boolean>): Promise<boolean> {
    let parsed: URL;

    try {
      parsed = new URL(url);
    } catch {
      return false;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    const hostKey = parsed.hostname.toLowerCase();
    const cached = cache.get(hostKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      await this.assertHostnameResolvesToPublicAddress(parsed.hostname);
      cache.set(hostKey, true);
      return true;
    } catch {
      cache.set(hostKey, false);
      return false;
    }
  }

  /** SSRF / DNS-rebind mitigation: resolved addresses must all be public (non-RFC1918, etc.). */
  private async assertHostnameResolvesToPublicAddress(hostname: string): Promise<void> {
    if (this.isLocalOrSpecialUseHostname(hostname)) {
      throw new BadRequestException(
        'URL points to a private or local network host and is not allowed',
      );
    }

    const resolved: LookupAddress[] = await lookup(hostname, { all: true }).catch(() => []);

    if (!Array.isArray(resolved) || resolved.length === 0) {
      throw new BadRequestException('Unable to resolve URL hostname');
    }

    const hasOnlyPublicAddresses = resolved.every((entry) => !this.isPrivateOrSpecialUseIp(entry.address));
    if (!hasOnlyPublicAddresses) {
      throw new BadRequestException(
        'URL points to a private or local network host and is not allowed',
      );
    }
  }

  private isLocalOrSpecialUseHostname(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase();

    if (!normalized) return true;
    if (normalized === 'localhost') return true;
    if (normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;

    const ipVersion = isIP(normalized);
    if (ipVersion > 0) {
      return this.isPrivateOrSpecialUseIp(normalized);
    }

    return false;
  }

  private isPrivateOrSpecialUseIp(address: string): boolean {
    const ipVersion = isIP(address);
    if (ipVersion === 4) {
      const [a, b] = address.split('.').map((part) => Number(part));

      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a >= 224) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      if (a === 198 && (b === 18 || b === 19)) return true;
      return false;
    }

    if (ipVersion === 6) {
      const normalized = address.toLowerCase();
      if (normalized === '::1') return true;
      if (normalized === '::') return true;
      if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
      if (normalized.startsWith('fe80')) return true;
      if (normalized.startsWith('::ffff:127.')) return true;
      return false;
    }

    return true;
  }

  private extractStructuredContent(html: string): {
    textContent: string;
    pageTitle?: string;
    sectionCount: number;
    jsonLdItems: number;
  } {
    const $ = cheerio.load(html);
    $('script, style, noscript, template').remove();

    const pageTitle = this.normalizeText($('head title').first().text()) || undefined;
    const sections: string[] = [];

    const pushSection = (label: string, text: string) => {
      const normalized = this.normalizeText(text);
      if (normalized.length < 20) return;
      sections.push(`${label}\n${normalized}`);
    };

    // Parse JSON-LD for Product and FAQ metadata.
    let jsonLdItems = 0;
    $('script[type="application/ld+json"]').each((_, el) => {
      const rawJson = $(el).text();
      if (!rawJson) return;

      try {
        const parsed = JSON.parse(rawJson);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          const normalizedItem = item?.['@graph'] ? item['@graph'] : item;
          const entries = Array.isArray(normalizedItem) ? normalizedItem : [normalizedItem];
          for (const entry of entries) {
            const type = entry?.['@type'];
            if (type === 'FAQPage' && Array.isArray(entry.mainEntity)) {
              jsonLdItems += 1;
              for (const faq of entry.mainEntity) {
                const question = faq?.name;
                const answer =
                  faq?.acceptedAnswer?.text || faq?.acceptedAnswer?.['@value'] || faq?.acceptedAnswer;
                if (question && answer) {
                  pushSection(`FAQ: ${question}`, String(answer));
                }
              }
            } else if (
              type === 'Product' ||
              (Array.isArray(type) && type.some((t) => t === 'Product'))
            ) {
              jsonLdItems += 1;
              const productSummary = [
                `Name: ${entry?.name ?? ''}`,
                `Description: ${entry?.description ?? ''}`,
                `Brand: ${entry?.brand?.name ?? entry?.brand ?? ''}`,
                `SKU: ${entry?.sku ?? ''}`,
              ]
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .join('\n');
              if (productSummary) {
                pushSection('Structured Product Data', productSummary);
              }
            }
          }
        }
      } catch {
        // Ignore malformed JSON-LD blocks.
      }
    });

    // Extract specs from tables.
    $('table').each((_, table) => {
      const rows: string[] = [];
      $(table)
        .find('tr')
        .each((__, tr) => {
          const cells = $(tr)
            .find('th,td')
            .map((___, td) => this.normalizeText($(td).text()))
            .get()
            .filter(Boolean);
          if (cells.length >= 2) {
            rows.push(`${cells[0]}: ${cells.slice(1).join(' | ')}`);
          }
        });

      if (rows.length > 0) {
        pushSection('Tabular Specifications', rows.join('\n'));
      }
    });

    // Extract definitions from dl/dt/dd blocks.
    $('dl').each((_, dl) => {
      const entries: string[] = [];
      let currentKey = '';
      $(dl)
        .children()
        .each((__, node) => {
          const tag = (node as any).tagName?.toLowerCase?.() ?? '';
          const value = this.normalizeText($(node).text());
          if (!value) return;
          if (tag === 'dt') {
            currentKey = value;
          } else if (tag === 'dd') {
            entries.push(currentKey ? `${currentKey}: ${value}` : value);
          }
        });
      if (entries.length > 0) {
        pushSection('Definition Specifications', entries.join('\n'));
      }
    });

    // Extract sections under headings.
    $('h1, h2, h3, h4').each((_, heading) => {
      const headingText = this.normalizeText($(heading).text());
      if (!headingText) return;

      const contentParts: string[] = [];
      let sibling = $(heading).next();
      while (sibling.length) {
        const tag = sibling.get(0)?.tagName?.toLowerCase?.() ?? '';
        if (tag && /^h[1-4]$/.test(tag)) break;

        const text = this.normalizeText(sibling.text());
        if (text.length > 0) {
          contentParts.push(text);
        }
        sibling = sibling.next();
      }

      if (contentParts.length > 0) {
        pushSection(`Section: ${headingText}`, contentParts.join('\n'));
      }
    });

    // HTML5 details/summary collapsibles often contain product FAQ/help content.
    $('details').each((_, details) => {
      const summary = this.normalizeText($(details).find('summary').first().text());
      const body = this.normalizeText(
        $(details)
          .clone()
          .find('summary')
          .remove()
          .end()
          .text(),
      );
      if (summary && body) {
        pushSection(`Details: ${summary}`, body);
      }
    });

    // Fallback to main content if no structured blocks were captured.
    if (sections.length === 0) {
      const fallbackText =
        this.normalizeText($('main').text()) || this.normalizeText($('body').text()) || '';
      if (fallbackText) {
        pushSection('Main Content', fallbackText);
      }
    }

    // Deduplicate near-identical sections.
    const uniqueSections: string[] = [];
    const seen = new Set<string>();
    for (const section of sections) {
      const key = section.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueSections.push(section);
    }

    const textContent = this.normalizeText(uniqueSections.join('\n\n'));
    return {
      textContent,
      pageTitle,
      sectionCount: uniqueSections.length,
      jsonLdItems,
    };
  }
}
