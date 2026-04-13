import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class ChatService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Find or create a conversation for a given booking context.
   * Returns the conversation id.
   */
  private async getOrCreateConversation(bookingId: string): Promise<string> {
    const { data: existing } = await this.supabase
      .schema('messages')
      .from('conversations')
      .select('id')
      .eq('context_type', 'booking')
      .eq('context_id', bookingId)
      .single();

    if (existing) return existing.id;

    const { data: created, error } = await this.supabase
      .schema('messages')
      .from('conversations')
      .insert([{ context_type: 'booking', context_id: bookingId, status: 'active' }])
      .select('id')
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return created.id;
  }

  async getConversations(userId: string, role?: string) {
    const column = role === 'provider' ? 'provider_id' : 'customer_id';
    const otherColumn = role === 'provider' ? 'customer_id' : 'provider_id';

    const { data: bookings, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select(`id, ${otherColumn}, service_id, status`)
      .eq(column, userId)
      .in('status', ['pending', 'confirmed', 'in_progress', 'completed']);
    if (error) throw new InternalServerErrorException(error.message);

    const conversations: any[] = [];
    for (const booking of bookings || []) {
      const otherPartyId = (booking as any)[otherColumn];

      // Fetch other party user info
      const { data: otherUser } = await this.supabase
        .schema('identity_and_user')
        .from('users')
        .select('full_name, contact_number')
        .eq('id', otherPartyId)
        .single();

      // Fetch service title
      const { data: service } = await this.supabase
        .schema('provider_catalog')
        .from('provider_services')
        .select('title')
        .eq('id', booking.service_id)
        .single();

      // Find conversation for this booking
      const { data: conversation } = await this.supabase
        .schema('messages')
        .from('conversations')
        .select('id')
        .eq('context_type', 'booking')
        .eq('context_id', booking.id)
        .single();

      let lastMsg: any = null;
      let unreadCount = 0;

      if (conversation) {
        const { data: lastMsgData } = await this.supabase
          .schema('messages')
          .from('messages')
          .select('id, body, created_at, sender_id')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        lastMsg = lastMsgData;

        const { count } = await this.supabase
          .schema('messages')
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conversation.id)
          .neq('sender_id', userId)
          .neq('delivery_status', 'read');
        unreadCount = count || 0;
      }

      conversations.push({
        id: `booking:${booking.id}`,
        bookingId: booking.id,
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
    const { data: booking } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('customer_id, provider_id')
      .eq('id', bookingId)
      .single();

    const { data: conversation } = await this.supabase
      .schema('messages')
      .from('conversations')
      .select('id')
      .eq('context_type', 'booking')
      .eq('context_id', bookingId)
      .single();

    let messageList: any[] = [];
    if (conversation) {
      const { data: messages, error } = await this.supabase
        .schema('messages')
        .from('messages')
        .select('id, body, created_at, sender_id, delivery_status')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });
      if (error) throw new InternalServerErrorException(error.message);
      messageList = messages || [];
    }

    const senderRole = booking?.provider_id === userId ? 'provider' : 'customer';
    const otherPartyId = senderRole === 'provider' ? booking?.customer_id : booking?.provider_id;
    const { data: otherUser } = await this.supabase
      .schema('identity_and_user')
      .from('users')
      .select('full_name, contact_number')
      .eq('id', otherPartyId)
      .single();

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

    const conversationId = await this.getOrCreateConversation(bookingId);

    const { data, error } = await this.supabase
      .schema('messages')
      .from('messages')
      .insert([{
        conversation_id: conversationId,
        sender_id: senderId,
        message_type: 'text',
        body: text.trim(),
        delivery_status: 'sent',
      }])
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    // Update conversation last_message_at
    await this.supabase
      .schema('messages')
      .from('conversations')
      .update({ last_message_at: data.created_at })
      .eq('id', conversationId);

    return { id: data.id, created_at: data.created_at };
  }

  async markRead(bookingId: string, userId: string) {
    const { data: conversation } = await this.supabase
      .schema('messages')
      .from('conversations')
      .select('id')
      .eq('context_type', 'booking')
      .eq('context_id', bookingId)
      .single();

    if (!conversation) return { ok: true };

    const { error } = await this.supabase
      .schema('messages')
      .from('messages')
      .update({ delivery_status: 'read' })
      .eq('conversation_id', conversation.id)
      .neq('sender_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true };
  }
}
