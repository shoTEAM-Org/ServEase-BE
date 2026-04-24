import {
  Inject,
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AUTH_PATTERNS,
  BOOKING_PATTERNS,
  NOTIFICATION_PATTERNS,
  sendKafkaRpcRequest,
} from '@app/common';

@Injectable()
export class SupportService implements OnModuleInit {
  constructor(
    private readonly supabase: SupabaseClient,
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
  ) {}

  async onModuleInit() {
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_USERS_BY_IDS);
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_USERS_BY_ROLE);
    this.kafka.subscribeToResponseOf(NOTIFICATION_PATTERNS.SEND_BROADCAST);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_BY_ID);
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

  private async getUsersByIds(userIds: unknown) {
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

  private async getBookingById(bookingId: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return null;
    try {
      const response = await this.request<any>(BOOKING_PATTERNS.GET_BY_ID, {
        id: normalizedBookingId,
      });
      return response?.booking || null;
    } catch {
      return null;
    }
  }

  private async emitNotifications(bookingId: string, type: string, metadata: any = {}) {
    try {
      const booking = await this.getBookingById(bookingId);
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
      // Silently fail, notifications are non-critical
    }
  }

  async createTicket(
    userId: string,
    body: { subject: string; message: string; category?: string; role?: string },
  ) {
    const normalizedUserId = this.toTrimmedString(userId);
    const subject = this.toTrimmedString(body?.subject);
    const message = this.toTrimmedString(body?.message);
    if (!normalizedUserId) throw new BadRequestException('userId is required');
    if (!subject) throw new BadRequestException('subject is required');
    if (!message) throw new BadRequestException('message is required');

    const { data, error } = await this.supabase
      .schema('notification_and_support')
      .from('support_tickets')
      .insert([
        {
          user_id: normalizedUserId,
          subject,
          message,
          status: 'open',
        },
      ])
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return { ticket: data };
  }

  async createDispute(bookingId: string, userId: string, reason: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    const normalizedUserId = this.toTrimmedString(userId);
    const normalizedReason = this.toTrimmedString(reason);
    if (!normalizedBookingId) throw new BadRequestException('bookingId is required');
    if (!normalizedUserId) throw new BadRequestException('userId is required');
    if (!normalizedReason) throw new BadRequestException('reason is required');

    const { data, error } = await this.supabase
      .schema('notification_and_support')
      .from('disputes')
      .insert([
        {
          booking_id: normalizedBookingId,
          customer_id: normalizedUserId,
          reason: normalizedReason,
          status: 'open',
        },
      ])
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    // Emit notification for dispute creation
    await this.emitNotifications(normalizedBookingId, NOTIFICATION_PATTERNS.DISPUTE_CREATED, {
      raisedBy: normalizedUserId,
      reason: normalizedReason,
    });

    return { dispute: data };
  }

  async getDisputes(page = 1, limit = 20, status?: string) {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    let query = this.supabase
      .schema('notification_and_support')
      .from('disputes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    const normalizedStatus = this.toTrimmedString(status).toLowerCase();
    if (normalizedStatus) {
      if (
        normalizedStatus === 'investigating' ||
        normalizedStatus === 'under review'
      ) {
        query = query.eq('status', 'under_review');
      } else {
        query = query.eq('status', normalizedStatus);
      }
    }

    const { data, error, count } = await query.range(
      offset,
      offset + normalizedLimit - 1,
    );
    if (error) throw new InternalServerErrorException(error.message);

    const rawDisputes = data || [];
    const bookingIds = Array.from(
      new Set(
        rawDisputes
          .map((dispute: any) => this.toTrimmedString(dispute?.booking_id))
          .filter(Boolean),
      ),
    );
    const bookingEntries = await Promise.all(
      bookingIds.map(async (bookingId) => [
        bookingId,
        await this.getBookingById(bookingId),
      ] as const),
    );
    const bookingsById = new Map(bookingEntries);

    const userIds = Array.from(
      new Set(
        rawDisputes
          .flatMap((dispute: any) => {
            const booking = bookingsById.get(
              this.toTrimmedString(dispute?.booking_id),
            );
            return [
              dispute?.raised_by,
              booking?.customer_id,
              booking?.provider_id,
            ];
          })
          .map((userId: unknown) => this.toTrimmedString(userId))
          .filter(Boolean),
      ),
    );
    const users = await this.getUsersByIds(userIds);
    const usersById = new Map(
      users.map((user: any) => [this.toTrimmedString(user?.id), user]),
    );

    const disputes = rawDisputes.map((dispute: any) => {
      const booking = bookingsById.get(
        this.toTrimmedString(dispute?.booking_id),
      );
      const customer = usersById.get(
        this.toTrimmedString(booking?.customer_id),
      );
      const provider = usersById.get(
        this.toTrimmedString(booking?.provider_id),
      );
      const raisedBy = usersById.get(
        this.toTrimmedString(dispute?.raised_by),
      );

      return {
        ...dispute,
        booking_public_id:
          this.toTrimmedString(booking?.booking_reference) ||
          this.toTrimmedString(dispute?.booking_id) ||
          null,
        customer_id: this.toTrimmedString(booking?.customer_id) || null,
        provider_id: this.toTrimmedString(booking?.provider_id) || null,
        customer_name:
          this.toTrimmedString(customer?.full_name) ||
          this.toTrimmedString(raisedBy?.full_name),
        customer_email:
          this.toTrimmedString(customer?.email) ||
          this.toTrimmedString(raisedBy?.email),
        provider_name: this.toTrimmedString(provider?.full_name),
        provider_email: this.toTrimmedString(provider?.email),
        amount: Number(dispute?.amount ?? booking?.total_amount ?? 0),
      };
    });

    return {
      disputes,
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async updateDisputeStatus(id: string, status: string) {
    const normalizedId = this.toTrimmedString(id);
    const normalizedStatus = this.toTrimmedString(status);
    if (!normalizedId) throw new BadRequestException('id is required');
    if (!normalizedStatus) throw new BadRequestException('status is required');

    const { data, error } = await this.supabase
      .schema('notification_and_support')
      .from('disputes')
      .update({ status: normalizedStatus })
      .eq('id', normalizedId)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException(`Dispute ${normalizedId} not found`);
    }
    return { ok: true };
  }

  async getSupportTickets(page = 1, limit = 20) {
    const normalizedPage = Number.isFinite(Number(page))
      ? Math.max(1, Number(page))
      : 1;
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Number(limit))
      : 20;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const { data, error, count } = await this.supabase
      .schema('notification_and_support')
      .from('support_tickets')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + normalizedLimit - 1);
    if (error) throw new InternalServerErrorException(error.message);

    return {
      tickets: data || [],
      total: count || 0,
      page: normalizedPage,
      limit: normalizedLimit,
    };
  }

  async updateSupportTicket(id: string, status: string) {
    const normalizedId = this.toTrimmedString(id);
    const normalizedStatus = this.toTrimmedString(status);
    if (!normalizedId) throw new BadRequestException('id is required');
    if (!normalizedStatus) throw new BadRequestException('status is required');

    const { data, error } = await this.supabase
      .schema('notification_and_support')
      .from('support_tickets')
      .update({ status: normalizedStatus })
      .eq('id', normalizedId)
      .select('id');
    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException(`Support ticket ${normalizedId} not found`);
    }
    return { ok: true };
  }

  async getComplianceReport(from?: string, to?: string) {
    let query = this.supabase
      .schema('notification_and_support')
      .from('disputes')
      .select('*');
    query = this.buildDateFilter(query, from, to);

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    return { disputes: data || [] };
  }

  async sendBroadcast(body: {
    user_ids?: string[];
    role?: string;
    title?: string;
    message?: string;
    type?: string;
  }) {
    const title = this.toTrimmedString(body?.title);
    const message = this.toTrimmedString(body?.message);
    if (!title) throw new BadRequestException('title is required');
    if (!message) throw new BadRequestException('message is required');

    const userIds = Array.from(
      new Set(
        (Array.isArray(body?.user_ids) ? body.user_ids : [])
          .map((userId) => this.toTrimmedString(userId))
          .filter(Boolean),
      ),
    );

    let targetUserIds = [...userIds];
    if (!targetUserIds.length && this.toTrimmedString(body?.role)) {
      const usersByRole = await this.request<any>(AUTH_PATTERNS.GET_USERS_BY_ROLE, {
        role: this.toTrimmedString(body?.role),
        page: 1,
        limit: 10000,
      });
      const roleUsers = Array.isArray(usersByRole?.users) ? usersByRole.users : [];
      targetUserIds = roleUsers
        .map((user: any) => this.toTrimmedString(user?.id))
        .filter(Boolean);
    }

    if (!targetUserIds.length) {
      throw new BadRequestException('No target users found');
    }

    return await this.request(NOTIFICATION_PATTERNS.SEND_BROADCAST, {
      userIds: targetUserIds,
      title,
      message,
      type: this.toTrimmedString(body?.type) || 'broadcast',
    });
  }
}
