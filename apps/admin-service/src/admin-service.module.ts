import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AdminService } from './admin.service.js';
import { AdminKafkaController } from './admin.controller.js';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'admin-service-client',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: 'admin-service-client-consumer' },
        },
      },
    ]),
  ],
  controllers: [AdminKafkaController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminServiceModule {}
