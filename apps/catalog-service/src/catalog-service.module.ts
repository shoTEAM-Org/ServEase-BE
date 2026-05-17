import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { ServicesService } from './services.service.js';
import { ReferenceService } from './reference.service.js';
import { LocationsService } from './locations.service.js';
import { CatalogKafkaController } from './catalog.controller.js';

const catalogClientInstanceId = `${process.pid}-${Date.now()}`;

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: `catalog-service-client-${catalogClientInstanceId}`,
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: `catalog-service-client-consumer-${catalogClientInstanceId}` },
        },
      },
    ]),
  ],
  controllers: [CatalogKafkaController],
  providers: [ServicesService, ReferenceService, LocationsService],
  exports: [ServicesService, ReferenceService, LocationsService],
})
export class CatalogServiceModule {}
