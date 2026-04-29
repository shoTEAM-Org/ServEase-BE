import {
  Inject,
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ClientKafka } from '@nestjs/microservices';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AUTH_PATTERNS,
  BOOKING_PATTERNS,
  PricingEngine,
  PROVIDER_PATTERNS,
  sendKafkaRpcRequest,
} from '@app/common';

@Injectable()
export class PaymentService implements OnModuleInit {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly supabase: SupabaseClient,
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
  ) {}

  async onModuleInit() {
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_BY_ID);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_USERS_BY_IDS);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS);
    await this.kafka.connect();
  }

  private toTrimmedString(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  private async request<T = any>(pattern: string, payload: unknown): Promise<T> {
    return await sendKafkaRpcRequest(
      () => this.kafka.send<T, unknown>(pattern, payload),
      { context: pattern },
    );
  }

  private buildDateFilter(query: any, from?: string, to?: string, column = 'created_at') {
    if (from) query = query.gte(column, from);
    if (to) query = query.lte(column, to);
    return query;
  }

  private toPositiveAmount(value: unknown) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return amount;
  }

  private normalizePaymentMethod(value: unknown): string | null {
    const method = this.toTrimmedString(value).toLowerCase();
    if (!method) return null;

    if (method === 'cash') return 'cash_on_service';

    const supported = new Set([
      'cash_on_service',
      'card',
      'gcash',
      'paymaya',
      'wallet',
    ]);
    return supported.has(method) ? method : null;
  }

  private async getLatestPaymentByBookingId(bookingId: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return null;

    const { data, error } = await this.supabase
      .schema('payment')
      .from('payments')
      .select('*')
      .eq('booking_id', normalizedBookingId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    const rows = Array.isArray(data) ? data : [];
    if (rows.length > 1) {
      this.logger.warn(
        `Multiple payment rows found for booking ${normalizedBookingId}; using latest row ${rows[0]?.id || 'unknown'}.`,
      );
    }
    return rows[0] || null;
  }

  private normalizeEnsurePaymentInput(body: any, booking?: any) {
    const bookingId = this.toTrimmedString(body?.bookingId);
    const customerId = this.toTrimmedString(
      body?.customerId || booking?.customer_id,
    );
    const providerId = this.toTrimmedString(
      body?.provider_id || booking?.provider_id,
    );
    const quote = PricingEngine.quote({
      ...(booking || {}),
      amount: body?.amount ?? booking?.total_amount,
    });
    const amount = this.toPositiveAmount(quote.total_amount);
    const method = this.normalizePaymentMethod(body?.method) || 'cash_on_service';

    if (!bookingId) throw new BadRequestException('bookingId is required');
    if (!customerId) throw new BadRequestException('customerId is required');
    if (!providerId) throw new BadRequestException('provider_id is required');
    if (amount === null) {
      throw new BadRequestException('amount must be a number greater than 0');
    }

    return {
      bookingId,
      customerId,
      providerId,
      amount,
      method,
      quote,
    };
  }

  private async getBookingForPricing(bookingId: string) {
    try {
      const response = await this.request<any>(BOOKING_PATTERNS.GET_BY_ID, {
        id: bookingId,
      });
      return response?.booking || null;
    } catch {
      return null;
    }
  }

  private buildPaymentReference() {
    return `PAY-${randomUUID().slice(0, 12).toUpperCase()}`;
  }

  private async getUsersByIds(userIds: string[]) {
    if (!userIds.length) return [] as any[];
    try {
      const response = await this.request<any>(AUTH_PATTERNS.GET_USERS_BY_IDS, {
        userIds,
      });
      return Array.isArray(response?.users) ? response.users : [];
    } catch {
      return [];
    }
  }

  private async getProviderProfilesByIds(userIds: string[]) {
    if (!userIds.length) return [] as any[];
    try {
      const response = await this.request<any>(
        PROVIDER_PATTERNS.GET_PROFILES_BY_IDS,
        { userIds },
      );
      return Array.isArray(response?.profiles) ? response.profiles : [];
    } catch {
      return [];
    }
  }

  private async getBookingPublicIds(bookingIds: string[]) {
    const entries = await Promise.all(
      bookingIds.map(async (bookingId) => {
        try {
          const response = await this.request<any>(BOOKING_PATTERNS.GET_BY_ID, {
            id: bookingId,
          });
          const booking = response?.booking;
          const publicId =
            this.toTrimmedString(booking?.booking_reference) ||
            this.toTrimmedString(booking?.id) ||
            bookingId;
          return [bookingId, publicId] as const;
        } catch {
          return [bookingId, bookingId] as const;
        }
      }),
    );
    return new Map(entries);
  }

  async createPayment(dto: any) {
    const normalizedMethod = this.normalizePaymentMethod(dto?.method) || 'cash_on_service';
    const bookingId = this.toTrimmedString(dto?.booking_id || dto?.bookingId);
    const booking = bookingId ? await this.getBookingForPricing(bookingId) : null;
    const quote = PricingEngine.quote({
      ...(booking || {}),
      amount: dto?.amount ?? booking?.total_amount,
    });
    const amount = this.toPositiveAmount(quote.total_amount);
    if (amount === null) {
      throw new BadRequestException('amount must be a number greater than 0');
    }
    const payload = {
      id: randomUUID(),
      booking_id: bookingId,
      customer_id: dto.customer_id || booking?.customer_id,
      provider_id: dto.provider_id || booking?.provider_id,
      amount,
      method: normalizedMethod,
      status: dto.status || 'pending',
      paid_at: dto.status === 'completed' ? new Date().toISOString() : null,
      transaction_reference: dto.transaction_reference || this.buildPaymentReference(),
    };
    const { data, error } = await this.supabase.schema('payment').from('payments').insert([payload]).select().single();
    if (error) throw new InternalServerErrorException(`Failed to process payment: ${error.message}`);
    return { status: 'success', message: 'Payment processed successfully', data, pricing: quote };
  }

  async getEarnings(providerId: string) {
    if (!providerId) throw new BadRequestException('Provider ID is required');
    const { data, error } = await this.supabase.schema('payment').from('payments').select('amount').eq('provider_id', providerId).eq('status', 'completed');
    if (error) throw new InternalServerErrorException(error.message);
    const total = data?.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0) || 0;
    return { status: 'success', data: { provider_id: providerId, total_earnings: total } };
  }

  async getPaymentByBookingId(bookingId: string) {
    const payment = await this.getLatestPaymentByBookingId(bookingId);
    return { payment };
  }

  async getProviderPaymentHistory(providerId: string) {
    const { data, error } = await this.supabase.schema('payment').from('payments')
      .select('*')
      .eq('provider_id', providerId).order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    const payments = await Promise.all((data || []).map(async (p: any) => {
      let booking: any = null;
      try {
        const bookingResponse = await this.request<any>(BOOKING_PATTERNS.GET_BY_ID, {
          id: p.booking_id,
        });
        booking = bookingResponse?.booking || null;
      } catch {
        booking = null;
      }

      const platformFee = Number(p.amount) * 0.1;
      return {
        ...p,
        booking_reference: booking?.booking_reference || '',
        customer_name: this.toTrimmedString(booking?.customer?.full_name) || '',
        service_title: this.toTrimmedString(booking?.service_title) || '',
        scheduled_at: booking?.scheduled_at,
        platform_fee: platformFee,
        net_earnings: Number(p.amount) - platformFee,
      };
    }));

    return { payments };
  }

  async getProviderEarningsSummary(providerId: string) {
    const { data, error } = await this.supabase.schema('payment').from('payments').select('amount, status, created_at').eq('provider_id', providerId);
    if (error) throw new InternalServerErrorException(error.message);

    const completed = (data || []).filter((p: any) => p.status === 'completed');
    const total = completed.reduce((acc: number, p: any) => acc + Number(p.amount), 0);
    const platformFees = total * 0.1;

    const now = new Date();
    const thisMonth = completed.filter((p: any) => { const d = new Date(p.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const monthlyTotal = thisMonth.reduce((acc: number, p: any) => acc + Number(p.amount), 0);

    return { total_earnings: total, net_earnings: total - platformFees, platform_fees: platformFees, monthly_earnings: monthlyTotal, completed_payments: completed.length };
  }

  async ensureBookingPayment(body: any) {
    const bookingIdCandidate = this.toTrimmedString(body?.bookingId);
    const booking = body?.skipBookingLookup
      ? null
      : await this.getBookingForPricing(bookingIdCandidate);
    const { bookingId, customerId, providerId, amount, method, quote } =
      this.normalizeEnsurePaymentInput(body, booking);

    const existing = await this.getLatestPaymentByBookingId(bookingId);
    if (existing) {
      if (Number(existing.amount) !== amount) {
        const { data, error } = await this.supabase
          .schema('payment')
          .from('payments')
          .update({ amount })
          .eq('id', existing.id)
          .select();
        if (error) throw new InternalServerErrorException(error.message);

        const updatedRows = Array.isArray(data) ? data : [];
        return { payment: updatedRows[0] || { ...existing, amount }, pricing: quote };
      }
      return { payment: existing, pricing: quote };
    }

    const { data, error } = await this.supabase
      .schema('payment')
      .from('payments')
      .insert([
        {
          id: randomUUID(),
          booking_id: bookingId,
          customer_id: customerId,
          provider_id: providerId,
          amount,
          method,
          status: 'pending',
          transaction_reference: this.buildPaymentReference(),
        },
      ])
      .select();
    if (error) throw new InternalServerErrorException(error.message);

    const insertedRows = Array.isArray(data) ? data : [];
    if (!insertedRows.length) {
      throw new InternalServerErrorException('Failed to ensure booking payment');
    }
    return { payment: insertedRows[0], pricing: quote };
  }

  async markBookingPaymentPaid(body: any) {
    const bookingId = this.toTrimmedString(body?.bookingId);
    if (!bookingId) throw new BadRequestException('bookingId is required');

    const existing = await this.getLatestPaymentByBookingId(bookingId);
    if (!existing) return { payment: null };

    const updates: any = { status: 'completed', paid_at: new Date().toISOString() };
    const booking = await this.getBookingForPricing(bookingId);
    const quote = PricingEngine.quote({
      ...(booking || {}),
      amount: body?.amount ?? existing.amount,
    });
    const amount = this.toPositiveAmount(quote.total_amount);
    if (amount !== null) updates.amount = amount;

    const method = this.normalizePaymentMethod(body?.method);
    if (method) updates.method = method;

    const { data, error } = await this.supabase
      .schema('payment')
      .from('payments')
      .update(updates)
      .eq('id', existing.id)
      .select();
    if (error) throw new InternalServerErrorException(error.message);

    const updatedRows = Array.isArray(data) ? data : [];
    return { payment: updatedRows[0] || { ...existing, ...updates }, pricing: quote };
  }

  async cancelBookingPayment(bookingId: string) {
    const existing = await this.getLatestPaymentByBookingId(bookingId);
    if (!existing) return { payment: null };

    const { data, error } = await this.supabase
      .schema('payment')
      .from('payments')
      .update({ status: 'cancelled' })
      .eq('id', existing.id)
      .select();
    if (error) throw new InternalServerErrorException(error.message);

    const updatedRows = Array.isArray(data) ? data : [];
    return { payment: updatedRows[0] || { ...existing, status: 'cancelled' } };
  }

  async updateBookingPaymentAmount(bookingId: string, amount: number) {
    const existing = await this.getLatestPaymentByBookingId(bookingId);
    if (!existing) return { payment: null };

    const booking = await this.getBookingForPricing(bookingId);
    const quote = PricingEngine.quote({
      ...(booking || {}),
      amount: amount ?? existing.amount,
    });
    const normalizedAmount = this.toPositiveAmount(quote.total_amount);
    if (normalizedAmount === null) {
      throw new BadRequestException('amount must be a number greater than 0');
    }

    const { data, error } = await this.supabase
      .schema('payment')
      .from('payments')
      .update({ amount: normalizedAmount })
      .eq('id', existing.id)
      .select();
    if (error) throw new InternalServerErrorException(error.message);

    const updatedRows = Array.isArray(data) ? data : [];
    return {
      payment: updatedRows[0] || { ...existing, amount: normalizedAmount },
      pricing: quote,
    };
  }

  async getAdminTransactions(page = 1, limit = 20) {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const { data, error, count } = await this.supabase
      .schema('payment')
      .from('payments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    const payments = data || [];
    if (!payments.length) {
      return {
        transactions: [],
        total: count || 0,
        page: normalizedPage,
        limit: normalizedLimit,
      };
    }

    const providerIds = Array.from(
      new Set(
        payments
          .map((payment: any) => this.toTrimmedString(payment.provider_id))
          .filter(Boolean),
      ),
    );
    const customerIds = Array.from(
      new Set(
        payments
          .map((payment: any) => this.toTrimmedString(payment.customer_id))
          .filter(Boolean),
      ),
    );
    const bookingIds = Array.from(
      new Set(
        payments
          .map((payment: any) => this.toTrimmedString(payment.booking_id))
          .filter(Boolean),
      ),
    );

    const users = await this.getUsersByIds([...providerIds, ...customerIds]);
    const userById = new Map(
      users.map((user: any) => [this.toTrimmedString(user?.id), user]),
    );
    const bookingPublicIds = await this.getBookingPublicIds(bookingIds);

    const transactions = payments.map((payment: any) => {
      const amount = Number(payment.amount || 0);
      const commissionAmount = Math.round(amount * 0.1);
      const providerEarnings = Math.max(0, amount - commissionAmount);
      const paymentStatus = this.toTrimmedString(payment.status).toLowerCase();
      let normalizedPaymentStatus = 'Pending';
      if (paymentStatus === 'completed') normalizedPaymentStatus = 'Paid';
      else if (paymentStatus === 'failed') normalizedPaymentStatus = 'Failed';
      else if (paymentStatus === 'refunded') {
        normalizedPaymentStatus = 'Refunded';
      }

      const method = this.toTrimmedString(payment.method).toLowerCase();
      let normalizedMethod = 'Credit Card';
      if (method === 'debit_card') normalizedMethod = 'Debit Card';

      const customer = userById.get(this.toTrimmedString(payment.customer_id)) as any;
      const provider = userById.get(this.toTrimmedString(payment.provider_id)) as any;
      const bookingId = this.toTrimmedString(payment.booking_id);

      return {
        id: payment.id,
        transaction_id: payment.transaction_reference || payment.id,
        booking_id: bookingPublicIds.get(bookingId) || bookingId || null,
        customer_id: payment.customer_id || null,
        provider_id: payment.provider_id || null,
        customer_name: this.toTrimmedString(customer?.full_name),
        customer_email: this.toTrimmedString(customer?.email),
        provider_name: this.toTrimmedString(provider?.full_name),
        provider_email: this.toTrimmedString(provider?.email),
        amount,
        commission_amount: commissionAmount,
        provider_earnings: providerEarnings,
        payment_method: normalizedMethod,
        payment_status: normalizedPaymentStatus,
        created_at: payment.created_at || null,
      };
    });

    return {
      transactions,
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async getAdminProviderEarnings(page = 1, limit = 20) {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const { data, error, count } = await this.supabase
      .schema('payment')
      .from('payments')
      .select('*', { count: 'exact' })
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    const payments = data || [];
    if (!payments.length) {
      return {
        payments: [],
        total: count || 0,
        page: normalizedPage,
        limit: normalizedLimit,
      };
    }

    const providerIds = Array.from(
      new Set(
        payments
          .map((payment: any) => this.toTrimmedString(payment.provider_id))
          .filter(Boolean),
      ),
    );
    const providers = await this.getUsersByIds(providerIds);
    const providerById = new Map<string, any>(
      providers.map((provider: any) => [this.toTrimmedString(provider?.id), provider]),
    );

    const enriched = payments.map((payment: any) => {
      const amount = Number(payment.amount || 0);
      const commissionAmount = Math.round(amount * 0.1);
      return {
        ...payment,
        provider_name: this.toTrimmedString(
          providerById.get(this.toTrimmedString(payment.provider_id))?.full_name,
        ),
        provider_email: this.toTrimmedString(
          providerById.get(this.toTrimmedString(payment.provider_id))?.email,
        ),
        provider_earnings: amount - commissionAmount,
        commission_amount: commissionAmount,
      };
    });

    return {
      payments: enriched,
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async getAdminPayouts(page = 1, limit = 20) {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const { data, error, count } = await this.supabase
      .schema('payment')
      .from('provider_payouts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    const payouts = data || [];
    if (!payouts.length) {
      return {
        payouts: [],
        total: count || 0,
        page: normalizedPage,
        limit: normalizedLimit,
      };
    }

    const providerRefs = Array.from(
      new Set(
        payouts
          .flatMap((payout: any) => [
            payout.provider_id,
            payout.provider_user_id,
            payout.user_id,
          ])
          .map((id: unknown) => this.toTrimmedString(id))
          .filter(Boolean),
      ),
    );

    const [providers, profiles] = await Promise.all([
      this.getUsersByIds(providerRefs),
      this.getProviderProfilesByIds(providerRefs),
    ]);
    const providersById = new Map(
      providers.map((provider: any) => [
        this.toTrimmedString(provider?.id),
        provider,
      ]),
    );
    const businessNameByUserId = new Map(
      profiles.map((profile: any) => [
        this.toTrimmedString(profile?.user_id),
        this.toTrimmedString(profile?.business_name),
      ]),
    );

    const enriched = payouts.map((payout: any) => {
      const providerRef =
        this.toTrimmedString(payout.provider_id) ||
        this.toTrimmedString(payout.provider_user_id) ||
        this.toTrimmedString(payout.user_id);
      const user = providersById.get(providerRef) as any;
      const businessName = businessNameByUserId.get(providerRef) || '';
      return {
        ...payout,
        amount: Number(payout.amount || 0),
        provider_name:
          businessName ||
          this.toTrimmedString(user?.full_name) ||
          this.toTrimmedString(payout.provider_name) ||
          this.toTrimmedString(payout.business_name),
        provider_email:
          this.toTrimmedString(user?.email) ||
          this.toTrimmedString(payout.provider_email),
        requested_date: payout.requested_date || payout.created_at || null,
        processed_date: payout.processed_date || payout.updated_at || null,
      };
    });

    return {
      payouts: enriched,
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async updateAdminPayout(id: string, status: string) {
    const normalizedId = this.toTrimmedString(id);
    const normalizedStatus = this.toTrimmedString(status);
    if (!normalizedId) throw new BadRequestException('id is required');
    if (!normalizedStatus) throw new BadRequestException('status is required');

    const { data, error } = await this.supabase
      .schema('payment')
      .from('provider_payouts')
      .update({ status: normalizedStatus })
      .eq('id', normalizedId)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException(`Payout ${normalizedId} not found`);
    }
    return { ok: true };
  }

  async getAdminRefunds(page = 1, limit = 20) {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const { data, error, count } = await this.supabase
      .schema('payment')
      .from('payments')
      .select('*', { count: 'exact' })
      .in('status', ['pending', 'refunded', 'cancelled'])
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    const payments = data || [];
    if (!payments.length) {
      return {
        payments: [],
        total: count || 0,
        page: normalizedPage,
        limit: normalizedLimit,
      };
    }

    const customerIds = Array.from(
      new Set(
        payments
          .map((payment: any) => this.toTrimmedString(payment.customer_id))
          .filter(Boolean),
      ),
    );
    const bookingIds = Array.from(
      new Set(
        payments
          .map((payment: any) => this.toTrimmedString(payment.booking_id))
          .filter(Boolean),
      ),
    );

    const [customers, bookingPublicIds] = await Promise.all([
      this.getUsersByIds(customerIds),
      this.getBookingPublicIds(bookingIds),
    ]);
    const customerById = new Map(
      customers.map((customer: any) => [
        this.toTrimmedString(customer?.id),
        customer,
      ]),
    );

    const enriched = payments.map((payment: any) => {
      const customer = customerById.get(
        this.toTrimmedString(payment.customer_id),
      ) as any;
      const bookingId = this.toTrimmedString(payment.booking_id);
      const status = this.toTrimmedString(payment.status).toLowerCase();
      let refundStatus = 'Pending';
      if (status === 'refunded') refundStatus = 'Processed';
      else if (status === 'cancelled') refundStatus = 'Approved';

      return {
        ...payment,
        refund_id: payment.id,
        booking_public_id: bookingPublicIds.get(bookingId) || bookingId || null,
        customer_name: this.toTrimmedString(customer?.full_name),
        customer_email: this.toTrimmedString(customer?.email),
        amount: Number(payment.amount || 0),
        reason: this.toTrimmedString(payment.refund_reason) || 'Refund requested',
        refund_status: refundStatus,
        requested_date: payment.created_at || null,
      };
    });

    return {
      payments: enriched,
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async markAdminRefund(id: string) {
    const normalizedId = this.toTrimmedString(id);
    if (!normalizedId) throw new BadRequestException('id is required');

    const { data, error } = await this.supabase
      .schema('payment')
      .from('payments')
      .update({ status: 'refunded' })
      .eq('id', normalizedId)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException(`Payment ${normalizedId} not found`);
    }
    return { ok: true };
  }

  async getAdminFailedPayments(page = 1, limit = 20) {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const { data, error, count } = await this.supabase
      .schema('payment')
      .from('payments')
      .select('*', { count: 'exact' })
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);
    if (error) throw new InternalServerErrorException(error.message);
    return {
      payments: data || [],
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async getRevenueReport(from?: string, to?: string) {
    let query = this.supabase
      .schema('payment')
      .from('payments')
      .select('amount, status, created_at, provider_id');
    query = this.buildDateFilter(query, from, to);
    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);

    const completed = (data || []).filter(
      (payment: any) => this.toTrimmedString(payment?.status) === 'completed',
    );
    const total = completed.reduce(
      (sum: number, payment: any) => sum + Number(payment.amount || 0),
      0,
    );
    const platformFees = total * 0.1;
    return {
      total_revenue: total,
      platform_fees: platformFees,
      net_to_providers: total - platformFees,
      transaction_count: completed.length,
    };
  }

  async getFinancialReport(from?: string, to?: string) {
    let paymentsQuery = this.supabase.schema('payment').from('payments').select('*');
    let payoutsQuery = this.supabase
      .schema('payment')
      .from('provider_payouts')
      .select('*');
    paymentsQuery = this.buildDateFilter(paymentsQuery, from, to);
    payoutsQuery = this.buildDateFilter(payoutsQuery, from, to);

    const [
      { data: payments, error: paymentsError },
      { data: payouts, error: payoutsError },
    ] = await Promise.all([paymentsQuery, payoutsQuery]);
    if (paymentsError) throw new InternalServerErrorException(paymentsError.message);
    if (payoutsError) throw new InternalServerErrorException(payoutsError.message);
    return { payments: payments || [], payouts: payouts || [] };
  }
}
