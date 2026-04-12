import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request, Inject, OnModuleInit, HttpCode } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { BOOKING_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/booking')
@UseGuards(SupabaseAuthGuard)
export class BookingController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [BOOKING_PATTERNS.CREATE, BOOKING_PATTERNS.GET_CUSTOMER_BOOKINGS, BOOKING_PATTERNS.GET_HISTORY, BOOKING_PATTERNS.GET_REQUESTS, BOOKING_PATTERNS.GET_BY_ID, BOOKING_PATTERNS.GET_ATTACHMENTS]
      .forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  @Post('v1/create')
  async create(@Body() dto: any, @Request() req: any) { return lastValueFrom(this.kafka.send(BOOKING_PATTERNS.CREATE, { ...dto, customerId: req['user'].id })); }

  @Get('v1/customer')
  async getCustomerBookings(@Request() req: any) { return lastValueFrom(this.kafka.send(BOOKING_PATTERNS.GET_CUSTOMER_BOOKINGS, { customerId: req['user'].id })); }

  @Get('v1/history')
  async getHistory() { return lastValueFrom(this.kafka.send(BOOKING_PATTERNS.GET_HISTORY, {})); }

  @Get('v1/requests')
  async getRequests() { return lastValueFrom(this.kafka.send(BOOKING_PATTERNS.GET_REQUESTS, {})); }

  @Get('v1/:id')
  async getById(@Param('id') id: string) { return lastValueFrom(this.kafka.send(BOOKING_PATTERNS.GET_BY_ID, { id })); }

  @Patch('v1/:id/status') @HttpCode(202)
  async updateStatus(@Param('id') id: string, @Body() body: any) { this.kafka.emit(BOOKING_PATTERNS.UPDATE_STATUS, { id, status: body.status }); return { status: 'accepted' }; }

  @Patch('v1/:id/cancel') @HttpCode(202)
  async cancel(@Param('id') id: string, @Request() req: any, @Body() body: any) { this.kafka.emit(BOOKING_PATTERNS.CANCEL, { id, userId: req['user'].id, reason: body.reason, explanation: body.explanation }); return { status: 'accepted' }; }

  @Get('v1/:id/attachments')
  async getAttachments(@Param('id') id: string) { return lastValueFrom(this.kafka.send(BOOKING_PATTERNS.GET_ATTACHMENTS, { bookingId: id })); }

  @Post('v1/:id/attachments') @HttpCode(202)
  async saveAttachments(@Param('id') id: string, @Body() body: any) { this.kafka.emit(BOOKING_PATTERNS.SAVE_ATTACHMENTS, { bookingId: id, attachments: body.attachments }); return { status: 'accepted' }; }

  @Post('v1/:id/disputes') @HttpCode(202)
  async createDispute(@Param('id') id: string, @Request() req: any, @Body() body: any) { this.kafka.emit(BOOKING_PATTERNS.CREATE_DISPUTE, { bookingId: id, userId: req['user'].id, reason: body.reason }); return { status: 'accepted' }; }
}
