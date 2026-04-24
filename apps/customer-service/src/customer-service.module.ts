import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CustomerService } from './customer.service.js';
import { CustomerKafkaController } from './customer.controller.js';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'customer-service-client',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: 'customer-service-client-consumer' },
        },
      },
    ]),
  ],
  controllers: [CustomerKafkaController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerServiceModule {}
