import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { EmailService } from './email.service.js';
import { EmailKafkaController } from './email.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [EmailKafkaController],
  providers: [EmailService],
})
export class EmailServiceModule {}
