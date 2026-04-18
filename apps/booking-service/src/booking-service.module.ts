import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SupabaseModule } from '@app/database';
import { BookingService } from './booking.service.js';
import { BookingKafkaController } from './booking.controller.js';

@Module({
  imports: [
    SupabaseModule,
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'booking-service-client',
            brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
          },
          consumer: { groupId: 'booking-service-client-consumer' },
        },
      },
    ]),
  ],
  controllers: [BookingKafkaController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingServiceModule {}
