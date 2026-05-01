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
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AUTH_PATTERNS,
  PROVIDER_PATTERNS,
  PAYMENT_PATTERNS,
  SUPPORT_PATTERNS,
  NOTIFICATION_PATTERNS,
  calculatePricingQuote,
  connectKafkaClientWithRetry,
  type FuelFreshness,
  type FuelType,
  type PricingMode,
  type RadiusTier,
  type VehicleType,
  sendKafkaRpcRequest,
} from '@app/common';

@Injectable()
export class BookingService implements OnModuleInit {
  private readonly availabilitySchemas = ['booking'] as const;
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly supabase: SupabaseClient,
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
  ) {}

  async onModuleInit() {
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_PROFILE);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_USERS_BY_IDS);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS);
    this.kafka.subscribeToResponseOf(SUPPORT_PATTERNS.CREATE_DISPUTE);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.CANCEL_BOOKING_PAYMENT);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.UPDATE_AMOUNT);
    await connectKafkaClientWithRetry(this.kafka, {
      context: BookingService.name,
      logger: this.logger,
    });
  }

  private async emitNotifications(bookingId: string, type: string, metadata: any = {}) {
    try {
      const booking = await this.getBookingRowByIdentifier(
        bookingId,
        'id, customer_id, provider_id',
      );
      if (!booking) return;
      
      // Emit to customer
      this.kafka.emit(type, {
        userId: booking.customer_id,
        bookingId,
        type,
        metadata,
      });
      
      // Emit to provider
      this.kafka.emit(type, {
        userId: booking.provider_id,
        bookingId,
        type,
        metadata,
      });
    } catch (error) {
      this.logger.warn(`Failed to emit notification for booking ${bookingId}:`, error);
    }
  }

  private toTrimmedString(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value === 'string') return value.trim() || null;
    if (value === null || value === undefined) return null;
    return String(value).trim() || null;
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

  private normalizeFuelType(value: unknown): FuelType {
    return this.toTrimmedString(value).toLowerCase() === 'diesel'
      ? 'diesel'
      : 'gasoline';
  }

  private normalizePricingMode(value: unknown): PricingMode {
    return this.toTrimmedString(value).toLowerCase() === 'hourly'
      ? 'hourly'
      : 'flat';
  }

  private normalizeRadiusTier(value: unknown): RadiusTier {
    const normalized = this.toTrimmedString(value).toLowerCase();
    if (['extended', 'far', 'outside'].includes(normalized)) {
      return normalized as RadiusTier;
    }
    return 'base';
  }

  private normalizeVehicleType(value: unknown): VehicleType {
    const normalized = this.toTrimmedString(value).toLowerCase();
    if (['car', 'van'].includes(normalized)) return normalized as VehicleType;
    return 'motorcycle';
  }

  private async getFuelBaseline(fuelType: FuelType) {
    const liveFuel = await this.fetchLiveFuelBaseline(fuelType);
    if (liveFuel) return liveFuel;

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

  private async fetchLiveFuelBaseline(fuelType: FuelType) {
    const url = this.toTrimmedString(process.env.SERVEASE_FUEL_PRICE_URL);
    if (!url) return null;

    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return null;
      const payload = await response.json();
      const price =
        this.extractFuelPrice(payload, fuelType) ||
        this.extractFuelPrice(payload?.prices, fuelType) ||
        this.extractFuelPrice(payload?.data, fuelType);
      if (!price) return null;

      const fetchedAt =
        this.toTrimmedString(payload?.fetched_at) ||
        this.toTrimmedString(payload?.updated_at) ||
        new Date().toISOString();
      const sourceName =
        this.toTrimmedString(payload?.source_name) || 'Configured live fuel source';
      const sourceUrl = this.toTrimmedString(payload?.source_url) || url;

      await this.supabase
        .schema('booking')
        .from('fuel_price_cache')
        .insert([
          {
            country_code: 'PH',
            fuel_type: fuelType,
            price_per_liter: price,
            currency: 'PHP',
            source_name: sourceName,
            source_url: sourceUrl,
            fetched_at: fetchedAt,
            valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            raw_payload: payload,
          },
        ]);

      return {
        fuelType,
        pricePerLiter: price,
        sourceName,
        sourceUrl,
        fetchedAt,
        freshness: 'fresh' as FuelFreshness,
      };
    } catch (error) {
      this.logger.warn(
        `fuel price live fetch degraded: ${this.toTrimmedString((error as any)?.message)}`,
      );
      return null;
    }
  }

  private extractFuelPrice(payload: any, fuelType: FuelType) {
    if (!payload || typeof payload !== 'object') return null;
    const keys =
      fuelType === 'diesel'
        ? ['diesel', 'diesel_price', 'diesel_php', 'diesel_price_per_liter']
        : ['gasoline', 'gasoline_price', 'gasoline_php', 'gasoline_price_per_liter', 'petrol'];
    for (const key of keys) {
      const value = this.toNullableNumber(payload[key]);
      if (value && value > 0) return value;
    }
    return null;
  }

  private defaultFuelPrice(fuelType: FuelType) {
    const envKey =
      fuelType === 'diesel'
        ? 'SERVEASE_DEFAULT_DIESEL_PRICE_PHP'
        : 'SERVEASE_DEFAULT_GASOLINE_PRICE_PHP';
    const configured = this.toNullableNumber(process.env[envKey]);
    return configured && configured > 0 ? configured : fuelType === 'diesel' ? 60 : 65;
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

    const baselineMode = this.normalizePricingMode(data.pricing_mode);
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

  private async getProviderRadiusTier(providerId: string, dto: any): Promise<RadiusTier> {
    const requestedTier = this.toTrimmedString(dto?.radius_tier);
    if (requestedTier) return this.normalizeRadiusTier(requestedTier);

    const { data } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('service_radius_km, home_latitude, home_longitude')
      .eq('user_id', providerId)
      .maybeSingle();
    const serviceRadius = this.toNullableNumber(data?.service_radius_km) || 10;
    const providerLat = this.toNullableNumber(data?.home_latitude);
    const providerLng = this.toNullableNumber(data?.home_longitude);
    const serviceLat = this.toNullableNumber(dto?.service_latitude);
    const serviceLng = this.toNullableNumber(dto?.service_longitude);
    if (
      providerLat === null ||
      providerLng === null ||
      serviceLat === null ||
      serviceLng === null
    ) {
      return 'base';
    }

    const distanceKm = this.haversineKm(providerLat, providerLng, serviceLat, serviceLng);
    if (distanceKm <= serviceRadius) return 'base';
    if (distanceKm <= serviceRadius * 1.5) return 'extended';
    if (distanceKm <= serviceRadius * 2) return 'far';
    return 'outside';
  }

  private async getProviderBaseMissing(providerId: string) {
    const { data } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('home_latitude, home_longitude')
      .eq('user_id', providerId)
      .maybeSingle();
    return (
      this.toNullableNumber(data?.home_latitude) === null ||
      this.toNullableNumber(data?.home_longitude) === null
    );
  }

  private haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const deltaLat = toRad(lat2 - lat1);
    const deltaLon = toRad(lon2 - lon1);
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(deltaLon / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private isMissingRelationError(error: any) {
    const code = this.toTrimmedString(error?.code).toUpperCase();
    const message = this.toTrimmedString(error?.message).toLowerCase();
    return (
      code === '42P01' ||
      code === 'PGRST106' ||
      ((message.includes('relation') || message.includes('schema')) &&
        message.includes('does not exist'))
    );
  }

  private isSchemaMismatchError(error: any) {
    const code = this.toTrimmedString(error?.code).toUpperCase();
    const message = this.toTrimmedString(error?.message).toLowerCase();
    return (
      code === '42703' ||
      code === 'PGRST204' ||
      code === 'PGRST200' ||
      (message.includes('column') && message.includes('does not exist')) ||
      message.includes('schema cache')
    );
  }

  private isInvalidUuidError(error: any) {
    const code = this.toTrimmedString(error?.code).toUpperCase();
    const message = this.toTrimmedString(error?.message).toLowerCase();
    return (
      code === '22P02' || message.includes('invalid input syntax for type uuid')
    );
  }

  private extractMissingColumnFromError(error: any): string | null {
    const searchTexts = [
      this.toTrimmedString(error?.message),
      this.toTrimmedString(error?.details),
      this.toTrimmedString(error?.hint),
      this.toTrimmedString(error?.description),
    ].filter(Boolean);
    if (!searchTexts.length) return null;

    const postgresPattern = /column\s+["']?(\w+)["']?/i;
    const schemaCachePattern =
      /find\s+the\s+["'](\w+)["']\s+column\s+of/i;

    for (const text of searchTexts) {
      if (text.toLowerCase().includes('does not exist')) {
        const postgresMatch = postgresPattern.exec(text);
        if (postgresMatch?.[1]) return postgresMatch[1];
      }

      const schemaCacheMatch = schemaCachePattern.exec(text);
      if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
    }

    return null;
  }

  private resolveServiceTitle(booking: any) {
    return (
      this.toTrimmedString(booking?.service_title) ||
      this.toTrimmedString(booking?.service_name) ||
      this.toTrimmedString(booking?.service_description) ||
      ''
    );
  }

  private async getProviderServiceForBooking(
    providerId: string,
    providerServiceId: string,
    serviceId: string,
  ) {
    const selectColumns =
      'id, provider_id, service_id, title, description, pricing_mode, price, duration_minutes, is_active';

    if (providerServiceId) {
      const result = await this.supabase
        .schema('provider_catalog')
        .from('provider_services')
        .select(selectColumns)
        .eq('provider_id', providerId)
        .eq('id', providerServiceId)
        .eq('is_active', true)
        .maybeSingle();

      if (result.error) {
        if (this.isInvalidUuidError(result.error)) return null;
        if (!this.isMissingRelationError(result.error)) {
          throw new InternalServerErrorException(result.error.message);
        }
      }
      if (result.data) return result.data as Record<string, any>;
    }

    if (!serviceId) return null;
    const result = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select(selectColumns)
      .eq('provider_id', providerId)
      .eq('service_id', serviceId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (result.error) {
      if (this.isInvalidUuidError(result.error)) return null;
      if (!this.isMissingRelationError(result.error)) {
        throw new InternalServerErrorException(result.error.message);
      }
    }

    return (result.data as Record<string, any>) || null;
  }

  private timeStringToMinutes(value: unknown): number | null {
    const normalized = this.normalizeTime(value);
    if (!normalized) return null;
    const [hour, minute] = normalized.split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  }

  private rangesOverlap(
    start: number,
    end: number,
    blockedStart: number,
    blockedEnd: number,
  ) {
    return start < blockedEnd && end > blockedStart;
  }

  private getManilaScheduleParts(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const byType = new Map(parts.map((part) => [part.type, part.value]));
    const year = byType.get('year');
    const month = byType.get('month');
    const day = byType.get('day');
    const weekday = byType.get('weekday') || '';
    let hour = Number(byType.get('hour'));
    const minute = Number(byType.get('minute'));

    if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }
    if (hour === 24) hour = 0;

    return {
      date: `${year}-${month}-${day}`,
      weekday,
      minutes: hour * 60 + minute,
    };
  }

  private async getAvailabilityBlockReason(
    providerId: string,
    scheduledAt: string,
    hoursRequired: number,
  ) {
    const scheduleParts = this.getManilaScheduleParts(scheduledAt);
    if (!scheduleParts) throw new BadRequestException('scheduled_at is invalid');

    const { weeklySchedule, availabilityWindows, daysOff } = await this.getProviderAvailabilityWithClient(
      this.supabase,
      providerId,
    );

    const isDayOff = (daysOff || []).some(
      (day: any) => this.normalizeOffDate(day?.off_date) === scheduleParts.date,
    );
    if (isDayOff) return 'Provider is unavailable on this date.';

    const requestedStart = scheduleParts.minutes;
    const requestedEnd = requestedStart + hoursRequired * 60;
    const activeWindows = (availabilityWindows || []).filter(
      (window: any) =>
        this.normalizeWeekdayKey(window?.day_of_week) === scheduleParts.weekday &&
        this.toBoolean(window?.is_active, true),
    );

    if (activeWindows.length) {
      const fitsWindow = activeWindows.some((window: any) => {
        const startTime = this.timeStringToMinutes(window?.start_time);
        const endTime = this.timeStringToMinutes(window?.end_time);
        return startTime !== null && endTime !== null && requestedStart >= startTime && requestedEnd <= endTime;
      });
      return fitsWindow ? null : 'Selected time is outside the provider schedule.';
    }

    if (!weeklySchedule?.length) return null;

    const day = weeklySchedule.find(
      (item: any) =>
        this.normalizeWeekdayKey(item?.day_of_week) === scheduleParts.weekday,
    );
    if (!day || !this.toBoolean(day?.is_active, false)) {
      return 'Provider is not accepting bookings on this day.';
    }

    const startTime = this.timeStringToMinutes(day?.start_time);
    const endTime = this.timeStringToMinutes(day?.end_time);
    if (startTime === null || endTime === null) {
      return 'Provider schedule is incomplete for this day.';
    }

    if (requestedStart < startTime || requestedEnd > endTime) {
      return 'Selected time is outside the provider schedule.';
    }

    const breakStart = this.timeStringToMinutes(day?.break_start_time);
    const breakEnd = this.timeStringToMinutes(day?.break_end_time);
    if (
      breakStart !== null &&
      breakEnd !== null &&
      this.rangesOverlap(requestedStart, requestedEnd, breakStart, breakEnd)
    ) {
      return 'Selected time overlaps with the provider break.';
    }

    return null;
  }

  private async getBookingRowByIdentifier(
    bookingIdentifier: string,
    selectColumns = '*',
  ): Promise<Record<string, unknown> | null> {
    const normalizedBookingIdentifier = this.toTrimmedString(bookingIdentifier);
    if (!normalizedBookingIdentifier) return null;

    const byId = await this.supabase
      .schema('booking')
      .from('bookings')
      .select(selectColumns)
      .eq('id', normalizedBookingIdentifier)
      .maybeSingle();
    if (byId.error && !this.isInvalidUuidError(byId.error)) {
      throw new InternalServerErrorException(byId.error.message);
    }
    if (byId.data) return byId.data as unknown as Record<string, unknown>;

    const byReference = await this.supabase
      .schema('booking')
      .from('bookings')
      .select(selectColumns)
      .eq('booking_reference', normalizedBookingIdentifier)
      .maybeSingle();
    if (byReference.error) {
      throw new InternalServerErrorException(byReference.error.message);
    }

    return (byReference.data as unknown as Record<string, unknown>) || null;
  }

  private normalizeTime(value: unknown): string | null {
    const raw = this.toTrimmedString(value);
    if (!raw) return null;
    const hhmmss = /^(\d{2}):(\d{2}):(\d{2})$/.exec(raw);
    if (hhmmss) return raw;
    const hhmm = /^(\d{2}):(\d{2})$/.exec(raw);
    if (hhmm) return `${hhmm[1]}:${hhmm[2]}:00`;
    return null;
  }

  private normalizeWeekdayKey(value: unknown): string {
    const normalized = this.toTrimmedString(value).toLowerCase();
    const weekdays: Record<string, string> = {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday',
    };
    return weekdays[normalized] || '';
  }

  private normalizeOffDate(value: unknown): string | null {
    const raw = this.toTrimmedString(value);
    if (!raw) return null;

    const yyyyMmDd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (yyyyMmDd) return `${yyyyMmDd[1]}-${yyyyMmDd[2]}-${yyyyMmDd[3]}`;

    const isoPrefix = /^(\d{4})-(\d{2})-(\d{2})T/.exec(raw);
    if (isoPrefix) return `${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`;

    const ddMmYyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    if (ddMmYyyy) return `${ddMmYyyy[3]}-${ddMmYyyy[2]}-${ddMmYyyy[1]}`;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async getUserProfileFromAuth(userId: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) return null;
    return await sendKafkaRpcRequest(
      () =>
        this.kafka.send(AUTH_PATTERNS.GET_PROFILE, {
          userId: normalizedUserId,
        }),
      { context: AUTH_PATTERNS.GET_PROFILE },
    );
  }

  private async getUsersByIdsFromAuth(userIds: string[]) {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(userIds) ? userIds : [])
          .map((userId) => this.toTrimmedString(userId))
          .filter(Boolean),
      ),
    );
    if (!normalizedIds.length) return [] as Record<string, unknown>[];

    const response = await sendKafkaRpcRequest(
      () =>
        this.kafka.send(AUTH_PATTERNS.GET_USERS_BY_IDS, {
          userIds: normalizedIds,
        }),
      { context: AUTH_PATTERNS.GET_USERS_BY_IDS },
    );
    const users =
      response && typeof response === 'object' && 'users' in response
        ? response.users
        : [];
    return Array.isArray(users) ? users : [];
  }

  private async getProviderProfileSummary(userId: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) return null;

    let response: any = null;
    try {
      response = await sendKafkaRpcRequest(
        () =>
          this.kafka.send(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS, {
            userIds: [normalizedUserId],
          }),
        { context: PROVIDER_PATTERNS.GET_PROFILES_BY_IDS, timeoutMs: 2500, retries: 0 },
      );
    } catch (error: any) {
      this.logger.warn(
        `${PROVIDER_PATTERNS.GET_PROFILES_BY_IDS} degraded: ${this.toTrimmedString(error?.message)}`,
      );
      return null;
    }

    const profiles =
      response && typeof response === 'object' && 'profiles' in response
        ? response.profiles
        : [];
    if (!Array.isArray(profiles) || !profiles.length) return null;

    const profile = profiles.find(
      (row: any) => this.toTrimmedString(row?.user_id) === normalizedUserId,
    );
    return profile || profiles[0] || null;
  }

  private normalizeWeeklyScheduleRows(userId: string, source: unknown) {
    if (!Array.isArray(source)) return [] as Record<string, any>[];

    return source
      .map((row: any) => ({
        user_id: userId,
        day_of_week: this.toTrimmedString(row?.day_of_week),
        is_active: this.toBoolean(row?.is_active, false),
        start_time: this.normalizeTime(row?.start_time),
        end_time: this.normalizeTime(row?.end_time),
        break_start_time: this.normalizeTime(row?.break_start_time),
        break_end_time: this.normalizeTime(row?.break_end_time),
      }))
      .filter((row) => row.day_of_week);
  }

  private normalizeDaysOffRows(userId: string, source: unknown) {
    if (!Array.isArray(source)) return [] as Record<string, any>[];

    return source
      .map((row: any) => {
        const normalizedDate = this.normalizeOffDate(row?.off_date);
        if (!normalizedDate) return null;
        return {
          user_id: userId,
          off_date: normalizedDate,
          reason: this.toNullableString(row?.reason),
        };
      })
      .filter(Boolean) as Record<string, any>[];
  }

  private normalizeAvailabilityWindowRows(userId: string, source: unknown) {
    if (!Array.isArray(source)) return [] as Record<string, any>[];

    return source.flatMap((row: any, dayIndex) => {
      const dayOfWeek = this.normalizeWeekdayKey(row?.day_of_week ?? row?.dayOfWeek);
      const isActive = this.toBoolean(row?.is_active ?? row?.isActive, true);
      const windows = Array.isArray(row?.windows) ? row.windows : [];
      if (!dayOfWeek || !isActive) return [];

      return windows
        .map((window: any, windowIndex: number) => ({
          user_id: userId,
          day_of_week: dayOfWeek,
          start_time: this.normalizeTime(window?.start_time ?? window?.startTime),
          end_time: this.normalizeTime(window?.end_time ?? window?.endTime),
          is_active: this.toBoolean(window?.is_active ?? window?.isActive, true),
          sort_order: Number.isFinite(Number(window?.sort_order ?? window?.sortOrder))
            ? Number(window?.sort_order ?? window?.sortOrder)
            : dayIndex * 10 + windowIndex,
        }))
        .filter((window: Record<string, any>) => window.start_time && window.end_time);
    });
  }

  private buildWindowsFromLegacySchedule(weeklySchedule: any[]) {
    return (weeklySchedule || []).flatMap((day: any) => {
      const dayOfWeek = this.normalizeWeekdayKey(day?.day_of_week);
      if (!dayOfWeek || !this.toBoolean(day?.is_active, false)) return [];

      const startTime = this.normalizeTime(day?.start_time);
      const endTime = this.normalizeTime(day?.end_time);
      const breakStart = this.normalizeTime(day?.break_start_time);
      const breakEnd = this.normalizeTime(day?.break_end_time);
      if (!startTime || !endTime) return [];

      if (breakStart && breakEnd) {
        return [
          { day_of_week: dayOfWeek, start_time: startTime, end_time: breakStart, is_active: true, sort_order: 0 },
          { day_of_week: dayOfWeek, start_time: breakEnd, end_time: endTime, is_active: true, sort_order: 1 },
        ].filter((window) => {
          const start = this.timeStringToMinutes(window.start_time);
          const end = this.timeStringToMinutes(window.end_time);
          return start !== null && end !== null && end > start;
        });
      }

      return [{ day_of_week: dayOfWeek, start_time: startTime, end_time: endTime, is_active: true, sort_order: 0 }];
    });
  }

  private async getProviderAvailabilityWithClient(
    client: SupabaseClient,
    userId: string,
  ) {
    let lastError: any = null;

    for (const schemaName of this.availabilitySchemas) {
      const [weeklyResult, windowsResult, daysOffResult] = await Promise.all([
        client
          .schema(schemaName)
          .from('provider_availability')
          .select('*')
          .eq('user_id', userId),
        client
          .schema(schemaName)
          .from('provider_availability_windows')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true })
          .order('start_time', { ascending: true }),
        client
          .schema(schemaName)
          .from('provider_days_off')
          .select('*')
          .eq('user_id', userId),
      ]);
      const windowsMissing = Boolean(windowsResult.error && this.isMissingRelationError(windowsResult.error));

      if (!weeklyResult.error && !daysOffResult.error && (!windowsResult.error || windowsMissing)) {
        const normalizedDaysOff = (daysOffResult.data || []).map((row: any) => ({
          ...row,
          off_date: this.normalizeOffDate(row?.off_date) || row?.off_date,
        }));
        const weeklySchedule = weeklyResult.data || [];
        const availabilityWindows = windowsMissing || !windowsResult.data?.length
          ? this.buildWindowsFromLegacySchedule(weeklySchedule)
          : windowsResult.data || [];
        return { weeklySchedule, availabilityWindows, daysOff: normalizedDaysOff };
      }

      const combinedErrors = [weeklyResult.error, windowsMissing ? null : windowsResult.error, daysOffResult.error].filter(Boolean);
      const permissionError = combinedErrors.find((error) =>
        this.isPermissionDeniedError(error),
      );
      if (permissionError) throw permissionError;

      lastError = combinedErrors[0] || lastError;
      if (combinedErrors.every((error) => this.isMissingRelationError(error))) {
        continue;
      }
      throw lastError;
    }

    if (lastError) throw lastError;
    return { weeklySchedule: [], daysOff: [] };
  }

  private async saveProviderAvailabilityWithClient( // NOSONAR: Legacy fallback flow; refactor planned separately.
    client: SupabaseClient,
    userId: string,
    body: any,
  ) {
    const weeklyRows = this.normalizeWeeklyScheduleRows(userId, body?.weeklySchedule);
    const windowRows = this.normalizeAvailabilityWindowRows(userId, body?.weeklySchedule);
    const daysOffRows = this.normalizeDaysOffRows(userId, body?.daysOff);
    const includesWeeklySchedule = body?.weeklySchedule !== undefined;
    const includesDaysOff = body?.daysOff !== undefined;

    let lastError: any = null;

    for (const schemaName of this.availabilitySchemas) {
      let operationError: any = null;

      if (includesWeeklySchedule) {
        const existingWindowsResult = await client
          .schema(schemaName)
          .from('provider_availability_windows')
          .select('id')
          .eq('user_id', userId);

        if (existingWindowsResult.error && !this.isMissingRelationError(existingWindowsResult.error)) {
          operationError = existingWindowsResult.error;
        }

        if (!operationError && !existingWindowsResult.error) {
          const existingWindowIds = (existingWindowsResult.data || [])
            .map((row: any) => this.toTrimmedString(row?.id))
            .filter(Boolean);

          if (existingWindowIds.length) {
            const { error } = await client
              .schema(schemaName)
              .from('provider_availability_windows')
              .delete()
              .in('id', existingWindowIds)
              .eq('user_id', userId);
            if (error) operationError = error;
          }

          if (!operationError && windowRows.length) {
            const { error } = await client
              .schema(schemaName)
              .from('provider_availability_windows')
              .insert(windowRows);
            if (error) operationError = error;
          }
        }

        const existingAvailabilityResult = await client
          .schema(schemaName)
          .from('provider_availability')
          .select('id, day_of_week')
          .eq('user_id', userId);

        if (existingAvailabilityResult.error) {
          operationError = existingAvailabilityResult.error;
        } else {
          const existingRows = existingAvailabilityResult.data || [];
          const existingByDay = new Map<string, any>();
          for (const row of existingRows) {
            const dayValue = row?.day_of_week;
            const dayKey = this.normalizeWeekdayKey(dayValue);
            if (!dayKey) continue;
            if (!existingByDay.has(dayKey)) existingByDay.set(dayKey, row);
          }

          const incomingByDay = new Map<string, Record<string, any>>();
          for (const row of weeklyRows) {
            const dayKey = this.normalizeWeekdayKey(row.day_of_week);
            if (!dayKey) continue;
            incomingByDay.set(dayKey, {
              is_active: row.is_active,
              start_time: this.normalizeTime(row.start_time),
              end_time: this.normalizeTime(row.end_time),
              break_start_time: this.normalizeTime(row.break_start_time),
              break_end_time: this.normalizeTime(row.break_end_time),
            });
          }

          const updates: Array<{ id: string; payload: Record<string, any> }> = [];
          const inserts: Record<string, any>[] = [];

          for (const [dayKey, payload] of incomingByDay.entries()) {
            const existing = existingByDay.get(dayKey);
            if (existing?.id) updates.push({ id: existing.id, payload });
            else {
              inserts.push({
                user_id: userId,
                day_of_week: dayKey,
                ...payload,
              });
            }
          }

          const staleIds = existingRows
            .filter((row: any) => {
              const dayKey = this.normalizeWeekdayKey(row?.day_of_week);
              return dayKey && !incomingByDay.has(dayKey);
            })
            .map((row: any) => this.toTrimmedString(row?.id))
            .filter(Boolean);

          for (const updateRow of updates) {
            const { error } = await client
              .schema(schemaName)
              .from('provider_availability')
              .update(updateRow.payload)
              .eq('id', updateRow.id)
              .eq('user_id', userId);
            if (error) {
              operationError = error;
              break;
            }
          }

          if (!operationError && inserts.length) {
            const { error } = await client
              .schema(schemaName)
              .from('provider_availability')
              .insert(inserts);
            if (error) operationError = error;
          }

          if (!operationError && staleIds.length) {
            const { error } = await client
              .schema(schemaName)
              .from('provider_availability')
              .delete()
              .in('id', staleIds)
              .eq('user_id', userId);
            if (error) operationError = error;
          }
        }
      }

      if (!operationError && includesDaysOff) {
        const existingDaysOffResult = await client
          .schema(schemaName)
          .from('provider_days_off')
          .select('id, off_date')
          .eq('user_id', userId);

        if (existingDaysOffResult.error) {
          operationError = existingDaysOffResult.error;
        } else {
          const existingRows = existingDaysOffResult.data || [];
          const existingByDate = new Map<string, any>();
          for (const row of existingRows) {
            const normalizedDate = this.normalizeOffDate(row?.off_date);
            if (!normalizedDate) continue;
            if (!existingByDate.has(normalizedDate)) {
              existingByDate.set(normalizedDate, row);
            }
          }

          const incomingByDate = new Map<string, Record<string, any>>();
          for (const row of daysOffRows) {
            const normalizedDate = this.normalizeOffDate(row.off_date);
            if (!normalizedDate) continue;
            incomingByDate.set(normalizedDate, {
              user_id: userId,
              off_date: normalizedDate,
              reason: this.toNullableString(row.reason),
            });
          }

          const updates: Array<{ id: string; reason: string | null }> = [];
          const inserts: Record<string, any>[] = [];
          for (const [dateKey, payload] of incomingByDate.entries()) {
            const existing = existingByDate.get(dateKey);
            if (existing?.id) {
              updates.push({
                id: existing.id,
                reason: this.toNullableString(payload.reason),
              });
            } else {
              inserts.push(payload);
            }
          }

          const staleIds = existingRows
            .filter((row: any) => {
              const normalizedDate = this.normalizeOffDate(row?.off_date);
              return normalizedDate && !incomingByDate.has(normalizedDate);
            })
            .map((row: any) => this.toTrimmedString(row?.id))
            .filter(Boolean);

          for (const updateRow of updates) {
            const { error } = await client
              .schema(schemaName)
              .from('provider_days_off')
              .update({ reason: updateRow.reason })
              .eq('id', updateRow.id)
              .eq('user_id', userId);
            if (error) {
              operationError = error;
              break;
            }
          }

          if (!operationError && inserts.length) {
            const { error } = await client
              .schema(schemaName)
              .from('provider_days_off')
              .insert(inserts);
            if (error) operationError = error;
          }

          if (!operationError && staleIds.length) {
            const { error } = await client
              .schema(schemaName)
              .from('provider_days_off')
              .delete()
              .in('id', staleIds)
              .eq('user_id', userId);
            if (error) operationError = error;
          }
        }
      }

      if (!operationError) return { success: true };
      if (this.isPermissionDeniedError(operationError)) {
        throw operationError;
      }

      lastError = operationError;
      if (this.isMissingRelationError(operationError)) continue;
      throw operationError;
    }

    if (lastError) throw lastError;
    return { success: true };
  }

  private extractStoragePathFromAttachmentUrl(fileUrl: unknown): string | null {
    const raw = this.toTrimmedString(fileUrl);
    if (!raw) return null;

    const markers = [
      '/storage/v1/object/public/booking-attachments/',
      '/storage/v1/object/sign/booking-attachments/',
      '/storage/v1/object/authenticated/booking-attachments/',
      '/object/public/booking-attachments/',
      '/object/sign/booking-attachments/',
      '/object/authenticated/booking-attachments/',
      '/booking-attachments/',
    ];

    for (const marker of markers) {
      const markerIndex = raw.indexOf(marker);
      if (markerIndex < 0) continue;
      const withQuery = raw.slice(markerIndex + marker.length);
      const withoutQuery = withQuery.split('?')[0].replace(/^\/+/, '').trim();
      if (withoutQuery) return withoutQuery;
    }

    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      const candidate = raw.split('?')[0].replace(/^\/+/, '').trim();
      if (candidate.includes('/')) return candidate;
    }

    return null;
  }

  private async toSignedAttachmentUrl(
    storagePath: string,
  ): Promise<string | null> {
    const normalizedStoragePath = this.toTrimmedString(storagePath);
    if (!normalizedStoragePath) return null;

    const { data, error } = await this.supabase.storage
      .from('booking-attachments')
      .createSignedUrl(normalizedStoragePath, 60 * 60 * 24 * 7);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  private isPermissionDeniedError(error: any) {
    const code = this.toTrimmedString(error?.code).toUpperCase();
    const message = this.toTrimmedString(error?.message).toLowerCase();
    return (
      code === '42501' ||
      message.includes('permission denied') ||
      message.includes('row-level security')
    );
  }

  private isTimeoutLikeError(error: unknown) {
    const message = this.toTrimmedString((error as { message?: unknown })?.message).toLowerCase();
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

  private createAccessScopedSupabase(
    accessToken: string,
  ): SupabaseClient | null {
    const token = this.toTrimmedString(accessToken);
    const supabaseUrl = this.toTrimmedString(process.env.SUPABASE_URL);
    const supabaseKey = this.toTrimmedString(process.env.SUPABASE_SECRET_KEY);
    if (!token || !supabaseUrl || !supabaseKey) return null;

    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  }

  private normalizeAttachmentPayload(bookingId: string, attachments: any[]) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return [] as Record<string, any>[];
    }

    return attachments
      .map((row: any, index: number) => ({
        booking_id: bookingId,
        file_url: this.toTrimmedString(row?.file_url || row?.uri),
        file_name:
          this.toTrimmedString(row?.file_name || row?.label) ||
          `Attachment ${index + 1}`,
        mime_type: this.toTrimmedString(row?.mime_type) || 'image/jpeg',
        storage_path: this.toTrimmedString(row?.storage_path) || null,
      }))
      .filter((row) => row.file_url);
  }

  private async getAttachmentsWithClient(
    client: SupabaseClient,
    bookingId: string,
  ) {
    const { data, error } = await client
      .schema('booking')
      .from('booking_attachments')
      .select(
        'id, booking_id, file_url, file_name, mime_type, storage_path, created_at',
      )
      .eq('booking_id', bookingId);
    if (error) throw error;

    const attachments = await Promise.all(
      (data || []).map(async (row: any) => {
        const storagePath =
          this.toTrimmedString(row?.storage_path) ||
          this.extractStoragePathFromAttachmentUrl(row?.file_url);
        if (!storagePath) return row;

        const signedUrl = await this.toSignedAttachmentUrl(storagePath);
        if (!signedUrl) return row;

        return {
          ...row,
          storage_path: storagePath,
          file_url: signedUrl,
        };
      }),
    );

    return { attachments };
  }

  private async saveAttachmentsWithClient(
    client: SupabaseClient,
    bookingId: string,
    attachments: any[],
  ) {
    const payload = this.normalizeAttachmentPayload(bookingId, attachments);
    if (!payload.length) return { attachments: [] };

    const { data, error } = await client
      .schema('booking')
      .from('booking_attachments')
      .insert(payload)
      .select(
        'id,booking_id,file_url,file_name,mime_type,storage_path,created_at',
      );
    if (error) throw error;

    return { attachments: data || [] };
  }

  private async collectAttachmentStorageRows(
    prefix: string,
    depth = 0,
  ): Promise<
    Array<{
      storagePath: string;
      fileName: string;
      mimeType: string | null;
      createdAt: string | null;
    }>
  > {
    if (depth > 4) return [];

    const normalizedPrefix = this.toTrimmedString(prefix);
    if (!normalizedPrefix) return [];

    const { data, error } = await this.supabase.storage
      .from('booking-attachments')
      .list(normalizedPrefix, {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' },
      });
    if (error) throw error;

    const rows: Array<{
      storagePath: string;
      fileName: string;
      mimeType: string | null;
      createdAt: string | null;
    }> = [];

    for (const entry of data || []) {
      const entryRecord = entry as unknown as Record<string, unknown>;
      const entryMetadata =
        entryRecord.metadata && typeof entryRecord.metadata === 'object'
          ? (entryRecord.metadata as Record<string, unknown>)
          : null;

      const name = this.toTrimmedString(entryRecord.name);
      if (!name) continue;

      const fullPath = `${normalizedPrefix}/${name}`;
      const isFile = Boolean(entryRecord.id) || Boolean(entryMetadata);

      if (isFile) {
        rows.push({
          storagePath: fullPath,
          fileName: name,
          mimeType: this.toTrimmedString(entryMetadata?.mimetype) || null,
          createdAt: this.toTrimmedString(entryRecord.created_at) || null,
        });
        continue;
      }

      const nestedRows = await this.collectAttachmentStorageRows(
        fullPath,
        depth + 1,
      );
      rows.push(...nestedRows);
    }

    return rows;
  }

  private async getAttachmentsFromStorage(bookingId: string) {
    try {
      const storageRows = await this.collectAttachmentStorageRows(bookingId);
      const attachments = await Promise.all(
        storageRows.map(async (row, index) => {
          const signedUrl = await this.toSignedAttachmentUrl(row.storagePath);
          if (!signedUrl) return null;
          return {
            id: `storage-${index}-${row.storagePath}`,
            booking_id: bookingId,
            file_url: signedUrl,
            file_name: row.fileName || 'Attachment',
            mime_type: row.mimeType,
            storage_path: row.storagePath,
            created_at: row.createdAt,
          };
        }),
      );

      return attachments.filter((row): row is NonNullable<typeof row> =>
        Boolean(row),
      );
    } catch {
      return [] as Record<string, unknown>[];
    }
  }

  private assertRequiredCreateBookingFields(
    providerId: string,
    customerId: string,
    serviceId: string,
    scheduledAt: string,
  ) {
    if (!providerId) throw new BadRequestException('provider_id is required');
    if (!customerId) throw new BadRequestException('customerId is required');
    if (!serviceId) throw new BadRequestException('service_id is required');
    if (!scheduledAt) throw new BadRequestException('scheduled_at is required');
  }

  private async ensureProviderCanBeBooked(providerId: string) {
    const userRecord = await this.getUserProfileFromAuth(providerId);
    if (!userRecord) throw new NotFoundException('Provider not found in the system.');

    const providerRole = this.toTrimmedString(userRecord?.role).toLowerCase();
    if (providerRole !== 'provider') {
      throw new BadRequestException(
        'Bookings can only be made with registered providers.',
      );
    }

    const profileRecord = await this.getProviderProfileSummary(providerId);
    if (!profileRecord) {
      throw new BadRequestException(
        'Provider profile is missing or incomplete.',
      );
    }

    const accountStatus = this.toTrimmedString(userRecord?.status).toLowerCase();
    const verificationStatus = this.toTrimmedString(
      profileRecord?.verification_status,
    ).toLowerCase();

    if (accountStatus === 'active' && verificationStatus === 'approved') {
      return;
    }

    const accountStatusLabel = this.toTrimmedString(userRecord?.status) || 'unknown';
    const profileVerificationLabel =
      this.toTrimmedString(profileRecord?.verification_status) || 'unknown';
    throw new BadRequestException(
      `Booking rejected: This provider is not yet fully verified (account_status=${accountStatusLabel}, profile_verification=${profileVerificationLabel}).`,
    );
  }

  private async insertBookingWithSchemaFallback(
    baseInsertPayload: Record<string, any>,
  ) {
    let insertPayload: Record<string, any> = { ...baseInsertPayload };
    let schemaFallbackAttempts = 0;

    while (schemaFallbackAttempts < 8) {
      const insertResult = await this.supabase
        .schema('booking')
        .from('bookings')
        .insert([insertPayload])
        .select()
        .single();

      if (!insertResult.error) {
        // Add initial timeline event for booking creation (fire and forget)
        this.addTimelineEventForStatusChange(insertResult.data.id, 'pending').catch(() => {
          // Silently ignore timeline errors
        });
        
        return insertResult.data;
      }

      if (!this.isSchemaMismatchError(insertResult.error)) {
        throw new BadRequestException(
          this.toTrimmedString(insertResult.error?.message) ||
            'Failed to create booking',
        );
      }

      const missingColumn = this.extractMissingColumnFromError(insertResult.error);
      if (!missingColumn || !(missingColumn in insertPayload)) {
        throw new BadRequestException(
          this.toTrimmedString(insertResult.error?.message) ||
            'Failed to create booking',
        );
      }

      delete insertPayload[missingColumn];
      schemaFallbackAttempts += 1;
    }

    throw new BadRequestException('Failed to create booking');
  }

  async createBooking(dto: any, customerId: string) {
    const normalizedProviderId = this.toTrimmedString(dto?.provider_id);
    const normalizedCustomerId = this.toTrimmedString(customerId);
    const normalizedServiceId = this.toTrimmedString(dto?.service_id);
    const normalizedProviderServiceId = this.toTrimmedString(
      dto?.provider_service_id,
    );
    const normalizedScheduledAt = this.toTrimmedString(dto?.scheduled_at);
    this.assertRequiredCreateBookingFields(
      normalizedProviderId,
      normalizedCustomerId,
      normalizedServiceId,
      normalizedScheduledAt,
    );
    await this.ensureProviderCanBeBooked(normalizedProviderId);

    const providerService = await this.getProviderServiceForBooking(
      normalizedProviderId,
      normalizedProviderServiceId,
      normalizedServiceId,
    );
    const requestedPricingMode = this.toTrimmedString(
      dto?.pricing_mode,
    ).toLowerCase();
    const providerPricingMode = this.toTrimmedString(
      providerService?.pricing_mode,
    ).toLowerCase();
    const normalizedPricingMode = ['hourly', 'flat'].includes(
      requestedPricingMode,
    )
      ? requestedPricingMode
      : ['hourly', 'flat'].includes(providerPricingMode)
        ? providerPricingMode
        : 'flat';
    const normalizedHoursRequired = Math.max(
      1,
      Number(this.toNullableNumber(dto?.hours_required) || 1),
    );
    const hourlyRate = this.toNullableNumber(dto?.hourly_rate);
    const flatRate = this.toNullableNumber(dto?.flat_rate);
    const providerPrice = this.toNullableNumber(providerService?.price);
    const serviceAmountCandidate = this.toNullableNumber(dto?.service_amount);
    const totalAmountCandidate = this.toNullableNumber(dto?.total_amount);
    const unitAmount =
      normalizedPricingMode === 'hourly'
        ? (providerPrice ?? hourlyRate ?? flatRate ?? serviceAmountCandidate ?? 0)
        : (providerPrice ?? flatRate ?? hourlyRate ?? serviceAmountCandidate ?? 0);
    const computedAmount =
      normalizedPricingMode === 'hourly'
        ? unitAmount * normalizedHoursRequired
        : unitAmount;
    const serviceAmount = providerService
      ? computedAmount
      : serviceAmountCandidate ?? computedAmount;
    const totalAmount = providerService
      ? serviceAmount
      : totalAmountCandidate ?? serviceAmount;
    const pricingQuoteResult = await this.getPricingQuote({
      ...dto,
      provider_id: normalizedProviderId,
      provider_service_id: normalizedProviderServiceId,
      service_id: normalizedServiceId,
      hours_required: normalizedHoursRequired,
      booking_amount: totalAmount,
      service_latitude: dto?.service_latitude,
      service_longitude: dto?.service_longitude,
    });
    const pricingSnapshot = pricingQuoteResult.pricing_quote;
    const normalizedServiceLocationType =
      this.toTrimmedString(dto?.service_location_type).toLowerCase() ===
      'in_shop'
        ? 'in_shop'
        : 'mobile';
    const normalizedPaymentMethod =
      this.toTrimmedString(dto?.payment_method).toLowerCase() ||
      'cash_on_service';
    const serviceTitle =
      this.toNullableString(dto?.service_title) ||
      this.toNullableString(dto?.service_name) ||
      this.toNullableString(providerService?.title) ||
      this.toNullableString(dto?.service_description) ||
      'Service booking';
    const serviceDescription =
      this.toNullableString(dto?.service_description) ||
      this.toNullableString(providerService?.description) ||
      serviceTitle;

    const availability = await this.checkAvailability(
      normalizedProviderId,
      normalizedScheduledAt,
      String(normalizedHoursRequired),
    );
    if (!availability.available) {
      throw new BadRequestException(
        availability.reason || 'Selected time is unavailable.',
      );
    }

    const bookingRef = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;

    const baseInsertPayload: Record<string, any> = {
      booking_reference: bookingRef,
      customer_id: normalizedCustomerId,
      provider_id: normalizedProviderId,
      service_id: normalizedServiceId,
      service_title: serviceTitle,
      service_name: serviceTitle,
      service_description: serviceDescription,
      service_address: this.toTrimmedString(dto?.service_address),
      service_location_type: normalizedServiceLocationType,
      scheduled_at: normalizedScheduledAt,
      hours_required: normalizedHoursRequired,
      service_amount: serviceAmount,
      additional_amount: 0,
      total_amount: totalAmount,
      payment_method: normalizedPaymentMethod,
      customer_notes: this.toNullableString(dto?.customer_notes),
      service_latitude: this.toNullableNumber(dto?.service_latitude),
      service_longitude: this.toNullableNumber(dto?.service_longitude),
      pricing_snapshot: pricingSnapshot,
      status: 'pending',
    };

    const newBooking = await this.insertBookingWithSchemaFallback(
      baseInsertPayload,
    );

    return {
      message: 'Booking successfully created!',
      booking: {
        ...newBooking,
        provider_service_id:
          normalizedProviderServiceId || this.toTrimmedString(providerService?.id),
        pricing_mode: normalizedPricingMode,
        pricing_snapshot: pricingSnapshot,
        service_title: this.resolveServiceTitle(newBooking) || serviceTitle,
        service_name: this.resolveServiceTitle(newBooking) || serviceTitle,
      },
    };
  }

  async getPricingQuote(dto: any) {
    const normalizedProviderId = this.toTrimmedString(dto?.provider_id);
    const normalizedServiceId = this.toTrimmedString(dto?.service_id);
    const normalizedProviderServiceId = this.toTrimmedString(dto?.provider_service_id);
    if (!normalizedProviderId) throw new BadRequestException('provider_id is required');
    if (!normalizedServiceId && !normalizedProviderServiceId) {
      throw new BadRequestException('service_id or provider_service_id is required');
    }

    const providerService = await this.getProviderServiceForBooking(
      normalizedProviderId,
      normalizedProviderServiceId,
      normalizedServiceId,
    );
    if (!providerService) throw new NotFoundException('Provider service not found');

    const pricingMode = this.normalizePricingMode(providerService.pricing_mode);
    const providerPrice = this.toNullableNumber(providerService.price) || 0;
    const hoursRequired = Math.max(1, Number(this.toNullableNumber(dto?.hours_required) || 1));
    const laborAmount = pricingMode === 'hourly' ? providerPrice * hoursRequired : providerPrice;
    const vehicle = await this.getProviderTravelProfile(normalizedProviderId);
    const fuelType = this.normalizeFuelType(vehicle?.fuelType);
    const fuel = await this.getFuelBaseline(fuelType);
    const radiusTier = await this.getProviderRadiusTier(normalizedProviderId, dto);
    const providerBaseMissing = await this.getProviderBaseMissing(normalizedProviderId);
    const laborBaseline = await this.getLaborBaseline(
      this.toTrimmedString(providerService.service_id) || normalizedServiceId,
      pricingMode,
      hoursRequired,
    );

    const pricingQuote = calculatePricingQuote({
        pricingMode,
        providerPrice,
        hoursRequired,
        bookingAmount: this.toNullableNumber(dto?.booking_amount) ?? laborAmount,
        radiusTier,
        vehicle,
        fuel,
        laborBaseline,
      });
    if (providerBaseMissing) {
      pricingQuote.assumptions.push('Provider service base is not set; travel tier uses base-radius fallback.');
    }

    return {
      pricing_quote: pricingQuote,
    };
  }

  async getCustomerBookings(customerId: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    const bookingRows = data || [];
    const bookingIds = bookingRows
      .map((booking: any) => this.toTrimmedString(booking?.id))
      .filter(Boolean);
    let timelineByBookingId = new Map<string, any[]>();

    if (bookingIds.length) {
      const { data: timelineRows, error: timelineError } = await this.withQueryTimeout(
        this.supabase
          .schema('booking')
          .from('booking_timeline_events')
          .select('booking_id, event_type, label, icon, created_at')
          .in('booking_id', bookingIds)
          .order('created_at', { ascending: true }),
        3000,
        'booking.get-provider timeline query',
      );

      if (timelineError) {
        this.logger.warn(`booking.get-provider timeline degraded: ${this.toTrimmedString(timelineError.message)}`);
      } else {
        timelineByBookingId = (timelineRows || []).reduce((acc: Map<string, any[]>, row: any) => {
          const rowBookingId = this.toTrimmedString(row?.booking_id);
          if (!rowBookingId) return acc;
          const events = acc.get(rowBookingId) || [];
          events.push(row);
          acc.set(rowBookingId, events);
          return acc;
        }, new Map<string, any[]>());
      }
    }

    const bookings = bookingRows.map((booking: any) => ({
      ...booking,
      service_title: this.resolveServiceTitle(booking),
      timeline: timelineByBookingId.get(this.toTrimmedString(booking?.id)) || [],
    }));

    return { bookings };
  }

  async getProviderBookings(providerId: string) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId)
      throw new BadRequestException('providerId is required');

    const { data, error } = await this.withQueryTimeout(
      this.supabase
        .schema('booking')
        .from('bookings')
        .select('*')
        .eq('provider_id', normalizedProviderId)
        .order('created_at', { ascending: false }),
      3000,
      'booking.get-provider query',
    );
    if (error) {
      this.logger.warn(`booking.get-provider degraded: ${this.toTrimmedString(error.message)}`);
      return { bookings: [] };
    }

    // Return bookings without timeline events for performance - timeline will be fetched on-demand
    const bookings = (data || []).map((booking: any) => ({
      ...booking,
      service_title: this.resolveServiceTitle(booking),
      timeline: [], // Empty timeline for list view
    }));

    return { bookings };
  }

  async getProviderBookingById(bookingId: string, providerId?: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId)
      throw new BadRequestException('bookingId is required');

    const data = await this.getBookingRowByIdentifier(normalizedBookingId);
    if (!data) throw new NotFoundException('Booking not found');

    const normalizedProviderId = this.toTrimmedString(providerId);
    if (
      normalizedProviderId &&
      this.toTrimmedString(data.provider_id) !== normalizedProviderId
    ) {
      throw new NotFoundException('Booking not found');
    }

    const customerId = this.toTrimmedString(data.customer_id);
    const customerUser = await this.getUserProfileFromAuth(customerId);

    return {
      booking: {
        ...data,
        customer_name: this.toTrimmedString(customerUser?.full_name),
        customer_contact: this.toTrimmedString(customerUser?.contact_number),
        service_title: this.resolveServiceTitle(data),
      },
    };
  }

  async getChatBookings(userId: string, role?: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) {
      throw new BadRequestException('userId is required');
    }

    const normalizedRole = this.toTrimmedString(role).toLowerCase();
    const actorColumn = normalizedRole === 'provider' ? 'provider_id' : 'customer_id';

    const { data, error } = await this.withQueryTimeout(
      this.supabase
        .schema('booking')
        .from('bookings')
        .select('*')
        .eq(actorColumn, normalizedUserId)
        .in('status', ['pending', 'confirmed', 'in_progress', 'completed'])
        .order('created_at', { ascending: false }),
      3000,
      'booking.chat.get-bookings query',
    );

    if (error) {
      this.logger.warn(`booking.chat.get-bookings degraded: ${this.toTrimmedString(error.message)}`);
      return { bookings: [] };
    }

    return { bookings: data || [] };
  }

  async getChatBookingContext(bookingId: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) {
      throw new BadRequestException('bookingId is required');
    }

    const data = await this.getBookingRowByIdentifier(
      normalizedBookingId,
      '*',
    );
    if (!data) {
      throw new NotFoundException('Booking not found');
    }

    return { booking: data };
  }

  async getAllBookings(page = 1, limit = 20) {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const { data, error, count } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    const bookings = data || [];
    if (!bookings.length) {
      return {
        bookings: [],
        total: count || 0,
        page: normalizedPage,
        limit: normalizedLimit,
      };
    }

    const userIds = Array.from(
      new Set(
        bookings
          .flatMap((booking: any) => [booking?.provider_id, booking?.customer_id])
          .map((userId: unknown) => this.toTrimmedString(userId))
          .filter(Boolean),
      ),
    );
    const users = await this.getUsersByIdsFromAuth(userIds);
    const userById = new Map(
      users.map((user: any) => [this.toTrimmedString(user?.id), user]),
    );

    const enriched = bookings.map((booking: any) => {
      const providerId = this.toTrimmedString(booking?.provider_id);
      const customerId = this.toTrimmedString(booking?.customer_id);

      const provider = userById.get(providerId);
      const customer = userById.get(customerId);

      return {
        id: booking.id,
        booking_id:
          this.toTrimmedString(booking.booking_reference) ||
          this.toTrimmedString(booking.id),
        status: this.toTrimmedString(booking.status) || 'pending',
        amount: Number(booking.total_amount || 0),
        scheduled_at: booking.scheduled_at || null,
        created_at: booking.created_at || null,
        customer_id: customerId || null,
        provider_id: providerId || null,
        service_id: this.toTrimmedString(booking?.service_id) || null,
        service_latitude:
          booking.service_latitude == null ? null : Number(booking.service_latitude),
        service_longitude:
          booking.service_longitude == null ? null : Number(booking.service_longitude),
        service_description:
          this.toTrimmedString(booking.service_description) || null,
        customer_name: this.toTrimmedString(customer?.full_name),
        customer_email: this.toTrimmedString(customer?.email),
        provider_name: this.toTrimmedString(provider?.full_name),
        provider_email: this.toTrimmedString(provider?.email),
      };
    });

    return {
      bookings: enriched,
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async getOngoingBookings(limit = 100) {
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 100;

    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .in('status', ['confirmed', 'in_progress'])
      .order('scheduled_at', { ascending: true })
      .range(0, normalizedLimit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    const bookings = data || [];
    const userIds = Array.from(
      new Set(
        bookings
          .flatMap((booking: any) => [booking?.provider_id, booking?.customer_id])
          .map((userId: unknown) => this.toTrimmedString(userId))
          .filter(Boolean),
      ),
    );
    const users = await this.getUsersByIdsFromAuth(userIds);
    const userById = new Map(
      users.map((user: any) => [this.toTrimmedString(user?.id), user]),
    );
    const latestLocationByBooking = await this.getLatestLocationsForBookings(
      bookings.map((booking: any) => this.toTrimmedString(booking?.id)),
    );

    const enriched = bookings.map((booking: any) => {
      const provider = userById.get(this.toTrimmedString(booking?.provider_id));
      const customer = userById.get(this.toTrimmedString(booking?.customer_id));
      return {
        ...booking,
        provider_name: this.toTrimmedString(provider?.full_name),
        customer_name: this.toTrimmedString(customer?.full_name),
        latest_location:
          latestLocationByBooking.get(this.toTrimmedString(booking?.id)) || null,
      };
    });

    return { bookings: enriched };
  }

  async getBookingCounts(dimension: string, ids: unknown) {
    const normalizedDimension = this.toTrimmedString(dimension).toLowerCase();
    let column = '';
    if (normalizedDimension === 'provider') {
      column = 'provider_id';
    } else if (normalizedDimension === 'customer') {
      column = 'customer_id';
    }
    if (!column) {
      throw new BadRequestException(
        'dimension must be either "customer" or "provider"',
      );
    }

    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(ids) ? ids : [])
          .map((id) => this.toTrimmedString(id))
          .filter(Boolean),
      ),
    );
    if (!normalizedIds.length) return { counts: {} };

    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select(column)
      .in(column, normalizedIds);
    if (error) throw new InternalServerErrorException(error.message);

    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const rowId = this.toTrimmedString(row?.[column]);
      if (!rowId) continue;
      counts[rowId] = (counts[rowId] || 0) + 1;
    }

    return { counts };
  }

  async getBookingAnalytics(from?: string, to?: string) {
    let query = this.supabase
      .schema('booking')
      .from('bookings')
      .select('status, created_at');
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);

    const bookings = data || [];
    const byStatus = bookings.reduce((acc: Record<string, number>, booking: any) => {
      const status = this.toTrimmedString(booking?.status) || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    return { total: bookings.length, by_status: byStatus };
  }

  async getProviderAvailability(userId: string, accessToken?: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    try {
      return await this.getProviderAvailabilityWithClient(
        this.supabase,
        normalizedUserId,
      );
    } catch (error: any) {
      const scopedClient = this.createAccessScopedSupabase(accessToken || '');
      if (scopedClient && this.isPermissionDeniedError(error)) {
        try {
          return await this.getProviderAvailabilityWithClient(
            scopedClient,
            normalizedUserId,
          );
        } catch (fallbackError: any) {
          throw new InternalServerErrorException(
            this.toTrimmedString(fallbackError?.message) ||
              'Failed to fetch provider availability',
          );
        }
      }
      throw new InternalServerErrorException(
        this.toTrimmedString(error?.message) ||
          'Failed to fetch provider availability',
      );
    }
  }

  async saveProviderAvailability(userId: string, body: any, accessToken?: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) throw new BadRequestException('userId is required');

    try {
      return await this.saveProviderAvailabilityWithClient(
        this.supabase,
        normalizedUserId,
        body,
      );
    } catch (error: any) {
      const scopedClient = this.createAccessScopedSupabase(accessToken || '');
      if (scopedClient && this.isPermissionDeniedError(error)) {
        try {
          return await this.saveProviderAvailabilityWithClient(
            scopedClient,
            normalizedUserId,
            body,
          );
        } catch (fallbackError: any) {
          throw new InternalServerErrorException(
            this.toTrimmedString(fallbackError?.message) ||
              'Failed to save provider availability',
          );
        }
      }
      throw new InternalServerErrorException(
        this.toTrimmedString(error?.message) ||
          'Failed to save provider availability',
      );
    }
  }

  async getReservedSlots(providerId: string, date: string) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    const normalizedDate = this.toTrimmedString(date);
    if (!normalizedProviderId) throw new BadRequestException('providerId is required');
    if (!normalizedDate) throw new BadRequestException('date is required');

    const startOfDay = `${normalizedDate}T00:00:00`;
    const endOfDay = `${normalizedDate}T23:59:59`;
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('scheduled_at, hours_required')
      .eq('provider_id', normalizedProviderId)
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
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId) throw new BadRequestException('providerId is required');
    const normalizedScheduledAt = this.toTrimmedString(scheduledAt);
    if (!normalizedScheduledAt) throw new BadRequestException('scheduledAt is required');
    const requestedStart = new Date(normalizedScheduledAt).getTime();
    if (Number.isNaN(requestedStart)) {
      throw new BadRequestException('scheduledAt is invalid');
    }
    const normalizedHoursRequired = Math.max(
      1,
      Number(this.toNullableNumber(hoursRequired) || 1),
    );

    const blockReason = await this.getAvailabilityBlockReason(
      normalizedProviderId,
      normalizedScheduledAt,
      normalizedHoursRequired,
    );
    if (blockReason) {
      return {
        available: false,
        reason: blockReason,
      };
    }

    const date = normalizedScheduledAt.slice(0, 10);
    const slots = (await this.getReservedSlots(normalizedProviderId, date)).reservedSlots;
    const requestedEnd = requestedStart + normalizedHoursRequired * 3600000;

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

  async createAdditionalCharges(body: any) {
    const bookingId = this.toTrimmedString(body?.bookingId);
    const providerId = this.toTrimmedString(body?.providerId);
    if (!bookingId) throw new BadRequestException('bookingId is required');
    if (!providerId) throw new BadRequestException('providerId is required');

    const booking = await this.getBookingRowByIdentifier(bookingId, 'id, provider_id');
    if (!booking) throw new NotFoundException('Booking not found');
    if (this.toTrimmedString(booking.provider_id) !== providerId) {
      throw new BadRequestException('Booking does not belong to provider');
    }

    const items = (body.items || []).map((item: any) => ({
      booking_id: bookingId,
      requested_by: providerId,
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

  async getAdditionalCharges(bookingId: string, providerId?: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return { charges: [] };

    const normalizedProviderId = this.toTrimmedString(providerId);
    if (normalizedProviderId) {
      const booking = await this.getBookingRowByIdentifier(
        normalizedBookingId,
        'id, provider_id',
      );
      if (!booking) throw new NotFoundException('Booking not found');
      if (this.toTrimmedString(booking.provider_id) !== normalizedProviderId) {
        throw new NotFoundException('Booking not found');
      }
    }

    const { data, error } = await this.supabase
      .schema('booking')
      .from('additional_charges')
      .select('*')
      .eq('booking_id', normalizedBookingId);
    if (error) {
      this.logger.warn(
        `booking.get-additional-charges degraded: ${this.toTrimmedString(error.message) || 'query error'}`,
      );
      return { charges: [] };
    }
    return { charges: data || [] };
  }

  async reviewAdditionalCharges(body: any) {
    const bookingId = this.toTrimmedString(body?.bookingId);
    const providerId = this.toTrimmedString(body?.providerId);
    const requesterId = this.toTrimmedString(body?.requesterId ?? body?.customerId);
    const chargeIds = Array.isArray(body?.chargeIds)
      ? body.chargeIds
          .map((chargeId: unknown) => this.toTrimmedString(chargeId))
          .filter(Boolean)
      : [];
    const rawDecision = this.toTrimmedString(body?.decision).toLowerCase();
    const decision = rawDecision === 'rejected' ? 'declined' : rawDecision;

    if (!bookingId) throw new BadRequestException('bookingId is required');
    if (!chargeIds.length) throw new BadRequestException('chargeIds is required');
    if (!['approved', 'declined'].includes(decision)) {
      throw new BadRequestException('decision must be approved or declined');
    }

    const booking = await this.getBookingRowByIdentifier(
      bookingId,
      'id, customer_id, provider_id, total_amount, additional_amount',
    );
    if (!booking) throw new NotFoundException('Booking not found');
    if (providerId && this.toTrimmedString(booking.provider_id) !== providerId) {
      throw new BadRequestException('Booking does not belong to provider');
    }
    if (requesterId && this.toTrimmedString(booking.customer_id) !== requesterId) {
      throw new NotFoundException('Booking not found');
    }

    const { data, error } = await this.supabase
      .schema('booking')
      .from('additional_charges')
      .update({
        status: decision,
        reviewed_at: new Date().toISOString(),
        reviewed_by: requesterId || null,
      })
      .eq('booking_id', this.toTrimmedString(booking.id))
      .in('id', chargeIds)
      .select();
    if (error) throw new InternalServerErrorException(error.message);

    if (decision === 'approved' && data?.length) {
      const totalAdditional = data.reduce(
        (acc: number, charge: any) => acc + Number(charge.amount),
        0,
      );
      if (booking) {
        const nextAdditionalAmount =
          Number(booking.additional_amount || 0) + totalAdditional;
        const nextTotalAmount = Number(booking.total_amount || 0) + totalAdditional;
        await this.supabase
          .schema('booking')
          .from('bookings')
          .update({
            additional_amount: nextAdditionalAmount,
            total_amount: nextTotalAmount,
          })
          .eq('id', this.toTrimmedString(booking.id));
        await sendKafkaRpcRequest(
          () =>
            this.kafka.send(PAYMENT_PATTERNS.UPDATE_AMOUNT, {
              bookingId: this.toTrimmedString(booking.id),
              amount: nextTotalAmount,
            }),
          { context: PAYMENT_PATTERNS.UPDATE_AMOUNT, logger: this.logger },
        );
      }
    }
    return { charges: data || [] };
  }

  private async ensureProviderCanMutateBooking(providerId: string) {
    const profileRecord = await this.getProviderProfileSummary(providerId);
    if (!profileRecord) {
      throw new ForbiddenException({
        code: 'provider_profile_missing',
        message: 'Provider profile not found. Please complete your onboarding.',
        verification_status: null,
      });
    }
    const verificationStatus = this.toTrimmedString(
      profileRecord?.verification_status,
    ).toLowerCase();
    if (verificationStatus !== 'approved') {
      throw new ForbiddenException({
        code: 'provider_not_verified',
        message: 'Your account has not been verified yet. Please complete the verification process.',
        verification_status: verificationStatus || 'pending',
      });
    }
  }

  private assertValidCoordinates(latitude: unknown, longitude: unknown) {
    const lat = this.toNullableNumber(latitude);
    const lng = this.toNullableNumber(longitude);
    if (lat === null || lng === null) {
      throw new BadRequestException('latitude and longitude are required');
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new BadRequestException('Invalid latitude or longitude');
    }
    return { latitude: lat, longitude: lng };
  }

  private async getBookingForParticipantCheck(bookingIdentifier: string) {
    const booking = await this.getBookingRowByIdentifier(
      bookingIdentifier,
      'id, customer_id, provider_id, status',
    );
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  private assertBookingParticipant(booking: any, userId: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    const customerId = this.toTrimmedString(booking?.customer_id);
    const providerId = this.toTrimmedString(booking?.provider_id);
    if (!normalizedUserId || (normalizedUserId !== customerId && normalizedUserId !== providerId)) {
      throw new NotFoundException('Booking not found');
    }
  }

  private async getLatestLocationsForBookings(bookingIds: string[]) {
    const normalizedIds = Array.from(
      new Set(bookingIds.map((id) => this.toTrimmedString(id)).filter(Boolean)),
    );
    if (!normalizedIds.length) return new Map<string, any>();

    const { data, error } = await this.supabase
      .schema('booking')
      .from('booking_location_pings')
      .select('booking_id, latitude, longitude, reported_at, source')
      .in('booking_id', normalizedIds)
      .order('reported_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    const latestByBooking = new Map<string, any>();
    for (const ping of data || []) {
      const bookingId = this.toTrimmedString((ping as any).booking_id);
      if (!bookingId || latestByBooking.has(bookingId)) continue;
      latestByBooking.set(bookingId, {
        latitude: Number((ping as any).latitude),
        longitude: Number((ping as any).longitude),
        reported_at: (ping as any).reported_at,
        source: (ping as any).source,
      });
    }
    return latestByBooking;
  }

  async saveLocationPing(
    bookingId: string,
    providerId: string,
    latitude: unknown,
    longitude: unknown,
  ) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedBookingId) throw new BadRequestException('bookingId is required');
    if (!normalizedProviderId) throw new BadRequestException('providerId is required');

    const booking = await this.getBookingForParticipantCheck(normalizedBookingId);
    if (this.toTrimmedString(booking.provider_id) !== normalizedProviderId) {
      throw new NotFoundException('Booking not found');
    }
    const status = this.toTrimmedString(booking.status).toLowerCase();
    if (!['confirmed', 'in_progress'].includes(status)) {
      throw new BadRequestException(
        'Location pings are only accepted after the provider accepts the booking',
      );
    }
    await this.ensureProviderCanMutateBooking(normalizedProviderId);

    const coords = this.assertValidCoordinates(latitude, longitude);
    const { data, error } = await this.supabase
      .schema('booking')
      .from('booking_location_pings')
      .insert([
        {
          booking_id: this.toTrimmedString(booking.id),
          latitude: coords.latitude,
          longitude: coords.longitude,
          source: 'provider',
        },
      ])
      .select('id, booking_id, latitude, longitude, reported_at, source')
      .single();
    if (error) throw new BadRequestException(error.message);

    return {
      location: {
        id: data.id,
        booking_id: data.booking_id,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        reported_at: data.reported_at,
        source: data.source,
      },
    };
  }

  async getLatestLocation(bookingId: string, requesterId: string) {
    const booking = await this.getBookingForParticipantCheck(bookingId);
    this.assertBookingParticipant(booking, requesterId);

    const { data, error } = await this.supabase
      .schema('booking')
      .from('booking_location_pings')
      .select('id, booking_id, latitude, longitude, reported_at, source')
      .eq('booking_id', this.toTrimmedString(booking.id))
      .order('reported_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) return { location: null };

    return {
      location: {
        id: data.id,
        booking_id: data.booking_id,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        reported_at: data.reported_at,
        source: data.source,
      },
    };
  }

  async getLocationTrail(bookingId: string, requesterId: string, limit = 50) {
    const booking = await this.getBookingForParticipantCheck(bookingId);
    this.assertBookingParticipant(booking, requesterId);
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.min(200, Math.max(1, Number(limit)))
      : 50;

    const { data, error } = await this.supabase
      .schema('booking')
      .from('booking_location_pings')
      .select('id, booking_id, latitude, longitude, reported_at, source')
      .eq('booking_id', this.toTrimmedString(booking.id))
      .order('reported_at', { ascending: false })
      .limit(normalizedLimit);
    if (error) throw new InternalServerErrorException(error.message);

    return {
      trail: (data || []).map((ping: any) => ({
        id: ping.id,
        booking_id: ping.booking_id,
        latitude: Number(ping.latitude),
        longitude: Number(ping.longitude),
        reported_at: ping.reported_at,
        source: ping.source,
      })),
    };
  }

  async getHistory(requesterId?: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .in('status', ['completed', 'cancelled', 'disputed']);
    if (error) throw new BadRequestException(error.message);

    const normalizedRequesterId = this.toTrimmedString(requesterId);
    const history = normalizedRequesterId
      ? (data || []).filter((booking: any) => {
          const bookingCustomerId = this.toTrimmedString(booking?.customer_id);
          const bookingProviderId = this.toTrimmedString(booking?.provider_id);
          return (
            bookingCustomerId === normalizedRequesterId ||
            bookingProviderId === normalizedRequesterId
          );
        })
      : data || [];

    return { history };
  }

  async getRequests(providerId?: string) {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .eq('status', 'pending');
    if (error) throw new BadRequestException(error.message);

    const normalizedProviderId = this.toTrimmedString(providerId);
    const requests = normalizedProviderId
      ? (data || []).filter((booking: any) => {
          return this.toTrimmedString(booking?.provider_id) === normalizedProviderId;
        })
      : data || [];

    return { requests };
  }

  async getBookingById(id: string, requesterId?: string) {
    const data = await this.getBookingRowByIdentifier(id);
    if (!data) throw new NotFoundException('Booking not found');

    const normalizedRequesterId = this.toTrimmedString(requesterId);
    if (normalizedRequesterId) {
      const providerId = this.toTrimmedString(data.provider_id);
      const customerId = this.toTrimmedString(data.customer_id);
      if (normalizedRequesterId !== providerId && normalizedRequesterId !== customerId) {
        throw new NotFoundException('Booking not found');
      }
    }

    const providerId = this.toTrimmedString(data.provider_id);
    const customerId = this.toTrimmedString(data.customer_id);
    const [providerUser, customerUser, timelineEvents] = await Promise.all([
      this.getUserProfileFromAuth(providerId),
      this.getUserProfileFromAuth(customerId),
      this.getBookingTimelineEvents(id),
    ]);

    return {
      booking: {
        ...data,
        service_title: this.resolveServiceTitle(data),
        timeline: timelineEvents,
        provider: {
          full_name: this.toTrimmedString(providerUser?.full_name),
          contact_number: this.toTrimmedString(providerUser?.contact_number),
          business_name: null as string | null,
          average_rating: null as number | null,
        },
        customer: {
          full_name: this.toTrimmedString(customerUser?.full_name),
          contact_number: this.toTrimmedString(customerUser?.contact_number),
        },
      },
    };
  }

  private async getBookingTimelineEvents(bookingId: string) {
    try {
      // Set a short timeout for timeline events
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeline timeout')), 2000)
      );

      const queryPromise = this.supabase
        .schema('booking')
        .from('booking_timeline_events')
        .select('event_type, label, icon, created_at')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });

      const { data: events, error } = await Promise.race([queryPromise, timeoutPromise]) as any;

      if (error) {
        return [];
      }

      return (events || []).map(event => ({
        type: event.event_type,
        label: event.label,
        icon: event.icon,
        at: event.created_at
      }));
    } catch {
      // Return empty array if timeline events can't be fetched
      return [];
    }
  }

  async updateStatus(id: string, status: string, providerId?: string) {
    const normalizedStatus = this.toTrimmedString(status).toLowerCase();
    const allowedStatuses = new Set([
      'pending',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
    ]);
    if (!allowedStatuses.has(normalizedStatus)) {
      throw new BadRequestException('Unsupported booking status');
    }

    const validTransitions: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    const normalizedProviderId = this.toTrimmedString(providerId);
    if (normalizedProviderId) {
      const booking = await this.getBookingRowByIdentifier(id, 'id, provider_id, status');
      if (!booking) throw new NotFoundException(`Booking with id ${id} not found`);
      if (this.toTrimmedString(booking.provider_id) !== normalizedProviderId) {
        throw new NotFoundException(`Booking with id ${id} not found`);
      }
      const currentStatus = this.toTrimmedString(booking.status).toLowerCase();
      const allowed = validTransitions[currentStatus] ?? [];
      if (!allowed.includes(normalizedStatus)) {
        throw new BadRequestException(
          `Cannot transition booking from '${currentStatus}' to '${normalizedStatus}'`,
        );
      }
      if (['confirmed', 'in_progress'].includes(normalizedStatus)) {
        await this.ensureProviderCanMutateBooking(normalizedProviderId);
      }
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: normalizedStatus,
      updated_at: now,
    };
    if (normalizedStatus === 'in_progress') {
      updates.started_at = now;
    }
    if (normalizedStatus === 'completed') {
      updates.completed_at = now;
    }

    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      if (error.code === 'PGRST116')
        throw new NotFoundException(`Booking with id ${id} not found`);
      throw new BadRequestException(error.message);
    }

    // Add timeline event for status change (fire and forget)
    this.addTimelineEventForStatusChange(id, normalizedStatus).catch(() => {
      // Silently ignore timeline errors
    });

    // Emit notification for status change
    const notificationPattern =
      normalizedStatus === 'confirmed'
        ? NOTIFICATION_PATTERNS.BOOKING_CONFIRMED
        : normalizedStatus === 'in_progress'
          ? NOTIFICATION_PATTERNS.BOOKING_IN_PROGRESS
          : normalizedStatus === 'completed'
            ? NOTIFICATION_PATTERNS.BOOKING_COMPLETED
            : null;

    if (notificationPattern) {
      await this.emitNotifications(id, notificationPattern, {
        status: normalizedStatus,
      });
    }

    return { message: 'Booking status updated successfully.', booking: data };
  }

  private async addTimelineEventForStatusChange(bookingId: string, status: string) {
    const statusLabels: Record<string, string> = {
      'pending': 'Request created',
      'confirmed': 'Provider accepted your booking',
      'in_progress': 'Provider started your service',
      'completed': 'Service completed',
      'cancelled': 'Booking cancelled'
    };

    const label = statusLabels[status] || `Status: ${status}`;

    try {
      const { error } = await this.supabase
        .schema('booking')
        .from('booking_timeline_events')
        .insert({
          booking_id: bookingId,
          event_type: 'status-change',
          label,
          icon: status
        });

      if (error) {
        // Log error but don't throw - timeline events are non-critical
        console.warn('Failed to create timeline event:', error.message);
      }
    } catch (error) {
      // Log error but don't throw - timeline events are non-critical
      console.warn('Failed to create timeline event:', error);
    }
  }

  async cancelBooking(
    id: string,
    userId: string,
    reason: string,
    explanation: string,
  ) {
    const booking = await this.getBookingRowByIdentifier(
      id,
      'id, customer_id, provider_id',
    );
    if (!booking) throw new NotFoundException(`Booking with id ${id} not found`);

    const normalizedUserId = this.toTrimmedString(userId);
    const canCancel =
      normalizedUserId === this.toTrimmedString(booking.customer_id) ||
      normalizedUserId === this.toTrimmedString(booking.provider_id);
    if (!canCancel) {
      throw new NotFoundException(`Booking with id ${id} not found`);
    }

    const canonicalBookingId = this.toTrimmedString(booking.id);
    const normalizedReason = this.toNullableString(reason);
    const normalizedExplanation = this.toNullableString(explanation);
    const cancelledAt = new Date().toISOString();

    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_by: normalizedUserId,
        cancel_reason: normalizedReason,
        cancel_explanation: normalizedExplanation,
        cancelled_at: cancelledAt,
      })
      .eq('id', canonicalBookingId)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    const { error: cancellationError } = await this.supabase
      .schema('booking')
      .from('bookings_cancellations')
      .insert([
        {
          booking_id: canonicalBookingId,
          user_id: normalizedUserId,
          reason: normalizedReason,
          explanation: normalizedExplanation,
        },
      ]);
    if (cancellationError)
      throw new BadRequestException(cancellationError.message);

    // Emit notification for cancellation
    await this.emitNotifications(canonicalBookingId, NOTIFICATION_PATTERNS.BOOKING_CANCELLED, {
      cancelledBy: normalizedUserId,
      reason: normalizedReason,
    });
    await sendKafkaRpcRequest(
      () =>
        this.kafka.send(PAYMENT_PATTERNS.CANCEL_BOOKING_PAYMENT, {
          bookingId: canonicalBookingId,
        }),
      {
        context: PAYMENT_PATTERNS.CANCEL_BOOKING_PAYMENT,
        logger: this.logger,
      },
    );

    return { booking: data };
  }

  async getAttachments(
    bookingId: string,
    userId?: string,
    accessToken?: string,
  ) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return { attachments: [] };

    const normalizedUserId = this.toTrimmedString(userId);
    if (normalizedUserId) {
      const booking = await this.getBookingRowByIdentifier(
        normalizedBookingId,
        'id, customer_id, provider_id',
      );
      if (!booking) throw new NotFoundException('Booking not found');
      const ownerMatches =
        normalizedUserId === this.toTrimmedString(booking.customer_id) ||
        normalizedUserId === this.toTrimmedString(booking.provider_id);
      if (!ownerMatches) throw new NotFoundException('Booking not found');
    }

    let tableResult: { attachments: any[] } | null = null;
    let lastError: any = null;

    try {
      tableResult = await this.getAttachmentsWithClient(
        this.supabase,
        normalizedBookingId,
      );
    } catch (error: any) {
      const scopedClient = this.createAccessScopedSupabase(accessToken || '');
      if (scopedClient && this.isPermissionDeniedError(error)) {
        try {
          tableResult = await this.getAttachmentsWithClient(
            scopedClient,
            normalizedBookingId,
          );
        } catch (fallbackError: any) {
          lastError = fallbackError;
        }
      } else {
        lastError = error;
      }
    }

    if (
      tableResult &&
      Array.isArray(tableResult.attachments) &&
      tableResult.attachments.length > 0
    ) {
      return tableResult;
    }

    const storageAttachments =
      await this.getAttachmentsFromStorage(normalizedBookingId);
    if (storageAttachments.length > 0) {
      return { attachments: storageAttachments };
    }

    if (tableResult) return tableResult;
    if (lastError) {
      throw new InternalServerErrorException(
        this.toTrimmedString(lastError?.message) ||
          'Failed to fetch booking attachments',
      );
    }

    return { attachments: [] };
  }

  async saveAttachments(
    bookingId: string,
    attachments: any[],
    userId?: string,
    accessToken?: string,
  ) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return { attachments: [] };

    const normalizedUserId = this.toTrimmedString(userId);
    if (normalizedUserId) {
      const booking = await this.getBookingRowByIdentifier(
        normalizedBookingId,
        'id, customer_id, provider_id',
      );
      if (!booking) throw new NotFoundException('Booking not found');
      const ownerMatches =
        normalizedUserId === this.toTrimmedString(booking.customer_id) ||
        normalizedUserId === this.toTrimmedString(booking.provider_id);
      if (!ownerMatches) throw new NotFoundException('Booking not found');
    }

    try {
      return await this.saveAttachmentsWithClient(
        this.supabase,
        normalizedBookingId,
        attachments,
      );
    } catch (error: any) {
      const scopedClient = this.createAccessScopedSupabase(accessToken || '');
      if (scopedClient && this.isPermissionDeniedError(error)) {
        try {
          return await this.saveAttachmentsWithClient(
            scopedClient,
            normalizedBookingId,
            attachments,
          );
        } catch (fallbackError: any) {
          if (this.isPermissionDeniedError(fallbackError)) {
            return { attachments: [] };
          }
          throw new InternalServerErrorException(
            this.toTrimmedString(fallbackError?.message) ||
              'Failed to save booking attachments',
          );
        }
      }

      if (this.isPermissionDeniedError(error)) {
        return { attachments: [] };
      }

      throw new InternalServerErrorException(
        this.toTrimmedString(error?.message) ||
          'Failed to save booking attachments',
      );
    }
  }

  async createDispute(bookingId: string, userId: string, reason: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    const normalizedUserId = this.toTrimmedString(userId);
    const normalizedReason = this.toTrimmedString(reason);
    if (!normalizedBookingId)
      throw new BadRequestException('bookingId is required');
    if (!normalizedUserId) throw new BadRequestException('userId is required');
    if (!normalizedReason) throw new BadRequestException('reason is required');

    const booking = await this.getBookingRowByIdentifier(
      normalizedBookingId,
      'id, customer_id, provider_id',
    );
    if (!booking) throw new NotFoundException('Booking not found');
    const ownerMatches =
      normalizedUserId === this.toTrimmedString(booking.customer_id) ||
      normalizedUserId === this.toTrimmedString(booking.provider_id);
    if (!ownerMatches) throw new NotFoundException('Booking not found');

    try {
      const result = await sendKafkaRpcRequest(
        () =>
          this.kafka.send(SUPPORT_PATTERNS.CREATE_DISPUTE, {
            bookingId: normalizedBookingId,
            userId: normalizedUserId,
            reason: normalizedReason,
          }),
        { context: SUPPORT_PATTERNS.CREATE_DISPUTE },
      );

      // Emit notification for dispute creation
      await this.emitNotifications(normalizedBookingId, NOTIFICATION_PATTERNS.DISPUTE_CREATED, {
        raisedBy: normalizedUserId,
        reason: normalizedReason,
      });

      return result;
    } catch (error: any) {
      throw new InternalServerErrorException(
        this.toTrimmedString(error?.message) || 'Failed to create dispute',
      );
    }
  }
}
