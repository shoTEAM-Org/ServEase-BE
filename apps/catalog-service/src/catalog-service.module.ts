import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { ServicesService } from './services.service.js';
import { ReferenceService } from './reference.service.js';
import { LocationsService } from './locations.service.js';
import { CatalogKafkaController } from './catalog.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [CatalogKafkaController],
  providers: [ServicesService, ReferenceService, LocationsService],
  exports: [ServicesService, ReferenceService, LocationsService],
})
export class CatalogServiceModule {}
