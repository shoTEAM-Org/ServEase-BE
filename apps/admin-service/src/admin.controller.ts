import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ADMIN_PATTERNS } from '@app/common';
import { AdminService } from './admin.service';

@Controller()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @MessagePattern(ADMIN_PATTERNS.UPDATE_DOCUMENT_STATUS)
  async updateDocumentStatus(@Payload() data: { documentId: string; dto: any }) {
    return this.adminService.updateDocumentStatus(data.documentId, data.dto);
  }
}
