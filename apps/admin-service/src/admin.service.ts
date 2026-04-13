import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AdminService {
  constructor(private readonly supabase: SupabaseClient) {}

  async updateDocumentStatus(documentId: string, dto: any) {
    if (
      dto.status === 'rejected' &&
      (!dto.reject_reason || dto.reject_reason.trim() === '')
    ) {
      throw new BadRequestException(
        'A rejection reason must be provided when rejecting a KYC application.',
      );
    }

    const { data: document, error: fetchError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .select('document_id, provider_id, status')
      .eq('document_id', documentId)
      .single();
    if (fetchError || !document)
      throw new NotFoundException(
        `Document with ID ${documentId} not found`,
      );

    const providerId = document.provider_id;
    const docUpdatePayload: any = {
      status: dto.status,
      reject_reason:
        dto.status === 'rejected' ? dto.reject_reason : null,
      reviewed_at: new Date().toISOString(),
    };
    if (dto.admin_id) docUpdatePayload.reviewed_by = dto.admin_id;

    const { data: updatedDoc, error: updateError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .update(docUpdatePayload)
      .eq('document_id', documentId)
      .select()
      .single();
    if (updateError)
      throw new BadRequestException(
        `Failed to update document status: ${updateError.message}`,
      );

    const { error: profileError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .update({ verification_status: dto.status })
      .eq('user_id', providerId);
    if (profileError)
      console.error(
        `Error updating provider profile for ${providerId}:`,
        profileError,
      );

    const userStatus = dto.status === 'approved' ? 'active' : 'rejected';
    const { error: userError } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .update({ status: userStatus })
      .eq('id', providerId);
    if (userError)
      console.error(
        `Error updating user status for ${providerId}:`,
        userError,
      );

    return {
      status: 'success',
      message: `Document ${dto.status} successfully`,
      data: {
        document_id: updatedDoc.document_id,
        provider_id: updatedDoc.provider_id,
        new_status: updatedDoc.status,
        reviewed_at: updatedDoc.reviewed_at,
      },
    };
  }

  // === USER MANAGEMENT ===

  async getCustomers(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('id, full_name, email, contact_number, status, created_at', { count: 'exact' })
      .eq('role', 'customer')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return { customers: data || [], total: count || 0, page, limit };
  }

  async getCustomerById(id: string) {
    const { data: user, error } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('id, full_name, email, contact_number, status, created_at')
      .eq('id', id)
      .eq('role', 'customer')
      .single();
    if (error) throw new NotFoundException(`Customer ${id} not found`);

    const { data: profile } = await this.supabase
      .schema('identity_and_user')
      .from('customer_profiles')
      .select('*')
      .eq('user_id', id)
      .single();

    const { count: bookingCount } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', id);

    return { user, profile: profile || null, booking_count: bookingCount || 0 };
  }

  async updateCustomerStatus(id: string, status: string) {
    const { error } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .update({ status })
      .eq('id', id)
      .eq('role', 'customer');
    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }

  async getReviews(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('trust_and_reputation')
      .from('reviews')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return { reviews: data || [], total: count || 0, page, limit };
  }

  async deleteReview(id: string) {
    const { error } = await this.supabase
      .schema('trust_and_reputation')
      .from('reviews')
      .delete()
      .eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true };
  }

  // === ACCOUNT ===

  async getAdminProfile(userId: string) {
    const { data, error } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('id, full_name, email, contact_number, status, created_at')
      .eq('id', userId)
      .eq('role', 'admin')
      .single();
    if (error) throw new NotFoundException('Admin profile not found');
    return { profile: data };
  }

  async updateAdminProfile(userId: string, updates: Record<string, any>) {
    const allowed = ['full_name', 'contact_number'];
    const filtered: Record<string, any> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }
    const { error } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .update(filtered)
      .eq('id', userId)
      .eq('role', 'admin');
    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true };
  }
}
