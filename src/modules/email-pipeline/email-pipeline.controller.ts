import { Controller, Get } from '@nestjs/common';
import { EmailPipelineService } from './email-pipeline.service';
import { EmailEntity } from '../../database/schema';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('email-pipeline')
export class EmailPipelineController {
  constructor(private readonly emailPipelineService: EmailPipelineService) {}

  @Get('test')
  testEmailPipeline() {
    const testEmail = {
      id: '8afd84aa-da96-47a2-9a75-49b64896b069',
      messageId: '19b273c5e73c7141',
      threadId: '8cb1cfd3-da74-4c49-95de-21c0aa790675',
      userId: '9d1ec857-9115-427b-95ed-e84afe4b3577',
      fromEmail: 'Super StrikeR <superstriker707@gmail.com>',
      toEmail: 'Nabeel Asif <nabeel.asif362@gmail.com>',
      cc: null,
      bcc: null,
      snippet: 'My order id is 23627, can you tell me where is it now ?',
      // snippet: 'Where is my order now ?',
      body: 'My order id is 23627, can you tell me where is it now ?',
      // body: 'Where is my order now ?',
      subject: 'Kindly Inform me about order',
      internalDate: null,
      direction: 'incoming',
    } as EmailEntity;

    return this.emailPipelineService.processEmail(testEmail);
  }

  @Get('workflow')
  async getWorkflowState() {
    return await this.emailPipelineService.getWorkflowState(
      'workflow-thread-8cb1cfd3-da74-4c49-95de-21c0aa790675',
    );
  }
}
