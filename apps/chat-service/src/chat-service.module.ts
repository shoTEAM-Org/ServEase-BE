import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { ChatService } from './chat.service.js';
import { ChatKafkaController } from './chat.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [ChatKafkaController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatServiceModule {}
