import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { PaymentService } from './payments.service.js';
import { PaymentKafkaController } from './payment.controller.js';

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'payment-service-client',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: 'payment-service-client-consumer' },
        },
      },
    ]),
  ],
  controllers: [PaymentKafkaController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentServiceModule {}
