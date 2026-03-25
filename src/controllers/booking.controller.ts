import { Controller, Post, Get, Patch, Param, Body, Req, Inject, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type { Request } from 'express';
import { CreateBookingDto, UpdateBookingStatusDto, BOOKING_PATTERNS } from '@app/common';
import { supabase } from '@app/database';

@Controller('api/booking')
export class BookingController implements OnModuleInit {
  constructor(@Inject('BOOKING_SERVICE') private readonly bookingClient: ClientKafka) {}

  async onModuleInit() {
    this.bookingClient.subscribeToResponseOf(BOOKING_PATTERNS.CREATE);
    this.bookingClient.subscribeToResponseOf(BOOKING_PATTERNS.GET_HISTORY);
    this.bookingClient.subscribeToResponseOf(BOOKING_PATTERNS.GET_REQUESTS);
    this.bookingClient.subscribeToResponseOf(BOOKING_PATTERNS.UPDATE_STATUS);
    await this.bookingClient.connect();
  }

  @Post('v1/create')
  async createBooking(@Body() dto: CreateBookingDto, @Req() req: Request) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('Access denied. No token provided');

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw new UnauthorizedException('Invalid or expired token. Please login again');

    return lastValueFrom(this.bookingClient.send(BOOKING_PATTERNS.CREATE, { dto, customerId: user.id }));
  }

  @Get('v1/history')
  async getHistory() {
    return lastValueFrom(this.bookingClient.send(BOOKING_PATTERNS.GET_HISTORY, {}));
  }

  @Get('v1/requests')
  async getRequests() {
    return lastValueFrom(this.bookingClient.send(BOOKING_PATTERNS.GET_REQUESTS, {}));
  }

  @Patch('v1/:id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateBookingStatusDto) {
    return lastValueFrom(this.bookingClient.send(BOOKING_PATTERNS.UPDATE_STATUS, { id, status: dto.status }));
  }
}
