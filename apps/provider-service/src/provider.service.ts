import {
  Inject,
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AUTH_PATTERNS,
  BOOKING_PATTERNS,
  KafkaRpcRequestOptions,
  NOTIFICATION_PATTERNS,
  PAYMENT_PATTERNS,
  TRUST_PATTERNS,
  calculatePricingQuote,
  connectKafkaClientWithRetry,
  FuelFreshness,
  FuelType,
  JobComplexity,
  sendKafkaRpcRequest,
  PricingMode,
  PricingUrgency,
  RadiusTier,
  VehicleType,
} from '@app/common';

@Injectable()
export class ProviderService implements OnModuleInit {
  constructor(
    private readonly supabase: SupabaseClient,
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
  ) {}
  private readonly logger = new Logger(ProviderService.name);

  async onModuleInit() {
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_PROFILE);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_USERS_BY_IDS);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_USERS_BY_ROLE);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.UPDATE_USER_STATUS);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_PROVIDER_BOOKINGS);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_PROVIDER_BOOKING_BY_ID);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.UPDATE_STATUS_RPC);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_PROVIDER_AVAILABILITY);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.SAVE_PROVIDER_AVAILABILITY);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_RESERVED_SLOTS);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.CHECK_PROVIDER_AVAILABILITY);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.UPDATE_STATUS);
    this.kafka.subscribeToResponseOf(
      BOOKING_PATTERNS.CREATE_ADDITIONAL_CHARGES,
    );
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_ADDITIONAL_CHARGES);
    this.kafka.subscribeToResponseOf(
      BOOKING_PATTERNS.REVIEW_ADDITIONAL_CHARGES,
    );
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.GET_EARNINGS_SUMMARY);
    this.kafka.subscribeToResponseOf(TRUST_PATTERNS.GET_PROVIDER_REVIEWS);
    this.kafka.subscribeToResponseOf(TRUST_PATTERNS.CREATE_REVIEW);
    this.kafka.subscribeToResponseOf(TRUST_PATTERNS.CREATE_PROVIDER_REPORT);
    this.kafka.subscribeToResponseOf(TRUST_PATTERNS.GET_ALL_REVIEWS);
    this.kafka.subscribeToResponseOf(TRUST_PATTERNS.DELETE_REVIEW);
    this.kafka.subscribeToResponseOf(TRUST_PATTERNS.GET_PERFORMANCE_REPORT);
    this.kafka.subscribeToResponseOf(TRUST_PATTERNS.GET_COMPLIANCE_REPORT);
    this.kafka.subscribeToResponseOf(TRUST_PATTERNS.CREATE_REVIEW_RESPONSE);
    this.kafka.subscribeToResponseOf(TRUST_PATTERNS.UPDATE_REVIEW_RESPONSE);
    this.kafka.subscribeToResponseOf(TRUST_PATTERNS.GET_REVIEW_WITH_RESPONSE);
    await connectKafkaClientWithRetry(this.kafka, {
      context: ProviderService.name,
      logger: this.logger,
    });
  }

  private async request<T = any>(
    pattern: string,
    payload: unknown,
    options: Pick<KafkaRpcRequestOptions, 'timeoutMs' | 'retries' | 'retryDelayMs'> = {},
  ): Promise<T> {
    return await sendKafkaRpcRequest(
      () => this.kafka.send<T, unknown>(pattern, payload),
      { context: pattern, ...options },
    );
  }

  private isTimeoutLikeError(error: unknown) {
    const message = this.toTrimmedString((error as any)?.message).toLowerCase();
    return message.includes('timeout') || message.includes('timed out');
  }

  private async withQueryTimeout<T>(
    operation: PromiseLike<T>,
    timeoutMs: number,
    context: string,
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`${context} timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private buildDateFilter(query: any, from?: string, to?: string, column = 'created_at') {
    if (from) query = query.gte(column, from);
    if (to) query = query.lte(column, to);
    return query;
  }

  private async getUserProfileFromAuth(userId: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) return null;
    return await this.request<any>(AUTH_PATTERNS.GET_PROFILE, {
      userId: normalizedUserId,
    });
  }

  private async getUsersByIdsFromAuth(userIds: unknown) {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(userIds) ? userIds : [])
          .map((userId) => this.toTrimmedString(userId))
          .filter(Boolean),
      ),
    );
    if (!normalizedIds.length) return [] as any[];

    const response = await this.request<any>(AUTH_PATTERNS.GET_USERS_BY_IDS, {
      userIds: normalizedIds,
    });
    const users =
      response && typeof response === 'object' && 'users' in response
        ? response.users
        : [];
    return Array.isArray(users) ? users : [];
  }

  private async getAdminUsersFromAuth() {
    const response = await this.request<any>(AUTH_PATTERNS.GET_USERS_BY_ROLE, {
      role: 'admin',
      page: 1,
      limit: 100,
    });
    const users =
      response && typeof response === 'object' && 'users' in response
        ? response.users
        : [];
    return Array.isArray(users) ? users : [];
  }

  private sanitizeStorageName(value: unknown) {
    const raw = this.toTrimmedString(value) || 'document';
    return raw.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
  }

  private normalizeDocumentType(value: unknown) {
    return this.toTrimmedString(value).toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  }

  private async toVerificationSignedUrl(path: unknown) {
    const normalizedPath = this.toTrimmedString(path);
    if (!normalizedPath) return null;
    const { data } = await this.supabase.storage
      .from('verification-docs')
      .createSignedUrl(normalizedPath, 60 * 60);
    return data?.signedUrl || null;
  }

  private async mapProviderDocument(doc: any) {
    const filePath = doc.document_file_path || '';
    const fileName = filePath.split('/').pop() || undefined;
    return {
      document_id: doc.document_id,
      id: doc.document_id,
      provider_id: doc.provider_id,
      document_type: doc.document_type,
      document_file_path: doc.document_file_path,
      file_name: fileName,
      status: doc.status || 'pending',
      reject_reason: doc.reject_reason || null,
      uploaded_at: doc.uploaded_at || null,
      reviewed_at: doc.reviewed_at || null,
      reviewed_by: doc.reviewed_by || null,
      signed_url: await this.toVerificationSignedUrl(doc.document_file_path),
    };
  }

  private async emitProviderNotification(
    pattern: string,
    userId: string,
    metadata: Record<string, unknown> = {},
  ) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) return;
    this.kafka.emit(pattern, {
      userId: normalizedUserId,
      type: pattern,
      metadata,
    });
  }

  private async emitAdminProviderApplicationSubmitted(providerId: string) {
    try {
      const admins = await this.getAdminUsersFromAuth();
      for (const admin of admins) {
        await this.emitProviderNotification(
          NOTIFICATION_PATTERNS.PROVIDER_APPLICATION_SUBMITTED,
          admin?.id,
          { providerId },
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to notify admins about provider application ${providerId}: ${this.toTrimmedString((error as any)?.message)}`,
      );
    }
  }

  private toTrimmedString(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
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

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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

  private allowUnverifiedProviderBooking() {
    return this.toTrimmedString(process.env.ALLOW_UNVERIFIED_PROVIDER_BOOKINGS)
      .toLowerCase() === 'true';
  }

  private normalizePricingMode(value: unknown): 'hourly' | 'flat' | null {
    const mode = this.toTrimmedString(value).toLowerCase();
    if (mode === 'hourly' || mode === 'flat') return mode;
    return null;
  }

  private normalizeFuelType(value: unknown): FuelType {
    return this.toTrimmedString(value).toLowerCase() === 'diesel'
      ? 'diesel'
      : 'gasoline';
  }

  private normalizeRadiusTier(value: unknown): RadiusTier {
    const normalized = this.toTrimmedString(value).toLowerCase();
    if (['extended', 'far', 'outside'].includes(normalized)) return normalized as RadiusTier;
    return 'base';
  }

  private normalizeJobComplexity(value: unknown): JobComplexity {
    const normalized = this.toTrimmedString(value).toLowerCase();
    if (['simple', 'complex'].includes(normalized)) return normalized as JobComplexity;
    return 'standard';
  }

  private normalizePricingUrgency(value: unknown): PricingUrgency {
    const normalized = this.toTrimmedString(value).toLowerCase();
    if (['same_day', 'urgent'].includes(normalized)) return normalized as PricingUrgency;
    return 'scheduled';
  }

  private normalizeVehicleType(value: unknown): VehicleType {
    const normalized = this.toTrimmedString(value).toLowerCase();
    if (['car', 'van'].includes(normalized)) return normalized as VehicleType;
    return 'motorcycle';
  }

  private defaultFuelPrice(fuelType: FuelType) {
    const envKey =
      fuelType === 'diesel'
        ? 'SERVEASE_DEFAULT_DIESEL_PRICE_PHP'
        : 'SERVEASE_DEFAULT_GASOLINE_PRICE_PHP';
    const configured = this.toNullableNumber(process.env[envKey]);
    return configured && configured > 0 ? configured : fuelType === 'diesel' ? 60 : 65;
  }

  private async getFuelBaseline(fuelType: FuelType) {
    const now = Date.now();
    const { data } = await this.supabase
      .schema('booking')
      .from('fuel_price_cache')
      .select('fuel_type, price_per_liter, source_name, source_url, fetched_at, valid_until')
      .eq('country_code', 'PH')
      .eq('fuel_type', fuelType)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const fetchedAt = this.toTrimmedString(data.fetched_at) || new Date().toISOString();
      const validUntil = this.toTrimmedString(data.valid_until);
      const ageMs = now - new Date(fetchedAt).getTime();
      const freshness: FuelFreshness =
        validUntil && new Date(validUntil).getTime() >= now
          ? 'fresh'
          : ageMs <= 24 * 60 * 60 * 1000
            ? 'cached'
            : 'stale';

      return {
        fuelType,
        pricePerLiter: Number(data.price_per_liter) || this.defaultFuelPrice(fuelType),
        sourceName: this.toTrimmedString(data.source_name) || 'Fuel price cache',
        sourceUrl: this.toTrimmedString(data.source_url) || undefined,
        fetchedAt,
        freshness,
      };
    }

    return {
      fuelType,
      pricePerLiter: this.defaultFuelPrice(fuelType),
      sourceName: 'ServEase default fuel baseline',
      fetchedAt: new Date().toISOString(),
      freshness: 'default' as FuelFreshness,
    };
  }

  private async getProviderTravelProfile(providerId: string) {
    const { data } = await this.supabase
      .schema('provider_catalog')
      .from('provider_travel_profiles')
      .select('vehicle_type, fuel_type, fuel_efficiency_km_per_liter')
      .eq('provider_id', providerId)
      .maybeSingle();

    if (!data) return undefined;
    return {
      vehicleType: this.normalizeVehicleType(data.vehicle_type),
      fuelType: this.normalizeFuelType(data.fuel_type),
      fuelEfficiencyKmPerLiter:
        this.toNullableNumber(data.fuel_efficiency_km_per_liter) || 45,
    };
  }

  private async getLaborBaseline(serviceId: string, pricingMode: PricingMode, hoursRequired: number) {
    if (!serviceId) return undefined;
    const { data } = await this.supabase
      .schema('provider_catalog')
      .from('service_pricing_baselines')
      .select('pricing_mode, min_labor_amount, max_labor_amount, typical_labor_amount, source_note')
      .eq('service_id', serviceId)
      .eq('is_active', true)
      .maybeSingle();
    if (!data) return undefined;

    const baselineMode = this.normalizePricingMode(data.pricing_mode) || 'flat';
    const multiplier = baselineMode === 'hourly' && pricingMode === 'hourly'
      ? Math.max(1, hoursRequired)
      : 1;
    return {
      minLaborAmount: (this.toNullableNumber(data.min_labor_amount) || 0) * multiplier,
      maxLaborAmount: (this.toNullableNumber(data.max_labor_amount) || 0) * multiplier,
      typicalLaborAmount: (this.toNullableNumber(data.typical_labor_amount) || 0) * multiplier,
      sourceNote: this.toTrimmedString(data.source_note) || 'ServEase category baseline',
    };
  }

  private deriveApplicationStatus(
    profileStatus: unknown,
    hasRejectedDoc: boolean,
    hasPendingDoc: boolean,
    hasApprovedDoc: boolean,
  ) {
    const normalizedProfileStatus = this.toTrimmedString(profileStatus);
    if (normalizedProfileStatus) return normalizedProfileStatus;
    if (hasRejectedDoc) return 'rejected';
    if (hasPendingDoc) return 'pending';
    if (hasApprovedDoc) return 'approved';
    return 'pending';
  }

  private mapVerificationStatusToUserStatus(status: string) {
    if (
      status === 'approved' ||
      status === 'pending' ||
      status === 'under_review' ||
      status === 'rejected'
    ) {
      return 'active';
    }
    return 'inactive';
  }

  private validateRequiredServiceFields(
    requireCoreFields: boolean,
    title: string,
    serviceId: string,
  ) {
    if (!requireCoreFields) return;
    if (!title) throw new BadRequestException('Service title is required');
    if (!serviceId) throw new BadRequestException('Service category is required');
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

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async resolveServiceCategoryId(serviceId: string): Promise<string | null> {
    const normalizedServiceId = this.toTrimmedString(serviceId);
    if (!normalizedServiceId) return null;
    if (this.isUuid(normalizedServiceId)) return normalizedServiceId;

    const legacySlugMap: Record<string, string> = {
      'cat-cleaning': 'home-cleaning',
      'cat-aircon': 'aircon-services',
      'cat-electrical': 'electrical',
      'cat-plumbing': 'plumbing',
    };
    const slug = legacySlugMap[normalizedServiceId] || normalizedServiceId.replace(/^cat-/, '');

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('service_categories')
      .select('id')
      .or(`slug.eq.${slug},name.ilike.${slug.replace(/-/g, ' ')}`)
      .limit(1)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    return this.toTrimmedString(data?.id) || null;
  }

  private normalizeServicePayload(
    body: any,
    options: {
      providerId?: string;
      requireCoreFields?: boolean;
      legacyOnly?: boolean;
    } = {},
  ) {
    const source: Record<string, unknown> =
      body && typeof body === 'object' ? body : {};
    const requireCoreFields = Boolean(options.requireCoreFields);
    const title = this.toTrimmedString(source.title);
    const serviceId = this.toTrimmedString(source.service_id ?? source.serviceId);
    this.validateRequiredServiceFields(requireCoreFields, title, serviceId);

    const priceInput = this.toPositiveNumber(source.price);
    const durationInput = this.toPositiveNumber(
      source.duration_minutes ?? source.durationMinutes,
    );
    const pricingMode =
      this.normalizePricingMode(source.pricing_mode ?? source.pricingMode) ||
      'hourly';

    const payload: Record<string, any> = {};
    if (options.providerId) payload.provider_id = options.providerId;
    if (title || requireCoreFields) payload.title = title;
    if (Object.hasOwn(source, 'description') || requireCoreFields) {
      payload.description = this.toNullableString(source.description);
    }
    if (serviceId || requireCoreFields) payload.service_id = serviceId;
    if (priceInput !== null || requireCoreFields) payload.price = priceInput || 0;
    if (Object.hasOwn(source, 'pricing_mode') || Object.hasOwn(source, 'pricingMode') || requireCoreFields) {
      payload.pricing_mode = pricingMode;
    }
    if (
      Object.hasOwn(source, 'duration_minutes') ||
      Object.hasOwn(source, 'durationMinutes') ||
      requireCoreFields
    ) {
      payload.duration_minutes = durationInput || 60;
    }
    if (Object.hasOwn(source, 'is_active')) {
      payload.is_active = this.toBoolean(source.is_active, true);
    }

    return payload;
  }

  // === Provider Status ===
  async getProviderStatus(providerId: string) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId) {
      throw new BadRequestException('providerId is required');
    }

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_status')
      .select('provider_id, status, last_updated')
      .eq('provider_id', normalizedProviderId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new InternalServerErrorException(error.message);
    }

    // If no status record exists, return default status
    if (!data) {
      return {
        status: 'success',
        data: {
          provider_id: normalizedProviderId,
          status: 'offline',
          updated_at: new Date().toISOString()
        }
      };
    }

    return {
      status: 'success',
      data: {
        provider_id: data.provider_id,
        status: data.status,
        updated_at: data.last_updated || new Date().toISOString()
      }
    };
  }

  async updateProviderStatus(providerId: string, status: string) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    const normalizedStatus = this.toTrimmedString(status).toLowerCase();
    
    if (!normalizedProviderId) {
      throw new BadRequestException('providerId is required');
    }
    
    if (!['online', 'on_the_way', 'arrived', 'busy', 'offline'].includes(normalizedStatus)) {
      throw new BadRequestException('status must be one of: online, on_the_way, arrived, busy, offline');
    }

    // First try to update
    const { data: updateData, error: updateError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_status')
      .update({
        status: normalizedStatus,
        last_updated: new Date().toISOString()
      })
      .eq('provider_id', normalizedProviderId)
      .select()
      .single();

    // If no rows were updated (PGRST116), insert instead
    if (updateError && updateError.code === 'PGRST116') {
      const { data: insertData, error: insertError } = await this.supabase
        .schema('provider_catalog')
        .from('provider_status')
        .insert({
          provider_id: normalizedProviderId,
          status: normalizedStatus,
          last_updated: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        throw new InternalServerErrorException(insertError.message);
      }

      // Create timeline events for active bookings (fire and forget)
      this.addTimelineEventsForProviderStatus(normalizedProviderId, normalizedStatus).catch(() => {
        // Silently ignore timeline errors
      });

      return {
        status: 'success',
        data: {
          provider_id: insertData.provider_id,
          status: insertData.status,
          updated_at: insertData.last_updated || new Date().toISOString()
        }
      };
    }

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }

    // Create timeline events for active bookings (fire and forget)
    this.addTimelineEventsForProviderStatus(normalizedProviderId, normalizedStatus).catch(() => {
      // Silently ignore timeline errors
    });

    return {
      status: 'success',
      data: {
        provider_id: updateData.provider_id,
        status: updateData.status,
        updated_at: updateData.last_updated || new Date().toISOString()
      }
    };
  }

  private async addTimelineEventsForProviderStatus(providerId: string, status: string) {
    try {
      // Get active bookings for this provider
      const { data: bookings, error: bookingsError } = await this.supabase
        .schema('booking')
        .from('bookings')
        .select('id')
        .eq('provider_id', providerId)
        .in('status', ['confirmed', 'in_progress']);

      if (bookingsError || !bookings || bookings.length === 0) {
        return;
      }

      // Map status to label
      const statusLabels: Record<string, string> = {
        'online': 'Provider is online',
        'on_the_way': 'Provider is on the way',
        'arrived': 'Provider has arrived',
        'busy': 'Provider started your service',
        'offline': 'Provider is offline'
      };

      const label = statusLabels[status] || `Provider status: ${status}`;

      // Insert timeline events for all active bookings
      const timelineEvents = bookings.map(booking => ({
        booking_id: booking.id,
        event_type: 'provider-status',
        label,
        icon: status
      }));

      // Use upsert to avoid conflicts and set timeout
      const { error: insertError } = await this.supabase
        .schema('booking')
        .from('booking_timeline_events')
        .insert(timelineEvents);

      if (insertError) {
        // Log error but don't throw - timeline events are non-critical
        console.warn('Failed to create timeline events:', insertError.message);
      }
    } catch (error) {
      // Log error but don't throw - timeline events are non-critical
      console.warn('Failed to create timeline events:', error);
    }
  }

  // === Existing: Provider Discovery ===
  async getProvidersByService(serviceId: string) {
    const { data: services, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('id, service_id, title, price, pricing_mode, duration_minutes, provider_id')
      .eq('service_id', serviceId);
    if (error) throw new InternalServerErrorException(error.message);

    const providerIds = [...new Set((services || []).map((s: any) => s.provider_id))];
    const { data: profiles } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('user_id, business_name, bio, service_description, average_rating, verification_status, home_address, home_latitude, home_longitude, service_radius_km')
      .in('user_id', providerIds);

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    const data = (services || [])
      .filter((s: any) => (() => {
          const verificationStatus = this.toTrimmedString(
            profileMap[s.provider_id]?.verification_status,
          ).toLowerCase();
          return (
            verificationStatus === 'approved' ||
            (this.allowUnverifiedProviderBooking() && verificationStatus === 'pending')
          );
        })())
      .map((s: any) => ({ ...s, provider_profiles: profileMap[s.provider_id] || null }));

    return { success: true, data };
  }

  async searchProviders(searchTerm?: string) {
    const { data: services, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('id, service_id, title, price, pricing_mode, duration_minutes, description, provider_id')
      .eq('is_active', true);
    if (error) throw new InternalServerErrorException(error.message);

    const providerIds = [...new Set((services || []).map((s: any) => s.provider_id))];
    const { data: profiles } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('user_id, business_name, bio, service_description, trust_score, average_rating, verification_status, home_address, home_latitude, home_longitude, service_radius_km')
      .in('user_id', providerIds);

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    const lower = this.toTrimmedString(searchTerm).toLowerCase();
    const filtered = (services || [])
      .filter((s: any) => (() => {
          const verificationStatus = this.toTrimmedString(
            profileMap[s.provider_id]?.verification_status,
          ).toLowerCase();
          return (
            verificationStatus === 'approved' ||
            (this.allowUnverifiedProviderBooking() && verificationStatus === 'pending')
          );
        })())
      .filter(
        (s: any) =>
          !lower ||
          s.title?.toLowerCase().includes(lower) ||
          s.description?.toLowerCase().includes(lower) ||
          profileMap[s.provider_id]?.business_name?.toLowerCase().includes(lower),
      )
      .map((s: any) => ({ ...s, provider_profiles: profileMap[s.provider_id] || null }));

    // Group active services by provider, keeping the lowest-priced as the representative
    const providerServiceMap = new Map<string, any>();
    for (const s of (services || [])) {
      if (profileMap[s.provider_id]?.verification_status !== 'approved') continue;
      const matchesSearch =
        !lower ||
        s.title?.toLowerCase().includes(lower) ||
        s.description?.toLowerCase().includes(lower) ||
        profileMap[s.provider_id]?.business_name?.toLowerCase().includes(lower);
      if (!matchesSearch) continue;
      const existing = providerServiceMap.get(s.provider_id);
      if (!existing || s.price < existing.price) {
        providerServiceMap.set(s.provider_id, {
          ...s,
          provider_profiles: profileMap[s.provider_id] || null,
        });
      }
    }

    return { success: true, data: Array.from(providerServiceMap.values()) };
  }

  // === Existing: Provider Profile ===
  async getProviderProfile(userId: string) {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select(
        'user_id, business_name, bio, service_description, verification_status, average_rating, total_reviews, trust_score, home_address, home_latitude, home_longitude, service_radius_km, verification_submitted_at, verification_decided_at, reject_reason',
      )
      .eq('user_id', userId)
      .single();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Provider profile not found');

    const { data: documents } = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .select('document_id, provider_id, document_type, document_file_path, status, reject_reason, uploaded_at, reviewed_at, reviewed_by')
      .eq('provider_id', userId);

    const documentsWithUrls = await Promise.all(
      (documents || []).map((doc: any) => this.mapProviderDocument(doc)),
    );
    return {
      status: 'success',
      data: { ...data, provider_documents: documentsWithUrls },
    };
  }

  async createProviderApplication(payload: any) {
    const userId = this.toTrimmedString(payload?.userId);
    const businessName = this.toTrimmedString(payload?.businessName);
    const documentType = this.toTrimmedString(payload?.documentType);
    const filePath = this.toTrimmedString(payload?.filePath);
    const dateOfBirthRaw = this.toTrimmedString(payload?.dateOfBirth);
    const dateOfBirth = dateOfBirthRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirthRaw)
      ? dateOfBirthRaw
      : null;

    if (!userId) throw new BadRequestException('userId is required');
    if (!businessName) throw new BadRequestException('businessName is required');
    if (!documentType) throw new BadRequestException('documentType is required');
    if (!filePath) throw new BadRequestException('filePath is required');

    const profileRow: Record<string, unknown> = {
      user_id: userId,
      business_name: businessName,
      verification_status: 'pending',
    };
    if (dateOfBirth) profileRow.date_of_birth = dateOfBirth;

    const { data: profile, error: profileError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .insert([profileRow])
      .select()
      .single();
    if (profileError)
      throw new InternalServerErrorException(profileError.message);

    const { error: docError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .insert([
        {
          provider_id: userId,
          document_type: documentType,
          document_file_path: filePath,
          status: 'pending',
        },
      ]);
    if (docError) {
      await this.supabase
        .schema('provider_catalog')
        .from('provider_profiles')
        .delete()
        .eq('user_id', userId);
      throw new InternalServerErrorException(docError.message);
    }

    return {
      provider_id: userId,
      business_name: profile?.business_name || businessName,
      verification_status: profile?.verification_status || 'pending',
    };
  }

  async getProviderProfilesByIds(userIds: unknown) {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(userIds) ? userIds : [])
          .map((userId) => this.toTrimmedString(userId))
          .filter(Boolean),
      ),
    );
    if (!normalizedIds.length) return { profiles: [] };

    const { data, error } = await this.withQueryTimeout(
      this.supabase
        .schema('provider_catalog')
        .from('provider_profiles')
        .select('user_id, business_name, bio, service_description, average_rating, verification_status, home_address, home_latitude, home_longitude, service_radius_km')
        .in('user_id', normalizedIds),
      3000,
      'provider.get-profiles-by-ids query',
    );
    if (error) throw new InternalServerErrorException(error.message);
    return { profiles: data || [] };
  }

  async getProviderApplications(page = 1, limit = 20, status = 'all') {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const query = this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select(
        'user_id, business_name, verification_status, created_at, updated_at, bio, service_description',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);

    const normalizedStatus = this.toTrimmedString(status).toLowerCase() || 'all';
    if (normalizedStatus !== 'all') {
      query.eq('verification_status', normalizedStatus);
    }

    const { data: profiles, error, count } = await query;
    if (error) throw new InternalServerErrorException(error.message);

    const rows = profiles || [];
    if (rows.length === 0) {
      return {
        applications: [],
        total: count || 0,
        page: normalizedPage,
        limit: normalizedLimit,
      };
    }

    const providerIds = rows.map((row: any) => row.user_id);
    const [users, docsResult] = await Promise.all([
      this.getUsersByIdsFromAuth(providerIds),
      this.supabase
        .schema('provider_catalog')
        .from('provider_documents')
        .select('provider_id, status')
        .in('provider_id', providerIds),
    ]);
    if (docsResult.error) {
      throw new InternalServerErrorException(docsResult.error.message);
    }

    const userMap = new Map(users.map((user: any) => [user.id, user]));
    const docRows = docsResult.data || [];

    const applications = rows.map((profile: any) => {
      const user = userMap.get(profile.user_id);
      const providerDocs = docRows.filter(
        (doc: any) => doc.provider_id === profile.user_id,
      );
      const hasRejectedDoc = providerDocs.some(
        (doc: any) => this.toTrimmedString(doc.status) === 'rejected',
      );
      const hasPendingDoc = providerDocs.some(
        (doc: any) => this.toTrimmedString(doc.status) === 'pending',
      );
      const hasApprovedDoc = providerDocs.some(
        (doc: any) => this.toTrimmedString(doc.status) === 'approved',
      );

      const derivedStatus = this.deriveApplicationStatus(
        profile.verification_status,
        hasRejectedDoc,
        hasPendingDoc,
        hasApprovedDoc,
      );

      return {
        applicationId: profile.user_id,
        providerId: profile.user_id,
        businessName: profile.business_name || user?.full_name || 'Unnamed Business',
        ownerName: user?.full_name || 'Unknown Owner',
        category: 'General Services',
        dateApplied: profile.created_at || profile.updated_at,
        location: '-',
        status: derivedStatus,
        email: user?.email || null,
        contact_number: user?.contact_number || null,
      };
    });

    return {
      applications,
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async getProviderApplicationById(id: string) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const [user, profileResult, docsResult] = await Promise.all([
      this.getUserProfileFromAuth(normalizedId),
      this.supabase
        .schema('provider_catalog')
        .from('provider_profiles')
        .select('*')
        .eq('user_id', normalizedId)
        .single(),
      this.supabase
        .schema('provider_catalog')
        .from('provider_documents')
        .select(
          'document_id, provider_id, document_type, document_file_path, status, reject_reason, uploaded_at, reviewed_at',
        )
        .eq('provider_id', normalizedId)
        .order('uploaded_at', { ascending: false }),
    ]);

    if (!user) throw new NotFoundException(`Provider application ${normalizedId} not found`);
    if (profileResult.error || !profileResult.data) {
      throw new NotFoundException(`Provider application ${normalizedId} not found`);
    }
    if (docsResult.error) {
      throw new InternalServerErrorException(docsResult.error.message);
    }

    const profile = profileResult.data;
    const mappedDocuments = await Promise.all(
      (docsResult.data || []).map((doc: any) => this.mapProviderDocument(doc)),
    );
    const documents = mappedDocuments.map((doc: any) => ({
      id: doc.document_id,
      document_id: doc.document_id,
      name: doc.document_type || 'Document',
      document_type: doc.document_type,
      file: doc.document_file_path || '',
      status: doc.status || 'pending',
      reject_reason: doc.reject_reason || null,
      uploaded_at: doc.uploaded_at || null,
      reviewed_at: doc.reviewed_at || null,
      signed_url: doc.signed_url || null,
      view_url: doc.signed_url || null,
    }));

    const status = profile.verification_status || user.status || 'pending';

    return {
      applicationId: profile.user_id,
      providerId: profile.user_id,
      businessName: profile.business_name || user.full_name || 'Unnamed Business',
      ownerName: user.full_name || 'Unknown Owner',
      category: 'General Services',
      dateApplied: profile.created_at || user.created_at,
      location: '-',
      status,
      email: user.email || null,
      contact_number: user.contact_number || null,
      profile: {
        bio: profile.bio || profile.service_description || null,
        service_description: profile.service_description || null,
        verification_status: profile.verification_status || null,
        trust_score: profile.trust_score || null,
        average_rating: profile.average_rating || null,
      },
      documents,
      notes: [],
    };
  }

  async updateProviderApplicationStatus(
    id: string,
    status: string,
    rejectReason?: string,
  ) {
    const normalizedId = this.toTrimmedString(id);
    const normalizedStatus = this.toTrimmedString(status).toLowerCase();
    if (!normalizedId) throw new BadRequestException('id is required');
    if (!['approved', 'rejected', 'pending', 'under_review'].includes(normalizedStatus)) {
      throw new BadRequestException(
        'status must be one of: approved, rejected, pending, under_review',
      );
    }
    if (
      normalizedStatus === 'rejected' &&
      !this.toTrimmedString(rejectReason)
    ) {
      throw new BadRequestException(
        'reject_reason is required when rejecting an application',
      );
    }

    const docsResult = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .select('document_id')
      .eq('provider_id', normalizedId);
    if (docsResult.error) {
      throw new InternalServerErrorException(docsResult.error.message);
    }

    const profileUpdate = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .update({
        verification_status: normalizedStatus,
        verification_decided_at: ['approved', 'rejected'].includes(normalizedStatus)
          ? new Date().toISOString()
          : null,
        reject_reason:
          normalizedStatus === 'rejected'
            ? this.toTrimmedString(rejectReason)
            : null,
      })
      .eq('user_id', normalizedId);
    if (profileUpdate.error) {
      throw new BadRequestException(profileUpdate.error.message);
    }

    const mappedUserStatus = this.mapVerificationStatusToUserStatus(
      normalizedStatus,
    );
    await this.request(AUTH_PATTERNS.UPDATE_USER_STATUS, {
      userId: normalizedId,
      status: mappedUserStatus,
    });

    const documentIds = (docsResult.data || []).map((doc: any) => doc.document_id);
    if (documentIds.length > 0) {
      const documentStatus =
        normalizedStatus === 'under_review' ? 'pending' : normalizedStatus;
      const docUpdate = await this.supabase
        .schema('provider_catalog')
        .from('provider_documents')
        .update({
          status: documentStatus,
          reject_reason:
            normalizedStatus === 'rejected'
              ? this.toTrimmedString(rejectReason)
              : null,
          reviewed_at: new Date().toISOString(),
        })
        .in('document_id', documentIds);
      if (docUpdate.error) {
        throw new BadRequestException(docUpdate.error.message);
      }
    }

    if (normalizedStatus === 'approved') {
      await this.emitProviderNotification(
        NOTIFICATION_PATTERNS.PROVIDER_APPLICATION_APPROVED,
        normalizedId,
      );
    }
    if (normalizedStatus === 'rejected') {
      await this.emitProviderNotification(
        NOTIFICATION_PATTERNS.PROVIDER_APPLICATION_REJECTED,
        normalizedId,
        { reason: this.toTrimmedString(rejectReason) },
      );
    }

    return { ok: true };
  }

  async updateDocumentStatus(documentId: string, dto: any) {
    const normalizedDocumentId = this.toTrimmedString(documentId);
    if (!normalizedDocumentId)
      throw new BadRequestException('documentId is required');

    const normalizedStatus = this.toTrimmedString(dto?.status).toLowerCase();
    if (!['approved', 'rejected', 'pending'].includes(normalizedStatus)) {
      throw new BadRequestException(
        'status must be one of: approved, rejected, pending',
      );
    }
    if (
      normalizedStatus === 'rejected' &&
      !this.toTrimmedString(dto?.reject_reason)
    ) {
      throw new BadRequestException(
        'A rejection reason must be provided when rejecting a KYC application.',
      );
    }

    const fetchResult = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .select('document_id, provider_id, status')
      .eq('document_id', normalizedDocumentId)
      .single();
    if (fetchResult.error || !fetchResult.data) {
      throw new NotFoundException(
        `Document with ID ${normalizedDocumentId} not found`,
      );
    }

    const providerId = this.toTrimmedString(fetchResult.data.provider_id);
    const docUpdatePayload: Record<string, any> = {
      status: normalizedStatus,
      reject_reason:
        normalizedStatus === 'rejected'
          ? this.toTrimmedString(dto?.reject_reason)
          : null,
      reviewed_at: new Date().toISOString(),
    };
    if (dto?.admin_id) {
      docUpdatePayload.reviewed_by = this.toTrimmedString(dto.admin_id);
    }

    const docUpdate = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .update(docUpdatePayload)
      .eq('document_id', normalizedDocumentId)
      .select()
      .single();
    if (docUpdate.error || !docUpdate.data) {
      throw new BadRequestException(
        `Failed to update document status: ${docUpdate.error?.message || 'Unknown error'}`,
      );
    }

    if (normalizedStatus === 'rejected') {
      const profileUpdate = await this.supabase
        .schema('provider_catalog')
        .from('provider_profiles')
        .update({
          verification_status: 'rejected',
          reject_reason: this.toTrimmedString(dto?.reject_reason),
          verification_decided_at: new Date().toISOString(),
        })
        .eq('user_id', providerId);
      if (profileUpdate.error) {
        throw new InternalServerErrorException(profileUpdate.error.message);
      }
      await this.emitProviderNotification(
        NOTIFICATION_PATTERNS.PROVIDER_APPLICATION_REJECTED,
        providerId,
        { reason: this.toTrimmedString(dto?.reject_reason) },
      );
    }

    return {
      status: 'success',
      message: `Document ${normalizedStatus} successfully`,
      data: {
        document_id: docUpdate.data.document_id,
        provider_id: docUpdate.data.provider_id,
        new_status: docUpdate.data.status,
        reviewed_at: docUpdate.data.reviewed_at,
      },
    };
  }

  async getRequiredDocumentTypes() {
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('required_document_types')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return { documentTypes: data || [] };
  }

  async getMyDocuments(userId: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .select(
        'document_id, provider_id, document_type, document_file_path, status, reject_reason, uploaded_at, reviewed_at, reviewed_by',
      )
      .eq('provider_id', normalizedUserId)
      .order('uploaded_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    return {
      documents: await Promise.all(
        (data || []).map((doc: any) => this.mapProviderDocument(doc)),
      ),
    };
  }

  async getMyVerification(userId: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    const [profileResult, required, documents] = await Promise.all([
      this.supabase
        .schema('provider_catalog')
        .from('provider_profiles')
        .select(
          'user_id, business_name, bio, service_description, verification_status, verification_submitted_at, verification_decided_at, reject_reason, home_address, home_latitude, home_longitude, service_radius_km',
        )
        .eq('user_id', normalizedUserId)
        .maybeSingle(),
      this.getRequiredDocumentTypes(),
      this.getMyDocuments(normalizedUserId),
    ]);

    if (profileResult.error) {
      throw new InternalServerErrorException(profileResult.error.message);
    }

    return {
      profile: profileResult.data || null,
      verification_status:
        profileResult.data?.verification_status || 'pending',
      required_document_types: required.documentTypes,
      documents: documents.documents,
    };
  }

  async uploadDocument(
    userId: string,
    documentType: string,
    file: Express.Multer.File,
  ) {
    const normalizedUserId = this.toTrimmedString(userId);
    const normalizedDocumentType = this.normalizeDocumentType(documentType);
    if (!normalizedUserId) throw new BadRequestException('userId is required');
    if (!normalizedDocumentType) {
      throw new BadRequestException('document_type is required');
    }
    if (!file) throw new BadRequestException('A document file is required');

    const { data: profile, error: profileError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('verification_status')
      .eq('user_id', normalizedUserId)
      .maybeSingle();
    if (profileError) throw new InternalServerErrorException(profileError.message);
    if (!profile) throw new NotFoundException('Provider profile not found');
    if (this.toTrimmedString(profile.verification_status) === 'approved') {
      throw new BadRequestException('Approved providers cannot replace verification documents');
    }

    const storagePath = `providers/${normalizedUserId}/${normalizedDocumentType}/${Date.now()}_${this.sanitizeStorageName(file.originalname)}`;
    const { error: uploadError } = await this.supabase.storage
      .from('verification-docs')
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });
    if (uploadError) throw new BadRequestException(uploadError.message);

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .insert([
        {
          provider_id: normalizedUserId,
          document_type: normalizedDocumentType,
          document_file_path: storagePath,
          status: 'pending',
        },
      ])
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    return {
      document: await this.mapProviderDocument(data),
      status: 'pending',
    };
  }

  async deleteMyDocument(userId: string, documentId: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    const normalizedDocumentId = this.toTrimmedString(documentId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');
    if (!normalizedDocumentId) throw new BadRequestException('documentId is required');

    const { data: doc, error: fetchError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .select('document_id, provider_id, document_file_path, status')
      .eq('document_id', normalizedDocumentId)
      .eq('provider_id', normalizedUserId)
      .maybeSingle();
    if (fetchError) throw new InternalServerErrorException(fetchError.message);
    if (!doc) throw new NotFoundException('Document not found');

    const status = this.toTrimmedString(doc.status);
    if (!['pending', 'rejected'].includes(status)) {
      throw new BadRequestException('Only pending or rejected documents can be deleted');
    }

    const { error: deleteError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_documents')
      .delete()
      .eq('document_id', normalizedDocumentId)
      .eq('provider_id', normalizedUserId);
    if (deleteError) throw new InternalServerErrorException(deleteError.message);

    const storagePath = this.toTrimmedString(doc.document_file_path);
    if (storagePath) {
      await this.supabase.storage.from('verification-docs').remove([storagePath]);
    }

    return { ok: true };
  }

  async submitForReview(userId: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    const [profileResult, requiredResult, docsResult] = await Promise.all([
      this.supabase
        .schema('provider_catalog')
        .from('provider_profiles')
        .select('verification_status')
        .eq('user_id', normalizedUserId)
        .maybeSingle(),
      this.supabase
        .schema('provider_catalog')
        .from('required_document_types')
        .select('code')
        .eq('is_required', true),
      this.supabase
        .schema('provider_catalog')
        .from('provider_documents')
        .select('document_type, status')
        .eq('provider_id', normalizedUserId),
    ]);

    if (profileResult.error) {
      throw new InternalServerErrorException(profileResult.error.message);
    }
    if (!profileResult.data) throw new NotFoundException('Provider profile not found');
    if (requiredResult.error) {
      throw new InternalServerErrorException(requiredResult.error.message);
    }
    if (docsResult.error) {
      throw new InternalServerErrorException(docsResult.error.message);
    }

    const currentStatus = this.toTrimmedString(
      profileResult.data.verification_status,
    );
    if (!['pending', 'rejected'].includes(currentStatus)) {
      throw new BadRequestException(
        'Only pending or rejected applications can be submitted for review',
      );
    }

    const acceptableDocs = new Set(
      (docsResult.data || [])
        .filter((doc: any) => this.toTrimmedString(doc.status) !== 'rejected')
        .map((doc: any) => this.normalizeDocumentType(doc.document_type)),
    );
    const missing = (requiredResult.data || [])
      .map((row: any) => this.normalizeDocumentType(row.code))
      .filter((code: string) => !acceptableDocs.has(code));
    if (missing.length) {
      throw new BadRequestException(
        `Missing required documents: ${missing.join(', ')}`,
      );
    }

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .update({
        verification_status: 'under_review',
        verification_submitted_at: new Date().toISOString(),
        verification_decided_at: null,
        reject_reason: null,
      })
      .eq('user_id', normalizedUserId)
      .select(
        'user_id, business_name, verification_status, verification_submitted_at',
      )
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    await this.emitAdminProviderApplicationSubmitted(normalizedUserId);

    return { profile: data, status: 'under_review' };
  }

  async getProviderDashboard(providerId: string) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId) {
      return {
        new_job_requests: 0,
        total_earnings: 0,
      };
    }

    const [bookingResponse, earningsSummary] = await Promise.all([
      this.request<any>(BOOKING_PATTERNS.GET_PROVIDER_BOOKINGS, {
        providerId: normalizedProviderId,
      }),
      this.request<any>(PAYMENT_PATTERNS.GET_EARNINGS_SUMMARY, {
        providerId: normalizedProviderId,
      }),
    ]);

    const bookings = Array.isArray(bookingResponse?.bookings)
      ? bookingResponse.bookings
      : [];
    const newRequests = bookings.filter(
      (booking: any) => this.toTrimmedString(booking?.status) === 'pending',
    ).length;

    return {
      new_job_requests: newRequests,
      total_earnings: Number(earningsSummary?.monthly_earnings || 0),
    };
  }

  async getServicesByIds(serviceIds: unknown) {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(serviceIds) ? serviceIds : [])
          .map((serviceId) => this.toTrimmedString(serviceId))
          .filter(Boolean),
      ),
    );
    if (!normalizedIds.length) return { services: [] };

    try {
      const result = await this.withQueryTimeout<any>(
        this.supabase
          .schema('provider_catalog')
          .from('provider_services')
          .select('id, title')
          .in('id', normalizedIds),
        4500,
        'provider.get-services-by-ids query',
      );
      const { data, error } = result || {};
      if (error) {
        this.logger.warn(
          `provider.get-services-by-ids degraded: ${this.toTrimmedString(error?.message) || 'query error'}`,
        );
        return { services: [] };
      }
      return { services: data || [] };
    } catch (error) {
      if (this.isTimeoutLikeError(error)) {
        this.logger.warn(
          `provider.get-services-by-ids degraded: query timed out for ${normalizedIds.length} id(s)`,
        );
        return { services: [] };
      }
      throw error;
    }
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
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId) {
      throw new BadRequestException('providerId is required');
    }

    const { data: profile } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('average_rating, total_reviews')
      .eq('user_id', normalizedProviderId)
      .single();

    let reviews: any[] = [];
    try {
      const reviewsResponse = await this.request<any>(
        TRUST_PATTERNS.GET_PROVIDER_REVIEWS,
        { providerId: normalizedProviderId },
      );
      reviews = Array.isArray(reviewsResponse?.reviews)
        ? reviewsResponse.reviews
        : [];
    } catch (error) {
      this.logger.warn(
        `provider.get-reviews degraded: ${this.toTrimmedString((error as { message?: unknown })?.message) || 'trust-service unavailable'}`
      );
      reviews = [];
    }

    return {
      status: 'success',
      data: {
        provider_id: normalizedProviderId,
        average_rating: Number(profile?.average_rating) || 0,
        total_reviews: Number(profile?.total_reviews) || reviews.length || 0,
        reviews,
      },
    };
  }

  async getAllReviews(page = 1, limit = 20) {
    return await this.request<any>(TRUST_PATTERNS.GET_ALL_REVIEWS, {
      page,
      limit,
    });
  }

  async deleteReview(id: string) {
    return await this.request<any>(TRUST_PATTERNS.DELETE_REVIEW, { id });
  }

  async getPerformanceReport(from?: string, to?: string) {
    const trustResponse = await this.request<any>(
      TRUST_PATTERNS.GET_PERFORMANCE_REPORT,
      { from, to },
    );
    const reviews = Array.isArray(trustResponse?.reviews)
      ? trustResponse.reviews
      : [];

    const { data: profiles, error: profilesError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select(
        'user_id, business_name, average_rating, total_reviews, trust_score, verification_status',
      );
    if (profilesError) {
      throw new InternalServerErrorException(profilesError.message);
    }

    return { reviews, provider_profiles: profiles || [] };
  }

  async getComplianceReport(from?: string, to?: string) {
    return await this.request<any>(TRUST_PATTERNS.GET_COMPLIANCE_REPORT, {
      from,
      to,
    });
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
    await this.request(AUTH_PATTERNS.UPDATE_USER_STATUS, {
      userId,
      status: 'pending',
    });
    return { status: 'success', message: 'KYC document reuploaded successfully.' };
  }

  // === Provider Bookings ===
  async getProviderBookings(providerId: string) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId) return { bookings: [] };

    try {
      return await this.request<any>(
        BOOKING_PATTERNS.GET_PROVIDER_BOOKINGS,
        { providerId: normalizedProviderId },
        { timeoutMs: 5000, retries: 0 },
      );
    } catch (error) {
      this.logger.warn(
        `provider.get-bookings degraded: ${this.toTrimmedString((error as any)?.message)}`,
      );
      return { bookings: [] };
    }
  }

  async getProviderBookingById(bookingId: string, providerId?: string) {
    return await this.request<any>(BOOKING_PATTERNS.GET_PROVIDER_BOOKING_BY_ID, {
      bookingId,
      providerId,
    });
  }

  async updateProviderBookingStatus(
    bookingId: string,
    status: string,
    providerId?: string,
  ) {
    const normalizedStatus = this.toTrimmedString(status).toLowerCase();
    return await this.request(BOOKING_PATTERNS.UPDATE_STATUS, {
      id: bookingId,
      status: normalizedStatus || status,
      providerId,
    });
  }

  // === Provider Availability ===
  async getProviderAvailability(userId: string, accessToken?: string) {
    return await this.request<any>(BOOKING_PATTERNS.GET_PROVIDER_AVAILABILITY, {
      userId,
      accessToken,
    });
  }

  async saveProviderAvailability(userId: string, body: any, accessToken?: string) {
    return await this.request<any>(BOOKING_PATTERNS.SAVE_PROVIDER_AVAILABILITY, {
      userId,
      accessToken,
      ...body,
    });
  }

  async getReservedSlots(providerId: string, date: string) {
    return await this.request<any>(BOOKING_PATTERNS.GET_RESERVED_SLOTS, {
      providerId,
      date,
    });
  }

  async checkAvailability(
    providerId: string,
    scheduledAt: string,
    hoursRequired: string,
  ) {
    return await this.request<any>(BOOKING_PATTERNS.CHECK_PROVIDER_AVAILABILITY, {
      providerId,
      scheduledAt,
      hoursRequired,
    });
  }

  // === My Services (Provider Catalog) ===
  async getMyServices(providerId: string, activeOnly = false) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId) return { services: [] };

    let query = this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('*')
      .eq('provider_id', normalizedProviderId);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await this.withQueryTimeout(
      query,
      3000,
      'provider.get-my-services query',
    );
    if (error) {
      this.logger.warn(
        `provider.get-my-services degraded: ${this.toTrimmedString(error.message)}`,
      );
      return { services: [] };
    }
    return { services: data || [] };
  }

  async getPricingGuidance(providerId: string, body: any) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    const serviceId = this.toTrimmedString(body?.service_id ?? body?.serviceId);
    const pricingMode = this.normalizePricingMode(body?.pricing_mode ?? body?.pricingMode) || 'flat';
    const providerPrice = this.toPositiveNumber(body?.price);
    const durationMinutes = this.toPositiveNumber(body?.duration_minutes ?? body?.durationMinutes) || 60;
    const hoursRequired = Math.max(1, durationMinutes / 60);

    if (!normalizedProviderId) throw new BadRequestException('providerId is required');
    if (!serviceId) throw new BadRequestException('service_id is required');
    if (!providerPrice) throw new BadRequestException('price is required');

    const vehicle = await this.getProviderTravelProfile(normalizedProviderId);
    const fuelType = this.normalizeFuelType(vehicle?.fuelType);
    const fuel = await this.getFuelBaseline(fuelType);
    const laborBaseline = await this.getLaborBaseline(serviceId, pricingMode, hoursRequired);
    const radiusTier = this.normalizeRadiusTier(body?.radius_tier ?? body?.radiusTier);
    const distanceKm = this.toNullableNumber(body?.distance_km ?? body?.distanceKm) ?? undefined;

    const pricingQuote = calculatePricingQuote({
      pricingMode,
      providerPrice,
      hoursRequired,
      bookingAmount: pricingMode === 'hourly' ? providerPrice * hoursRequired : providerPrice,
      radiusTier,
      distanceKm,
      jobComplexity: this.normalizeJobComplexity(body?.job_complexity ?? body?.jobComplexity),
      urgency: this.normalizePricingUrgency(body?.urgency),
      vehicle,
      fuel,
      laborBaseline,
      providerBaseMissing: distanceKm === undefined,
    });

    pricingQuote.assumptions.push(
      'Provider pricing guidance uses your listed price to show how competitive and sustainable it looks before customers book.',
    );
    if (distanceKm === undefined) {
      pricingQuote.assumptions.push(
        'No customer address is selected yet; travel guidance uses your normal service radius tier.',
      );
    }

    return { pricing_guidance: pricingQuote };
  }

  async getAdminServices(page = 1, limit = 20) {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const { data, error, count } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    return {
      services: data || [],
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async createAdminService(body: any) {
    const source = body && typeof body === 'object' ? body : {};
    const providerId = this.toTrimmedString(source.provider_id ?? source.providerId);
    const categoryId = this.toTrimmedString(source.category_id ?? source.categoryId);
    const title = this.toTrimmedString(source.title);
    const price = this.toPositiveNumber(source.price);

    if (!providerId) throw new BadRequestException('provider_id is required');
    if (!categoryId) throw new BadRequestException('category_id is required');
    if (!title) throw new BadRequestException('title is required');
    if (price === null) {
      throw new BadRequestException('price must be a number greater than 0');
    }

    const payload = {
      provider_id: providerId,
      category_id: categoryId,
      title,
      description: this.toNullableString(source.description),
      price,
      is_active: this.toBoolean(source.is_active ?? source.isActive, true),
    };

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .insert([payload])
      .select('*')
      .single();
    if (error) {
      throw new BadRequestException(
        `Failed to create service: ${error.message}${
          error.code ? ` (${error.code})` : ''
        }`,
      );
    }
    return { service: data };
  }

  async updateAdminService(id: string, body: any) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const source = body && typeof body === 'object' ? body : {};
    const {
      provider_id: _providerId,
      id: _id,
      status,
      isActive,
      is_active,
      active: _active,
      ...rawUpdates
    } = source;
    const updates: Record<string, any> = {};

    const supportedFields = [
      'title',
      'description',
      'category_id',
      'price',
    ];
    for (const field of supportedFields) {
      if (Object.hasOwn(rawUpdates, field)) updates[field] = rawUpdates[field];
    }
    if (Object.hasOwn(rawUpdates, 'categoryId')) {
      updates.category_id = rawUpdates.categoryId;
    }

    if (is_active !== undefined) {
      updates.is_active = this.toBoolean(is_active, true);
    } else if (isActive !== undefined) {
      updates.is_active = this.toBoolean(isActive, true);
    } else if (status !== undefined) {
      const normalizedStatus = this.toTrimmedString(status).toLowerCase();
      if (normalizedStatus === 'active') {
        updates.is_active = true;
      } else if (normalizedStatus === 'inactive') {
        updates.is_active = false;
      } else {
        throw new BadRequestException(
          'status must be one of: active, inactive',
        );
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('No supported service fields provided');
    }

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .update(updates)
      .eq('id', normalizedId)
      .select('*');
    if (error) {
      throw new BadRequestException(
        `Failed to update service: ${error.message}${
          error.code ? ` (${error.code})` : ''
        }`,
      );
    }
    if (!data || data.length === 0) {
      throw new NotFoundException(`Service ${normalizedId} not found`);
    }
    return { ok: true, service: data[0] };
  }

  async deleteAdminService(id: string) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .delete()
      .eq('id', normalizedId)
      .select('id');
    if (error) throw new InternalServerErrorException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException(`Service ${normalizedId} not found`);
    }
    return { ok: true };
  }

  private async checkProviderVerificationStatus(providerId: string): Promise<void> {
    const { data: profile, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('verification_status')
      .eq('user_id', providerId)
      .single();

    if (error) {
      throw new InternalServerErrorException('Failed to verify provider status');
    }

    const verificationStatus = this.toTrimmedString(profile?.verification_status);
    if (verificationStatus !== 'approved') {
      throw new ForbiddenException(
        'You must complete the screening process and be fully verified before adding services. ' +
        'Please complete your verification in the Provider Verification section.'
      );
    }
  }

  async createMyService(providerId: string, body: any) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId) throw new BadRequestException('providerId is required');

    // Check if provider is verified before allowing service creation
    await this.checkProviderVerificationStatus(normalizedProviderId);

    const payload = this.normalizeServicePayload(body, {
      providerId: normalizedProviderId,
      requireCoreFields: true,
    });
    const resolvedServiceId = await this.resolveServiceCategoryId(payload.service_id);
    if (!resolvedServiceId) {
      throw new BadRequestException('Service category is not recognized');
    }
    payload.service_id = resolvedServiceId;

    let { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .insert([payload])
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return { service: data };
  }

  async updateMyService(serviceId: string, providerId: string, body: any) {
    const normalizedServiceId = this.toTrimmedString(serviceId);
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedServiceId) throw new BadRequestException('serviceId is required');
    if (!normalizedProviderId) throw new BadRequestException('providerId is required');

    // Check if provider is verified before allowing service update
    await this.checkProviderVerificationStatus(normalizedProviderId);

    const payload = this.normalizeServicePayload(body, { requireCoreFields: true });
    const resolvedServiceId = await this.resolveServiceCategoryId(payload.service_id);
    if (!resolvedServiceId) {
      throw new BadRequestException('Service category is not recognized');
    }
    payload.service_id = resolvedServiceId;
    let { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .update(payload)
      .eq('id', normalizedServiceId)
      .eq('provider_id', normalizedProviderId)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return { service: data };
  }

  async deleteMyService(serviceId: string, providerId: string) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId) throw new BadRequestException('providerId is required');

    // Check if provider is verified before allowing service deletion
    await this.checkProviderVerificationStatus(normalizedProviderId);

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
        'user_id, business_name, bio, service_description, trust_score, verification_status, home_address, home_latitude, home_longitude, service_radius_km',
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
      'bio',
      'service_description',
      'home_address',
      'home_latitude',
      'home_longitude',
      'service_radius_km',
    ];
    const updates: any = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const baseQuery = this.supabase
      .schema('provider_catalog')
      .from('provider_profiles');

    // If the provider profile row doesn't exist yet, PostgREST returns 0 rows
    // and `.single()` produces an error. Treat that case as "create on first edit".
    const { data, error } = await baseQuery
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (!error) return { draft: data };

    // PGRST116: "The result contains 0 rows" (common when update matched nothing).
    if ((error as any)?.code === 'PGRST116') {
      const { data: inserted, error: insertError } = await baseQuery
        .insert({ user_id: userId, ...updates })
        .select()
        .single();
      if (insertError) throw new InternalServerErrorException(insertError.message);
      return { draft: inserted };
    }

    throw new InternalServerErrorException(error.message);
  }

  // === Additional Charges ===
  async createAdditionalCharges(body: any) {
    return await this.request<any>(
      BOOKING_PATTERNS.CREATE_ADDITIONAL_CHARGES,
      body,
    );
  }

  async getAdditionalCharges(bookingId: string, providerId?: string) {
    return await this.request<any>(BOOKING_PATTERNS.GET_ADDITIONAL_CHARGES, {
      bookingId,
      providerId,
    });
  }

  async reviewAdditionalCharges(body: any) {
    return await this.request<any>(
      BOOKING_PATTERNS.REVIEW_ADDITIONAL_CHARGES,
      body,
    );
  }

  // === Reviews & Reports ===
  async submitReview(body: any) {
    const revieweeId = this.toTrimmedString(body?.reviewee_id);
    const response = await this.request<any>(TRUST_PATTERNS.CREATE_REVIEW, body);
    const totalReviews = Number(response?.total_reviews || 0);
    const averageRating = Number(response?.average_rating || 0);

    if (revieweeId && totalReviews >= 0) {
      await this.supabase
        .schema('provider_catalog')
        .from('provider_profiles')
        .update({
          average_rating: averageRating,
          total_reviews: totalReviews,
        })
        .eq('user_id', revieweeId);
    }
    return { review: response?.review || null };
  }

  async submitReport(body: any) {
    return await this.request<any>(TRUST_PATTERNS.CREATE_PROVIDER_REPORT, body);
  }

  // === Review Responses ===
  async createReviewResponse(body: any) {
    return await this.request<any>(TRUST_PATTERNS.CREATE_REVIEW_RESPONSE, body);
  }

  async updateReviewResponse(body: any) {
    return await this.request<any>(TRUST_PATTERNS.UPDATE_REVIEW_RESPONSE, body);
  }

  async getReviewWithResponse(body: any) {
    return await this.request<any>(TRUST_PATTERNS.GET_REVIEW_WITH_RESPONSE, body);
  }
}

