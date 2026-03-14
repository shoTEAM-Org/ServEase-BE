import { Controller, Patch, Param, Body } from '@nestjs/common';
import { AdminService } from './admin.service';
import { UpdateDocumentStatusDto } from './dto/update-document-status.dto';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}


  @Patch('v2/documents/status/:id')
  async updateDocumentStatus(
    @Param('id') documentId: string,
    @Body() dto: UpdateDocumentStatusDto
  ) {
    return this.adminService.updateDocumentStatus(documentId, dto);
  }
}
