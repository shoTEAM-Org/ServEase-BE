import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Inject,
  OnModuleInit,
  HttpCode,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { SupabaseClient } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { sendWithTimeout } from '../utils/kafka-request.js';
import { BOOKING_PATTERNS, PROVIDER_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/booking')
@UseGuards(SupabaseAuthGuard)
export class BookingController implements OnModuleInit {
  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
    private readonly supabase: SupabaseClient,
  ) {}

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
      BOOKING_PATTERNS.UPDATE_STATUS,
      BOOKING_PATTERNS.CANCEL,
      BOOKING_PATTERNS.GET_ATTACHMENTS,
      BOOKING_PATTERNS.SAVE_ATTACHMENTS,
      BOOKING_PATTERNS.LOCATION_PING,
      BOOKING_PATTERNS.LOCATION_LATEST,
      BOOKING_PATTERNS.LOCATION_TRAIL,
      PROVIDER_PATTERNS.GET_PROFILES_BY_IDS,
    ].forEach((p) => this.kafka.subscribeToResponseOf(p));
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
  async getHistory(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(BOOKING_PATTERNS.GET_HISTORY, {
        requesterId: req['user'].id,
      }),
    );
  }

  @Get('v1/requests')
  async getRequests(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(BOOKING_PATTERNS.GET_REQUESTS, {
        providerId: req['user'].id,
      }),
    );
  }

  @Post('v1/:id/location')
  @HttpCode(202)
  async postLocation(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: any,
  ) {
    return sendWithTimeout(
      this.kafka.send(BOOKING_PATTERNS.LOCATION_PING, {
        bookingId: id,
        providerId: req['user'].id,
        latitude: body.latitude,
        longitude: body.longitude,
      }),
    );
  }

  @Get('v1/:id/location')
  async getLatestLocation(@Param('id') id: string, @Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(BOOKING_PATTERNS.LOCATION_LATEST, {
        bookingId: id,
        requesterId: req['user'].id,
      }),
    );
  }

  @Get('v1/:id/location/trail')
  async getLocationTrail(
    @Param('id') id: string,
    @Request() req: any,
    @Query('limit') limit = '50',
  ) {
    return sendWithTimeout(
      this.kafka.send(BOOKING_PATTERNS.LOCATION_TRAIL, {
        bookingId: id,
        requesterId: req['user'].id,
        limit: Number(limit),
      }),
    );
  }

  @Get('v1/:id')
  async getById(@Param('id') id: string, @Request() req: any) {
    const result = await sendWithTimeout<any>(
      this.kafka.send(BOOKING_PATTERNS.GET_BY_ID, {
        id,
        requesterId: req['user'].id,
      }),
    );
    const booking = result?.booking;
    const providerId = String(booking?.provider_id || '').trim();

    // Enrich with provider profile in background (non-blocking)
    if (booking && providerId) {
      // Fire and forget - don't wait for this
      firstValueFrom(
        this.kafka
          .send(PROVIDER_PATTERNS.GET_PROFILES_BY_IDS, {
            userIds: [providerId],
          })
          .pipe(catchError(() => of(null))),
      )
        .then((profileResponse: any) => {
          if (!profileResponse) return;
          const profiles = Array.isArray(profileResponse?.profiles)
            ? profileResponse.profiles
            : [];
          const profile =
            profiles.find(
              (row: any) => String(row?.user_id || '').trim() === providerId,
            ) || profiles[0];
          if (profile && booking.provider) {
            booking.provider.business_name =
              String(profile?.business_name || '').trim() || null;
            booking.provider.average_rating =
              profile?.average_rating == null
                ? null
                : Number(profile.average_rating);
          }
        })
        .catch(() => {
          // Silently fail - booking is still usable without profile enrichment
        });
    }

    return result;
  }

  @Patch('v1/:id/status')
  @HttpCode(202)
  async updateStatus(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: any,
  ) {
    return sendWithTimeout(
      this.kafka.send(BOOKING_PATTERNS.UPDATE_STATUS, {
        id,
        status: body.status,
        providerId: req['user'].id,
      }),
    );
  }

  @Patch('v1/:id/provider-progress')
  @HttpCode(200)
  async updateProviderProgress(
    @Param('id') id: string,
    @Request() req: any,
    @Body('status') status: string,
  ) {
    if (req?.['user']?.role !== 'provider') {
      throw new ForbiddenException('Only providers can update booking progress');
    }

    const providerId = String(req?.['user']?.id || '').trim();
    const bookingId = String(id || '').trim();
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const labels: Record<string, string> = {
      on_the_way: 'Provider is on the way',
      arrived: 'Provider has arrived',
      busy: 'Provider started your service',
    };

    if (!bookingId) throw new BadRequestException('booking id is required');
    if (!labels[normalizedStatus]) {
      throw new BadRequestException('status must be one of: on_the_way, arrived, busy');
    }

    const { data: booking, error: bookingError } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('id, provider_id, status')
      .eq('id', bookingId)
      .maybeSingle();

    if (bookingError) throw new BadRequestException(bookingError.message);
    if (!booking) throw new NotFoundException('Booking not found');
    if (String(booking.provider_id) !== providerId) {
      throw new ForbiddenException('Only the assigned provider can update progress');
    }
    if (!['confirmed', 'in_progress'].includes(String(booking.status))) {
      throw new BadRequestException('Provider progress can only be updated for active bookings');
    }

    const now = new Date().toISOString();
    const { error: statusError } = await this.supabase
      .schema('provider_catalog')
      .from('provider_status')
      .upsert(
        {
          provider_id: providerId,
          status: normalizedStatus,
          current_booking_id: bookingId,
          last_updated: now,
        },
        { onConflict: 'provider_id' },
      );
    if (statusError) throw new BadRequestException(statusError.message);

    const { data: existingEvent, error: existingEventError } = await this.supabase
      .schema('booking')
      .from('booking_timeline_events')
      .select('event_type, label, icon, created_at')
      .eq('booking_id', bookingId)
      .eq('event_type', 'provider-status')
      .eq('icon', normalizedStatus)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingEventError) throw new BadRequestException(existingEventError.message);

    const event = existingEvent || (await this.supabase
      .schema('booking')
      .from('booking_timeline_events')
      .insert({
        booking_id: bookingId,
        event_type: 'provider-status',
        label: labels[normalizedStatus],
        icon: normalizedStatus,
        created_at: now,
      })
      .select('event_type, label, icon, created_at')
      .single()).data;

    if (!event) {
      throw new BadRequestException('Unable to update booking timeline');
    }

    return {
      status: 'success',
      event,
      provider_status: {
        provider_id: providerId,
        status: normalizedStatus,
        updated_at: now,
      },
    };
  }

  @Patch('v1/:id/cancel')
  @HttpCode(202)
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
        userId: req['user'].id,
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
        userId: req['user'].id,
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
