import {
  Inject,
  Injectable,
  BadRequestException,
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
  PAYMENT_PATTERNS,
  TRUST_PATTERNS,
  connectKafkaClientWithRetry,
  sendKafkaRpcRequest,
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
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.UPDATE_USER_STATUS);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_PROVIDER_BOOKINGS);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_PROVIDER_BOOKING_BY_ID);
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
    if (status === 'approved' || status === 'pending' || status === 'rejected') {
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
      .select('user_id, business_name, average_rating, verification_status')
      .in('user_id', providerIds);

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    const data = (services || [])
      .filter((s: any) => profileMap[s.provider_id]?.verification_status === 'approved')
      .map((s: any) => ({ ...s, provider_profiles: profileMap[s.provider_id] || null }));

    return { success: true, data };
  }

  async searchProviders(searchTerm?: string) {
    const { data: services, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('id, service_id, title, price, pricing_mode, duration_minutes, description, provider_id');
    if (error) throw new InternalServerErrorException(error.message);

    const providerIds = [...new Set((services || []).map((s: any) => s.provider_id))];
    const { data: profiles } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('user_id, business_name, trust_score, average_rating, verification_status')
      .in('user_id', providerIds);

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    const lower = this.toTrimmedString(searchTerm).toLowerCase();
    const filtered = (services || [])
      .filter((s: any) => profileMap[s.provider_id]?.verification_status === 'approved')
      .filter(
        (s: any) =>
          !lower ||
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

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .select('user_id, business_name, average_rating, verification_status')
      .in('user_id', normalizedIds);
    if (error) throw new InternalServerErrorException(error.message);
    return { profiles: data || [] };
  }

  async getProviderApplications(page = 1, limit = 20, status = 'pending') {
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
        'user_id, business_name, verification_status, created_at, updated_at, service_description',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);

    const normalizedStatus = this.toTrimmedString(status).toLowerCase() || 'pending';
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
    const documents = (docsResult.data || []).map((doc: any) => ({
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
      location: '-',
      status,
      email: user.email || null,
      contact_number: user.contact_number || null,
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

  async updateProviderApplicationStatus(
    id: string,
    status: string,
    rejectReason?: string,
  ) {
    const normalizedId = this.toTrimmedString(id);
    const normalizedStatus = this.toTrimmedString(status).toLowerCase();
    if (!normalizedId) throw new BadRequestException('id is required');
    if (!['approved', 'rejected', 'pending'].includes(normalizedStatus)) {
      throw new BadRequestException(
        'status must be one of: approved, rejected, pending',
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
      .update({ verification_status: normalizedStatus })
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
      const docUpdate = await this.supabase
        .schema('provider_catalog')
        .from('provider_documents')
        .update({
          status: normalizedStatus,
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

    const profileUpdate = await this.supabase
      .schema('provider_catalog')
      .from('provider_profiles')
      .update({ verification_status: normalizedStatus })
      .eq('user_id', providerId);
    if (profileUpdate.error) {
      throw new InternalServerErrorException(profileUpdate.error.message);
    }

    const mappedUserStatus = this.mapVerificationStatusToUserStatus(
      normalizedStatus,
    );
    await this.request(AUTH_PATTERNS.UPDATE_USER_STATUS, {
      userId: providerId,
      status: mappedUserStatus,
    });

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
    const reviewsResponse = await this.request<any>(
      TRUST_PATTERNS.GET_PROVIDER_REVIEWS,
      { providerId: normalizedProviderId },
    );
    const reviews = Array.isArray(reviewsResponse?.reviews)
      ? reviewsResponse.reviews
      : [];

    return {
      status: 'success',
      data: {
        provider_id: normalizedProviderId,
        average_rating: Number(profile?.average_rating) || 0,
        total_reviews: Number(profile?.total_reviews) || 0,
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

    return await this.request<any>(BOOKING_PATTERNS.GET_PROVIDER_BOOKINGS, {
      providerId: normalizedProviderId,
    });
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
    return await this.request(BOOKING_PATTERNS.UPDATE_STATUS, {
      id: bookingId,
      status,
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
  async getMyServices(providerId: string) {
    const normalizedProviderId = this.toTrimmedString(providerId);
    if (!normalizedProviderId) return { services: [] };

    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .select('*')
      .eq('provider_id', normalizedProviderId);
    if (error) throw new InternalServerErrorException(error.message);
    return { services: data || [] };
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

  async updateAdminService(id: string, body: any) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const { provider_id: _providerId, id: _id, ...updates } = body || {};
    const { data, error } = await this.supabase
      .schema('provider_catalog')
      .from('provider_services')
      .update(updates)
      .eq('id', normalizedId)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException(`Service ${normalizedId} not found`);
    }
    return { ok: true };
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
}
