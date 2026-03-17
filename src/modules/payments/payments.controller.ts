import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { EarningsDto } from './dto/earnings.dto';

@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  
  @Post('v1/create')
  async createPayment(@Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentsService.createPayment(createPaymentDto);
  }

 
  @Get('v1/earnings/:provider_id')
  async getEarnings(@Param('provider_id') providerId: string):
    Promise<EarningsDto> {
    return this.paymentsService.getEarnings(providerId);
  }
}