import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmailPipelineService } from '../src/modules/email-pipeline/email-pipeline.service';
import { EmailEntity } from '../src/database/schema';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const emailService = app.get(EmailPipelineService);

  const testEmail = {
    id: '8afd84aa-da96-47a2-9a75-49b64896b069',
    messageId: '19b273c5e73c7141',
    threadId: '8cb1cfd3-da74-4c49-95de-21c0aa790675',
    userId: '9d1ec857-9115-427b-95ed-e84afe4b3577',
    fromEmail: 'Super StrikeR <superstriker707@gmail.com>',
    toEmail: 'Nabeel Asif <nabeel.asif362@gmail.com>',
    cc: null,
    bcc: null,
    snippet: 'My order id is 23443, can you tell me where is it now ?',
    subject: 'Kindly Inform me about order',
    body: 'My order id is 23443, can you tell me where is it now ?',
    internalDate: null,
    direction: 'incoming',
  } as EmailEntity;

  try {
    await emailService.processEmail(testEmail);
  } catch (err) {
    console.error(err);
  } finally {
    await app.close();
  }
}

bootstrap();
