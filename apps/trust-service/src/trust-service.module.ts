import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { TrustService } from './trust.service.js';
import { TrustKafkaController } from './trust.controller.js';

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'trust-service-client',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: 'trust-service-client-consumer' },
        },
      },
    ]),
  ],
  controllers: [TrustKafkaController],
  providers: [TrustService],
  exports: [TrustService],
})
export class TrustServiceModule {}

