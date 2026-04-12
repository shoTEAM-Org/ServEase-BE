import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { ProviderService } from './provider.service.js';
import { ProviderKafkaController } from './provider.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [ProviderKafkaController],
  providers: [ProviderService],
  exports: [ProviderService],
})
export class ProviderServiceModule {}
