import { Controller, Patch, Param, Body, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { UpdateDocumentStatusDto, ADMIN_PATTERNS } from '@app/common';

@Controller('api/admin')
export class AdminController implements OnModuleInit {
  constructor(@Inject('ADMIN_SERVICE') private readonly adminClient: ClientKafka) {}

  async onModuleInit() {
    this.adminClient.subscribeToResponseOf(ADMIN_PATTERNS.UPDATE_DOCUMENT_STATUS);
    await this.adminClient.connect();
  }

  @Patch('v2/documents/status/:id')
  async updateDocumentStatus(@Param('id') documentId: string, @Body() dto: UpdateDocumentStatusDto) {
    return lastValueFrom(this.adminClient.send(ADMIN_PATTERNS.UPDATE_DOCUMENT_STATUS, { documentId, dto }));
  }
}
