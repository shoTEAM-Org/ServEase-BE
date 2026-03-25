import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BOOKING_PATTERNS } from '@app/common';
import { BookingService } from './booking.service.js';

@Controller()
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @MessagePattern(BOOKING_PATTERNS.CREATE)
  async createBooking(@Payload() data: { dto: any; customerId: string }) {
    return this.bookingService.createBooking(data.dto, data.customerId);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_HISTORY)
  async getHistory() {
    return this.bookingService.getHistory();
  }

  @MessagePattern(BOOKING_PATTERNS.GET_REQUESTS)
  async getRequests() {
    return this.bookingService.getRequests();
  }

  @MessagePattern(BOOKING_PATTERNS.UPDATE_STATUS)
  async updateStatus(@Payload() data: { id: string; status: string }) {
    return this.bookingService.updateStatus(data.id, data.status);
  }
}
