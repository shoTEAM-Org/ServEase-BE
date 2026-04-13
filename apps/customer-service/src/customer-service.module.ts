import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { CustomerService } from './customer.service.js';
import { CustomerKafkaController } from './customer.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [CustomerKafkaController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerServiceModule {}
