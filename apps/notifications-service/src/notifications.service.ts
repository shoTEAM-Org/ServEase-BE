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

  async createNotification(
    userId: string,
    type: string,
    payload: {
      bookingId?: string;
      title?: string;
      body?: string;
      metadata?: any;
    },
  ) {
    const normalizedUserId = this.toTrimmedString(userId);
    const normalizedType = this.toTrimmedString(type);
    const normalizedTitle = this.toTrimmedString(payload?.title) || this.getTitleForType(normalizedType);
    const normalizedBody = this.toTrimmedString(payload?.body) || this.getBodyForType(normalizedType);
    const bookingId = this.toTrimmedString(payload?.bookingId) || null;

    if (!normalizedUserId) throw new BadRequestException('userId is required');

    const { error } = await this.supabase
      .schema('notification_and_support')
      .from('notifications')
      .insert([
        {
          user_id: normalizedUserId,
          type: normalizedType,
          title: normalizedTitle,
          body: normalizedBody,
          booking_id: bookingId,
          data: payload?.metadata || null,
          is_read: false,
        },
      ]);
    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true };
  }

  private getTitleForType(type: string): string {
    const typeMap: { [key: string]: string } = {
      'notification.booking-created': 'Booking Created',
      'notification.booking-confirmed': 'Booking Confirmed',
      'notification.booking-in-progress': 'Service in Progress',
      'notification.booking-completed': 'Booking Completed',
      'notification.booking-cancelled': 'Booking Cancelled',
      'notification.dispute-created': 'Dispute Raised',
      'notification.dispute-status-changed': 'Dispute Updated',
      'notification.review-created': 'You Have a New Review',
    };
    return typeMap[type] || 'Notification';
  }

  private getBodyForType(type: string): string {
    const typeMap: { [key: string]: string } = {
      'notification.booking-created': 'Your booking has been created',
      'notification.booking-confirmed': 'Your booking has been confirmed',
      'notification.booking-in-progress': 'Your service is now in progress',
      'notification.booking-completed': 'Your booking has been completed',
      'notification.booking-cancelled': 'Your booking has been cancelled',
      'notification.dispute-created': 'A dispute has been raised',
      'notification.dispute-status-changed': 'Your dispute status has been updated',
      'notification.review-created': 'Someone left you a review',
    };
    return typeMap[type] || 'You have a new notification';
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
