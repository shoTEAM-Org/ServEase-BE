import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AUTH_PATTERNS,
  BOOKING_PATTERNS,
  CATALOG_PATTERNS,
  CUSTOMER_PATTERNS,
  PAYMENT_PATTERNS,
  PROVIDER_PATTERNS,
  SUPPORT_PATTERNS,
  sendKafkaRpcRequest,
} from '@app/common';

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
    private readonly supabase: SupabaseClient,
  ) {}

  async onModuleInit() {
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_PROFILE);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_USERS_BY_ROLE);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_USERS_BY_IDS);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.UPDATE_USER_STATUS);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.UPDATE_PROFILE);
    this.kafka.subscribeToResponseOf(CUSTOMER_PATTERNS.GET_PROFILE);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_PROFILE);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_MY_SERVICES);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_APPLICATIONS);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_APPLICATION_BY_ID);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.UPDATE_APPLICATION_STATUS);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.UPDATE_DOCUMENT_STATUS);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_ALL_REVIEWS);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.DELETE_REVIEW);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_COUNTS);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_ALL);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_ONGOING);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_ANALYTICS);
    this.kafka.subscribeToResponseOf(SUPPORT_PATTERNS.CREATE_DISPUTE);
    this.kafka.subscribeToResponseOf(SUPPORT_PATTERNS.GET_DISPUTES);
    this.kafka.subscribeToResponseOf(SUPPORT_PATTERNS.UPDATE_DISPUTE_STATUS);
    this.kafka.subscribeToResponseOf(SUPPORT_PATTERNS.GET_SUPPORT_TICKETS);
    this.kafka.subscribeToResponseOf(SUPPORT_PATTERNS.UPDATE_SUPPORT_TICKET);
    this.kafka.subscribeToResponseOf(SUPPORT_PATTERNS.GET_COMPLIANCE_REPORT);
    this.kafka.subscribeToResponseOf(SUPPORT_PATTERNS.SEND_BROADCAST);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.GET_ADMIN_TRANSACTIONS);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.GET_ADMIN_EARNINGS);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.GET_ADMIN_PAYOUTS);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.UPDATE_ADMIN_PAYOUT);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.GET_ADMIN_REFUNDS);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.MARK_ADMIN_REFUND);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.GET_ADMIN_FAILED_PAYMENTS);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.GET_REVENUE_REPORT);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.GET_FINANCIAL_REPORT);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.GET_ADMIN_CATEGORIES);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.CREATE_ADMIN_CATEGORY);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.UPDATE_ADMIN_CATEGORY);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.DELETE_ADMIN_CATEGORY);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.GET_ADMIN_SERVICES);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.CREATE_ADMIN_SERVICE);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.UPDATE_ADMIN_SERVICE);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.DELETE_ADMIN_SERVICE);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.GET_ADMIN_SERVICE_AREAS);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.CREATE_ADMIN_SERVICE_AREA);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.UPDATE_ADMIN_SERVICE_AREA);
    this.kafka.subscribeToResponseOf(CATALOG_PATTERNS.DELETE_ADMIN_SERVICE_AREA);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_USER_REPORT);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_PERFORMANCE_REPORT);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_COMPLIANCE_REPORT);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.GET_COMMISSION);
    this.kafka.subscribeToResponseOf(PAYMENT_PATTERNS.UPDATE_COMMISSION);
    await this.kafka.connect();
  }

  private async request<T = any>(pattern: string, payload: unknown): Promise<T> {
    return await sendKafkaRpcRequest(
      () => this.kafka.send<T, unknown>(pattern, payload),
      { context: pattern },
    );
  }

  private toTrimmedString(value: unknown) {
    return String(value ?? '').trim();
  }

  async updateDocumentStatus(documentId: string, dto: any) {
    return await this.request(PROVIDER_PATTERNS.UPDATE_DOCUMENT_STATUS, {
      documentId,
      ...dto,
    });
  }

  // === USER MANAGEMENT ===

  async getCustomers(page = 1, limit = 20) {
    const usersResponse = await this.request<any>(AUTH_PATTERNS.GET_USERS_BY_ROLE, {
      role: 'customer',
      page,
      limit,
    });
    const customers = Array.isArray(usersResponse?.users)
      ? usersResponse.users
      : [];
    if (!customers.length) {
      return {
        customers: [],
        total: Number(usersResponse?.total || 0),
        page: Number(usersResponse?.page || page),
        limit: Number(usersResponse?.limit || limit),
      };
    }

    const customerIds = customers
      .map((customer: any) => this.toTrimmedString(customer?.id))
      .filter((customerId: string) => Boolean(customerId));
    const countsResponse = await this.request<any>(BOOKING_PATTERNS.GET_COUNTS, {
      dimension: 'customer',
      ids: customerIds,
    });
    const counts =
      countsResponse && typeof countsResponse === 'object' && countsResponse.counts
        ? countsResponse.counts
        : {};

    const enriched = customers.map((customer: any) => ({
      ...customer,
      booking_count: Number(counts[this.toTrimmedString(customer?.id)] || 0),
    }));

    return {
      customers: enriched,
      total: Number(usersResponse?.total || 0),
      page: Number(usersResponse?.page || page),
      limit: Number(usersResponse?.limit || limit),
    };
  }

  async getCustomerById(id: string) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const [user, customerProfile, bookingCounts] = await Promise.all([
      this.request<any>(AUTH_PATTERNS.GET_PROFILE, { userId: normalizedId }),
      this.request<any>(CUSTOMER_PATTERNS.GET_PROFILE, { userId: normalizedId }),
      this.request<any>(BOOKING_PATTERNS.GET_COUNTS, {
        dimension: 'customer',
        ids: [normalizedId],
      }),
    ]);

    if (!user || this.toTrimmedString(user?.role) !== 'customer') {
      throw new NotFoundException(`Customer ${normalizedId} not found`);
    }

    const counts =
      bookingCounts && typeof bookingCounts === 'object' && bookingCounts.counts
        ? bookingCounts.counts
        : {};
    return {
      user,
      profile: customerProfile || null,
      booking_count: Number(counts[normalizedId] || 0),
    };
  }

  async updateCustomerStatus(id: string, status: string) {
    const normalizedId = this.toTrimmedString(id);
    const user = await this.request<any>(AUTH_PATTERNS.GET_PROFILE, {
      userId: normalizedId,
    });
    if (!user || this.toTrimmedString(user?.role) !== 'customer') {
      throw new NotFoundException(`Customer ${normalizedId} not found`);
    }

    await this.request(AUTH_PATTERNS.UPDATE_USER_STATUS, {
      userId: normalizedId,
      status,
    });
    return { ok: true };
  }

  async getProviders(page = 1, limit = 20) {
    const usersResponse = await this.request<any>(AUTH_PATTERNS.GET_USERS_BY_ROLE, {
      role: 'provider',
      page,
      limit,
    });
    const providers = Array.isArray(usersResponse?.users)
      ? usersResponse.users
      : [];
    if (!providers.length) {
      return {
        providers: [],
        total: Number(usersResponse?.total || 0),
        page: Number(usersResponse?.page || page),
        limit: Number(usersResponse?.limit || limit),
      };
    }

    const providerIds = providers
      .map((provider: any) => this.toTrimmedString(provider?.id))
      .filter((providerId: string) => Boolean(providerId));
    const [profilesResponse, countsResponse] = await Promise.all([
      this.request<any>(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS, {
        userIds: providerIds,
      }),
      this.request<any>(BOOKING_PATTERNS.GET_COUNTS, {
        dimension: 'provider',
        ids: providerIds,
      }),
    ]);
    const profiles = Array.isArray(profilesResponse?.profiles)
      ? profilesResponse.profiles
      : [];
    const profileById = new Map(
      profiles.map((profile: any) => [this.toTrimmedString(profile?.user_id), profile]),
    );
    const counts =
      countsResponse && typeof countsResponse === 'object' && countsResponse.counts
        ? countsResponse.counts
        : {};

    const enriched = providers.map((provider: any) => {
      const providerId = this.toTrimmedString(provider?.id);
      const profile = profileById.get(providerId) as any;
      return {
        ...provider,
        business_name:
          this.toTrimmedString(profile?.business_name) ||
          this.toTrimmedString(provider?.full_name),
        average_rating: Number(profile?.average_rating || 0),
        verification_status: profile?.verification_status || null,
        booking_count: Number(counts[providerId] || 0),
      };
    });

    return {
      providers: enriched,
      total: Number(usersResponse?.total || 0),
      page: Number(usersResponse?.page || page),
      limit: Number(usersResponse?.limit || limit),
    };
  }

  async getProviderById(id: string) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const [user, profileResponse, servicesResponse, countsResponse] =
      await Promise.all([
        this.request<any>(AUTH_PATTERNS.GET_PROFILE, { userId: normalizedId }),
        this.request<any>(PROVIDER_PATTERNS.GET_PROFILE, { userId: normalizedId }),
        this.request<any>(PROVIDER_PATTERNS.GET_MY_SERVICES, {
          providerId: normalizedId,
        }),
        this.request<any>(BOOKING_PATTERNS.GET_COUNTS, {
          dimension: 'provider',
          ids: [normalizedId],
        }),
      ]);

    if (!user || this.toTrimmedString(user?.role) !== 'provider') {
      throw new NotFoundException(`Provider ${normalizedId} not found`);
    }

    const profile =
      profileResponse && typeof profileResponse === 'object' && 'data' in profileResponse
        ? profileResponse.data
        : profileResponse;
    const services =
      servicesResponse && typeof servicesResponse === 'object' && 'services' in servicesResponse
        ? servicesResponse.services
        : [];
    const counts =
      countsResponse && typeof countsResponse === 'object' && countsResponse.counts
        ? countsResponse.counts
        : {};

    return {
      user,
      profile: profile || null,
      booking_count: Number(counts[normalizedId] || 0),
      services: Array.isArray(services) ? services : [],
    };
  }

  async updateProviderStatus(id: string, status: string) {
    const normalizedId = this.toTrimmedString(id);
    const user = await this.request<any>(AUTH_PATTERNS.GET_PROFILE, {
      userId: normalizedId,
    });
    if (!user || this.toTrimmedString(user?.role) !== 'provider') {
      throw new NotFoundException(`Provider ${normalizedId} not found`);
    }

    await this.request(AUTH_PATTERNS.UPDATE_USER_STATUS, {
      userId: normalizedId,
      status,
    });
    return { ok: true };
  }

  async getProviderApplications(page = 1, limit = 20, status = 'all') {
    return await this.request(PROVIDER_PATTERNS.GET_APPLICATIONS, {
      page,
      limit,
      status,
    });
  }

  async getProviderApplicationById(id: string) {
    return await this.request(PROVIDER_PATTERNS.GET_APPLICATION_BY_ID, { id });
  }

  async updateProviderApplicationStatus(id: string, status: string, rejectReason?: string) {
    return await this.request(PROVIDER_PATTERNS.UPDATE_APPLICATION_STATUS, {
      id,
      status,
      reject_reason: rejectReason,
    });
  }

  async getReviews(page = 1, limit = 20) {
    return await this.request(PROVIDER_PATTERNS.GET_ALL_REVIEWS, {
      page,
      limit,
    });
  }

  async deleteReview(id: string) {
    return await this.request(PROVIDER_PATTERNS.DELETE_REVIEW, { id });
  }

  // === ACCOUNT ===

  async getAdminProfile(userId: string) {
    const profile = await this.request<any>(AUTH_PATTERNS.GET_PROFILE, {
      userId,
    });
    if (!profile || this.toTrimmedString(profile?.role) !== 'admin') {
      throw new NotFoundException('Admin profile not found');
    }
    return { profile };
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
    this.kafka.emit(AUTH_PATTERNS.UPDATE_PROFILE, {
      userId,
      ...filtered,
    });
    return { ok: true };
  }

  // === OPERATIONS ===

  async getAllBookings(page = 1, limit = 20) {
    return await this.request(BOOKING_PATTERNS.GET_ALL, { page, limit });
  }

  async getOngoingServices() {
    return await this.request(BOOKING_PATTERNS.GET_ONGOING, { limit: 100 });
  }

  async updateBookingStatus(id: string, status: string) {
    return await this.request(BOOKING_PATTERNS.UPDATE_STATUS, { id, status });
  }

  async createBookingDispute(bookingId: string, userId: string, reason: string) {
    const disputeResponse = await this.request<any>(SUPPORT_PATTERNS.CREATE_DISPUTE, {
      bookingId,
      userId,
      reason,
    });
    return { ok: true, dispute_id: disputeResponse?.dispute?.id || null };
  }

  async getDisputes(page = 1, limit = 20, status?: string) {
    return await this.request(SUPPORT_PATTERNS.GET_DISPUTES, {
      page,
      limit,
      status,
    });
  }

  async updateDisputeStatus(id: string, status: string) {
    return await this.request(SUPPORT_PATTERNS.UPDATE_DISPUTE_STATUS, {
      id,
      status,
    });
  }

  async getSupportTickets(page = 1, limit = 20) {
    return await this.request(SUPPORT_PATTERNS.GET_SUPPORT_TICKETS, {
      page,
      limit,
    });
  }

  async updateSupportTicket(id: string, status: string) {
    return await this.request(SUPPORT_PATTERNS.UPDATE_SUPPORT_TICKET, {
      id,
      status,
    });
  }

  // === FINANCE ===

  async getTransactions(page = 1, limit = 20) {
    return await this.request(PAYMENT_PATTERNS.GET_ADMIN_TRANSACTIONS, {
      page,
      limit,
    });
  }

  async getProviderEarnings(page = 1, limit = 20) {
    return await this.request(PAYMENT_PATTERNS.GET_ADMIN_EARNINGS, {
      page,
      limit,
    });
  }

  async getPayouts(page = 1, limit = 20) {
    return await this.request(PAYMENT_PATTERNS.GET_ADMIN_PAYOUTS, {
      page,
      limit,
    });
  }

  async updatePayout(id: string, status: string) {
    console.log('[admin-service service] forwarding payout update', { id, status });
    const response = await this.request(PAYMENT_PATTERNS.UPDATE_ADMIN_PAYOUT, {
      id,
      status,
    });
    console.log('[admin-service service] payment-service payout response', response);
    return response;
  }

  async getRefunds(page = 1, limit = 20) {
    return await this.request(PAYMENT_PATTERNS.GET_ADMIN_REFUNDS, {
      page,
      limit,
    });
  }

  async markRefund(id: string, status?: string, rejectReason?: string) {
    return await this.request(PAYMENT_PATTERNS.MARK_ADMIN_REFUND, {
      id,
      status,
      reject_reason: rejectReason,
    });
  }

  async getFailedPayments(page = 1, limit = 20) {
    return await this.request(PAYMENT_PATTERNS.GET_ADMIN_FAILED_PAYMENTS, {
      page,
      limit,
    });
  }

  // === MARKETPLACE ===

  async getCategories(page = 1, limit = 100) {
    return await this.request(CATALOG_PATTERNS.GET_ADMIN_CATEGORIES, {
      page,
      limit,
    });
  }

  async createCategory(body: any) {
    return await this.request(CATALOG_PATTERNS.CREATE_ADMIN_CATEGORY, body);
  }

  async updateCategory(id: string, body: any) {
    return await this.request(CATALOG_PATTERNS.UPDATE_ADMIN_CATEGORY, {
      id,
      body,
    });
  }

  async deleteCategory(id: string) {
    return await this.request(CATALOG_PATTERNS.DELETE_ADMIN_CATEGORY, { id });
  }

  async getAllServicesAdmin(page = 1, limit = 20) {
    return await this.request(CATALOG_PATTERNS.GET_ADMIN_SERVICES, {
      page,
      limit,
    });
  }

  async createService(body: any) {
    return await this.request(CATALOG_PATTERNS.CREATE_ADMIN_SERVICE, body);
  }

  async updateService(id: string, body: any) {
    return await this.request(CATALOG_PATTERNS.UPDATE_ADMIN_SERVICE, {
      id,
      body,
    });
  }

  async deleteService(id: string) {
    return await this.request(CATALOG_PATTERNS.DELETE_ADMIN_SERVICE, { id });
  }

  async getServiceAreas() {
    return await this.request(CATALOG_PATTERNS.GET_ADMIN_SERVICE_AREAS, {});
  }

  async createServiceArea(body: any) {
    return await this.request(CATALOG_PATTERNS.CREATE_ADMIN_SERVICE_AREA, body);
  }

  async updateServiceArea(id: string, body: any) {
    return await this.request(CATALOG_PATTERNS.UPDATE_ADMIN_SERVICE_AREA, {
      id,
      body,
    });
  }

  async deleteServiceArea(id: string) {
    return await this.request(CATALOG_PATTERNS.DELETE_ADMIN_SERVICE_AREA, {
      id,
    });
  }

  async sendBroadcast(body: {
    user_ids?: string[];
    role?: string;
    title: string;
    message: string;
    type?: string;
  }) {
    return await this.request(SUPPORT_PATTERNS.SEND_BROADCAST, body);
  }

  // === COMMISSION ===

  async getCommission() {
    return await this.request(PAYMENT_PATTERNS.GET_COMMISSION, {});
  }

  async updateCommission(body: any) {
    return await this.request(PAYMENT_PATTERNS.UPDATE_COMMISSION, body);
  }

  // === REPORTS ===

  async getRevenueReport(from?: string, to?: string) {
    return await this.request(PAYMENT_PATTERNS.GET_REVENUE_REPORT, {
      from,
      to,
    });
  }

  async getBookingAnalytics(from?: string, to?: string) {
    return await this.request(BOOKING_PATTERNS.GET_ANALYTICS, {
      from,
      to,
    });
  }

  async getUserReport(from?: string, to?: string) {
    return await this.request(AUTH_PATTERNS.GET_USER_REPORT, { from, to });
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
    return await this.request(PAYMENT_PATTERNS.GET_FINANCIAL_REPORT, {
      from,
      to,
    });
  }

  async getPerformanceReport(from?: string, to?: string) {
    return await this.request(PROVIDER_PATTERNS.GET_PERFORMANCE_REPORT, {
      from,
      to,
    });
  }

  async getComplianceReport(from?: string, to?: string) {
    const [supportReport, providerReport] = await Promise.all([
      this.request<any>(SUPPORT_PATTERNS.GET_COMPLIANCE_REPORT, { from, to }),
      this.request<any>(PROVIDER_PATTERNS.GET_COMPLIANCE_REPORT, { from, to }),
    ]);

    const disputes = Array.isArray(supportReport?.disputes)
      ? supportReport.disputes
      : [];
    const providerReports = Array.isArray(providerReport?.provider_reports)
      ? providerReport.provider_reports
      : [];
    return { disputes, provider_reports: providerReports };
  }

  // === PLATFORM SETTINGS ===

  private readonly SETTINGS_SCHEMA = 'notification_and_support';

  private defaultNotificationSettings() {
    return {
      emailNotifications: true,
      smsNotifications: true,
      pushNotifications: true,
      bookingConfirmations: true,
      paymentAlerts: true,
      disputeAlerts: true,
      providerApprovalAlerts: true,
      systemAlerts: true,
      marketingEmails: false,
    };
  }

  private defaultSecuritySettings() {
    return {
      twoFactorRequired: false,
      sessionTimeoutMinutes: 60,
      maxLoginAttempts: 5,
      ipWhitelistEnabled: false,
      ipWhitelist: [],
      passwordExpiryDays: 90,
      auditLogsEnabled: true,
    };
  }

  private isTableMissingError(error: any): boolean {
    const code = String(error?.code ?? '').toUpperCase();
    const msg = String(error?.message ?? '').toLowerCase();
    return (
      code === '42P01' ||
      code === 'PGRST106' ||
      code === 'PGRST200' ||
      msg.includes('schema cache') ||
      msg.includes('could not find the table') ||
      (msg.includes('relation') && msg.includes('does not exist'))
    );
  }

  /** Remove Kafka transport fields that should never be persisted */
  private stripKafkaMeta(obj: Record<string, any>): Record<string, any> {
    const { __meta, source, correlationId, pattern, ...clean } = obj;
    return clean;
  }

  async getNotificationSettings() {
    const schemas = ['notification_and_support', 'identity_and_user', 'identity_svc'] as const;
    for (const schema of schemas) {
      const { data, error } = await this.supabase
        .schema(schema as any)
        .from('platform_config')
        .select('value')
        .eq('key', 'notification_settings')
        .maybeSingle();
      if (!error) {
        const val = data?.value ?? this.defaultNotificationSettings();
        return this.stripKafkaMeta(val);
      }
      if (!this.isTableMissingError(error)) break;
    }
    return this.defaultNotificationSettings();
  }

  async updateNotificationSettings(updates: Record<string, any>) {
    const current = await this.getNotificationSettings();
    const cleanMerged = this.stripKafkaMeta({ ...current, ...updates });
    
    const schemas = ['notification_and_support', 'identity_and_user', 'identity_svc'] as const;
    for (const schema of schemas) {
      const { error: upsertError } = await this.supabase
        .schema(schema as any)
        .from('platform_config')
        .upsert(
          { key: 'notification_settings', value: cleanMerged },
          { onConflict: 'key' },
        );
      if (!upsertError) return { ok: true, settings: cleanMerged };
      if (!this.isTableMissingError(upsertError)) throw new Error(upsertError.message);
    }
    // Table doesn't exist yet — return merged optimistically so UI doesn't break
    return { ok: true, settings: cleanMerged, note: 'platform_config table not yet created' };
  }

  async getSecuritySettings() {
    const schemas = ['notification_and_support', 'identity_and_user', 'identity_svc'] as const;
    for (const schema of schemas) {
      const { data, error } = await this.supabase
        .schema(schema as any)
        .from('platform_config')
        .select('value')
        .eq('key', 'security_settings')
        .maybeSingle();
      if (!error) {
        const val = data?.value ?? this.defaultSecuritySettings();
        return this.stripKafkaMeta(val);
      }
      if (!this.isTableMissingError(error)) break;
    }
    return this.defaultSecuritySettings();
  }

  async updateSecuritySettings(updates: Record<string, any>) {
    const current = await this.getSecuritySettings();
    const cleanMerged = this.stripKafkaMeta({ ...current, ...updates });

    const schemas = ['notification_and_support', 'identity_and_user', 'identity_svc'] as const;
    for (const schema of schemas) {
      const { error: upsertError } = await this.supabase
        .schema(schema as any)
        .from('platform_config')
        .upsert(
          { key: 'security_settings', value: cleanMerged },
          { onConflict: 'key' },
        );
      if (!upsertError) return { ok: true, settings: cleanMerged };
      if (!this.isTableMissingError(upsertError)) throw new Error(upsertError.message);
    }
    return { ok: true, settings: cleanMerged, note: 'platform_config table not yet created' };
  }

  // === INTEGRATIONS ===

  private defaultIntegrations() {
    return {
      gcash: { enabled: true, connected: true },
      paymaya: { enabled: true, connected: true },
      stripe: { enabled: false, connected: false },
      twilio: { enabled: true, connected: true },
      sendgrid: { enabled: true, connected: true },
      googleMaps: { enabled: true, connected: true },
      mixpanel: { enabled: false, connected: false },
      firebase: { enabled: true, connected: true },
    };
  }

  async getIntegrations() {
    const schemas = ['notification_and_support', 'identity_and_user', 'identity_svc'] as const;
    for (const schema of schemas) {
      const { data, error } = await this.supabase
        .schema(schema as any)
        .from('platform_config')
        .select('value')
        .eq('key', 'integrations_config')
        .maybeSingle();
      if (!error) {
        return data?.value ?? this.defaultIntegrations();
      }
      if (!this.isTableMissingError(error)) break;
    }
    return this.defaultIntegrations();
  }

  async toggleIntegration(service: string, enabled: boolean) {
    const current = await this.getIntegrations();
    const merged = {
      ...current,
      [service]: { ...(current[service] || {}), enabled },
    };
    const schemas = ['notification_and_support', 'identity_and_user', 'identity_svc'] as const;
    for (const schema of schemas) {
      const { error: upsertError } = await this.supabase
        .schema(schema as any)
        .from('platform_config')
        .upsert(
          { key: 'integrations_config', value: merged },
          { onConflict: 'key' },
        );
      if (!upsertError) return { ok: true, integrations: merged };
      if (!this.isTableMissingError(upsertError)) throw new Error(upsertError.message);
    }
    return { ok: true, integrations: merged, note: 'platform_config table not yet created' };
  }

  async testIntegration(service: string) {
    // Ping test — just acknowledge for now; extend per-service as needed
    return { ok: true, service, status: 'reachable' };
  }

  // === COMMISSION RULES ===

  private defaultCommissionRules() {
    const rules = [
      { id: 'CR-001', category: 'Home Maintenance & Repair', currentRate: 12, previousRate: 10, status: 'active', lastUpdated: new Date().toISOString().split('T')[0], monthlyRevenue: 0, monthlyCommission: 0 },
      { id: 'CR-002', category: 'Beauty Wellness & Personal Care', currentRate: 15, previousRate: 15, status: 'active', lastUpdated: new Date().toISOString().split('T')[0], monthlyRevenue: 0, monthlyCommission: 0 },
      { id: 'CR-003', category: 'Domestic & Cleaning Services', currentRate: 10, previousRate: 8, status: 'active', lastUpdated: new Date().toISOString().split('T')[0], monthlyRevenue: 0, monthlyCommission: 0 },
      { id: 'CR-004', category: 'Pet Services', currentRate: 18, previousRate: 18, status: 'active', lastUpdated: new Date().toISOString().split('T')[0], monthlyRevenue: 0, monthlyCommission: 0 },
      { id: 'CR-005', category: 'Events & Entertainment', currentRate: 20, previousRate: 18, status: 'active', lastUpdated: new Date().toISOString().split('T')[0], monthlyRevenue: 0, monthlyCommission: 0 },
      { id: 'CR-006', category: 'Automotive & Tech Support', currentRate: 14, previousRate: 14, status: 'active', lastUpdated: new Date().toISOString().split('T')[0], monthlyRevenue: 0, monthlyCommission: 0 },
      { id: 'CR-007', category: 'Education & Professional Services', currentRate: 16, previousRate: 15, status: 'active', lastUpdated: new Date().toISOString().split('T')[0], monthlyRevenue: 0, monthlyCommission: 0 },
      { id: 'CR-008', category: 'Health & Fitness', currentRate: 13, previousRate: 12, status: 'active', lastUpdated: new Date().toISOString().split('T')[0], monthlyRevenue: 0, monthlyCommission: 0 },
    ];
    const totalCommission = rules.reduce((sum, r) => sum + r.monthlyCommission, 0);
    const averageRate = Math.round(rules.reduce((sum, r) => sum + r.currentRate, 0) / rules.length * 100) / 100;
    return {
      rules,
      stats: { averageRate, totalCommission, activeCategories: rules.filter(r => r.status === 'active').length, pendingChanges: 0 },
    };
  }

  async getCommissionRules() {
    const schemas = ['notification_and_support', 'identity_and_user', 'identity_svc'] as const;
    for (const schema of schemas) {
      const { data, error } = await this.supabase
        .schema(schema as any)
        .from('platform_config')
        .select('value')
        .eq('key', 'commission_rules')
        .maybeSingle();
      if (!error) {
        return data?.value ?? this.defaultCommissionRules();
      }
      if (!this.isTableMissingError(error)) break;
    }
    return this.defaultCommissionRules();
  }

  async updateCommissionRule(ruleId: string, currentRate: number) {
    const current = await this.getCommissionRules();
    const rules = (current.rules || []).map((r: any) =>
      r.id === ruleId
        ? { ...r, previousRate: r.currentRate, currentRate, lastUpdated: new Date().toISOString().split('T')[0] }
        : r,
    );
    const totalCommission = rules.reduce((sum: number, r: any) => sum + r.monthlyCommission, 0);
    const averageRate = Math.round(rules.reduce((sum: number, r: any) => sum + r.currentRate, 0) / rules.length * 100) / 100;
    const merged = {
      rules,
      stats: { averageRate, totalCommission, activeCategories: rules.filter((r: any) => r.status === 'active').length, pendingChanges: 0 },
    };
    const schemas = ['notification_and_support', 'identity_and_user', 'identity_svc'] as const;
    for (const schema of schemas) {
      const { error: upsertError } = await this.supabase
        .schema(schema as any)
        .from('platform_config')
        .upsert(
          { key: 'commission_rules', value: merged },
          { onConflict: 'key' },
        );
      if (!upsertError) return { ok: true, ...merged };
      if (!this.isTableMissingError(upsertError)) throw new Error(upsertError.message);
    }
    return { ok: true, ...merged, note: 'platform_config table not yet created' };
  }
}
