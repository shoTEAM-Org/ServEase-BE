import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { PaymentService } from './payments.service.js';
import { PaymentKafkaController } from './payment.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [PaymentKafkaController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentServiceModule {}
