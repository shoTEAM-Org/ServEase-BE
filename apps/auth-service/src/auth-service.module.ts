import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '@app/database';
import { AuthService } from './auth.service.js';
import { UsersService } from './users.service.js';
import { AuthController } from './auth.controller.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SupabaseModule],
  controllers: [AuthController],
  providers: [AuthService, UsersService],
})
export class AuthServiceModule {}
