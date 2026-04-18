import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { ServicesService } from './services.service.js';
import { ReferenceService } from './reference.service.js';
import { LocationsService } from './locations.service.js';
import { CatalogKafkaController } from './catalog.controller.js';

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'catalog-service-client',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: 'catalog-service-client-consumer' },
        },
      },
    ]),
  ],
  controllers: [CatalogKafkaController],
  providers: [ServicesService, ReferenceService, LocationsService],
  exports: [ServicesService, ReferenceService, LocationsService],
})
export class CatalogServiceModule {}
