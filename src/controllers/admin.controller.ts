import { Controller, Patch, Param, Body, UseGuards, Inject, HttpCode } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { ADMIN_PATTERNS, UpdateDocumentStatusDto } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/admin')
@UseGuards(SupabaseAuthGuard)
export class AdminController {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  @Patch('v2/documents/status/:id') @HttpCode(202)
  updateDocumentStatus(@Param('id') id: string, @Body() dto: UpdateDocumentStatusDto) {
    this.kafka.emit(ADMIN_PATTERNS.UPDATE_DOCUMENT_STATUS, { documentId: id, ...dto });
    return { status: 'accepted' };
  }
}
