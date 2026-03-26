import { Controller, Get, Req, UseGuards, Inject, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { AUTH_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard';

@Controller('api/users')
export class UsersController implements OnModuleInit {
  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientKafka) {}

  async onModuleInit() {
    this.authClient.subscribeToResponseOf(AUTH_PATTERNS.GET_PROFILE);
    await this.authClient.connect();
  }

  @Get('/v1/profile')
  @UseGuards(SupabaseAuthGuard)
  async getProfile(@Req() req: any) {
    return lastValueFrom(this.authClient.send(AUTH_PATTERNS.GET_PROFILE, { userId: req.user.id }));
  }
}
