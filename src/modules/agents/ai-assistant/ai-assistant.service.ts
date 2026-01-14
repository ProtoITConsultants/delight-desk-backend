import { Injectable } from '@nestjs/common';
import { EscalationsRepository } from '../../../database/repos/escalations.repository';

@Injectable()
export class AiAssistantService {
  constructor(private readonly escalationsRepository: EscalationsRepository) {}

  createEscalation(data: any) {
    this.escalationsRepository.createEscalation(data);
  }

  async getAllEscalationsForUserId(userId: string) {
    return await this.escalationsRepository.getAllEscalationsForUserId(userId);
  }
}
