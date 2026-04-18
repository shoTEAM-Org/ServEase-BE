import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Inject,
  OnModuleInit,
  HttpCode,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { sendWithTimeout } from '../utils/kafka-request.js';
import { AUTH_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/users')
@UseGuards(SupabaseAuthGuard)
export class UsersController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [
      AUTH_PATTERNS.GET_PROFILE,
      AUTH_PATTERNS.GET_CUSTOMER_PROFILE,
      AUTH_PATTERNS.GET_ADDRESSES,
    ].forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  @Get('v1/profile')
  async getProfile(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(AUTH_PATTERNS.GET_PROFILE, { userId: req['user'].id }),
    );
  }

  @Patch('v1/profile')
  @HttpCode(202)
  async updateProfile(@Request() req: any, @Body() body: any) {
    this.kafka.emit(AUTH_PATTERNS.UPDATE_PROFILE, {
      userId: req['user'].id,
      ...body,
    });
    return { status: 'accepted' };
  }

  @Get('v1/customer-profile')
  async getCustomerProfile(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(AUTH_PATTERNS.GET_CUSTOMER_PROFILE, {
        userId: req['user'].id,
      }),
    );
  }

  @Patch('v1/customer-profile')
  @HttpCode(202)
  async updateCustomerProfile(@Request() req: any, @Body() body: any) {
    this.kafka.emit(AUTH_PATTERNS.UPDATE_CUSTOMER_PROFILE, {
      userId: req['user'].id,
      ...body,
    });
    return { status: 'accepted' };
  }

  @Get('v1/addresses')
  async getAddresses(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(AUTH_PATTERNS.GET_ADDRESSES, { userId: req['user'].id }),
    );
  }

  @Post('v1/addresses')
  @HttpCode(202)
  async addAddress(@Request() req: any, @Body() body: any) {
    this.kafka.emit(AUTH_PATTERNS.ADD_ADDRESS, {
      userId: req['user'].id,
      ...body,
    });
    return { status: 'accepted' };
  }

  @Patch('v1/addresses/:id')
  @HttpCode(202)
  async updateAddress(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: any,
  ) {
    this.kafka.emit(AUTH_PATTERNS.UPDATE_ADDRESS, {
      addressId: id,
      userId: req['user'].id,
      ...body,
    });
    return { status: 'accepted' };
  }

  @Delete('v1/addresses/:id')
  @HttpCode(202)
  async deleteAddress(@Param('id') id: string, @Request() req: any) {
    this.kafka.emit(AUTH_PATTERNS.DELETE_ADDRESS, {
      addressId: id,
      userId: req['user'].id,
    });
    return { status: 'accepted' };
  }
}
