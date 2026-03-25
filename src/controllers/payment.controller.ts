import { Controller, Post, Get, Param, Body, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { CreatePaymentDto, PAYMENT_PATTERNS } from '@app/common';

@Controller('api/payments')
export class PaymentController implements OnModuleInit {
  constructor(@Inject('PAYMENT_SERVICE') private readonly paymentClient: ClientKafka) {}

  async onModuleInit() {
    this.paymentClient.subscribeToResponseOf(PAYMENT_PATTERNS.CREATE);
    this.paymentClient.subscribeToResponseOf(PAYMENT_PATTERNS.GET_EARNINGS);
    await this.paymentClient.connect();
  }

  @Post('v1/create')
  async createPayment(@Body() dto: CreatePaymentDto) {
    return lastValueFrom(this.paymentClient.send(PAYMENT_PATTERNS.CREATE, dto));
  }

  @Get('v1/earnings/:provider_id')
  async getEarnings(@Param('provider_id') providerId: string) {
    return lastValueFrom(this.paymentClient.send(PAYMENT_PATTERNS.GET_EARNINGS, { providerId }));
  }
}
