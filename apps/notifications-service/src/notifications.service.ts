import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class NotificationsService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getNotifications(userId: string) {
    const { data, error } = await this.supabase
      .schema('notification_and_support')
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return { notifications: data || [] };
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
}
