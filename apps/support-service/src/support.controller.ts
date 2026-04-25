import { Controller, Inject } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { SUPPORT_PATTERNS } from '@app/common';
import { SupportService } from './support.service.js';

@Controller()
export class SupportKafkaController {
  constructor(@Inject(SupportService) private readonly supportService: SupportService) {}

  @EventPattern(SUPPORT_PATTERNS.CREATE_TICKET)
  async createTicket(@Payload() data: any) {
    return this.supportService.createTicket(data.userId, data);
  }

  @MessagePattern(SUPPORT_PATTERNS.CREATE_DISPUTE)
  async createDispute(@Payload() data: any) {
    return this.supportService.createDispute(
      data.bookingId,
      data.userId,
      data.reason,
      data.description,
    );
  }

  @MessagePattern(SUPPORT_PATTERNS.GET_DISPUTES)
  async getDisputes(@Payload() data: any) {
    return this.supportService.getDisputes(data?.page, data?.limit, data?.status);
  }

  @MessagePattern(SUPPORT_PATTERNS.UPDATE_DISPUTE_STATUS)
  async updateDisputeStatus(@Payload() data: any) {
    return this.supportService.updateDisputeStatus(data?.id, data?.status);
  }

  @MessagePattern(SUPPORT_PATTERNS.GET_SUPPORT_TICKETS)
  async getSupportTickets(@Payload() data: any) {
    return this.supportService.getSupportTickets(data?.page, data?.limit);
  }

  @MessagePattern(SUPPORT_PATTERNS.UPDATE_SUPPORT_TICKET)
  async updateSupportTicket(@Payload() data: any) {
    return this.supportService.updateSupportTicket(data?.id, data?.status);
  }

  @MessagePattern(SUPPORT_PATTERNS.GET_COMPLIANCE_REPORT)
  async getComplianceReport(@Payload() data: any) {
    return this.supportService.getComplianceReport(data?.from, data?.to);
  }

  @MessagePattern(SUPPORT_PATTERNS.SEND_BROADCAST)
  async sendBroadcast(@Payload() data: any) {
    return this.supportService.sendBroadcast(data);
  }
}
