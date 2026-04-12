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

  @EventPattern(NOTIFICATION_PATTERNS.MARK_READ)
  async markRead(@Payload() data: any) {
    return this.notificationsService.markRead(data.notificationId, data.userId);
  }

  @EventPattern(NOTIFICATION_PATTERNS.MARK_ALL_READ)
  async markAllRead(@Payload() data: any) {
    return this.notificationsService.markAllRead(data.userId);
  }
}
