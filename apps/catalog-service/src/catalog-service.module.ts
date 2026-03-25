import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '@app/database';
import { CatalogController } from './catalog.controller.js';
import { ServicesService } from './services.service.js';
import { ReferenceService } from './reference.service.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SupabaseModule],
  controllers: [CatalogController],
  providers: [ServicesService, ReferenceService],
})
export class CatalogServiceModule {}
