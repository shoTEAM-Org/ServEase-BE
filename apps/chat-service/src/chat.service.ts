import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const BOOKING_SCHEMA_CANDIDATES = ['booking', 'booking_svc'] as const;
const CHAT_SCHEMA_CANDIDATES = ['booking', 'booking_svc', 'messages'] as const;
const IDENTITY_SCHEMA_CANDIDATES = ['identity_and_user', 'identity_svc'] as const;
const PROVIDER_CATALOG_SCHEMA_CANDIDATES = ['provider_catalog', 'provider_catalog_svc'] as const;
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
export class ChatService {
  constructor(private readonly supabase: SupabaseClient) {}
  private readonly memoryConversationIds = new Map<string, string>();
  private readonly memoryMessages = new Map<string, MemoryChatMessageRow[]>();
  private hasLoggedChatStorageFallback = false;

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

  private async runWithSchemaFallback<T>(
    schemas: readonly string[],
    operation: (schema: string) => PromiseLike<any>,
    context: string
  ): Promise<{ data: T; schema: string; count?: number | null }> {
    let lastError: any = null;

    for (const schema of schemas) {
      const result = (await operation(schema)) as { data: T; error: any; count?: number | null };
      if (!result.error) {
        return { data: result.data, schema, count: result.count };
      }

      lastError = result.error;
      if (!this.isSchemaResolutionError(result.error)) {
        throw new InternalServerErrorException(result.error?.message || context);
      }
    }

    throw new InternalServerErrorException(lastError?.message || context);
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
    const column = role === 'provider' ? 'provider_id' : 'customer_id';
    const otherColumn = role === 'provider' ? 'customer_id' : 'provider_id';

    const { data: bookings } = await this.runWithSchemaFallback<any[]>(
      BOOKING_SCHEMA_CANDIDATES,
      (schema) =>
        this.supabase
          .schema(schema)
          .from('bookings')
          .select(`id, ${otherColumn}, service_id, status`)
          .eq(column, userId)
          .in('status', ['pending', 'confirmed', 'in_progress', 'completed']),
      'Unable to load booking conversations.'
    );

    const conversations: any[] = [];
    for (const booking of bookings || []) {
      const otherPartyId = (booking as any)[otherColumn];

      // Fetch other party user info
      const { data: otherUser } = await this.runWithSchemaFallback<any | null>(
        IDENTITY_SCHEMA_CANDIDATES,
        (schema) =>
          this.supabase
            .schema(schema)
            .from('users')
            .select('full_name, contact_number')
            .eq('id', otherPartyId)
            .maybeSingle(),
        'Unable to load conversation participant.'
      );

      // Fetch service title
      const { data: service } = await this.runWithSchemaFallback<any | null>(
        PROVIDER_CATALOG_SCHEMA_CANDIDATES,
        (schema) =>
          this.supabase
            .schema(schema)
            .from('provider_services')
            .select('title')
            .eq('id', booking.service_id)
            .maybeSingle(),
        'Unable to load service title for conversation.'
      );

      const bookingId = String(booking.id || '').trim();
      let conversation: { id: string } | null = null;
      let lastMsg: any = null;
      let unreadCount = 0;

      try {
        const conversationResult = await this.runWithChatSchemaFallback<{ id: string } | null>(
          (schema) =>
            this.supabase
              .schema(schema)
              .from('conversations')
              .select('id')
              .eq('context_type', 'booking')
              .eq('context_id', booking.id)
              .maybeSingle(),
          'Unable to load chat conversation.'
        );
        conversation = conversationResult.data;

        if (conversation) {
          const conversationId = conversation.id;
          const { data: lastMsgData } = await this.runWithChatSchemaFallback<any | null>(
            (schema) =>
              this.supabase
                .schema(schema)
                .from('messages')
                .select('id, body, created_at, sender_id')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            'Unable to load latest chat message.'
          );
          lastMsg = lastMsgData;

          const unreadResult = await this.runWithChatSchemaFallback<any>(
            (schema) =>
              this.supabase
                .schema(schema)
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', conversationId)
                .neq('sender_id', userId)
                .neq('delivery_status', 'read'),
            'Unable to load unread chat counts.'
          );
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

      conversations.push({
        id: `booking:${bookingId}`,
        bookingId,
        conversationId: conversation?.id || null,
        otherPartyId,
        otherPartyName: otherUser?.full_name || 'User',
        otherPartyPhone: otherUser?.contact_number || '',
        serviceName: service?.title || 'Service',
        lastMessage: lastMsg?.body || '',
        lastMessageTime: lastMsg?.created_at || null,
        unreadCount,
      });
    }
    return conversations;
  }

  async getMessages(bookingId: string, userId: string) {
    const { data: booking } = await this.runWithSchemaFallback<any | null>(
      BOOKING_SCHEMA_CANDIDATES,
      (schema) =>
        this.supabase
          .schema(schema)
          .from('bookings')
          .select('customer_id, provider_id')
          .eq('id', bookingId)
          .maybeSingle(),
      'Unable to load booking context for chat.'
    );

    if (!booking) {
      throw new BadRequestException('Booking not found.');
    }

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
            .eq('context_id', bookingId)
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
      const memorySnapshot = this.getMemoryConversationSnapshot(bookingId, userId);
      conversation = memorySnapshot.conversation;
      messageList = memorySnapshot.messages;
    }

    const senderRole = booking?.provider_id === userId ? 'provider' : 'customer';
    const otherPartyId = senderRole === 'provider' ? booking?.customer_id : booking?.provider_id;
    const { data: otherUser } = await this.runWithSchemaFallback<any | null>(
      IDENTITY_SCHEMA_CANDIDATES,
      (schema) =>
        this.supabase
          .schema(schema)
          .from('users')
          .select('full_name, contact_number')
          .eq('id', otherPartyId)
          .maybeSingle(),
      'Unable to load chat participant.'
    );

    return {
      id: `booking:${bookingId}`,
      bookingId,
      conversationId: conversation?.id || null,
      otherPartyId,
      otherPartyName: otherUser?.full_name || 'User',
      otherPartyPhone: otherUser?.contact_number || '',
      serviceName: '',
      messages: messageList.map((m: any) => ({
        id: m.id,
        text: m.body,
        createdAt: m.created_at,
        sender: m.sender_id === booking?.provider_id ? 'provider' : 'customer',
        deliveryStatus: m.delivery_status || 'sent',
      })),
    };
  }

  async sendMessage(bookingId: string, senderId: string, text: string) {
    if (!text?.trim()) throw new BadRequestException('Message text cannot be empty.');

    const normalizedText = String(text || '').trim();
    const conversationId = await this.getOrCreateConversation(bookingId);
    if (conversationId.startsWith(MEMORY_CONVERSATION_PREFIX)) {
      const memoryMessage = this.appendMemoryMessage(bookingId, senderId, normalizedText);
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
                sender_id: senderId,
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
      const memoryMessage = this.appendMemoryMessage(bookingId, senderId, normalizedText);
      return { id: memoryMessage.id, created_at: memoryMessage.created_at };
    }
  }

  async markRead(bookingId: string, userId: string) {
    try {
      const { data: conversation } = await this.runWithChatSchemaFallback<{ id: string } | null>(
        (schema) =>
          this.supabase
            .schema(schema)
            .from('conversations')
            .select('id')
            .eq('context_type', 'booking')
            .eq('context_id', bookingId)
            .maybeSingle(),
        'Unable to resolve conversation read status.'
      );

      if (!conversation) {
        this.markMemoryRead(bookingId, userId);
        return { ok: true };
      }

      await this.runWithChatSchemaFallback<any>(
        (schema) =>
          this.supabase
            .schema(schema)
            .from('messages')
            .update({ delivery_status: 'read' })
            .eq('conversation_id', conversation.id)
            .neq('sender_id', userId),
        'Unable to mark chat messages as read.'
      );
      return { ok: true };
    } catch (error) {
      if (!(error instanceof ChatStorageUnavailableError)) {
        throw error;
      }

      this.logChatStorageFallback(error);
      this.markMemoryRead(bookingId, userId);
      return { ok: true };
    }
  }
}
