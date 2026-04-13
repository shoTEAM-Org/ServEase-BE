import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { SUPPORT_PATTERNS } from '@app/common';
import { SupportService } from './support.service.js';

@Controller()
export class SupportKafkaController {
  constructor(@Inject(SupportService) private readonly supportService: SupportService) {}

  @EventPattern(SUPPORT_PATTERNS.CREATE_TICKET)
  async createTicket(@Payload() data: any) {
    return this.supportService.createTicket(data.userId, data);
  }
}
