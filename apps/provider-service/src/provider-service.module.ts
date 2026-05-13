import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { ProviderService } from './provider.service.js';
import { ProviderKafkaController } from './provider.controller.js';

const providerClientInstanceId = `${process.pid}-${Date.now()}`;

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: `provider-service-client-${providerClientInstanceId}`,
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: {
            groupId: `provider-service-client-consumer-${providerClientInstanceId}`,
          },
        },
      },
    ]),
  ],
  controllers: [ProviderKafkaController],
  providers: [ProviderService],
  exports: [ProviderService],
})
export class ProviderServiceModule {}
