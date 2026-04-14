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

    const [{ data: profile }, { count: bookingCount }] = await Promise.all([
      this.supabase.schema('identity_and_user').from('customer_profiles').select('*').eq('user_id', id).single(),
      this.supabase.schema('booking').from('bookings').select('*', { count: 'exact', head: true }).eq('customer_id', id),
    ]);

    return { user, profile: profile || null, booking_count: bookingCount || 0 };
  }

  async updateCustomerStatus(id: string, status: string) {
    const { data, error } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .update({ status })
      .eq('id', id)
      .eq('role', 'customer')
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Customer ${id} not found`);
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
    const { data, error } = await this.supabase
      .schema('trust_and_reputation')
      .from('reviews')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw new InternalServerErrorException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Review ${id} not found`);
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

  // === ACCOUNT SETTINGS (STUB) ===

  async getAccountSettings(userId: string) {
    // STUB — table `admin_settings` not yet created
    return {
      settings: {
        language: 'en',
        timezone: 'Asia/Manila',
        theme: 'light',
        email_notifications: true,
        push_notifications: false,
        booking_alerts: true,
        payment_alerts: true,
        dispute_alerts: true,
        data_retention_days: 90,
        updated_at: new Date().toISOString(),
      },
    };
  }

  async updateAccountSettings(_userId: string, _body: Record<string, any>) {
    // STUB — table `admin_settings` not yet created
    return { ok: true };
  }

  async getActivityLog(userId: string, page = 1, limit = 20, _from?: string, _to?: string) {
    // STUB — table `audit_log` not yet created
    return { logs: [], total: 0, page, limit };
  }

  async updateAdminProfile(userId: string, updates: Record<string, any>) {
    const allowed = ['full_name', 'contact_number'];
    const filtered: Record<string, any> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = updates[key];
    }
    if (Object.keys(filtered).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
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

  // === OPERATIONS ===

  async getOngoingServices() {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .in('status', ['confirmed', 'in_progress'])
      .order('scheduled_at', { ascending: true })
      .range(0, 99);
    if (error) throw new InternalServerErrorException(error.message);

    const bookings = await Promise.all((data || []).map(async (b: any) => {
      const { data: provider } = await this.supabase
        .schema('identity_and_user').from('users')
        .select('full_name').eq('id', b.provider_id).single();
      const { data: customer } = await this.supabase
        .schema('identity_and_user').from('users')
        .select('full_name').eq('id', b.customer_id).single();
      return {
        ...b,
        provider_name: provider?.full_name || '',
        customer_name: customer?.full_name || '',
      };
    }));

    return { bookings };
  }

  async getDisputes(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('notification_and_support')
      .from('disputes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return { disputes: data || [], total: count || 0, page, limit };
  }

  async updateDisputeStatus(id: string, status: string) {
    const { data, error } = await this.supabase
      .schema('notification_and_support')
      .from('disputes')
      .update({ status })
      .eq('id', id)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Dispute ${id} not found`);
    return { ok: true };
  }

  async getSupportTickets(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('notification_and_support')
      .from('support_tickets')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return { tickets: data || [], total: count || 0, page, limit };
  }

  async updateSupportTicket(id: string, status: string) {
    const { data, error } = await this.supabase
      .schema('notification_and_support')
      .from('support_tickets')
      .update({ status })
      .eq('id', id)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Support ticket ${id} not found`);
    return { ok: true };
  }

  // === FINANCE ===

  async getProviderEarnings(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('payment')
      .from('payments')
      .select('*', { count: 'exact' })
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return { payments: data || [], total: count || 0, page, limit };
  }

  async getPayouts(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('payment')
      .from('provider_payouts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return { payouts: data || [], total: count || 0, page, limit };
  }

  async updatePayout(id: string, status: string) {
    const { data, error } = await this.supabase
      .schema('payment')
      .from('provider_payouts')
      .update({ status })
      .eq('id', id)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Payout ${id} not found`);
    return { ok: true };
  }

  async getRefunds(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('payment')
      .from('payments')
      .select('*', { count: 'exact' })
      .in('status', ['refunded', 'cancelled'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return { payments: data || [], total: count || 0, page, limit };
  }

  async markRefund(id: string) {
    const { data, error } = await this.supabase
      .schema('payment')
      .from('payments')
      .update({ status: 'refunded' })
      .eq('id', id)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Payment ${id} not found`);
    return { ok: true };
  }

  async getFailedPayments(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('payment')
      .from('payments')
      .select('*', { count: 'exact' })
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return { payments: data || [], total: count || 0, page, limit };
  }

  // === MARKETPLACE ===

  async createCategory(body: any) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .insert([body])
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return { category: data };
  }

  async updateCategory(id: string, body: any) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .update(body)
      .eq('id', id)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Category ${id} not found`);
    return { ok: true };
  }

  async deleteCategory(id: string) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw new InternalServerErrorException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Category ${id} not found`);
    return { ok: true };
  }

  async getAllServicesAdmin(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return { services: data || [], total: count || 0, page, limit };
  }

  async updateService(id: string, body: any) {
    const { provider_id: _provider_id, id: _id, ...updates } = body;
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .update(updates)
      .eq('id', id)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Service ${id} not found`);
    return { ok: true };
  }

  async deleteService(id: string) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw new InternalServerErrorException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Service ${id} not found`);
    return { ok: true };
  }

  async getServiceAreas() {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('location')
      .select('*');
    if (error) throw new InternalServerErrorException(error.message);
    return { areas: data || [] };
  }

  async createServiceArea(body: any) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('location')
      .insert([body])
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return { area: data };
  }

  async updateServiceArea(id: string, body: any) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('location')
      .update(body)
      .eq('id', id)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Service area ${id} not found`);
    return { ok: true };
  }

  async deleteServiceArea(id: string) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('location')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw new InternalServerErrorException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Service area ${id} not found`);
    return { ok: true };
  }

  // === PROMOTIONS (STUB) ===

  async getPromotions(page = 1, limit = 20, _filters?: Record<string, any>) {
    // STUB — table `promotions` not yet created
    return { promotions: [], total: 0, page, limit };
  }

  async createPromotion(_body: Record<string, any>) {
    // STUB — table `promotions` not yet created
    return { promotion: null };
  }

  async updatePromotion(_id: string, _body: Record<string, any>) {
    // STUB — table `promotions` not yet created
    return { ok: true };
  }

  async deletePromotion(_id: string) {
    // STUB — table `promotions` not yet created
    return { ok: true };
  }

  async sendBroadcast(body: {
    user_ids?: string[];
    role?: string;
    title: string;
    message: string;
    type?: string;
  }) {
    let userIds: string[] = body.user_ids || [];

    if (!userIds.length && body.role) {
      const { data: users } = await this.supabase
        .schema('identity_and_user')
        .from('users')
        .select('id')
        .eq('role', body.role);
      userIds = (users || []).map((u: any) => u.id);
    }

    if (!userIds.length) throw new BadRequestException('No target users found');

    const notifications = userIds.map((uid: string) => ({
      user_id: uid,
      title: body.title,
      message: body.message,
      type: body.type || 'broadcast',
      is_read: false,
    }));

    const { error } = await this.supabase
      .schema('notification_and_support')
      .from('notifications')
      .insert(notifications);
    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true, sent_to: userIds.length };
  }

  // === SETTINGS (STUBS) ===

  async getCommission() {
    // STUB — table `platform_config` not yet created
    return {
      default_commission_rate: 0.18,
      category_overrides: [],
    };
  }

  async updateCommission(_body: Record<string, any>) {
    // STUB — table `platform_config` not yet created
    return { ok: true };
  }

  async getRoles(page = 1, limit = 20) {
    // STUB — table `admin_roles` not yet created
    return { roles: [], total: 0, page, limit };
  }

  async createRole(_body: Record<string, any>) {
    // STUB — table `admin_roles` not yet created
    return { role: null };
  }

  async updateRole(_id: string, _body: Record<string, any>) {
    // STUB — table `admin_roles` not yet created
    return { ok: true };
  }

  async deleteRole(_id: string) {
    // STUB — table `admin_roles` not yet created
    return { ok: true };
  }

  async assignRole(_body: Record<string, any>) {
    // STUB — table `admin_role_assignments` not yet created
    return { ok: true };
  }

  async getSecuritySettings() {
    // STUB — table `platform_config` not yet created
    return {
      require_2fa: false,
      session_timeout_minutes: 60,
      ip_whitelist_enabled: false,
      ip_whitelist: [],
    };
  }

  async updateSecuritySettings(_body: Record<string, any>) {
    // STUB — table `platform_config` not yet created
    return { ok: true };
  }

  async getNotificationSettings(page = 1, limit = 20) {
    // STUB — table `notification_config` not yet created
    return { notifications: [], total: 0, page, limit };
  }

  async updateNotificationSetting(_id: string, _body: Record<string, any>) {
    // STUB — table `notification_config` not yet created
    return { ok: true };
  }

  async getAuditLogs(page = 1, limit = 20, _filters?: Record<string, any>) {
    // STUB — table `audit_log` not yet created
    return { logs: [], total: 0, page, limit };
  }

  async getIntegrations() {
    // STUB — table `integrations_config` not yet created
    return { integrations: [] };
  }

  async updateIntegration(_id: string, _body: Record<string, any>) {
    // STUB — table `integrations_config` not yet created
    return { ok: true };
  }

  // === REPORTS ===

  private buildDateFilter(query: any, from?: string, to?: string, column = 'created_at') {
    if (from) query = query.gte(column, from);
    if (to) query = query.lte(column, to);
    return query;
  }

  async getRevenueReport(from?: string, to?: string) {
    let query = this.supabase
      .schema('payment')
      .from('payments')
      .select('amount, status, created_at, provider_id');
    query = this.buildDateFilter(query, from, to);
    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);

    const completed = (data || []).filter((p: any) => p.status === 'completed');
    const total = completed.reduce((acc: number, p: any) => acc + Number(p.amount), 0);
    const platformFees = total * 0.1;
    return {
      total_revenue: total,
      platform_fees: platformFees,
      net_to_providers: total - platformFees,
      transaction_count: completed.length,
    };
  }

  async getBookingAnalytics(from?: string, to?: string) {
    let query = this.supabase
      .schema('booking')
      .from('bookings')
      .select('status, created_at');
    query = this.buildDateFilter(query, from, to);
    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);

    const bookings = data || [];
    const byStatus = bookings.reduce((acc: any, b: any) => {
      acc[b.status] = (acc[b.status] || 0) + 1;
      return acc;
    }, {});
    return { total: bookings.length, by_status: byStatus };
  }

  async getUserReport(from?: string, to?: string) {
    let query = this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('role, status, created_at');
    query = this.buildDateFilter(query, from, to);
    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);

    const users = data || [];
    const byRole = users.reduce((acc: any, u: any) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {});
    const byStatus = users.reduce((acc: any, u: any) => {
      acc[u.status] = (acc[u.status] || 0) + 1;
      return acc;
    }, {});
    return { total: users.length, by_role: byRole, by_status: byStatus };
  }

  async getBusinessReport(from?: string, to?: string) {
    const [revenue, bookings, users] = await Promise.all([
      this.getRevenueReport(from, to),
      this.getBookingAnalytics(from, to),
      this.getUserReport(from, to),
    ]);
    return { revenue, bookings, users };
  }

  async getFinancialReport(from?: string, to?: string) {
    let paymentsQuery = this.supabase
      .schema('payment')
      .from('payments')
      .select('*');
    let payoutsQuery = this.supabase
      .schema('payment')
      .from('provider_payouts')
      .select('*');
    paymentsQuery = this.buildDateFilter(paymentsQuery, from, to);
    payoutsQuery = this.buildDateFilter(payoutsQuery, from, to);

    const [{ data: payments, error: paymentsError }, { data: payouts, error: payoutsError }] = await Promise.all([
      paymentsQuery,
      payoutsQuery,
    ]);
    if (paymentsError) throw new InternalServerErrorException(paymentsError.message);
    if (payoutsError) throw new InternalServerErrorException(payoutsError.message);
    return { payments: payments || [], payouts: payouts || [] };
  }

  async getPerformanceReport(from?: string, to?: string) {
    let query = this.supabase
      .schema('trust_and_reputation')
      .from('reviews')
      .select('reviewee_id, rating, created_at');
    query = this.buildDateFilter(query, from, to);
    const { data: reviews, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);

    const { data: profiles } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('user_id, business_name, average_rating, total_reviews, trust_score, verification_status');

    return { reviews: reviews || [], provider_profiles: profiles || [] };
  }

  async getComplianceReport(from?: string, to?: string) {
    let disputesQuery = this.supabase
      .schema('notification_and_support')
      .from('disputes')
      .select('*');
    let reportsQuery = this.supabase
      .schema('trust_and_reputation')
      .from('provider_profile_reports')
      .select('*');
    disputesQuery = this.buildDateFilter(disputesQuery, from, to);
    reportsQuery = this.buildDateFilter(reportsQuery, from, to);

    const [{ data: disputes, error: disputesError }, { data: reports, error: reportsError }] = await Promise.all([
      disputesQuery,
      reportsQuery,
    ]);
    if (disputesError) throw new InternalServerErrorException(disputesError.message);
    if (reportsError) throw new InternalServerErrorException(reportsError.message);
    return { disputes: disputes || [], provider_reports: reports || [] };
  }
}
