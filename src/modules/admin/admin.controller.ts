import { Controller, Put, Param, Body } from '@nestjs/common';
import { AdminService } from './admin.service';
import { UpdateDocumentStatusDto } from './dto/update-document-status.dto';

// SCRUM-55: Admin Document Approval/Rejection Endpoints
// Developer: alex cadaoas
@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * PUT /api/admin/documents/:id/status
   * Allows admin to approve or reject provider KYC documents
   * 
   * Body:
   * {
   *   "status": "approved" | "rejected",
   *   "remarks": "optional rejection reason"
   * }
   */
  @Put('documents/:id/status')
  async updateDocumentStatus(
    @Param('id') documentId: string,
    @Body() dto: UpdateDocumentStatusDto
  ) {
    return this.adminService.updateDocumentStatus(documentId, dto);
  }
}
