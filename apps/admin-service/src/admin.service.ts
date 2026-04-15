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

    // Query 1: paginated customer list
    const { data, error, count } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('id, full_name, email, contact_number, status, created_at', { count: 'exact' })
      .eq('role', 'customer')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new InternalServerErrorException(error.message);

    const customers = data || [];

    if (customers.length === 0) {
      return { customers: [], total: count || 0, page, limit };
    }

    // Query 2: bulk booking counts for the returned customer IDs
    const ids = customers.map((c) => c.id);
    const { data: bookingRows, error: bookingError } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('customer_id')
      .in('customer_id', ids);

    if (bookingError) throw new InternalServerErrorException(bookingError.message);

    // Build a count map: customer_id → number of bookings
    const countMap: Record<string, number> = {};
    for (const row of bookingRows || []) {
      countMap[row.customer_id] = (countMap[row.customer_id] || 0) + 1;
    }

    // Merge booking_count into each customer
    const enriched = customers.map((c) => ({
      ...c,
      booking_count: countMap[c.id] || 0,
    }));

    return { customers: enriched, total: count || 0, page, limit };
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

  async getProviders(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const { data, error, count } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('id, full_name, email, contact_number, status, created_at', { count: 'exact' })
      .eq('role', 'provider')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new InternalServerErrorException(error.message);

    const providers = data || [];
    if (providers.length === 0) {
      return { providers: [], total: count || 0, page, limit };
    }

    const ids = providers.map((p) => p.id);
    const [{ data: profiles, error: profileError }, { data: bookingRows, error: bookingError }] =
      await Promise.all([
        this.supabase
          .schema('provider_catalog')
          .from('provider_profiles')
          .select('user_id, business_name, average_rating, verification_status')
          .in('user_id', ids),
        this.supabase.schema('booking').from('bookings').select('provider_id').in('provider_id', ids),
      ]);

    if (profileError) throw new InternalServerErrorException(profileError.message);
    if (bookingError) throw new InternalServerErrorException(bookingError.message);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const bookingCountMap: Record<string, number> = {};
    for (const row of bookingRows || []) {
      bookingCountMap[row.provider_id] = (bookingCountMap[row.provider_id] || 0) + 1;
    }

    const enriched = providers.map((provider) => {
      const profile = profileMap.get(provider.id);
      return {
        ...provider,
        business_name: profile?.business_name || provider.full_name,
        average_rating: Number(profile?.average_rating) || 0,
        verification_status: profile?.verification_status || null,
        booking_count: bookingCountMap[provider.id] || 0,
      };
    });

    return { providers: enriched, total: count || 0, page, limit };
  }

  async getProviderById(id: string) {
    const { data: user, error } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('id, full_name, email, contact_number, status, created_at')
      .eq('id', id)
      .eq('role', 'provider')
      .single();
    if (error) throw new NotFoundException(`Provider ${id} not found`);

    const [{ data: profile }, { count: bookingCount }, { data: services }] = await Promise.all([
      this.supabase
        .schema('provider_catalog')
        .from('provider_profiles')
        .select('*')
        .eq('user_id', id)
        .single(),
      this.supabase
        .schema('booking')
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', id),
      this.supabase
        .schema('provider_catalog')
        .from('provider_services')
        .select('id, title, price, category_id, service_location, created_at')
        .eq('provider_id', id)
        .order('created_at', { ascending: false }),
    ]);

    return { user, profile: profile || null, booking_count: bookingCount || 0, services: services || [] };
  }

  async updateProviderStatus(id: string, status: string) {
    const { data, error } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .update({ status })
      .eq('id', id)
      .eq('role', 'provider')
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Provider ${id} not found`);
    return { ok: true };
  }

  async getProviderApplications(page = 1, limit = 20, status = 'pending') {
    const offset = (page - 1) * limit;

    const query = this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select(
        'user_id, business_name, verification_status, created_at, updated_at, service_description',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const normalizedStatus = String(status || 'pending').toLowerCase();
    if (normalizedStatus !== 'all') {
      query.eq('verification_status', normalizedStatus);
    }

    const { data: profiles, error, count } = await query;
    if (error) throw new InternalServerErrorException(error.message);

    const rows = profiles || [];
    if (rows.length === 0) {
      return { applications: [], total: count || 0, page, limit };
    }

    const providerIds = rows.map((r) => r.user_id);
    const [{ data: users, error: usersError }, { data: docs, error: docsError }] = await Promise.all([
      this.supabase
        .schema('identity_and_user')
        .from('users')
        .select('id, full_name, email, contact_number')
        .in('id', providerIds),
      this.supabase
        .schema('provider_catalog')
        .from('provider_documents')
        .select('provider_id, status')
        .in('provider_id', providerIds),
    ]);

    if (usersError) throw new InternalServerErrorException(usersError.message);
    if (docsError) throw new InternalServerErrorException(docsError.message);

    const userMap = new Map((users || []).map((u) => [u.id, u]));
    const docRows = docs || [];

    const applications = rows.map((profile) => {
      const user = userMap.get(profile.user_id);
      const providerDocs = docRows.filter((d) => d.provider_id === profile.user_id);
      const hasRejectedDoc = providerDocs.some((d) => d.status === 'rejected');
      const hasPendingDoc = providerDocs.some((d) => d.status === 'pending');
      const hasApprovedDoc = providerDocs.some((d) => d.status === 'approved');

      const derivedStatus =
        profile.verification_status ||
        (hasRejectedDoc ? 'rejected' : hasPendingDoc ? 'pending' : hasApprovedDoc ? 'approved' : 'pending');

      return {
        applicationId: profile.user_id,
        providerId: profile.user_id,
        businessName: profile.business_name || user?.full_name || 'Unnamed Business',
        ownerName: user?.full_name || 'Unknown Owner',
        category: 'General Services',
        dateApplied: profile.created_at || profile.updated_at,
        location: '—',
        status: derivedStatus,
        email: user?.email || null,
        contact_number: user?.contact_number || null,
      };
    });

    return { applications, total: count || 0, page, limit };
  }

  async getProviderApplicationById(id: string) {
    const [{ data: user, error: userError }, { data: profile, error: profileError }, { data: docs, error: docsError }] =
      await Promise.all([
        this.supabase
          .schema('identity_and_user')
          .from('users')
          .select('id, full_name, email, contact_number, status, created_at')
          .eq('id', id)
          .eq('role', 'provider')
          .single(),
        this.supabase
          .schema('provider_catalog')
          .from('provider_profiles')
          .select('*')
          .eq('user_id', id)
          .single(),
        this.supabase
          .schema('provider_catalog')
          .from('provider_documents')
          .select(
            'document_id, provider_id, document_type, document_file_path, status, reject_reason, uploaded_at, reviewed_at',
          )
          .eq('provider_id', id)
          .order('uploaded_at', { ascending: false }),
      ]);

    if (userError || !user) throw new NotFoundException(`Provider application ${id} not found`);
    if (profileError || !profile) throw new NotFoundException(`Provider application ${id} not found`);
    if (docsError) throw new InternalServerErrorException(docsError.message);

    const documents = (docs || []).map((doc) => ({
      id: doc.document_id,
      name: doc.document_type || 'Document',
      file: doc.document_file_path || '',
      status: doc.status || 'pending',
      reject_reason: doc.reject_reason || null,
      uploaded_at: doc.uploaded_at || null,
      reviewed_at: doc.reviewed_at || null,
    }));

    const status = profile.verification_status || user.status || 'pending';

    return {
      applicationId: profile.user_id,
      providerId: profile.user_id,
      businessName: profile.business_name || user.full_name || 'Unnamed Business',
      ownerName: user.full_name || 'Unknown Owner',
      category: 'General Services',
      dateApplied: profile.created_at || user.created_at,
      location: '—',
      status,
      email: user.email,
      contact_number: user.contact_number,
      profile: {
        service_description: profile.service_description || null,
        verification_status: profile.verification_status || null,
        trust_score: profile.trust_score || null,
        average_rating: profile.average_rating || null,
      },
      documents,
      notes: [],
    };
  }

  async updateProviderApplicationStatus(id: string, status: string, rejectReason?: string) {
    const normalized = String(status || '').toLowerCase();
    if (!['approved', 'rejected', 'pending'].includes(normalized)) {
      throw new BadRequestException('status must be one of: approved, rejected, pending');
    }
    if (normalized === 'rejected' && (!rejectReason || !String(rejectReason).trim())) {
      throw new BadRequestException('reject_reason is required when rejecting an application');
    }

    const { data: docs, error: docsError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .select('document_id')
      .eq('provider_id', id);
    if (docsError) throw new InternalServerErrorException(docsError.message);

    const { error: profileError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .update({ verification_status: normalized })
      .eq('user_id', id);
    if (profileError) throw new BadRequestException(profileError.message);

    const mappedUserStatus = normalized === 'approved' ? 'active' : normalized === 'rejected' ? 'rejected' : 'pending';
    const { error: userError } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .update({ status: mappedUserStatus })
      .eq('id', id)
      .eq('role', 'provider');
    if (userError) throw new BadRequestException(userError.message);

    if ((docs || []).length > 0) {
      const documentIds = docs!.map((d) => d.document_id);
      const { error: docUpdateError } = await this.supabase
        .schema('provider_catalog')
        .from('provider_documents')
        .update({
          status: normalized,
          reject_reason: normalized === 'rejected' ? String(rejectReason).trim() : null,
          reviewed_at: new Date().toISOString(),
        })
        .in('document_id', documentIds);
      if (docUpdateError) throw new BadRequestException(docUpdateError.message);
    }

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

  async getAllBookings(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    const bookings = await Promise.all((data || []).map(async (b: any) => {
      const [{ data: provider }, { data: customer }, { data: service }] = await Promise.all([
        this.supabase
          .schema('identity_and_user')
          .from('users')
          .select('full_name, email')
          .eq('id', b.provider_id)
          .single(),
        this.supabase
          .schema('identity_and_user')
          .from('users')
          .select('full_name, email')
          .eq('id', b.customer_id)
          .single(),
        b.service_id
          ? this.supabase
              .schema('provider_catalog')
              .from('provider_services')
              .select('title, category_id')
              .eq('id', b.service_id)
              .single()
          : Promise.resolve({ data: null }),
      ]);

      return {
        id: b.id,
        booking_id: b.booking_id || b.id,
        status: b.status || 'pending',
        payment_status: b.payment_status || 'pending',
        amount: Number(b.amount || 0),
        scheduled_at: b.scheduled_at || null,
        created_at: b.created_at || null,
        customer_id: b.customer_id || null,
        provider_id: b.provider_id || null,
        service_id: b.service_id || null,
        service_description: b.service_description || service?.title || null,
        category_id: service?.category_id || null,
        customer_name: customer?.full_name || '',
        customer_email: customer?.email || '',
        provider_name: provider?.full_name || '',
        provider_email: provider?.email || '',
      };
    }));

    return { bookings, total: count || 0, page, limit };
  }

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

  async updateBookingStatus(id: string, status: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) throw new NotFoundException(`Booking ${id} not found`);
    return { ok: true };
  }

  async createBookingDispute(bookingId: string, userId: string, reason: string) {
    const trimmed = String(reason || '').trim();
    if (!trimmed) throw new BadRequestException('reason is required');
    const { data, error } = await this.supabase
      .schema('notification_and_support')
      .from('disputes')
      .insert([{ booking_id: bookingId, raised_by: userId, reason: trimmed, status: 'open' }])
      .select('id');
    if (error) throw new InternalServerErrorException(error.message);
    if (!data || data.length === 0) throw new InternalServerErrorException('Failed to create dispute');
    return { ok: true, dispute_id: data[0].id };
  }

  async getDisputes(page = 1, limit = 20, status?: string) {
    const offset = (page - 1) * limit;
    let query = this.supabase
      .schema('notification_and_support')
      .from('disputes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
    if (normalizedStatus) {
      if (normalizedStatus === 'investigating' || normalizedStatus === 'under review') {
        query = query.eq('status', 'under_review');
      } else {
        query = query.eq('status', normalizedStatus);
      }
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    const rawDisputes = data || [];
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const bookingIds = Array.from(
      new Set(
        rawDisputes
          .map((dispute: any) => dispute.booking_id)
          .filter((id: unknown): id is string => typeof id === 'string' && uuidPattern.test(id)),
      ),
    );

    const bookingsById = new Map<string, { customer_id: string | null; provider_id: string | null }>();
    if (bookingIds.length > 0) {
      const { data: bookingRows, error: bookingError } = await this.supabase
        .schema('booking')
        .from('bookings')
        .select('id, customer_id, provider_id')
        .in('id', bookingIds);
      if (bookingError) throw new InternalServerErrorException(bookingError.message);
      for (const booking of bookingRows || []) {
        bookingsById.set(String(booking.id), {
          customer_id: booking.customer_id || null,
          provider_id: booking.provider_id || null,
        });
      }
    }

    const userIds = Array.from(
      new Set(
        [
          ...Array.from(bookingsById.values()).flatMap((b) => [b.customer_id, b.provider_id]),
          ...rawDisputes.map((dispute: any) => dispute.raised_by),
        ].filter((id: unknown): id is string => typeof id === 'string' && uuidPattern.test(id)),
      ),
    );

    const usersById = new Map<string, { full_name: string | null; email: string | null }>();
    if (userIds.length > 0) {
      const { data: userRows, error: userError } = await this.supabase
        .schema('identity_and_user')
        .from('users')
        .select('id, full_name, email')
        .in('id', userIds);
      if (userError) throw new InternalServerErrorException(userError.message);
      for (const user of userRows || []) {
        usersById.set(String(user.id), {
          full_name: user.full_name || null,
          email: user.email || null,
        });
      }
    }

    const disputes = rawDisputes.map((dispute: any) => {
      const booking = bookingsById.get(String(dispute.booking_id || ''));
      const customer = booking?.customer_id ? usersById.get(String(booking.customer_id)) : null;
      const provider = booking?.provider_id ? usersById.get(String(booking.provider_id)) : null;
      const raisedBy = typeof dispute.raised_by === 'string' ? usersById.get(dispute.raised_by) : null;

      return {
        ...dispute,
        booking_public_id: dispute.booking_id || null,
        customer_id: booking?.customer_id || null,
        provider_id: booking?.provider_id || null,
        customer_name: customer?.full_name || raisedBy?.full_name || '',
        customer_email: customer?.email || raisedBy?.email || '',
        provider_name: provider?.full_name || '',
        provider_email: provider?.email || '',
        amount: Number(dispute.amount ?? 0),
      };
    });

    return { disputes, total: count || 0, page, limit };
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

  async getTransactions(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('payment')
      .from('payments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    const payments = data || [];
    if (payments.length === 0) {
      return { transactions: [], total: count || 0, page, limit };
    }

    const providerIds = Array.from(
      new Set(
        payments
          .map((payment: any) => payment.provider_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const customerIds = Array.from(
      new Set(
        payments
          .map((payment: any) => payment.customer_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const bookingIds = Array.from(
      new Set(
        payments
          .map((payment: any) => payment.booking_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const [{ data: providers }, { data: customers }, { data: bookings }] = await Promise.all([
      providerIds.length > 0
        ? this.supabase
            .schema('identity_and_user')
            .from('users')
            .select('id, full_name, email')
            .in('id', providerIds)
        : Promise.resolve({ data: [] as any[] }),
      customerIds.length > 0
        ? this.supabase
            .schema('identity_and_user')
            .from('users')
            .select('id, full_name, email')
            .in('id', customerIds)
        : Promise.resolve({ data: [] as any[] }),
      bookingIds.length > 0
        ? this.supabase
            .schema('booking')
            .from('bookings')
            .select('id, booking_id')
            .in('id', bookingIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const providersById = new Map((providers || []).map((user: any) => [String(user.id), user]));
    const customersById = new Map((customers || []).map((user: any) => [String(user.id), user]));
    const bookingsById = new Map((bookings || []).map((booking: any) => [String(booking.id), booking]));

    const transactions = payments.map((payment: any) => {
      const amount = Number(payment.amount || 0);
      const commissionAmount = Math.round(amount * 0.1);
      const providerEarnings = Math.max(0, amount - commissionAmount);

      const paymentStatus = String(payment.status || 'pending').toLowerCase();
      const normalizedPaymentStatus =
        paymentStatus === 'completed'
          ? 'Paid'
          : paymentStatus === 'failed'
            ? 'Failed'
            : paymentStatus === 'refunded'
              ? 'Refunded'
              : 'Pending';

      const method = String(payment.method || '').toLowerCase();
      const normalizedMethod =
        method === 'debit_card'
          ? 'Debit Card'
          : method === 'credit_card'
            ? 'Credit Card'
            : 'Credit Card';

      const customer = payment.customer_id ? customersById.get(String(payment.customer_id)) : null;
      const provider = payment.provider_id ? providersById.get(String(payment.provider_id)) : null;
      const booking = payment.booking_id ? bookingsById.get(String(payment.booking_id)) : null;

      return {
        id: payment.id,
        transaction_id: payment.transaction_reference || payment.id,
        booking_id: booking?.booking_id || payment.booking_id || null,
        customer_id: payment.customer_id || null,
        provider_id: payment.provider_id || null,
        customer_name: customer?.full_name || '',
        customer_email: customer?.email || '',
        provider_name: provider?.full_name || '',
        provider_email: provider?.email || '',
        amount,
        commission_amount: commissionAmount,
        provider_earnings: providerEarnings,
        payment_method: normalizedMethod,
        payment_status: normalizedPaymentStatus,
        created_at: payment.created_at || null,
      };
    });

    return { transactions, total: count || 0, page, limit };
  }

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

    const payments = data || [];
    if (payments.length === 0) {
      return { payments: [], total: count || 0, page, limit };
    }

    const providerIds = Array.from(
      new Set(
        payments
          .map((payment: any) => payment.provider_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const providersById = new Map<string, { full_name: string | null; email: string | null }>();
    if (providerIds.length > 0) {
      const { data: providers, error: providersError } = await this.supabase
        .schema('identity_and_user')
        .from('users')
        .select('id, full_name, email')
        .in('id', providerIds);
      if (providersError) throw new InternalServerErrorException(providersError.message);
      for (const provider of providers || []) {
        providersById.set(String(provider.id), {
          full_name: provider.full_name || null,
          email: provider.email || null,
        });
      }
    }

    const enriched = payments.map((payment: any) => ({
      ...payment,
      provider_name: payment.provider_id ? providersById.get(String(payment.provider_id))?.full_name || '' : '',
      provider_email: payment.provider_id ? providersById.get(String(payment.provider_id))?.email || '' : '',
      provider_earnings: Number(payment.amount || 0) - Math.round(Number(payment.amount || 0) * 0.1),
      commission_amount: Math.round(Number(payment.amount || 0) * 0.1),
    }));

    return { payments: enriched, total: count || 0, page, limit };
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

    const payouts = data || [];
    if (payouts.length === 0) {
      return { payouts: [], total: count || 0, page, limit };
    }

    const providerRefs = Array.from(
      new Set(
        payouts
          .flatMap((payout: any) => [payout.provider_id, payout.provider_user_id, payout.user_id])
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const providersById = new Map<string, { full_name: string | null; email: string | null }>();
    const providerBusinessByUserId = new Map<string, string>();
    if (providerRefs.length > 0) {
      const [{ data: providers, error: providersError }, { data: profiles, error: profilesError }] = await Promise.all([
        this.supabase
          .schema('identity_and_user')
          .from('users')
          .select('id, full_name, email')
          .in('id', providerRefs),
        this.supabase
          .schema('provider_catalog')
          .from('provider_profiles')
          .select('user_id, business_name')
          .in('user_id', providerRefs),
      ]);
      if (providersError) throw new InternalServerErrorException(providersError.message);
      if (profilesError) throw new InternalServerErrorException(profilesError.message);

      for (const provider of providers || []) {
        providersById.set(String(provider.id), {
          full_name: provider.full_name || null,
          email: provider.email || null,
        });
      }
      for (const profile of profiles || []) {
        if (profile.user_id && profile.business_name) {
          providerBusinessByUserId.set(String(profile.user_id), String(profile.business_name));
        }
      }
    }

    const enriched = payouts.map((payout: any) => {
      const providerRef =
        (typeof payout.provider_id === 'string' && payout.provider_id) ||
        (typeof payout.provider_user_id === 'string' && payout.provider_user_id) ||
        (typeof payout.user_id === 'string' && payout.user_id) ||
        '';

      const user = providerRef ? providersById.get(String(providerRef)) : null;
      const businessName = providerRef ? providerBusinessByUserId.get(String(providerRef)) : null;

      return {
        ...payout,
        amount: Number(payout.amount || 0),
        provider_name:
          businessName ||
          user?.full_name ||
          (typeof payout.provider_name === 'string' ? payout.provider_name : '') ||
          (typeof payout.business_name === 'string' ? payout.business_name : '') ||
          '',
        provider_email:
          user?.email ||
          (typeof payout.provider_email === 'string' ? payout.provider_email : '') ||
          '',
        requested_date: payout.requested_date || payout.created_at || null,
        processed_date: payout.processed_date || payout.updated_at || null,
      };
    });

    return { payouts: enriched, total: count || 0, page, limit };
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
      .in('status', ['pending', 'refunded', 'cancelled'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    const payments = data || [];
    if (payments.length === 0) {
      return { payments: [], total: count || 0, page, limit };
    }

    const customerIds = Array.from(
      new Set(
        payments
          .map((payment: any) => payment.customer_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const bookingIds = Array.from(
      new Set(
        payments
          .map((payment: any) => payment.booking_id)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const [{ data: customers }, { data: bookings }] = await Promise.all([
      customerIds.length > 0
        ? this.supabase
            .schema('identity_and_user')
            .from('users')
            .select('id, full_name, email')
            .in('id', customerIds)
        : Promise.resolve({ data: [] as any[] }),
      bookingIds.length > 0
        ? this.supabase
            .schema('booking')
            .from('bookings')
            .select('id, booking_id')
            .in('id', bookingIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const customersById = new Map((customers || []).map((customer: any) => [String(customer.id), customer]));
    const bookingsById = new Map((bookings || []).map((booking: any) => [String(booking.id), booking]));

    const enriched = payments.map((payment: any) => {
      const customer = payment.customer_id ? customersById.get(String(payment.customer_id)) : null;
      const booking = payment.booking_id ? bookingsById.get(String(payment.booking_id)) : null;
      const status = String(payment.status || '').toLowerCase();

      return {
        ...payment,
        refund_id: payment.id,
        booking_public_id: booking?.booking_id || payment.booking_id || null,
        customer_name: customer?.full_name || '',
        customer_email: customer?.email || '',
        amount: Number(payment.amount || 0),
        reason: typeof payment.refund_reason === 'string' ? payment.refund_reason : 'Refund requested',
        refund_status:
          status === 'refunded'
            ? 'Processed'
            : status === 'cancelled'
              ? 'Approved'
              : 'Pending',
        requested_date: payment.created_at || null,
      };
    });

    return { payments: enriched, total: count || 0, page, limit };
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

  async getCategories(page = 1, limit = 100) {
    const offset = (page - 1) * limit;
    const { data, error, count } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return { categories: data || [], total: count || 0, page, limit };
  }

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
