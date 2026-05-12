import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ClientKafka } from '@nestjs/microservices';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AUTH_PATTERNS,
  PROVIDER_PATTERNS,
  PAYMENT_PATTERNS,
  PricingEngine,
  SUPPORT_PATTERNS,
  sendKafkaRpcRequest,
} from '@app/common';

@Injectable()
export class BookingService implements OnModuleInit {
  private readonly availabilitySchemas = ['booking', 'booking_svc'] as const;
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly supabase: SupabaseClient,
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
  ) {}

  async onModuleInit() {
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_PROFILE);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_USERS_BY_IDS);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.ENSURE_BOOKING_PAYMENT);
    this.kafka.subscribeToResponseOf(SUPPORT_PATTERNS.CREATE_DISPUTE);
    await this.kafka.connect();
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
    const parsed = this.toTrimmedString(value);
    return parsed || null;
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
      this.toTrimmedString(booking?.service_description) ||
      this.toTrimmedString(booking?.service_title) ||
      this.toTrimmedString(booking?.service_name) ||
      ''
    );
  }

  private normalizeStatusKey(value: unknown): string {
    return this.toTrimmedString(value)
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');
  }

  private isProviderRejectedBooking(
    booking: Record<string, unknown> | null | undefined,
  ) {
    const normalizedStatus = this.normalizeStatusKey(booking?.status);
    if (normalizedStatus === 'rejected') return true;

    const normalizedReason = this.normalizeStatusKey(
      booking?.cancellation_reason,
    );
    return (
      normalizedReason === 'provider_rejected' ||
      normalizedReason === 'provider_declined'
    );
  }

  private decorateCustomerFacingBooking<T extends Record<string, unknown>>(
    booking: T,
  ): T {
    if (!this.isProviderRejectedBooking(booking)) {
      return booking;
    }

    return {
      ...booking,
      status: 'rejected',
    };
  }

  private async updateBookingWithSchemaFallback(
    bookingId: string,
    payload: Record<string, unknown>,
  ) {
    let nextPayload = { ...payload };
    let schemaFallbackAttempts = 0;

    while (schemaFallbackAttempts < 8) {
      const updateResult = await this.supabase
        .schema('booking')
        .from('bookings')
        .update(nextPayload)
        .eq('id', bookingId)
        .select()
        .single();

      if (!updateResult.error) {
        return updateResult.data;
      }

      if (!this.isSchemaMismatchError(updateResult.error)) {
        throw updateResult.error;
      }

      const missingColumn = this.extractMissingColumnFromError(
        updateResult.error,
      );
      if (!missingColumn || !(missingColumn in nextPayload)) {
        throw updateResult.error;
      }

      delete nextPayload[missingColumn];
      schemaFallbackAttempts += 1;
    }

    throw new BadRequestException('Failed to update booking');
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
    return this.toTrimmedString(value).toLowerCase();
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

    const response = await sendKafkaRpcRequest(
      () =>
        this.kafka.send(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS, {
          userIds: [normalizedUserId],
        }),
      { context: PROVIDER_PATTERNS.GET_PROFILES_BY_IDS },
    );

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

  private async getProviderAvailabilityWithClient(
    client: SupabaseClient,
    userId: string,
  ) {
    let lastError: any = null;

    for (const schemaName of this.availabilitySchemas) {
      const [weeklyResult, daysOffResult] = await Promise.all([
        client
          .schema(schemaName)
          .from('provider_availability')
          .select('*')
          .eq('user_id', userId),
        client
          .schema(schemaName)
          .from('provider_days_off')
          .select('*')
          .eq('user_id', userId),
      ]);

      if (!weeklyResult.error && !daysOffResult.error) {
        const normalizedDaysOff = (daysOffResult.data || []).map((row: any) => ({
          ...row,
          off_date: this.normalizeOffDate(row?.off_date) || row?.off_date,
        }));
        return { weeklySchedule: weeklyResult.data || [], daysOff: normalizedDaysOff };
      }

      const combinedErrors = [weeklyResult.error, daysOffResult.error].filter(Boolean);
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
    const daysOffRows = this.normalizeDaysOffRows(userId, body?.daysOff);
    const includesWeeklySchedule = body?.weeklySchedule !== undefined;
    const includesDaysOff = body?.daysOff !== undefined;

    let lastError: any = null;

    for (const schemaName of this.availabilitySchemas) {
      let operationError: any = null;

      if (includesWeeklySchedule) {
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

    if (
      this.allowUnverifiedProviderBooking() &&
      ['active', 'pending'].includes(accountStatus) &&
      verificationStatus === 'pending'
    ) {
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

  private async ensurePaymentForBooking(booking: Record<string, any>) {
    const bookingId = this.toTrimmedString(booking?.id);
    if (!bookingId) return null;

    try {
      return await sendKafkaRpcRequest<any>(
        () =>
          this.kafka.send(PAYMENT_PATTERNS.ENSURE_BOOKING_PAYMENT, {
            bookingId,
            customerId: booking.customer_id,
            provider_id: booking.provider_id,
            amount: booking.total_amount,
            method: booking.payment_method,
            skipBookingLookup: true,
          }),
        { context: PAYMENT_PATTERNS.ENSURE_BOOKING_PAYMENT },
      );
    } catch (error: any) {
      this.logger.warn(
        `booking.create payment ensure failed for ${bookingId}: ${
          this.toTrimmedString(error?.message) || 'unknown error'
        }`,
      );
      return null;
    }
  }

  async createBooking(dto: any, customerId: string) {
    const normalizedProviderId = this.toTrimmedString(dto?.provider_id);
    const normalizedCustomerId = this.toTrimmedString(customerId);
    const normalizedServiceId = this.toTrimmedString(dto?.service_id);
    const normalizedScheduledAt = this.toTrimmedString(dto?.scheduled_at);
    this.assertRequiredCreateBookingFields(
      normalizedProviderId,
      normalizedCustomerId,
      normalizedServiceId,
      normalizedScheduledAt,
    );
    await this.ensureProviderCanBeBooked(normalizedProviderId);

    const pricingQuote = PricingEngine.quote(dto || {});
    const normalizedServiceLocationType =
      this.toTrimmedString(dto?.service_location_type).toLowerCase() ===
      'in_shop'
        ? 'in_shop'
        : 'mobile';
    const normalizedPaymentMethod =
      this.toTrimmedString(dto?.payment_method).toLowerCase() ||
      'cash_on_service';
    const serviceDescription =
      this.toTrimmedString(
        dto?.service_description || dto?.service_name || dto?.service_title,
      ) || null;
    const bookingRef = `BKG-${randomUUID().slice(0, 8).toUpperCase()}`;

    const baseInsertPayload: Record<string, any> = {
      id: randomUUID(),
      booking_reference: bookingRef,
      customer_id: normalizedCustomerId,
      provider_id: normalizedProviderId,
      service_id: normalizedServiceId,
      service_description: serviceDescription,
      service_address: this.toTrimmedString(dto?.service_address),
      service_location_type: normalizedServiceLocationType,
      scheduled_at: normalizedScheduledAt,
      pricing_mode: pricingQuote.pricing_mode,
      hourly_rate: pricingQuote.hourly_rate,
      flat_rate: pricingQuote.flat_rate,
      hours_required: pricingQuote.hours_required,
      total_amount: pricingQuote.total_amount,
      payment_method: normalizedPaymentMethod,
      customer_notes: this.toNullableString(dto?.customer_notes),
      status: 'pending',
    };

    const newBooking = await this.insertBookingWithSchemaFallback(
      baseInsertPayload,
    );
    const paymentResult = await this.ensurePaymentForBooking(newBooking);

    return {
      message: 'Booking successfully created!',
      booking: newBooking,
      pricing: pricingQuote,
      payment: paymentResult?.payment || null,
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

    const providerIds = [...new Set(
      (data || [])
        .map((booking: any) => this.toTrimmedString(booking?.provider_id))
        .filter(Boolean),
    )];

    const providerEntries = await Promise.all(
      providerIds.map(async (providerId) => {
        const providerUser = await this.getUserProfileFromAuth(providerId);

        return [
          providerId,
          {
            full_name: this.toTrimmedString(providerUser?.full_name) || null,
            contact_number:
              this.toTrimmedString(providerUser?.contact_number) || null,
            business_name: null as string | null,
            average_rating: null as number | null,
            total_reviews: null as number | null,
          },
        ] as const;
      }),
    );
    const providerById = new Map(providerEntries);

      const bookings = (data || []).map((booking: any) => {
        const providerId = this.toTrimmedString(booking?.provider_id);
        return this.decorateCustomerFacingBooking({
          ...booking,
          provider: providerById.get(providerId) || {},
        });
      });

    return { bookings };
  }

  async getProviderBookings(providerId: string) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId)
      throw new BadRequestException('providerId is required');

    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .eq('provider_id', normalizedProviderId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    const customerIds = [
      ...new Set(
        (data || [])
          .map((booking: any) => this.toTrimmedString(booking?.customer_id))
          .filter(Boolean),
      ),
    ];
    const customerEntries = await Promise.all(
      customerIds.map(async (customerId) => [
        customerId,
        await this.getUserProfileFromAuth(customerId),
      ] as const),
    );
    const customerById = new Map(customerEntries);

    const bookings = (data || []).map((booking: any) => {
      const customerId = this.toTrimmedString(booking?.customer_id);
      const customer = customerById.get(customerId);
      return {
        ...booking,
        customer_name: this.toTrimmedString(customer?.full_name),
        customer_contact: this.toTrimmedString(customer?.contact_number),
        service_title: this.resolveServiceTitle(booking),
      };
    });

    return { bookings };
  }

  async getProviderBookingById(bookingId: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId)
      throw new BadRequestException('bookingId is required');

    const data = await this.getBookingRowByIdentifier(normalizedBookingId);
    if (!data) throw new NotFoundException('Booking not found');

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

    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .eq(actorColumn, normalizedUserId)
      .in('status', ['confirmed', 'in_progress', 'completed'])
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
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

      return { booking: this.decorateCustomerFacingBooking(data) };
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
        payment_status: this.toTrimmedString(booking.payment_status) || 'pending',
        amount: Number(booking.amount || booking.total_amount || 0),
        scheduled_at: booking.scheduled_at || null,
        created_at: booking.created_at || null,
        customer_id: customerId || null,
        provider_id: providerId || null,
        service_id: this.toTrimmedString(booking?.service_id) || null,
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

    const enriched = bookings.map((booking: any) => {
      const provider = userById.get(this.toTrimmedString(booking?.provider_id));
      const customer = userById.get(this.toTrimmedString(booking?.customer_id));
      return {
        ...booking,
        provider_name: this.toTrimmedString(provider?.full_name),
        customer_name: this.toTrimmedString(customer?.full_name),
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
    const normalizedScheduledAt = this.toTrimmedString(scheduledAt);
    if (!normalizedScheduledAt) throw new BadRequestException('scheduledAt is required');

    const date = normalizedScheduledAt.slice(0, 10);
    const slots = (await this.getReservedSlots(providerId, date)).reservedSlots;
    const requestedStart = new Date(normalizedScheduledAt).getTime();
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
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return { requests: [] };

    try {
      const result = await this.withQueryTimeout<any>(
        this.supabase
          .schema('booking')
          .from('booking_reschedule_requests')
          .select('*')
          .eq('booking_id', normalizedBookingId)
          .order('created_at', { ascending: false }),
        4500,
        'booking.get-reschedules query',
      );
      const { data, error } = result || {};
      if (error) {
        this.logger.warn(
          `booking.get-reschedules degraded: ${this.toTrimmedString(error?.message) || 'query error'}`,
        );
        return { requests: [] };
      }
      return { requests: data || [] };
    } catch (error) {
      if (this.isTimeoutLikeError(error)) {
        this.logger.warn(
          `booking.get-reschedules degraded: query timed out for bookingId=${normalizedBookingId}`,
        );
        return { requests: [] };
      }
      throw new InternalServerErrorException(
        this.toTrimmedString((error as { message?: unknown })?.message) ||
          'Failed to fetch reschedule requests',
      );
    }
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

    if (body.decision === 'approved' && data) {
      const req = data as Record<string, unknown>;
      const proposedDate = this.toTrimmedString(req.proposed_date);
      const proposedTime = this.toTrimmedString(req.proposed_time);
      if (proposedDate && proposedTime) {
        await this.supabase
          .schema('booking')
          .from('bookings')
          .update({ scheduled_at: `${proposedDate}T${proposedTime}` })
          .eq('id', this.toTrimmedString(req.booking_id));
      }
    }
    return { request: data };
  }

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
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return { charges: [] };

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

    if (decision === 'approved' && data?.length && body.bookingId) {
      const totalAdditional = data.reduce(
        (acc: number, charge: any) => acc + Number(charge.amount),
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
          .update({
            total_amount: Number(booking.total_amount) + totalAdditional,
          })
          .eq('id', body.bookingId);
      }
    }
    return { charges: data || [] };
  }

  async getHistory() {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .in('status', ['completed', 'cancelled', 'disputed']);
    if (error) throw new BadRequestException(error.message);
    return { history: data };
  }

  async getRequests() {
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('*')
      .eq('status', 'pending');
    if (error) throw new BadRequestException(error.message);
    return { requests: data };
  }

  async getBookingById(id: string) {
    const data = await this.getBookingRowByIdentifier(id);
    if (!data) throw new NotFoundException('Booking not found');

    const providerId = this.toTrimmedString(data.provider_id);
    const customerId = this.toTrimmedString(data.customer_id);
    const [providerUser, customerUser] = await Promise.all([
      this.getUserProfileFromAuth(providerId),
      this.getUserProfileFromAuth(customerId),
    ]);

    return {
      booking: this.decorateCustomerFacingBooking({
        ...data,
        service_title: this.resolveServiceTitle(data),
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
      }),
    };
  }

  async updateStatus(id: string, status: string, metadata?: Record<string, unknown>) {
    const booking = await this.getBookingRowByIdentifier(id, 'id, provider_id');
    if (!booking?.id) {
      throw new NotFoundException(`Booking with id ${id} not found`);
    }

    const bookingId = this.toTrimmedString(booking.id);
    const normalizedStatus = this.normalizeStatusKey(status);
    const actorId = this.toTrimmedString(metadata?.actorId);
    const actorRole = this.normalizeStatusKey(metadata?.actorRole);
    const providerId = this.toTrimmedString(booking.provider_id);
    const nowIso = new Date().toISOString();

    const isProviderRejection =
      normalizedStatus === 'rejected' &&
      actorRole === 'provider' &&
      actorId &&
      actorId === providerId;

    const basePayload: Record<string, unknown> = {
      status,
    };

    if (normalizedStatus === 'cancelled' && actorId) {
      basePayload.cancelled_at = nowIso;
      basePayload.cancelled_by = actorId;
    }

    if (isProviderRejection) {
      const rejectionPayload: Record<string, unknown> = {
        status: 'rejected',
        cancellation_reason: 'provider_rejected',
        cancelled_at: nowIso,
        cancelled_by: actorId,
      };

      try {
        const data = await this.updateBookingWithSchemaFallback(
          bookingId,
          rejectionPayload,
        );
        return {
          message: 'Booking rejected successfully.',
          booking: this.decorateCustomerFacingBooking(data),
        };
      } catch (error: any) {
        const fallbackPayload: Record<string, unknown> = {
          status: 'cancelled',
          cancellation_reason: 'provider_rejected',
          cancelled_at: nowIso,
          cancelled_by: actorId,
        };

        try {
          const data = await this.updateBookingWithSchemaFallback(
            bookingId,
            fallbackPayload,
          );
          return {
            message: 'Booking rejected successfully.',
            booking: this.decorateCustomerFacingBooking(data),
          };
        } catch (fallbackError: any) {
          const finalError = fallbackError?.message ? fallbackError : error;
          throw new BadRequestException(
            this.toTrimmedString(finalError?.message) ||
              'Failed to reject booking',
          );
        }
      }
    }

    try {
      const data = await this.updateBookingWithSchemaFallback(
        bookingId,
        basePayload,
      );
      return { message: 'Booking status updated successfully.', booking: data };
    } catch (error: any) {
      if (error?.code === 'PGRST116') {
        throw new NotFoundException(`Booking with id ${id} not found`);
      }
      throw new BadRequestException(
        this.toTrimmedString(error?.message) || 'Failed to update booking',
      );
    }
  }

  async cancelBooking(
    id: string,
    userId: string,
    reason: string,
    explanation: string,
  ) {
    const booking = await this.getBookingRowByIdentifier(id, 'id');
    if (!booking?.id) throw new NotFoundException('Booking not found');

    const bookingId = this.toTrimmedString(booking.id);
    const { data, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);

    const { error: cancellationError } = await this.supabase
      .schema('booking')
      .from('bookings_cancellations')
      .insert([
        {
          booking_id: bookingId,
          cancelled_by: userId,
          reason,
          detailed_explanation: explanation,
        },
      ]);
    if (cancellationError) {
      this.logger.warn(
        `Booking ${bookingId} was cancelled, but cancellation audit insert failed: ${cancellationError.message}`,
      );
    }

    return { booking: data };
  }

  async getAttachments(bookingId: string, accessToken?: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return { attachments: [] };

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
    accessToken?: string,
  ) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return { attachments: [] };

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

    try {
      return await sendKafkaRpcRequest(
        () =>
          this.kafka.send(SUPPORT_PATTERNS.CREATE_DISPUTE, {
            bookingId: normalizedBookingId,
            userId: normalizedUserId,
            reason: normalizedReason,
          }),
        { context: SUPPORT_PATTERNS.CREATE_DISPUTE },
      );
    } catch (error: any) {
      throw new InternalServerErrorException(
        this.toTrimmedString(error?.message) || 'Failed to create dispute',
      );
    }
  }
}

