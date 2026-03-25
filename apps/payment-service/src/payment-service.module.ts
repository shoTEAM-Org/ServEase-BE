import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '@app/database';
import { PaymentController } from './payment.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SupabaseModule],
  controllers: [PaymentController],
  providers: [PaymentsService],
})
export class PaymentServiceModule {}
