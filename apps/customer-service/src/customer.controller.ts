import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CUSTOMER_PATTERNS } from '@app/common';
import { CustomerService } from './customer.service.js';

@Controller()
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @MessagePattern(CUSTOMER_PATTERNS.GET_DASHBOARD)
  async getDashboard(@Payload() data: { customerId: string }) {
    return this.customerService.getDashboardData(data.customerId);
  }
}
