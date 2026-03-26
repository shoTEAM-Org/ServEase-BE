import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from '@app/database';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SupabaseModule],
  controllers: [AuthController],
  providers: [AuthService, UsersService],
})
export class AuthServiceModule {}
