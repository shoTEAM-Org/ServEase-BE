import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '@app/database';
import { ProviderController } from './provider.controller.js';
import { ProviderService } from './provider.service.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SupabaseModule],
  controllers: [ProviderController],
  providers: [ProviderService],
})
export class ProviderServiceModule {}
