import { Module } from '@nestjs/common';
import { SupabaseModule } from '@app/database';
import { AuthService } from './auth.service.js';
import { UsersService } from './users.service.js';
import { AuthKafkaController } from './auth.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [AuthKafkaController],
  providers: [AuthService, UsersService],
  exports: [AuthService, UsersService],
})
export class AuthServiceModule {}
