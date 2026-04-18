import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class NotificationsService {
  constructor(private readonly supabase: SupabaseClient) {}

  private toTrimmedString(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    return '';
  }

  async getNotifications(userId: string) {
    const { data, error } = await this.supabase
      .schema('notification_and_support')
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    const notifications = (data || []).map((row: any) => {
      const normalizedId =
        this.toTrimmedString(row?.id) ||
        this.toTrimmedString(row?.notification_id) ||
        null;
      const normalizedBody =
        this.toTrimmedString(row?.body) || this.toTrimmedString(row?.message);

      return {
        ...row,
        id: normalizedId,
        notification_id:
          this.toTrimmedString(row?.notification_id) || normalizedId,
        body: normalizedBody,
        message: this.toTrimmedString(row?.message) || normalizedBody,
      };
    });

    return { notifications };
  }

  async markRead(notificationId: string, userId: string) {
    const { error } = await this.supabase
      .schema('notification_and_support')
      .from('notifications')
      .update({ is_read: true })
      .eq('notification_id', notificationId)
      .eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const { error } = await this.supabase
      .schema('notification_and_support')
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true };
  }

  async getUnreadCount(userId: string) {
    const { count, error } = await this.supabase
      .schema('notification_and_support')
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw new InternalServerErrorException(error.message);
    return { count: count || 0 };
  }

  async sendBroadcast(
    userIds: unknown,
    title: unknown,
    message: unknown,
    type: unknown,
  ) {
    const normalizedTitle = this.toTrimmedString(title);
    const normalizedMessage = this.toTrimmedString(message);
    const normalizedType = this.toTrimmedString(type) || 'broadcast';
    if (!normalizedTitle) throw new BadRequestException('title is required');
    if (!normalizedMessage) throw new BadRequestException('message is required');

    const targetUserIds = Array.from(
      new Set(
        (Array.isArray(userIds) ? userIds : [])
          .map((userId) => this.toTrimmedString(userId))
          .filter(Boolean),
      ),
    );

    if (!targetUserIds.length) {
      throw new BadRequestException('No target users found');
    }

    const payload = targetUserIds.map((userId) => ({
      user_id: userId,
      title: normalizedTitle,
      message: normalizedMessage,
      type: normalizedType,
      is_read: false,
    }));

    const { error } = await this.supabase
      .schema('notification_and_support')
      .from('notifications')
      .insert(payload);
    if (error) throw new InternalServerErrorException(error.message);

    return { ok: true, sent_to: targetUserIds.length };
  }
}
