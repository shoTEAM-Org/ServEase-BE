import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { AdminService } from './admin.service.js';
import { AdminKafkaController } from './admin.controller.js';

const adminClientInstanceId = `${process.pid}-${Date.now()}`;

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: `admin-service-client-${adminClientInstanceId}`,
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: `admin-service-client-consumer-${adminClientInstanceId}` },
        },
      },
    ]),
  ],
  controllers: [AdminKafkaController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminServiceModule {}
