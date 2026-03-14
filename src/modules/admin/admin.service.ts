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
    //  Strict Validation
    if (dto.status === 'rejected' && (!dto.reject_reason || dto.reject_reason.trim() === '')) {
      throw new BadRequestException('A rejection reason must be provided when rejecting a KYC application.');
    }

    // Check if document exists and retrieve the provider_id
    const { data: document, error: fetchError } = await this.supabase
      .from('provider_documents')
      .select('document_id, provider_id, status')
      .eq('document_id', documentId)
      .single();

    if (fetchError || !document) {
      throw new NotFoundException(`Document with ID ${documentId} not found`);
    }

    const providerId = document.provider_id;

    // Update provider_documents status
    const docUpdatePayload: any = {
      status: dto.status,
      reject_reason: dto.status === 'rejected' ? dto.reject_reason : null,
      reviewed_at: new Date().toISOString(),
    };

    // Include admin ID 
    if (dto.admin_id) {
      docUpdatePayload.reviewed_by = dto.admin_id;
    }

    const { data: updatedDoc, error: updateError } = await this.supabase
      .from('provider_documents')
      .update(docUpdatePayload)
      .eq('document_id', documentId)
      .select()
      .single();

    if (updateError) {
      throw new BadRequestException(`Failed to update document status: ${updateError.message}`);
    }

    // Update provider_profiles verification status
    const { error: profileError } = await this.supabase
      .from('provider_profiles')
      .update({ verification_status: dto.status })
      .eq('user_id', providerId);

    if (profileError) {
      console.error(`Error updating provider profile for ${providerId}:`, profileError);
      // Don't throw, just log 
    }

    // 5. Update users table account_status 
    const userStatus = dto.status === 'approved' ? 'active' : 'rejected';
    
    const { error: userError } = await this.supabase
      .from('users')
      .update({ status: userStatus })
      .eq('id', providerId);

    if (userError) {
      console.error(`Error updating user status for ${providerId}:`, userError);
      // Don't throw, just log
    }

    return {
      status: 'success',
      message: `Document ${dto.status} successfully`,
      data: {
        document_id: updatedDoc.document_id,
        provider_id: updatedDoc.provider_id,
        new_status: updatedDoc.status,
        reviewed_at: updatedDoc.reviewed_at
      }
    };
  }
}