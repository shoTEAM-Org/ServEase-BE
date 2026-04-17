import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { CUSTOMER_PATTERNS } from '@app/common';
import { CustomerService } from './customer.service.js';

@Controller()
export class CustomerKafkaController {
  constructor(@Inject(CustomerService) private readonly customerService: CustomerService) {}

  @MessagePattern(CUSTOMER_PATTERNS.GET_DASHBOARD)
  async getDashboardData(@Payload() data: any) {
    return this.customerService.getDashboardData(data.customerId);
  }

  @MessagePattern(CUSTOMER_PATTERNS.GET_PROFILE)
  async getProfile(@Payload() data: any) {
    return this.customerService.getProfile(data.userId);
  }

  @EventPattern(CUSTOMER_PATTERNS.UPDATE_PROFILE)
  async updateProfile(@Payload() data: any) {
    const { userId, ...updates } = data || {};
    return this.customerService.updateProfile(userId, updates);
  }
}
