import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '@app/database';
import { CatalogController } from './catalog.controller';
import { ServicesService } from './services.service';
import { ReferenceService } from './reference.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SupabaseModule],
  controllers: [CatalogController],
  providers: [ServicesService, ReferenceService],
})
export class CatalogServiceModule {}
