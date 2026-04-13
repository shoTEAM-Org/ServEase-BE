import { Controller, Inject } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ADMIN_PATTERNS } from '@app/common';
import { AdminService } from './admin.service.js';

@Controller()
export class AdminKafkaController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @EventPattern(ADMIN_PATTERNS.UPDATE_DOCUMENT_STATUS)
  async updateDocumentStatus(@Payload() data: any) {
    return this.adminService.updateDocumentStatus(data.documentId, data);
  }
}
