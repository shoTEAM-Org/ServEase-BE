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

  @MessagePattern(PAYMENT_PATTERNS.GET_ADMIN_TRANSACTIONS)
  async getAdminTransactions(@Payload() data: any) {
    return this.paymentService.getAdminTransactions(data?.page, data?.limit);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_ADMIN_EARNINGS)
  async getAdminEarnings(@Payload() data: any) {
    return this.paymentService.getAdminProviderEarnings(data?.page, data?.limit);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_ADMIN_PAYOUTS)
  async getAdminPayouts(@Payload() data: any) {
    return this.paymentService.getAdminPayouts(data?.page, data?.limit);
  }

  @MessagePattern(PAYMENT_PATTERNS.UPDATE_ADMIN_PAYOUT)
  async updateAdminPayout(@Payload() data: any) {
    return this.paymentService.updateAdminPayout(data?.id, data?.status);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_ADMIN_REFUNDS)
  async getAdminRefunds(@Payload() data: any) {
    return this.paymentService.getAdminRefunds(data?.page, data?.limit);
  }

  @MessagePattern(PAYMENT_PATTERNS.MARK_ADMIN_REFUND)
  async markAdminRefund(@Payload() data: any) {
    return this.paymentService.markAdminRefund(
      data?.id,
      data?.status,
      data?.reject_reason,
    );
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_ADMIN_FAILED_PAYMENTS)
  async getAdminFailedPayments(@Payload() data: any) {
    return this.paymentService.getAdminFailedPayments(data?.page, data?.limit);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_REVENUE_REPORT)
  async getRevenueReport(@Payload() data: any) {
    return this.paymentService.getRevenueReport(data?.from, data?.to);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_FINANCIAL_REPORT)
  async getFinancialReport(@Payload() data: any) {
    return this.paymentService.getFinancialReport(data?.from, data?.to);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_COMMISSION)
  async getCommission(@Payload() data: any) {
    return this.paymentService.getCommission();
  }

  @MessagePattern(PAYMENT_PATTERNS.UPDATE_COMMISSION)
  async updateCommission(@Payload() data: any) {
    return this.paymentService.updateCommission(data);
  }
  
  @MessagePattern(PAYMENT_PATTERNS.ENSURE_BOOKING_PAYMENT)
  async ensureBookingPayment(@Payload() data: any) {
    try {
      return await this.paymentService.ensureBookingPayment(data);
    } catch (error: any) {
      console.error('[payment-service.ensure-booking] failed', {
        bookingId: data?.bookingId,
        customerId: data?.customerId,
        providerId: data?.provider_id,
        amount: data?.amount,
        method: data?.method,
        message: error?.message,
        details: error?.response || error,
      });
      throw error;
    }
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
