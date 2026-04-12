import { Controller, Get, Patch, Param, Body, UseGuards, Request, Inject, OnModuleInit, HttpCode } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { CUSTOMER_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/customer')
@UseGuards(SupabaseAuthGuard)
export class CustomerController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [CUSTOMER_PATTERNS.GET_DASHBOARD, CUSTOMER_PATTERNS.GET_PROFILE]
      .forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  @Get('v1/dashboard/:id')
  async getDashboard(@Param('id') id: string) { return lastValueFrom(this.kafka.send(CUSTOMER_PATTERNS.GET_DASHBOARD, { customerId: id })); }

  @Get('v1/profile')
  async getProfile(@Request() req: any) { return lastValueFrom(this.kafka.send(CUSTOMER_PATTERNS.GET_PROFILE, { userId: req['user'].id })); }

  @Patch('v1/profile') @HttpCode(202)
  async updateProfile(@Request() req: any, @Body() body: any) { this.kafka.emit(CUSTOMER_PATTERNS.UPDATE_PROFILE, { userId: req['user'].id, ...body }); return { status: 'accepted' }; }
}
