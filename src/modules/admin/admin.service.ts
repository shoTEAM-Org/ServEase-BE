import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { UpdateDocumentStatusDto } from './dto/update-document-status.dto';

// SCRUM-55: Admin KYC Document Approval/Rejection System
// Developer: alex cadaoas
// Purpose: Approve or reject provider KYC documents

@Injectable()
export class AdminService {
  constructor(private readonly supabase: SupabaseClient) {}

  async updateDocumentStatus(documentId: string, dto: UpdateDocumentStatusDto) {
    // Check if document exists
    const { data: document, error: fetchError } = await this.supabase
      .from('provider_documents')
      .select('document_id, provider_id, status')
      .eq('document_id', documentId)
      .single();

    if (fetchError || !document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    // Update document status
    const { data: updatedDoc, error: updateError } = await this.supabase
      .from('provider_documents')
      .update({
        status: dto.status,
        remarks: dto.remarks || null,
        updated_at: new Date()
      })
      .eq('document_id', documentId)
      .select()
      .single();

    if (updateError) {
      throw new BadRequestException(`Failed to update document status: ${updateError.message}`);
    }

    // If approved, update provider verification status
    if (dto.status === 'approved') {
      const { error: profileError } = await this.supabase
        .from('provider_profiles')
        .update({ verification_status: 'approved' })
        .eq('user_id', document.provider_id);

      if (profileError) {
        console.error('Error updating provider profile:', profileError);
        // Don't throw, just log - document transition is more critical
      }
    }

    return {
      status: 'success',
      message: `Document ${dto.status} successfully`,
      data: {
        document_id: updatedDoc.document_id,
        provider_id: updatedDoc.provider_id,
        new_status: updatedDoc.status,
        updated_at: updatedDoc.updated_at
      }
    };
  }
}
