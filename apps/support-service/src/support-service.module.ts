import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { SupportService } from './support.service.js';
import { SupportKafkaController } from './support.controller.js';

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'support-service-client',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: 'support-service-client-consumer' },
        },
      },
    ]),
  ],
  controllers: [SupportKafkaController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportServiceModule {}
