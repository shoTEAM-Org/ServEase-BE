import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class ProviderService {
  constructor(private readonly supabase: SupabaseClient) {}

  private toTrimmedString(value: unknown) {
    return String(value ?? '').trim();
  }

  private toNullableString(value: unknown) {
    const parsed = this.toTrimmedString(value);
    return parsed || null;
  }

  private toPositiveNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }

  private toBoolean(value: unknown, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    }
    return fallback;
  }

  private normalizePricingMode(value: unknown): 'hourly' | 'flat' | null {
    const mode = this.toTrimmedString(value).toLowerCase();
    if (mode === 'hourly' || mode === 'flat') return mode;
    return null;
  }

  private normalizeServiceLocationType(value: unknown): 'mobile' | 'in_shop' {
    return this.toTrimmedString(value).toLowerCase() === 'in_shop' ? 'in_shop' : 'mobile';
  }

  private isSchemaMismatchError(error: any) {
    const message = this.toTrimmedString(error?.message).toLowerCase();
    if (!message) return false;
    return (
      (message.includes('column') && message.includes('does not exist')) ||
      message.includes('schema cache') ||
      message.includes('pgrst204') ||
      message.includes('pgrst200')
    );
  }

  private normalizeServicePayload(
    body: any,
    options: {
      providerId?: string;
      requireCoreFields?: boolean;
      legacyOnly?: boolean;
    } = {},
  ) {
    const source = body || {};
    const requireCoreFields = Boolean(options.requireCoreFields);
    const title = this.toTrimmedString(source.title);
    const categoryId = this.toTrimmedString(source.category_id ?? source.categoryId);

    if (requireCoreFields) {
      if (!title) throw new BadRequestException('Service title is required');
      if (!categoryId) throw new BadRequestException('Service category is required');
    }

    const hourlyRateInput = this.toPositiveNumber(source.hourly_rate ?? source.hourlyRate);
    const flatRateInput = this.toPositiveNumber(source.flat_rate ?? source.flatRate);
    const priceInput = this.toPositiveNumber(source.price);

    let supportsHourly = this.toBoolean(
      source.supports_hourly ?? source.supportsHourly,
      hourlyRateInput !== null,
    );
    let supportsFlat = this.toBoolean(
      source.supports_flat ?? source.supportsFlat,
      flatRateInput !== null,
    );

    if (!supportsHourly && !supportsFlat) {
      if (flatRateInput !== null) supportsFlat = true;
      else supportsHourly = true;
    }

    const resolvedPrice = Math.max(priceInput || 0, hourlyRateInput || 0, flatRateInput || 0);
    const locationType = this.normalizeServiceLocationType(
      source.service_location_type ?? source.serviceLocationType,
    );

    const payload: Record<string, any> = {};
    if (options.providerId) payload.provider_id = options.providerId;
    if (title || requireCoreFields) payload.title = title;
    if (Object.prototype.hasOwnProperty.call(source, 'description') || requireCoreFields) {
      payload.description = this.toNullableString(source.description);
    }
    if (categoryId || requireCoreFields) payload.category_id = categoryId;
    if (resolvedPrice > 0 || requireCoreFields) payload.price = resolvedPrice;

    if (options.legacyOnly) return payload;

    payload.supports_hourly = supportsHourly;
    payload.hourly_rate = supportsHourly
      ? hourlyRateInput ?? (resolvedPrice > 0 ? resolvedPrice : null)
      : null;
    payload.supports_flat = supportsFlat;
    payload.flat_rate = supportsFlat
      ? flatRateInput ?? (resolvedPrice > 0 ? resolvedPrice : null)
      : null;
    payload.default_pricing_mode =
      supportsHourly && supportsFlat
        ? this.normalizePricingMode(source.default_pricing_mode ?? source.defaultPricingMode) || 'hourly'
        : supportsHourly
          ? 'hourly'
          : 'flat';
    payload.service_location_type = locationType;
    payload.service_location_address =
      locationType === 'in_shop'
        ? this.toNullableString(source.service_location_address ?? source.serviceLocationAddress)
        : null;

    return payload;
  }

  // === Existing: Provider Discovery ===
  async getProvidersByService(serviceId: string) {
    const { data: services, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('id, title, price, provider_id')
      .eq('category_id', serviceId);
    if (error) throw new InternalServerErrorException(error.message);

    const providerIds = [...new Set((services || []).map((s: any) => s.provider_id))];
    const { data: profiles } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('user_id, business_name, average_rating, verification_status')
      .in('user_id', providerIds);

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    const data = (services || [])
      .filter((s: any) => profileMap[s.provider_id]?.verification_status === 'approved')
      .map((s: any) => ({ ...s, provider_profiles: profileMap[s.provider_id] || null }));

    return { success: true, data };
  }

  async searchProviders(searchTerm: string) {
    const { data: services, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('id, title, price, description, provider_id');
    if (error) throw new InternalServerErrorException(error.message);

    const providerIds = [...new Set((services || []).map((s: any) => s.provider_id))];
    const { data: profiles } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('user_id, business_name, trust_score, average_rating, verification_status')
      .in('user_id', providerIds);

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    const lower = searchTerm.toLowerCase();
    const filtered = (services || [])
      .filter((s: any) => profileMap[s.provider_id]?.verification_status === 'approved')
      .filter(
        (s: any) =>
          s.title?.toLowerCase().includes(lower) ||
          s.description?.toLowerCase().includes(lower) ||
          profileMap[s.provider_id]?.business_name?.toLowerCase().includes(lower),
      )
      .map((s: any) => ({ ...s, provider_profiles: profileMap[s.provider_id] || null }));

    return { success: true, data: filtered };
  }

  // === Existing: Provider Profile ===
  async getProviderProfile(userId: string) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select(
        'user_id, business_name, service_description, verification_status, average_rating, total_reviews, trust_score',
      )
      .eq('user_id', userId)
      .single();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Provider profile not found');

    const { data: documents } = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .select('document_id, document_type, document_file_path, status')
      .eq('provider_id', userId);

    const documentsWithUrls = await Promise.all(
      (documents || []).map(async (doc: any) => {
        const { data: urlData } = await this.supabase.storage
          .from('verification-docs')
          .createSignedUrl(doc.document_file_path, 60);
        return { ...doc, view_url: urlData?.signedUrl || null };
      }),
    );
    return {
      status: 'success',
      data: { ...data, provider_documents: documentsWithUrls },
    };
  }

  async getProviderDashboard(providerId: string) {
    const now = new Date();
    const firstDayOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    const { count: newRequests } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', providerId)
      .eq('status', 'pending');
    const { data: payments } = await this.supabase
      .schema('payment')
      .from('payments')
      .select('amount')
      .eq('provider_id', providerId)
      .eq('status', 'completed')
      .gte('created_at', firstDayOfMonth);
    const totalEarnings =
      payments?.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0) || 0;
    return { new_job_requests: newRequests || 0, total_earnings: totalEarnings };
  }

  async getTrustScore(providerId: string) {
    if (!providerId) throw new BadRequestException('provider_id is required');
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('trust_score')
      .eq('user_id', providerId)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Provider profile not found');
    return {
      status: 'success',
      data: { provider_id: providerId, trust_score: Number(data.trust_score) || 0 },
    };
  }

  async getProviderReviews(providerId: string) {
    const { data: profile } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('average_rating, total_reviews')
      .eq('user_id', providerId)
      .single();
    const { data: reviews } = await this.supabase
      .schema('trust_and_reputation')
      .from('reviews')
      .select('id, reviewer_id, rating, review_text, created_at')
      .eq('reviewee_id', providerId)
      .order('created_at', { ascending: false });
    return {
      status: 'success',
      data: {
        provider_id: providerId,
        average_rating: Number(profile?.average_rating) || 0,
        total_reviews: Number(profile?.total_reviews) || 0,
        reviews: reviews || [],
      },
    };
  }

  async reuploadKycDocument(userId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('A new document file is required');
    const { data: profile } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('verification_status')
      .eq('user_id', userId)
      .single();
    if (!profile)
      throw new NotFoundException('Provider profile not found');
    if (profile.verification_status !== 'rejected')
      throw new BadRequestException('Only rejected providers can reupload KYC documents');

    const filePath = `kyc/${userId}/${Date.now()}_${file.originalname}`;
    const { error: uploadError } = await this.supabase.storage
      .from('verification-docs')
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadError) throw new BadRequestException(uploadError.message);

    await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .update({
        document_file_path: filePath,
        status: 'pending',
        reject_reason: null,
        uploaded_at: new Date().toISOString(),
      })
      .eq('provider_id', userId);
    await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .update({ verification_status: 'pending' })
      .eq('user_id', userId);
    await this.supabase
      .schema('identity_and_user')
      .from('users')
      .update({ status: 'pending' })
      .eq('id', userId);
    return { status: 'success', message: 'KYC document reuploaded successfully.' };
  }

  // === Provider Bookings ===
  async getProviderBookings(providerId: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    // Fetch customer and service info separately (cross-schema join not supported)
    const bookings = await Promise.all((data || []).map(async (b: any) => {
      const { data: customerUser } = await this.supabase
        .schema('identity_and_user').from('users')
        .select('full_name, contact_number').eq('id', b.customer_id).single();
      const { data: service } = await this.supabase
        .schema('provider_catalog').from('provider_services')
        .select('title').eq('id', b.service_id).single();
      return {
        ...b,
        customer_name: customerUser?.full_name || '',
        customer_contact: customerUser?.contact_number || '',
        service_title: service?.title || '',
      };
    }));

    return { bookings };
  }

  async getProviderBookingById(bookingId: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();
    if (error) throw new NotFoundException('Booking not found');

    const [{ data: customerUser }, { data: service }] = await Promise.all([
      this.supabase.schema('identity_and_user').from('users').select('full_name, contact_number').eq('id', data.customer_id).single(),
      this.supabase.schema('provider_catalog').from('provider_services').select('title').eq('id', data.service_id).single(),
    ]);

    return {
      booking: {
        ...data,
        customer_name: customerUser?.full_name || '',
        customer_contact: customerUser?.contact_number || '',
        service_title: service?.title || '',
      },
    };
  }

  async updateProviderBookingStatus(bookingId: string, status: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .update({ status })
      .eq('id', bookingId)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return { booking: data };
  }

  // === Provider Availability ===
  async getProviderAvailability(userId: string) {
    const [{ data: weeklyRows }, { data: daysOffRows }] = await Promise.all([
      this.supabase.schema('booking').from('provider_availability').select('*').eq('user_id', userId),
      this.supabase.schema('booking').from('provider_days_off').select('*').eq('user_id', userId),
    ]);
    return { weeklySchedule: weeklyRows || [], daysOff: daysOffRows || [] };
  }

  async saveProviderAvailability(userId: string, body: any) {
    // Upsert weekly schedule
    if (body.weeklySchedule?.length) {
      const rows = body.weeklySchedule.map((r: any) => ({
        ...r,
        user_id: userId,
      }));
      await this.supabase
        .schema('booking')
        .from('provider_availability')
        .delete()
        .eq('user_id', userId);
      const { error } = await this.supabase
        .schema('booking')
        .from('provider_availability')
        .insert(rows);
      if (error) throw new InternalServerErrorException(error.message);
    }
    // Replace days off
    if (body.daysOff !== undefined) {
      await this.supabase
        .schema('booking')
        .from('provider_days_off')
        .delete()
        .eq('user_id', userId);
      if (body.daysOff?.length) {
        const offs = body.daysOff.map((d: any) => ({
          user_id: userId,
          off_date: d.off_date,
          reason: d.reason || null,
        }));
        const { error } = await this.supabase
          .schema('booking')
          .from('provider_days_off')
          .insert(offs);
        if (error) throw new InternalServerErrorException(error.message);
      }
    }
    return { ok: true };
  }

  async getReservedSlots(providerId: string, date: string) {
    const startOfDay = `${date}T00:00:00`;
    const endOfDay = `${date}T23:59:59`;
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('scheduled_at, hours_required')
      .eq('provider_id', providerId)
      .gte('scheduled_at', startOfDay)
      .lte('scheduled_at', endOfDay)
      .in('status', ['pending', 'confirmed', 'in_progress']);
    if (error) throw new InternalServerErrorException(error.message);
    return { reservedSlots: data || [] };
  }

  async checkAvailability(
    providerId: string,
    scheduledAt: string,
    hoursRequired: string,
  ) {
    const date = scheduledAt.slice(0, 10);
    const slots = (await this.getReservedSlots(providerId, date)).reservedSlots;
    const requestedStart = new Date(scheduledAt).getTime();
    const requestedEnd = requestedStart + Number(hoursRequired || 1) * 3600000;

    for (const slot of slots) {
      const slotStart = new Date(slot.scheduled_at).getTime();
      const slotEnd = slotStart + (slot.hours_required || 1) * 3600000;
      if (requestedStart < slotEnd && requestedEnd > slotStart) {
        return {
          available: false,
          reason: 'This time slot overlaps with an existing booking.',
        };
      }
    }
    return { available: true };
  }

  // === My Services (Provider Catalog) ===
  async getMyServices(providerId: string) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('*')
      .eq('provider_id', providerId);
    if (error) throw new InternalServerErrorException(error.message);
    return { services: data || [] };
  }

  async createMyService(providerId: string, body: any) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId) throw new BadRequestException('providerId is required');

    const payload = this.normalizeServicePayload(body, {
      providerId: normalizedProviderId,
      requireCoreFields: true,
    });

    let { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .insert([payload])
      .select()
      .single();

    if (error && this.isSchemaMismatchError(error)) {
      const legacyPayload = this.normalizeServicePayload(body, {
        providerId: normalizedProviderId,
        requireCoreFields: true,
        legacyOnly: true,
      });
      ({ data, error } = await this.supabase
        .schema('provider_catalog')
        .from('provider_services')
        .insert([legacyPayload])
        .select()
        .single());
    }

    if (error) throw new BadRequestException(error.message);
    return { service: data };
  }

  async updateMyService(serviceId: string, providerId: string, body: any) {
    const normalizedServiceId = this.toTrimmedString(serviceId);
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedServiceId) throw new BadRequestException('serviceId is required');
    if (!normalizedProviderId) throw new BadRequestException('providerId is required');

    const payload = this.normalizeServicePayload(body, { requireCoreFields: true });
    let { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .update(payload)
      .eq('id', normalizedServiceId)
      .eq('provider_id', normalizedProviderId)
      .select()
      .single();

    if (error && this.isSchemaMismatchError(error)) {
      const legacyPayload = this.normalizeServicePayload(body, {
        requireCoreFields: true,
        legacyOnly: true,
      });
      ({ data, error } = await this.supabase
        .schema('provider_catalog')
        .from('provider_services')
        .update(legacyPayload)
        .eq('id', normalizedServiceId)
        .eq('provider_id', normalizedProviderId)
        .select()
        .single());
    }

    if (error) throw new BadRequestException(error.message);
    return { service: data };
  }

  async deleteMyService(serviceId: string, providerId: string) {
    const { error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .delete()
      .eq('id', serviceId)
      .eq('provider_id', providerId);
    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true };
  }

  // === Profile Draft ===
  async getProfileDraft(userId: string) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select(
        'user_id, business_name, service_description, trust_score, verification_status',
      )
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116')
      throw new InternalServerErrorException(error.message);
    return { draft: data || null };
  }

  async saveProfileDraft(userId: string, body: any) {
    const allowed = [
      'business_name',
      'service_description',
      'verification_status',
    ];
    const updates: any = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return { draft: data };
  }

  // === Reschedule Requests ===
  async createRescheduleRequest(body: any) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('booking_reschedule_requests')
      .insert([
        {
          booking_id: body.bookingId,
          provider_id: body.providerId,
          reason: body.reason,
          explanation: body.explanation,
          proposed_date: body.proposedDate,
          proposed_time: body.proposedTime,
          status: 'pending',
        },
      ])
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return { request: data };
  }

  async getRescheduleRequests(bookingId: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('booking_reschedule_requests')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return { requests: data || [] };
  }

  async reviewRescheduleRequest(requestId: string, body: any) {
    const updates: any = {
      status: body.decision,
      reviewed_at: new Date().toISOString(),
    };
    const { data, error } = await this.supabase
      .schema('booking')
      .from('booking_reschedule_requests')
      .update(updates)
      .eq('id', requestId)
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    // If approved, update booking scheduled_at
    if (body.decision === 'approved' && data) {
      const req = data as any;
      if (req.proposed_date && req.proposed_time) {
        await this.supabase
          .schema('booking')
          .from('bookings')
          .update({ scheduled_at: `${req.proposed_date}T${req.proposed_time}` })
          .eq('id', req.booking_id);
      }
    }
    return { request: data };
  }

  // === Additional Charges ===
  async createAdditionalCharges(body: any) {
    const items = (body.items || []).map((item: any) => ({
      booking_id: body.bookingId,
      requested_by: body.providerId,
      description: item.description,
      amount: item.amount,
      justification: body.justification,
      status: 'pending',
    }));
    const { data, error } = await this.supabase
      .schema('booking')
      .from('additional_charges')
      .insert(items)
      .select();
    if (error) throw new InternalServerErrorException(error.message);
    return { charges: data || [] };
  }

  async getAdditionalCharges(bookingId: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('additional_charges')
      .select('*')
      .eq('booking_id', bookingId);
    if (error) throw new InternalServerErrorException(error.message);
    return { charges: data || [] };
  }

  async reviewAdditionalCharges(body: any) {
    const { chargeIds, decision } = body;
    const { data, error } = await this.supabase
      .schema('booking')
      .from('additional_charges')
      .update({
        status: decision,
        reviewed_at: new Date().toISOString(),
      })
      .in('id', chargeIds)
      .select();
    if (error) throw new InternalServerErrorException(error.message);

    // If approved, update booking total
    if (decision === 'approved' && data?.length && body.bookingId) {
      const totalAdditional = data.reduce(
        (acc: number, c: any) => acc + Number(c.amount),
        0,
      );
      const { data: booking } = await this.supabase
        .schema('booking')
        .from('bookings')
        .select('total_amount')
        .eq('id', body.bookingId)
        .single();
      if (booking) {
        await this.supabase
          .schema('booking')
          .from('bookings')
          .update({ total_amount: Number(booking.total_amount) + totalAdditional })
          .eq('id', body.bookingId);
      }
    }
    return { charges: data || [] };
  }

  // === Reviews & Reports ===
  async submitReview(body: any) {
    const { data, error } = await this.supabase
      .schema('trust_and_reputation')
      .from('reviews')
      .insert([
        {
          booking_id: body.booking_id,
          reviewer_id: body.reviewer_id,
          reviewee_id: body.reviewee_id,
          rating: body.rating,
          review_text: body.review_text || null,
        },
      ])
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    // Update provider average rating
    const { data: allReviews } = await this.supabase
      .schema('trust_and_reputation')
      .from('reviews')
      .select('rating')
      .eq('reviewee_id', body.reviewee_id);
    if (allReviews?.length) {
      const avg = allReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / allReviews.length;
      await this.supabase
        .schema('provider_catalog')
        .from('provider_profiles')
        .update({ average_rating: avg, total_reviews: allReviews.length })
        .eq('user_id', body.reviewee_id);
    }
    return { review: data };
  }

  async submitReport(body: any) {
    const { data, error } = await this.supabase
      .schema('trust_and_reputation')
      .from('provider_profile_reports')
      .insert([
        {
          reported_provider_id: body.provider_id,
          reporter_id: body.reporter_id,
          reason: body.reason,
          description: body.details,
          status: 'pending',
        },
      ])
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}
