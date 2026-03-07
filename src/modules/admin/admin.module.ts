import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// SCRUM-55: Admin Module for KYC Document Management
// Developer: alex cadaoas
@Module({
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
