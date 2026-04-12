import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request, Inject, OnModuleInit, HttpCode } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { PAYMENT_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/payments')
@UseGuards(SupabaseAuthGuard)
export class PaymentController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [PAYMENT_PATTERNS.CREATE, PAYMENT_PATTERNS.GET_EARNINGS, PAYMENT_PATTERNS.GET_BY_BOOKING, PAYMENT_PATTERNS.GET_PROVIDER_HISTORY, PAYMENT_PATTERNS.GET_EARNINGS_SUMMARY, PAYMENT_PATTERNS.ENSURE_BOOKING_PAYMENT]
      .forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  @Post('v1/create')
  async create(@Body() dto: any) { return lastValueFrom(this.kafka.send(PAYMENT_PATTERNS.CREATE, dto)); }

  @Get('v1/earnings/:provider_id')
  async getEarnings(@Param('provider_id') providerId: string) { return lastValueFrom(this.kafka.send(PAYMENT_PATTERNS.GET_EARNINGS, { providerId })); }

  @Get('v1/booking/:bookingId')
  async getByBooking(@Param('bookingId') bookingId: string) { return lastValueFrom(this.kafka.send(PAYMENT_PATTERNS.GET_BY_BOOKING, { bookingId })); }

  @Get('v1/provider/history')
  async getProviderHistory(@Request() req: any) { return lastValueFrom(this.kafka.send(PAYMENT_PATTERNS.GET_PROVIDER_HISTORY, { providerId: req['user'].id })); }

  @Get('v1/provider/earnings-summary')
  async getEarningsSummary(@Request() req: any) { return lastValueFrom(this.kafka.send(PAYMENT_PATTERNS.GET_EARNINGS_SUMMARY, { providerId: req['user'].id })); }

  @Post('v1/booking/ensure')
  async ensurePayment(@Body() body: any) { return lastValueFrom(this.kafka.send(PAYMENT_PATTERNS.ENSURE_BOOKING_PAYMENT, body)); }

  @Patch('v1/booking/mark-paid') @HttpCode(202)
  async markPaid(@Body() body: any) { this.kafka.emit(PAYMENT_PATTERNS.MARK_PAID, body); return { status: 'accepted' }; }

  @Patch('v1/booking/:bookingId/cancel') @HttpCode(202)
  async cancelPayment(@Param('bookingId') bookingId: string) { this.kafka.emit(PAYMENT_PATTERNS.CANCEL_BOOKING_PAYMENT, { bookingId }); return { status: 'accepted' }; }

  @Patch('v1/booking/:bookingId/amount') @HttpCode(202)
  async updateAmount(@Param('bookingId') bookingId: string, @Body() body: { amount: number }) { this.kafka.emit(PAYMENT_PATTERNS.UPDATE_AMOUNT, { bookingId, amount: body.amount }); return { status: 'accepted' }; }
}
