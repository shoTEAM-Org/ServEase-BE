import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '@app/database';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SupabaseModule],
  controllers: [CustomerController],
  providers: [CustomerService],
})
export class CustomerServiceModule {}
