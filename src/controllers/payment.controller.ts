import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Inject,
  OnModuleInit,
  HttpCode,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { sendWithTimeout } from '../utils/kafka-request.js';
import { PAYMENT_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';
import { AdminRoleGuard } from '../guards/admin-role.guard.js';

@Controller('api/payments')
@UseGuards(SupabaseAuthGuard)
export class PaymentController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [
      PAYMENT_PATTERNS.CREATE,
      PAYMENT_PATTERNS.GET_EARNINGS,
      PAYMENT_PATTERNS.GET_BY_BOOKING,
      PAYMENT_PATTERNS.GET_PROVIDER_HISTORY,
      PAYMENT_PATTERNS.GET_EARNINGS_SUMMARY,
      PAYMENT_PATTERNS.ENSURE_BOOKING_PAYMENT,
      PAYMENT_PATTERNS.MARK_PAID,
      PAYMENT_PATTERNS.CANCEL_BOOKING_PAYMENT,
      PAYMENT_PATTERNS.UPDATE_AMOUNT,
    ].forEach((p) => this.kafka.subscribeToResponseOf(p));
  }

  @Post('v1/create')
  @UseGuards(AdminRoleGuard)
  async create(@Body() dto: any) {
    return sendWithTimeout(this.kafka.send(PAYMENT_PATTERNS.CREATE, dto));
  }

  @Get('v1/earnings/:provider_id')
  @UseGuards(AdminRoleGuard)
  async getEarnings(@Param('provider_id') providerId: string) {
    return sendWithTimeout(
      this.kafka.send(PAYMENT_PATTERNS.GET_EARNINGS, { providerId }),
    );
  }

  @Get('v1/booking/:bookingId')
  async getByBooking(
    @Param('bookingId') bookingId: string,
    @Request() req: any,
  ) {
    return sendWithTimeout(
      this.kafka.send(PAYMENT_PATTERNS.GET_BY_BOOKING, {
        bookingId,
        requesterId: req['user'].id,
      }),
    );
  }

  @Get('v1/provider/history')
  async getProviderHistory(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PAYMENT_PATTERNS.GET_PROVIDER_HISTORY, {
        providerId: req['user'].id,
      }),
    );
  }

  @Get('v1/provider/earnings-summary')
  async getEarningsSummary(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PAYMENT_PATTERNS.GET_EARNINGS_SUMMARY, {
        providerId: req['user'].id,
      }),
    );
  }

  @Post('v1/booking/ensure')
  async ensurePayment(@Request() req: any, @Body() body: any) {
    try {
      return await sendWithTimeout(
        this.kafka.send(PAYMENT_PATTERNS.ENSURE_BOOKING_PAYMENT, {
          ...body,
          customerId: req['user'].id,
        }),
      );
    } catch (error: any) {
      console.error('[gateway.payments.ensure] failed', {
        bookingId: body?.bookingId,
        customerId: body?.customerId,
        providerId: body?.provider_id,
        amount: body?.amount,
        method: body?.method,
        message: error?.message,
        details: error?.response || error,
      });
      throw error;
    }
  }

  @Patch('v1/booking/mark-paid')
  @HttpCode(202)
  async markPaid(@Request() req: any, @Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(PAYMENT_PATTERNS.MARK_PAID, {
        ...body,
        requesterId: req['user'].id,
        requesterRole: req['user'].role,
      }),
    );
  }

  @Patch('v1/booking/:bookingId/cancel')
  @UseGuards(AdminRoleGuard)
  @HttpCode(202)
  async cancelPayment(@Param('bookingId') bookingId: string) {
    return sendWithTimeout(
      this.kafka.send(PAYMENT_PATTERNS.CANCEL_BOOKING_PAYMENT, { bookingId }),
    );
  }

  @Patch('v1/booking/:bookingId/amount')
  @UseGuards(AdminRoleGuard)
  @HttpCode(202)
  async updateAmount(
    @Param('bookingId') bookingId: string,
    @Body() body: { amount: number },
  ) {
    return sendWithTimeout(
      this.kafka.send(PAYMENT_PATTERNS.UPDATE_AMOUNT, {
        bookingId,
        amount: body.amount,
      }),
    );
  }
}
