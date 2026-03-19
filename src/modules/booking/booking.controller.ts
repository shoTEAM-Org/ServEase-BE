import {Controller, Post, Get, Put, Param, Body, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { BookingService } from './booking.service';
import { CreateBookingDto} from './dto/create-booking.dto';
import { supabase } from '../../../src/config/supabaseClient';

@Controller('api/v1/booking')
export class BookingController {
    constructor(private readonly bookingService: BookingService) {}

    @Post('create')
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

    @Get('history')
    async getHistory() {
        return this.bookingService.getHistory();
    }

    @Get('requests')
    async getRequests() {
        return this.bookingService.getRequests();
    }

    @Put(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body('status') status: string
    ) {
        return this.bookingService.updateStatus(id, status);
    }
}