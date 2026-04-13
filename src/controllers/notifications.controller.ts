import { Controller, Get, Patch, Param, UseGuards, Request, Inject, OnModuleInit, HttpCode } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { NOTIFICATION_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/notifications')
@UseGuards(SupabaseAuthGuard)
export class NotificationsController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [NOTIFICATION_PATTERNS.GET_NOTIFICATIONS, NOTIFICATION_PATTERNS.GET_UNREAD_COUNT]
      .forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  @Get('v1')
  async getAll(@Request() req: any) { return lastValueFrom(this.kafka.send(NOTIFICATION_PATTERNS.GET_NOTIFICATIONS, { userId: req['user'].id })); }

  @Patch('v1/read-all') @HttpCode(202)
  async markAllRead(@Request() req: any) { this.kafka.emit(NOTIFICATION_PATTERNS.MARK_ALL_READ, { userId: req['user'].id }); return { status: 'accepted' }; }

  @Get('v1/unread-count')
  async getUnreadCount(@Request() req: any) { return lastValueFrom(this.kafka.send(NOTIFICATION_PATTERNS.GET_UNREAD_COUNT, { userId: req['user'].id })); }

  @Patch('v1/:id/read') @HttpCode(202)
  async markRead(@Param('id') id: string, @Request() req: any) { this.kafka.emit(NOTIFICATION_PATTERNS.MARK_READ, { notificationId: id, userId: req['user'].id }); return { status: 'accepted' }; }
}
