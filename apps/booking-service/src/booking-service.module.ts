import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '@app/database';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SupabaseModule],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingServiceModule {}
