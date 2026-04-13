import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { BOOKING_PATTERNS } from '@app/common';
import { BookingService } from './booking.service.js';

@Controller()
export class BookingKafkaController {
  constructor(@Inject(BookingService) private readonly bookingService: BookingService) {}

  @MessagePattern(BOOKING_PATTERNS.CREATE)
  async createBooking(@Payload() data: any) {
    return this.bookingService.createBooking(data, data.customerId);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_CUSTOMER_BOOKINGS)
  async getCustomerBookings(@Payload() data: any) {
    return this.bookingService.getCustomerBookings(data.customerId);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_HISTORY)
  async getHistory() {
    return this.bookingService.getHistory();
  }

  @MessagePattern(BOOKING_PATTERNS.GET_REQUESTS)
  async getRequests() {
    return this.bookingService.getRequests();
  }

  @MessagePattern(BOOKING_PATTERNS.GET_BY_ID)
  async getBookingById(@Payload() data: any) {
    return this.bookingService.getBookingById(data.id);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_ATTACHMENTS)
  async getAttachments(@Payload() data: any) {
    return this.bookingService.getAttachments(data.bookingId);
  }

  @EventPattern(BOOKING_PATTERNS.UPDATE_STATUS)
  async updateStatus(@Payload() data: any) {
    return this.bookingService.updateStatus(data.id, data.status);
  }

  @EventPattern(BOOKING_PATTERNS.CANCEL)
  async cancelBooking(@Payload() data: any) {
    return this.bookingService.cancelBooking(data.id, data.userId, data.reason, data.explanation);
  }

  @EventPattern(BOOKING_PATTERNS.SAVE_ATTACHMENTS)
  async saveAttachments(@Payload() data: any) {
    return this.bookingService.saveAttachments(data.bookingId, data.attachments);
  }

  @EventPattern(BOOKING_PATTERNS.CREATE_DISPUTE)
  async createDispute(@Payload() data: any) {
    return this.bookingService.createDispute(data.bookingId, data.userId, data.reason);
  }
}
