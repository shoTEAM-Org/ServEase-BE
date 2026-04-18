import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import {
  AUTH_PATTERNS,
  BOOKING_PATTERNS,
  KafkaRpcRequestOptions,
  PROVIDER_PATTERNS,
  sendKafkaRpcRequest,
} from '@app/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const CHAT_SCHEMA_CANDIDATES = ['messages'] as const;
const MEMORY_CONVERSATION_PREFIX = 'memory:';

type MemoryChatMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  delivery_status: string;
};

class ChatStorageUnavailableError extends Error {
  constructor(message: string, readonly details?: any) {
    super(message);
    this.name = 'ChatStorageUnavailableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(
    private readonly supabase: SupabaseClient,
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
  ) {}
  private readonly logger = new Logger(ChatService.name);
  private readonly memoryConversationIds = new Map<string, string>();
  private readonly memoryMessages = new Map<string, MemoryChatMessageRow[]>();
  private hasLoggedChatStorageFallback = false;

  async onModuleInit() {
    this.kafka.subscribeToResponseOf(AUTH_PATTERNS.GET_USERS_BY_IDS);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_CHAT_BOOKINGS);
    this.kafka.subscribeToResponseOf(BOOKING_PATTERNS.GET_CHAT_BOOKING_CONTEXT);
    this.kafka.subscribeToResponseOf(PROVIDER_PATTERNS.GET_SERVICES_BY_IDS);
    await this.kafka.connect();
  }

  private toTrimmedString(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
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

  private async getChatBookings(userId: string, role?: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    if (!normalizedUserId) return [] as any[];

    const response = await this.request<any>(BOOKING_PATTERNS.GET_CHAT_BOOKINGS, {
      userId: normalizedUserId,
      role,
    });
    const bookings =
      response && typeof response === 'object' && 'bookings' in response
        ? (response as any).bookings
        : [];
    return Array.isArray(bookings) ? bookings : [];
  }

  private async getChatBookingContext(bookingId: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    if (!normalizedBookingId) return null;

    const response = await this.request<any>(
      BOOKING_PATTERNS.GET_CHAT_BOOKING_CONTEXT,
      {
        bookingId: normalizedBookingId,
      },
    );

    if (!response || typeof response !== 'object' || !('booking' in response)) {
      return null;
    }

    return (response as any).booking || null;
  }

  private resolveBookingContextId(booking: any, bookingId: string) {
    return (
      this.toTrimmedString(booking?.id) ||
      this.toTrimmedString(booking?.booking_reference) ||
      this.toTrimmedString(bookingId)
    );
  }

  private resolveServiceNameFromBooking(booking: any) {
    return (
      this.toTrimmedString(booking?.service_description) ||
      this.toTrimmedString(booking?.service_title) ||
      this.toTrimmedString(booking?.service_name) ||
      'Service'
    );
  }

  private hasServiceNameFromBooking(booking: any) {
    return Boolean(
      this.toTrimmedString(booking?.service_description) ||
      this.toTrimmedString(booking?.service_title) ||
      this.toTrimmedString(booking?.service_name),
    );
  }

  private isTimeoutLikeError(error: unknown) {
    const message = this.toTrimmedString((error as any)?.message).toLowerCase();
    return message.includes('timeout') || message.includes('timed out');
  }

  private assertConversationParticipant(booking: any, userId: string) {
    const normalizedUserId = this.toTrimmedString(userId);
    const providerId = this.toTrimmedString(booking?.provider_id);
    const customerId = this.toTrimmedString(booking?.customer_id);

    if (!normalizedUserId) {
      throw new UnauthorizedException('Missing conversation participant.');
    }
    if (
      normalizedUserId !== providerId &&
      normalizedUserId !== customerId
    ) {
      throw new UnauthorizedException(
        'You are not part of this booking conversation.',
      );
    }

    return { normalizedUserId, providerId, customerId };
  }

  private async getUsersByIds(userIds: unknown) {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(userIds) ? userIds : [])
          .map((userId) => this.toTrimmedString(userId))
          .filter((userId) => Boolean(userId)),
      ),
    );
    if (!normalizedIds.length) return [] as any[];

    const response = await this.request<any>(AUTH_PATTERNS.GET_USERS_BY_IDS, {
      userIds: normalizedIds,
    });
    const users =
      response && typeof response === 'object' && 'users' in response
        ? (response as any).users
        : [];
    return Array.isArray(users) ? users : [];
  }

  private async getServicesByIds(serviceIds: unknown) {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(serviceIds) ? serviceIds : [])
          .map((serviceId) => this.toTrimmedString(serviceId))
          .filter((serviceId) => Boolean(serviceId)),
      ),
    );
    if (!normalizedIds.length) return [] as any[];

    let response: any = null;
    try {
      response = await this.request<any>(
        PROVIDER_PATTERNS.GET_SERVICES_BY_IDS,
        { serviceIds: normalizedIds },
        { timeoutMs: 10_000, retries: 1, retryDelayMs: 300 },
      );
    } catch (error) {
      const reason = this.isTimeoutLikeError(error) ? 'timeout' : 'error';
      this.logger.warn(
        `chat service lookup degraded (${reason}): provider.get-services-by-ids for ${normalizedIds.length} id(s)`,
      );
      return [] as any[];
    }

    const services =
      response && typeof response === 'object' && 'services' in response
        ? (response as any).services
        : [];
    return Array.isArray(services) ? services : [];
  }

  private isSchemaResolutionError(error: any): boolean {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    return (
      code === '3F000' ||
      code === '42P01' ||
      (message.includes('schema') && message.includes('does not exist')) ||
      (message.includes('relation') && message.includes('does not exist')) ||
      message.includes('schema cache')
    );
  }

  private isChatStorageUnavailableError(error: any): boolean {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    return (
      this.isSchemaResolutionError(error) ||
      code === 'PGRST106' ||
      code === 'PGRST205' ||
      code === 'PGRST204' ||
      code === '42501' ||
      message.includes('permission denied') ||
      message.includes('schema cache') ||
      message.includes('does not exist')
    );
  }

  private async runWithChatSchemaFallback<T>(
    operation: (schema: string) => PromiseLike<any>,
    context: string
  ): Promise<{ data: T; schema: string; count?: number | null }> {
    let lastError: any = null;

    for (const schema of CHAT_SCHEMA_CANDIDATES) {
      const result = (await operation(schema)) as { data: T; error: any; count?: number | null };
      if (!result.error) {
        return { data: result.data, schema, count: result.count };
      }

      lastError = result.error;
      if (!this.isChatStorageUnavailableError(result.error)) {
        throw new InternalServerErrorException(result.error?.message || context);
      }
    }

    throw new ChatStorageUnavailableError(lastError?.message || context, lastError);
  }

  private getMemoryConversationId(bookingId: string, create = true): string | null {
    const key = String(bookingId || '').trim();
    if (!key) return null;

    const existing = this.memoryConversationIds.get(key);
    if (existing) return existing;
    if (!create) return null;

    const generated = `${MEMORY_CONVERSATION_PREFIX}${key}`;
    this.memoryConversationIds.set(key, generated);
    return generated;
  }

  private getMemoryMessages(bookingId: string): MemoryChatMessageRow[] {
    return this.memoryMessages.get(String(bookingId || '').trim()) || [];
  }

  private appendMemoryMessage(bookingId: string, senderId: string, text: string): MemoryChatMessageRow {
    const normalizedBookingId = String(bookingId || '').trim();
    const conversationId = this.getMemoryConversationId(normalizedBookingId, true) as string;
    const next: MemoryChatMessageRow = {
      id: `memory-${typeof randomUUID === 'function' ? randomUUID() : `${Date.now()}`}`,
      conversation_id: conversationId,
      sender_id: String(senderId || '').trim(),
      body: String(text || '').trim(),
      created_at: new Date().toISOString(),
      delivery_status: 'sent',
    };

    const existing = this.getMemoryMessages(normalizedBookingId);
    this.memoryMessages.set(normalizedBookingId, [...existing, next]);
    return next;
  }

  private markMemoryRead(bookingId: string, userId: string) {
    const normalizedBookingId = String(bookingId || '').trim();
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedBookingId || !normalizedUserId) return;

    const existing = this.getMemoryMessages(normalizedBookingId);
    if (!existing.length) return;

    this.memoryMessages.set(
      normalizedBookingId,
      existing.map((message) =>
        message.sender_id === normalizedUserId
          ? message
          : { ...message, delivery_status: 'read' }
      )
    );
  }

  private getMemoryConversationSnapshot(bookingId: string, userId: string) {
    const messages = this.getMemoryMessages(bookingId);
    const conversationId = this.getMemoryConversationId(bookingId, false);
    const lastMessage = messages.length ? messages[messages.length - 1] : null;
    const unreadCount = messages.reduce((count, message) => {
      if (message.sender_id === String(userId || '').trim()) return count;
      if (String(message.delivery_status || '').toLowerCase() === 'read') return count;
      return count + 1;
    }, 0);

    return {
      conversation: conversationId ? { id: conversationId } : null,
      messages,
      lastMessage,
      unreadCount,
    };
  }

  private logChatStorageFallback(error: ChatStorageUnavailableError) {
    if (this.hasLoggedChatStorageFallback) return;
    this.hasLoggedChatStorageFallback = true;

    const code = String(error?.details?.code || '').trim();
    const message = String(error?.details?.message || error.message || '').trim();
    console.warn(
      '[chat] falling back to in-memory chat storage; check schema grants for chat tables',
      { code, message }
    );
  }

  /**
   * Find or create a conversation for a given booking context.
   * Returns the conversation id.
   */
  private async getOrCreateConversation(bookingId: string): Promise<string> {
    try {
      const { data: existing } = await this.runWithChatSchemaFallback<{ id: string } | null>(
        (schema) =>
          this.supabase
            .schema(schema)
            .from('conversations')
            .select('id')
            .eq('context_type', 'booking')
            .eq('context_id', bookingId)
            .maybeSingle(),
        'Unable to resolve chat conversation schema.'
      );

      if (existing?.id) return existing.id;

      const { data: created } = await this.runWithChatSchemaFallback<{ id: string }>(
        (schema) =>
          this.supabase
            .schema(schema)
            .from('conversations')
            .insert([{ context_type: 'booking', context_id: bookingId, status: 'active' }])
            .select('id')
            .single(),
        'Unable to create chat conversation.'
      );

      return created.id;
    } catch (error) {
      if (!(error instanceof ChatStorageUnavailableError)) {
        throw error;
      }

      this.logChatStorageFallback(error);
      return this.getMemoryConversationId(bookingId, true) as string;
    }
  }

  async getConversations(userId: string, role?: string) {
    const otherColumn = role === 'provider' ? 'customer_id' : 'provider_id';
    const bookings = await this.getChatBookings(userId, role);

    const otherPartyIds = Array.from(
      new Set(
        (bookings || [])
          .map((booking: any) => this.toTrimmedString(booking?.[otherColumn]))
          .filter((value: string) => Boolean(value)),
      ),
    );
    const bookingsWithoutServiceName = (bookings || []).filter(
      (booking: any) => !this.hasServiceNameFromBooking(booking),
    );
    const serviceIds = Array.from(
      new Set(
        bookingsWithoutServiceName
          .map((booking: any) => this.toTrimmedString(booking?.service_id))
          .filter((value: string) => Boolean(value)),
      ),
    );

    const [users, services] = await Promise.all([
      this.getUsersByIds(otherPartyIds),
      serviceIds.length ? this.getServicesByIds(serviceIds) : Promise.resolve([]),
    ]);
    const usersById = new Map(
      users.map((row: any) => [this.toTrimmedString(row?.id), row]),
    );
    const servicesById = new Map(
      services.map((row: any) => [
        this.toTrimmedString(row?.id),
        this.toTrimmedString(row?.title),
      ]),
    );

    const conversations = await Promise.all(
      (bookings || []).map(async (booking: any) => {
        const otherPartyId = this.toTrimmedString((booking as any)[otherColumn]);
        const serviceId = this.toTrimmedString(booking?.service_id);
        const otherUser = usersById.get(otherPartyId) as any;

        const bookingId = String(booking.id || '').trim();
        let conversation: { id: string } | null = null;
        let lastMsg: any = null;
        let unreadCount = 0;

        try {
          const conversationResult = await this.runWithChatSchemaFallback<
            { id: string } | null
          >(
            (schema) =>
              this.supabase
                .schema(schema)
                .from('conversations')
                .select('id')
                .eq('context_type', 'booking')
                .eq('context_id', booking.id)
                .maybeSingle(),
            'Unable to load chat conversation.',
          );
          conversation = conversationResult.data;

          if (conversation) {
            const conversationId = conversation.id;
            const [lastMsgResult, unreadResult] = await Promise.all([
              this.runWithChatSchemaFallback<any | null>(
                (schema) =>
                  this.supabase
                    .schema(schema)
                    .from('messages')
                    .select('id, body, created_at, sender_id')
                    .eq('conversation_id', conversationId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                'Unable to load latest chat message.',
              ),
              this.runWithChatSchemaFallback<any>(
                (schema) =>
                  this.supabase
                    .schema(schema)
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('conversation_id', conversationId)
                    .neq('sender_id', userId)
                    .neq('delivery_status', 'read'),
                'Unable to load unread chat counts.',
              ),
            ]);
            lastMsg = lastMsgResult.data;
            unreadCount = Number(unreadResult.count || 0);
          }
        } catch (error) {
          if (!(error instanceof ChatStorageUnavailableError)) {
            throw error;
          }

          this.logChatStorageFallback(error);
          const memorySnapshot = this.getMemoryConversationSnapshot(bookingId, userId);
          conversation = memorySnapshot.conversation;
          lastMsg = memorySnapshot.lastMessage;
          unreadCount = memorySnapshot.unreadCount;
        }

        return {
          id: `booking:${bookingId}`,
          bookingId,
          conversationId: conversation?.id || null,
          otherPartyId,
          otherPartyName: otherUser?.full_name || 'User',
          otherPartyPhone: otherUser?.contact_number || '',
          serviceName:
            this.toTrimmedString(booking?.service_description) ||
            this.toTrimmedString(booking?.service_title) ||
            this.toTrimmedString(booking?.service_name) ||
            this.toTrimmedString(servicesById.get(serviceId)) ||
            'Service',
          lastMessage: lastMsg?.body || '',
          lastMessageTime: lastMsg?.created_at || null,
          unreadCount,
        };
      }),
    );

    return conversations;
  }

  async getMessages(bookingId: string, userId: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    const booking = await this.getChatBookingContext(normalizedBookingId);

    if (!booking) {
      throw new BadRequestException('Booking not found.');
    }
    const { normalizedUserId, providerId, customerId } =
      this.assertConversationParticipant(booking, userId);
    const contextBookingId = this.resolveBookingContextId(
      booking,
      normalizedBookingId,
    );

    let conversation: { id: string } | null = null;
    let messageList: any[] = [];

    try {
      const conversationResult = await this.runWithChatSchemaFallback<{ id: string } | null>(
        (schema) =>
            this.supabase
              .schema(schema)
              .from('conversations')
              .select('id')
              .eq('context_type', 'booking')
              .eq('context_id', contextBookingId)
              .maybeSingle(),
        'Unable to load chat conversation.'
      );
      conversation = conversationResult.data;

      if (conversation) {
        const conversationId = conversation.id;
        const { data: messages } = await this.runWithChatSchemaFallback<any[]>(
          (schema) =>
            this.supabase
              .schema(schema)
              .from('messages')
              .select('id, body, created_at, sender_id, delivery_status')
              .eq('conversation_id', conversationId)
              .order('created_at', { ascending: true }),
          'Unable to load chat messages.'
        );
        messageList = messages || [];
      }
    } catch (error) {
      if (!(error instanceof ChatStorageUnavailableError)) {
        throw error;
      }

      this.logChatStorageFallback(error);
      const memorySnapshot = this.getMemoryConversationSnapshot(
        contextBookingId,
        normalizedUserId,
      );
      conversation = memorySnapshot.conversation;
      messageList = memorySnapshot.messages;
    }

    const senderRole = providerId === normalizedUserId ? 'provider' : 'customer';
    const otherPartyId = senderRole === 'provider' ? customerId : providerId;
    const users = await this.getUsersByIds([otherPartyId]);
    const otherUser = Array.isArray(users) && users.length ? users[0] : null;

    return {
      id: `booking:${contextBookingId}`,
      bookingId: contextBookingId,
      conversationId: conversation?.id || null,
      otherPartyId,
      otherPartyName: otherUser?.full_name || 'User',
      otherPartyPhone: otherUser?.contact_number || '',
      serviceName: this.resolveServiceNameFromBooking(booking),
      messages: messageList.map((m: any) => ({
        id: m.id,
        text: m.body,
        createdAt: m.created_at,
        sender: m.sender_id === providerId ? 'provider' : 'customer',
        deliveryStatus: m.delivery_status || 'sent',
      })),
    };
  }

  async sendMessage(bookingId: string, senderId: string, text: string) {
    if (!text?.trim()) throw new BadRequestException('Message text cannot be empty.');

    const normalizedBookingId = this.toTrimmedString(bookingId);
    const booking = await this.getChatBookingContext(normalizedBookingId);
    if (!booking) throw new BadRequestException('Booking not found.');

    const { normalizedUserId } = this.assertConversationParticipant(
      booking,
      senderId,
    );
    const contextBookingId = this.resolveBookingContextId(
      booking,
      normalizedBookingId,
    );
    const normalizedText = String(text || '').trim();
    const conversationId = await this.getOrCreateConversation(contextBookingId);
    if (conversationId.startsWith(MEMORY_CONVERSATION_PREFIX)) {
      const memoryMessage = this.appendMemoryMessage(
        contextBookingId,
        normalizedUserId,
        normalizedText,
      );
      return { id: memoryMessage.id, created_at: memoryMessage.created_at };
    }

    try {
      const { data } = await this.runWithChatSchemaFallback<any>(
        (schema) =>
          this.supabase
            .schema(schema)
            .from('messages')
            .insert([
              {
                conversation_id: conversationId,
                sender_id: normalizedUserId,
                message_type: 'text',
                body: normalizedText,
                delivery_status: 'sent',
              },
            ])
            .select()
            .single(),
        'Unable to send chat message.'
      );

      // Update conversation last_message_at
      await this.runWithChatSchemaFallback<any>(
        (schema) =>
          this.supabase
            .schema(schema)
            .from('conversations')
            .update({ last_message_at: data.created_at })
            .eq('id', conversationId),
        'Unable to update conversation timestamp.'
      );

      return { id: data.id, created_at: data.created_at };
    } catch (error) {
      if (!(error instanceof ChatStorageUnavailableError)) {
        throw error;
      }

      this.logChatStorageFallback(error);
      const memoryMessage = this.appendMemoryMessage(
        contextBookingId,
        normalizedUserId,
        normalizedText,
      );
      return { id: memoryMessage.id, created_at: memoryMessage.created_at };
    }
  }

  async markRead(bookingId: string, userId: string) {
    const normalizedBookingId = this.toTrimmedString(bookingId);
    const normalizedUserId = this.toTrimmedString(userId);

    let contextBookingId = normalizedBookingId;
    try {
      const booking = await this.getChatBookingContext(normalizedBookingId);
      if (booking) {
        this.assertConversationParticipant(booking, normalizedUserId);
        contextBookingId = this.resolveBookingContextId(
          booking,
          normalizedBookingId,
        );
      }
    } catch {
      // Read status updates are best-effort; continue with the provided booking id.
    }

    try {
      const { data: conversation } = await this.runWithChatSchemaFallback<{ id: string } | null>(
        (schema) =>
          this.supabase
            .schema(schema)
            .from('conversations')
            .select('id')
            .eq('context_type', 'booking')
            .eq('context_id', contextBookingId)
            .maybeSingle(),
        'Unable to resolve conversation read status.'
      );

      if (!conversation) {
        this.markMemoryRead(contextBookingId, normalizedUserId);
        return { ok: true };
      }

      await this.runWithChatSchemaFallback<any>(
        (schema) =>
          this.supabase
            .schema(schema)
            .from('messages')
            .update({ delivery_status: 'read' })
            .eq('conversation_id', conversation.id)
            .neq('sender_id', normalizedUserId),
        'Unable to mark chat messages as read.'
      );
      return { ok: true };
    } catch (error) {
      if (!(error instanceof ChatStorageUnavailableError)) {
        throw error;
      }

      this.logChatStorageFallback(error);
      this.markMemoryRead(contextBookingId, normalizedUserId);
      return { ok: true };
    }
  }
}
