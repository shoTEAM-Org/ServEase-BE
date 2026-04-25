import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { BOOKING_PATTERNS } from '@app/common';
import { BookingService } from './booking.service.js';

@Controller()
export class BookingKafkaController {
  constructor(
    @Inject(BookingService) private readonly bookingService: BookingService,
  ) {}

  @MessagePattern(BOOKING_PATTERNS.CREATE)
  async createBooking(@Payload() data: any) {
    try {
      return await this.bookingService.createBooking(data, data.customerId);
    } catch (error: any) {
      console.error('[booking-service.create-booking] failed', {
        customerId: data?.customerId,
        providerId: data?.provider_id,
        serviceId: data?.service_id,
        scheduledAt: data?.scheduled_at,
        totalAmount: data?.total_amount,
        message: error?.message,
        details: error?.response || error,
      });
      throw error;
    }
  }

  @MessagePattern(BOOKING_PATTERNS.GET_CUSTOMER_BOOKINGS)
  async getCustomerBookings(@Payload() data: any) {
    return this.bookingService.getCustomerBookings(data.customerId);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_PROVIDER_BOOKINGS)
  async getProviderBookings(@Payload() data: any) {
    return this.bookingService.getProviderBookings(data.providerId);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_PROVIDER_BOOKING_BY_ID)
  async getProviderBookingById(@Payload() data: any) {
    return this.bookingService.getProviderBookingById(
      data.bookingId,
      data.providerId,
    );
  }

  @MessagePattern(BOOKING_PATTERNS.GET_CHAT_BOOKINGS)
  async getChatBookings(@Payload() data: any) {
    return this.bookingService.getChatBookings(data?.userId, data?.role);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_CHAT_BOOKING_CONTEXT)
  async getChatBookingContext(@Payload() data: any) {
    return this.bookingService.getChatBookingContext(data?.bookingId);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_ALL)
  async getAllBookings(@Payload() data: any) {
    return this.bookingService.getAllBookings(data?.page, data?.limit);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_ONGOING)
  async getOngoingBookings(@Payload() data: any) {
    return this.bookingService.getOngoingBookings(data?.limit);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_COUNTS)
  async getBookingCounts(@Payload() data: any) {
    return this.bookingService.getBookingCounts(data?.dimension, data?.ids);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_ANALYTICS)
  async getBookingAnalytics(@Payload() data: any) {
    return this.bookingService.getBookingAnalytics(data?.from, data?.to);
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
    return this.bookingService.getBookingById(
      data.id,
      data.requesterId || data.providerId || data.userId,
    );
  }

  @MessagePattern(BOOKING_PATTERNS.GET_ATTACHMENTS)
  async getAttachments(@Payload() data: any) {
    return this.bookingService.getAttachments(
      data.bookingId,
      data.userId,
      data.accessToken,
    );
  }

  @MessagePattern(BOOKING_PATTERNS.GET_PROVIDER_AVAILABILITY)
  async getProviderAvailability(@Payload() data: any) {
    return this.bookingService.getProviderAvailability(data.userId, data.accessToken);
  }

  @MessagePattern(BOOKING_PATTERNS.SAVE_PROVIDER_AVAILABILITY)
  async saveProviderAvailability(@Payload() data: any) {
    const { userId, accessToken, ...body } = data || {};
    return this.bookingService.saveProviderAvailability(userId, body, accessToken);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_RESERVED_SLOTS)
  async getReservedSlots(@Payload() data: any) {
    return this.bookingService.getReservedSlots(data.providerId, data.date);
  }

  @MessagePattern(BOOKING_PATTERNS.CHECK_PROVIDER_AVAILABILITY)
  async checkAvailability(@Payload() data: any) {
    return this.bookingService.checkAvailability(
      data.providerId,
      data.scheduledAt,
      data.hoursRequired,
    );
  }

  @MessagePattern(BOOKING_PATTERNS.CREATE_ADDITIONAL_CHARGES)
  async createAdditionalCharges(@Payload() data: any) {
    return this.bookingService.createAdditionalCharges(data);
  }

  @MessagePattern(BOOKING_PATTERNS.GET_ADDITIONAL_CHARGES)
  async getAdditionalCharges(@Payload() data: any) {
    return this.bookingService.getAdditionalCharges(
      data.bookingId,
      data.providerId,
    );
  }

  @MessagePattern(BOOKING_PATTERNS.REVIEW_ADDITIONAL_CHARGES)
  async reviewAdditionalCharges(@Payload() data: any) {
    return this.bookingService.reviewAdditionalCharges(data);
  }

  @MessagePattern(BOOKING_PATTERNS.UPDATE_STATUS)
  async updateStatus(@Payload() data: any) {
    return this.bookingService.updateStatus(
      data.id,
      data.status,
      data.providerId,
    );
  }

  @MessagePattern(BOOKING_PATTERNS.CANCEL)
  async cancelBooking(@Payload() data: any) {
    return this.bookingService.cancelBooking(
      data.id,
      data.userId,
      data.reason,
      data.explanation,
    );
  }

  @MessagePattern(BOOKING_PATTERNS.SAVE_ATTACHMENTS)
  async saveAttachments(@Payload() data: any) {
    return this.bookingService.saveAttachments(
      data.bookingId,
      data.attachments,
      data.userId,
      data.accessToken,
    );
  }

  @EventPattern(BOOKING_PATTERNS.CREATE_DISPUTE)
  async createDispute(@Payload() data: any) {
    return this.bookingService.createDispute(
      data.bookingId,
      data.userId,
      data.reason,
    );
  }
}
