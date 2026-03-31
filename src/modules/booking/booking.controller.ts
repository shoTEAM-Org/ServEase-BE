import {Controller, Post, Get, Patch, Param, Body, Req, UnauthorizedException, ParseUUIDPipe } from '@nestjs/common';
import type { Request } from 'express';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ProviderBookingResponseDto, UpdateBookingStatusDto, } from './dto/update-booking-status.dto';
import { ProviderCounterOfferDto } from './dto/booking-counter-offer.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { supabase } from '../../../src/config/supabaseClient';

@Controller('api/booking')
export class BookingController {
    constructor(private readonly bookingService: BookingService) {}

    @Post('v1/create')
    async createBooking(
        @Body() dto: CreateBookingDto,
        @Req() req: Request
    ) {

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            throw new UnauthorizedException('Access denied. No token provided');
        }
        console.log('=== RAW HEADER ===', authHeader);
        const token = authHeader.split(' ')[1];
        const {data: {user}, error} = await supabase.auth.getUser(token);

        if (error || !user) {
            console.log('=== DEBUG: SUPABASE ERROR ===', error); 
            console.log('=== DEBUG: THE TOKEN ===', token);      
            throw new UnauthorizedException('Invalid or expired token. Please login again');
        }

        const customerId = user.id;
        return this.bookingService.createBooking(dto, customerId);

    }

    @Get('v1/history')
    async getHistory() {
        return this.bookingService.getHistory();
    }

    @Get('v1/requests')
    async getRequests() {
        return this.bookingService.getRequests();
    }

    @Patch('v1/:id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body() dto: UpdateBookingStatusDto
    ) {
        return this.bookingService.updateStatus(id, dto.status);
    }

    @Patch('v1/provider-response/:providerId/:bookingId')
  async providerResponse(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: ProviderBookingResponseDto
  ) {
    return this.bookingService.providerBookingResponse(bookingId, providerId, dto);
  }

    @Post('v1/counter-offer/:providerId/:bookingId')
  async submitCounterOffer(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: ProviderCounterOfferDto
  ) {
    return this.bookingService.providerCounterOffer(bookingId, providerId, dto);
  }

  @Get('v1/my-bookings/:providerId/:bookingId')
  async getMyBookings(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string
  ) {
    return this.bookingService.getMyBookings(bookingId, providerId);
  }

  @Post('provider/:providerId/:bookingId/cancel')
  async cancelBooking(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: CancelBookingDto
  ) {
    return this.bookingService.cancelBooking(bookingId, providerId, dto);
  }
}