import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { AdminService } from './admin.service.js';
import { AdminKafkaController } from './admin.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [AdminKafkaController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminServiceModule {}
