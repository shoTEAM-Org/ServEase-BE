import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { NotificationsService } from './notifications.service.js';
import { NotificationsKafkaController } from './notifications.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [NotificationsKafkaController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsServiceModule {}
