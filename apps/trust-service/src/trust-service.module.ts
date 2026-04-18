import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { TrustService } from './trust.service.js';
import { TrustKafkaController } from './trust.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [TrustKafkaController],
  providers: [TrustService],
  exports: [TrustService],
})
export class TrustServiceModule {}

