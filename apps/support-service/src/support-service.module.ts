import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { SupportService } from './support.service.js';
import { SupportKafkaController } from './support.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [SupportKafkaController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportServiceModule {}
