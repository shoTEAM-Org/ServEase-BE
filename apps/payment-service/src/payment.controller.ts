import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { PAYMENT_PATTERNS } from '@app/common';
import { PaymentService } from './payments.service.js';

@Controller()
export class PaymentKafkaController {
  constructor(@Inject(PaymentService) private readonly paymentService: PaymentService) {}

  @MessagePattern(PAYMENT_PATTERNS.CREATE)
  async createPayment(@Payload() data: any) {
    return this.paymentService.createPayment(data);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_EARNINGS)
  async getEarnings(@Payload() data: any) {
    return this.paymentService.getEarnings(data.providerId);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_BY_BOOKING)
  async getPaymentByBookingId(@Payload() data: any) {
    return this.paymentService.getPaymentByBookingId(data.bookingId);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_PROVIDER_HISTORY)
  async getProviderPaymentHistory(@Payload() data: any) {
    return this.paymentService.getProviderPaymentHistory(data.providerId);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_EARNINGS_SUMMARY)
  async getProviderEarningsSummary(@Payload() data: any) {
    return this.paymentService.getProviderEarningsSummary(data.providerId);
  }

  @MessagePattern(PAYMENT_PATTERNS.ENSURE_BOOKING_PAYMENT)
  async ensureBookingPayment(@Payload() data: any) {
    return this.paymentService.ensureBookingPayment(data);
  }

  @EventPattern(PAYMENT_PATTERNS.MARK_PAID)
  async markBookingPaymentPaid(@Payload() data: any) {
    return this.paymentService.markBookingPaymentPaid(data);
  }

  @EventPattern(PAYMENT_PATTERNS.CANCEL_BOOKING_PAYMENT)
  async cancelBookingPayment(@Payload() data: any) {
    return this.paymentService.cancelBookingPayment(data.bookingId);
  }

  @EventPattern(PAYMENT_PATTERNS.UPDATE_AMOUNT)
  async updateBookingPaymentAmount(@Payload() data: any) {
    return this.paymentService.updateBookingPaymentAmount(data.bookingId, data.amount);
  }
}
