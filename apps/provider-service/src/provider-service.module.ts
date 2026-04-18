import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { ProviderService } from './provider.service.js';
import { ProviderKafkaController } from './provider.controller.js';

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'provider-service-client',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: 'provider-service-client-consumer' },
        },
      },
    ]),
  ],
  controllers: [ProviderKafkaController],
  providers: [ProviderService],
  exports: [ProviderService],
})
export class ProviderServiceModule {}
