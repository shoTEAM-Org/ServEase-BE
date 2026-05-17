import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { PaymentService } from './payments.service.js';
import { PaymentKafkaController } from './payment.controller.js';

const paymentClientInstanceId = `${process.pid}-${Date.now()}`;

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: `payment-service-client-${paymentClientInstanceId}`,
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: `payment-service-client-consumer-${paymentClientInstanceId}` },
        },
      },
    ]),
  ],
  controllers: [PaymentKafkaController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentServiceModule {}
