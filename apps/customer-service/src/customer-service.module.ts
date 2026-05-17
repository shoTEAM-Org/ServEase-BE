import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CustomerService } from './customer.service.js';
import { CustomerKafkaController } from './customer.controller.js';

const customerClientInstanceId = `${process.pid}-${Date.now()}`;

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: `customer-service-client-${customerClientInstanceId}`,
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: `customer-service-client-consumer-${customerClientInstanceId}` },
        },
      },
    ]),
  ],
  controllers: [CustomerKafkaController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerServiceModule {}
