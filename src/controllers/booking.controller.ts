import {
  Controller,
  Post,
  Get,
  Patch,
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
import { BOOKING_PATTERNS, PROVIDER_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/booking')
@UseGuards(SupabaseAuthGuard)
export class BookingController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  private extractAccessToken(req: any): string {
    const authHeader = String(req?.headers?.authorization || '').trim();
    if (!authHeader) return '';
    const [scheme, token] = authHeader.split(/\s+/);
    if (scheme?.toLowerCase() !== 'bearer') return '';
    return String(token || '').trim();
  }

  async onModuleInit() {
    [
      BOOKING_PATTERNS.CREATE,
      BOOKING_PATTERNS.GET_CUSTOMER_BOOKINGS,
      BOOKING_PATTERNS.GET_HISTORY,
      BOOKING_PATTERNS.GET_REQUESTS,
      BOOKING_PATTERNS.GET_BY_ID,
      BOOKING_PATTERNS.GET_ATTACHMENTS,
      BOOKING_PATTERNS.SAVE_ATTACHMENTS,
      BOOKING_PATTERNS.CANCEL,
      PROVIDER_PATTERNS.GET_PROFILES_BY_IDS,
    ].forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  @Post('v1/create')
  async create(@Body() dto: any, @Request() req: any) {
    const payload = {
      ...dto,
      customerId: req['user'].id,
    };

    try {
      return await sendWithTimeout(
        this.kafka.send(BOOKING_PATTERNS.CREATE, payload),
      );
    } catch (error: any) {
      console.error('[gateway.booking.create] failed', {
        customerId: payload?.customerId,
        providerId: payload?.provider_id,
        serviceId: payload?.service_id,
        scheduledAt: payload?.scheduled_at,
        totalAmount: payload?.total_amount,
        message: error?.message,
        details: error?.response || error,
      });
      throw error;
    }
  }

  @Get('v1/customer')
  async getCustomerBookings(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(BOOKING_PATTERNS.GET_CUSTOMER_BOOKINGS, {
        customerId: req['user'].id,
      }),
    );
  }

  @Get('v1/history')
  async getHistory() {
    return sendWithTimeout(this.kafka.send(BOOKING_PATTERNS.GET_HISTORY, {}));
  }

  @Get('v1/requests')
  async getRequests() {
    return sendWithTimeout(this.kafka.send(BOOKING_PATTERNS.GET_REQUESTS, {}));
  }

  @Get('v1/:id')
  async getById(@Param('id') id: string) {
    const result = await sendWithTimeout<any>(
      this.kafka.send(BOOKING_PATTERNS.GET_BY_ID, { id }),
    );
    const booking = result?.booking;
    const providerId = String(booking?.provider_id || '').trim();
    if (booking && providerId) {
      try {
        const profileResponse = await sendWithTimeout<any>(
          this.kafka.send(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS, {
            userIds: [providerId],
          }),
        );
        const profiles = Array.isArray(profileResponse?.profiles)
          ? profileResponse.profiles
          : [];
        const profile =
          profiles.find(
            (row: any) => String(row?.user_id || '').trim() === providerId,
          ) || profiles[0];
        if (profile) {
          booking.provider = {
            ...booking.provider,
            business_name:
              String(profile?.business_name || '').trim() || null,
            average_rating:
              profile?.average_rating == null
                ? null
                : Number(profile.average_rating),
          };
        }
      } catch {
        // provider-service unavailable: return booking without profile enrichment
      }
    }

    return result;
  }

  @Patch('v1/:id/status')
  @HttpCode(202)
  async updateStatus(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(BOOKING_PATTERNS.UPDATE_STATUS, {
      id,
      status: body.status,
    });
    return { status: 'accepted' };
  }

  @Patch('v1/:id/cancel')
  async cancel(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: any,
  ) {
    return sendWithTimeout(
      this.kafka.send(BOOKING_PATTERNS.CANCEL, {
        id,
        userId: req['user'].id,
        reason: body.reason,
        explanation: body.explanation,
      }),
    );
  }

  @Get('v1/:id/attachments')
  async getAttachments(@Param('id') id: string, @Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(BOOKING_PATTERNS.GET_ATTACHMENTS, {
        bookingId: id,
        accessToken: this.extractAccessToken(req),
      }),
    );
  }

  @Post('v1/:id/attachments')
  async saveAttachments(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: any,
  ) {
    return sendWithTimeout(
      this.kafka.send(BOOKING_PATTERNS.SAVE_ATTACHMENTS, {
        bookingId: id,
        attachments: body.attachments,
        accessToken: this.extractAccessToken(req),
      }),
    );
  }

  @Post('v1/:id/disputes')
  @HttpCode(202)
  async createDispute(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: any,
  ) {
    this.kafka.emit(BOOKING_PATTERNS.CREATE_DISPUTE, {
      bookingId: id,
      userId: req['user'].id,
      reason: body.reason,
    });
    return { status: 'accepted' };
  }
}
