import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { BookingService } from './booking.service.js';
import { BookingKafkaController } from './booking.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [BookingKafkaController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingServiceModule {}
