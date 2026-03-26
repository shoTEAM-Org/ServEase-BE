import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PAYMENT_PATTERNS } from '@app/common';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @MessagePattern(PAYMENT_PATTERNS.CREATE)
  async createPayment(@Payload() dto: any) {
    return this.paymentsService.createPayment(dto);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_EARNINGS)
  async getEarnings(@Payload() data: { providerId: string }) {
    return this.paymentsService.getEarnings(data.providerId);
  }
}
