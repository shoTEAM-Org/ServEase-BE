import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '@app/database';
import { PaymentController } from './payment.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SupabaseModule],
  controllers: [PaymentController],
  providers: [PaymentsService],
})
export class PaymentServiceModule {}
