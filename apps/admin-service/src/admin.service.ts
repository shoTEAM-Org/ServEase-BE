import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
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
}
