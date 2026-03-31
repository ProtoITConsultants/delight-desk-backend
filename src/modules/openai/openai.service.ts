import OpenAI from 'openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenAIService {
  private readonly openai: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  async createChatCompletion(messages: any, temperature: number, response_format?: any) {
    return await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature,
      response_format,
    });
  }

  async createEmbeddings(input: string | string[], model = 'text-embedding-3-small') {
    return await this.openai.embeddings.create({
      model,
      input,
    });
  }
}
