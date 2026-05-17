import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { NOTIFICATION_PATTERNS } from '@app/common';
import { NotificationsService } from './notifications.service.js';

@Controller()
export class NotificationsKafkaController {
  constructor(@Inject(NotificationsService) private readonly notificationsService: NotificationsService) {}

  @MessagePattern(NOTIFICATION_PATTERNS.GET_NOTIFICATIONS)
  async getNotifications(@Payload() data: any) {
    return this.notificationsService.getNotifications(data.userId);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.GET_UNREAD_COUNT)
  async getUnreadCount(@Payload() data: any) {
    return this.notificationsService.getUnreadCount(data.userId);
  }

  @MessagePattern(NOTIFICATION_PATTERNS.SEND_BROADCAST)
  async sendBroadcast(@Payload() data: any) {
    return this.notificationsService.sendBroadcast(
      data?.userIds,
      data?.title,
      data?.message,
      data?.type,
    );
  }

  @EventPattern(NOTIFICATION_PATTERNS.MARK_READ)
  async markRead(@Payload() data: any) {
    return this.notificationsService.markRead(data.notificationId, data.userId);
  }

  @EventPattern(NOTIFICATION_PATTERNS.MARK_ALL_READ)
  async markAllRead(@Payload() data: any) {
    return this.notificationsService.markAllRead(data.userId);
  }

  @EventPattern(NOTIFICATION_PATTERNS.BOOKING_CREATED)
  async handleBookingCreated(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      bookingId: data.bookingId,
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.BOOKING_CONFIRMED)
  async handleBookingConfirmed(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      bookingId: data.bookingId,
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.BOOKING_IN_PROGRESS)
  async handleBookingInProgress(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      bookingId: data.bookingId,
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.BOOKING_COMPLETED)
  async handleBookingCompleted(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      bookingId: data.bookingId,
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.BOOKING_CANCELLED)
  async handleBookingCancelled(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      bookingId: data.bookingId,
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.DISPUTE_CREATED)
  async handleDisputeCreated(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      bookingId: data.bookingId,
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.DISPUTE_STATUS_CHANGED)
  async handleDisputeStatusChanged(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      bookingId: data.bookingId,
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.REVIEW_CREATED)
  async handleReviewCreated(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.PROVIDER_APPLICATION_SUBMITTED)
  async handleProviderApplicationSubmitted(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.PROVIDER_APPLICATION_APPROVED)
  async handleProviderApplicationApproved(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.PROVIDER_APPLICATION_REJECTED)
  async handleProviderApplicationRejected(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.REVIEW_RESPONSE_CREATED)
  async handleReviewResponseCreated(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      metadata: data.metadata,
    });
  }

  @EventPattern(NOTIFICATION_PATTERNS.REVIEW_RESPONSE_UPDATED)
  async handleReviewResponseUpdated(@Payload() data: any) {
    return this.notificationsService.createNotification(data.userId, data.type, {
      metadata: data.metadata,
    });
  }
}
