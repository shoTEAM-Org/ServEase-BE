import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Inject,
  OnModuleInit,
  HttpCode,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientKafka } from '@nestjs/microservices';
import { SupabaseClient } from '@supabase/supabase-js';
import { sendWithTimeout } from '../utils/kafka-request.js';
import { BOOKING_PATTERNS, CHAT_PATTERNS, PROVIDER_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';
import { VerifiedProviderGuard } from '../guards/verified-provider.guard.js';
import 'multer';

@Controller('api/provider')
export class ProviderController implements OnModuleInit {
  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
    private readonly supabase: SupabaseClient,
  ) {}

  private extractAccessToken(req: any): string {
    const authHeader = String(req?.headers?.authorization || '').trim();
    if (!authHeader) return '';
    const [scheme, token] = authHeader.split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== 'bearer') return '';
    return String(token || '').trim();
  }

  async onModuleInit() {
    [
      PROVIDER_PATTERNS.GET_STATUS,
      PROVIDER_PATTERNS.UPDATE_STATUS,
      PROVIDER_PATTERNS.GET_BY_SERVICE,
      PROVIDER_PATTERNS.SEARCH,
      PROVIDER_PATTERNS.GET_PROFILE,
      PROVIDER_PATTERNS.GET_DASHBOARD,
      PROVIDER_PATTERNS.GET_TRUST_SCORE,
      PROVIDER_PATTERNS.GET_REVIEWS,
      PROVIDER_PATTERNS.GET_BOOKINGS,
      PROVIDER_PATTERNS.GET_BOOKING_BY_ID,
      PROVIDER_PATTERNS.GET_AVAILABILITY,
      PROVIDER_PATTERNS.GET_RESERVED_SLOTS,
      PROVIDER_PATTERNS.CHECK_AVAILABILITY,
      PROVIDER_PATTERNS.SAVE_AVAILABILITY,
      BOOKING_PATTERNS.UPDATE_STATUS,
      PROVIDER_PATTERNS.UPDATE_BOOKING_STATUS,
      PROVIDER_PATTERNS.GET_MY_SERVICES,
      PROVIDER_PATTERNS.GET_PRICING_GUIDANCE,
      PROVIDER_PATTERNS.GET_PROFILE_DRAFT,
      PROVIDER_PATTERNS.GET_ADDITIONAL_CHARGES,
      PROVIDER_PATTERNS.SUBMIT_REVIEW,
      PROVIDER_PATTERNS.SUBMIT_REPORT,
      PROVIDER_PATTERNS.GET_REQUIRED_DOCUMENT_TYPES,
      PROVIDER_PATTERNS.GET_MY_VERIFICATION,
      PROVIDER_PATTERNS.UPLOAD_DOCUMENT,
      PROVIDER_PATTERNS.GET_MY_DOCUMENTS,
      PROVIDER_PATTERNS.DELETE_MY_DOCUMENT,
      PROVIDER_PATTERNS.SUBMIT_FOR_REVIEW,
      BOOKING_PATTERNS.UPDATE_STATUS_RPC,
    ].forEach((p) => this.kafka.subscribeToResponseOf(p));
  }

  // ========== STATIC ROUTES ==========

  @Get('v1')
  async getProviders(
    @Query('serviceId') serviceId?: string,
    @Query('search') search?: string,
  ) {
    if (serviceId)
      return sendWithTimeout(
        this.kafka.send(PROVIDER_PATTERNS.GET_BY_SERVICE, { serviceId }),
      );
    if (search)
      return sendWithTimeout(
        this.kafka.send(PROVIDER_PATTERNS.SEARCH, { searchTerm: search }),
      );
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.SEARCH, { searchTerm: '' }),
    );
  }

  @Get('v1/status')
  @UseGuards(SupabaseAuthGuard)
  async getStatus(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_STATUS, {
        providerId: req['user'].id,
      }),
    );
  }

  @Get('v1/status/direct')
  @UseGuards(SupabaseAuthGuard)
  async getStatusDirect(@Request() req: any) {
    // Direct database read to bypass Kafka issues
    const providerId = req['user'].id;

    try {
      const { data, error } = await this.supabase
        .schema('provider_catalog')
        .from('provider_status')
        .select('provider_id, status, last_updated')
        .eq('provider_id', providerId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new InternalServerErrorException(error.message);
      }

      // If no status record exists, return default status
      if (!data) {
        return {
          status: 'success',
          data: {
            provider_id: providerId,
            status: 'offline',
            updated_at: new Date().toISOString(),
          },
        };
      }

      return {
        status: 'success',
        data: {
          provider_id: data.provider_id,
          status: data.status,
          updated_at: data.last_updated || new Date().toISOString(),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException(
        error.message || 'Failed to get status',
      );
    }
  }

  @Patch('v1/status')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(200)
  async updateStatus(@Request() req: any, @Body('status') status: string) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.UPDATE_STATUS, {
        providerId: req['user'].id,
        status,
      }),
    );
  }

  @Patch('v1/status/direct')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(200)
  async updateStatusDirect(
    @Request() req: any,
    @Body('status') status: string,
  ) {
    // Direct database update to bypass Kafka issues
    const providerId = req['user'].id;
    const normalizedStatus = status?.toLowerCase()?.trim();

    if (
      !['online', 'on_the_way', 'arrived', 'busy', 'offline'].includes(
        normalizedStatus,
      )
    ) {
      throw new BadRequestException('Invalid status');
    }

    try {
      // Try to update existing record
      const { data: updateData, error: updateError } = await this.supabase
        .schema('provider_catalog')
        .from('provider_status')
        .update({
          status: normalizedStatus,
          last_updated: new Date().toISOString(),
        })
        .eq('provider_id', providerId)
        .select()
        .single();

      // If no rows updated, insert new record
      if (updateError && updateError.code === 'PGRST116') {
        const { data: insertData, error: insertError } = await this.supabase
          .schema('provider_catalog')
          .from('provider_status')
          .insert({
            provider_id: providerId,
            status: normalizedStatus,
            last_updated: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) {
          throw new InternalServerErrorException(insertError.message);
        }

        // Create timeline events for active bookings (fire and forget)
        this.createTimelineEventsForProviderStatus(
          providerId,
          normalizedStatus,
        ).catch(() => {
          // Silently ignore timeline errors
        });

        return {
          status: 'success',
          data: {
            provider_id: insertData.provider_id,
            status: insertData.status,
            updated_at: insertData.last_updated,
          },
        };
      }

      if (updateError) {
        throw new InternalServerErrorException(updateError.message);
      }

      // Create timeline events for active bookings (fire and forget)
      this.createTimelineEventsForProviderStatus(
        providerId,
        normalizedStatus,
      ).catch(() => {
        // Silently ignore timeline errors
      });

      return {
        status: 'success',
        data: {
          provider_id: updateData.provider_id,
          status: updateData.status,
          updated_at: updateData.last_updated,
        },
      };
    } catch (error) {
      throw new InternalServerErrorException(
        error.message || 'Failed to update status',
      );
    }
  }

  private async createTimelineEventsForProviderStatus(
    providerId: string,
    status: string,
  ) {
    try {
      // Get active bookings for this provider
      const { data: bookings, error: bookingsError } = await this.supabase
        .schema('booking')
        .from('bookings')
        .select('id')
        .eq('provider_id', providerId)
        .in('status', ['confirmed', 'in_progress']);

      if (bookingsError || !bookings || bookings.length === 0) {
        return;
      }

      // Map status to label
      const statusLabels: Record<string, string> = {
        online: 'Provider is online',
        on_the_way: 'Provider is on the way',
        arrived: 'Provider has arrived',
        busy: 'Provider is busy',
        offline: 'Provider is offline',
      };

      const label = statusLabels[status] || `Provider status: ${status}`;

      // Insert timeline events for all active bookings
      const timelineEvents = bookings.map((booking) => ({
        booking_id: booking.id,
        event_type: 'provider-status',
        label,
        icon: status,
      }));

      await this.supabase
        .schema('booking')
        .from('booking_timeline_events')
        .insert(timelineEvents);
    } catch {
      // Silently ignore timeline errors
    }
  }

  @Get('v1/bookings')
  @UseGuards(SupabaseAuthGuard)
  async getBookings(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_BOOKINGS, {
        providerId: req['user'].id,
      }),
    );
  }

  @Get('v1/booking/:id')
  @UseGuards(SupabaseAuthGuard)
  async getBookingById(@Param('id') id: string, @Request() req: any) {
    if (req['user']?.role !== 'provider') {
      throw new ForbiddenException('Only providers can use provider booking routes');
    }

    const providerId = String(req['user'].id || '').trim();
    const bookingId = String(id || '').trim();
    if (!bookingId) throw new BadRequestException('Booking id is required');

    const { data: booking, error } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select(
        `
        *,
        timeline:booking_timeline_events(event_type, label, icon, created_at)
      `,
      )
      .eq('id', bookingId)
      .eq('provider_id', providerId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!booking) throw new ForbiddenException('Booking is not assigned to this provider');

    return { booking };
  }

  @Patch('v1/booking/:id/status')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async updateBookingStatus(
    @Param('id') id: string,
    @Request() req: any,
    @Body('status') status: string,
  ) {
    if (req['user']?.role !== 'provider') {
      throw new ForbiddenException('Only providers can update provider booking status');
    }
    return this.updateBookingStatusDirect(id, req['user'].id, status);
  }

  private async updateBookingStatusDirect(id: string, providerId: string, status: string) {
    const bookingId = String(id || '').trim();
    const normalizedProviderId = String(providerId || '').trim();
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const allowedStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
    const validTransitions: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!bookingId) throw new BadRequestException('Booking id is required');
    if (!allowedStatuses.includes(normalizedStatus)) {
      throw new BadRequestException('Unsupported booking status');
    }

    const { data: booking, error: bookingError } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('id, provider_id, status')
      .eq('id', bookingId)
      .maybeSingle();

    if (bookingError) throw new InternalServerErrorException(bookingError.message);
    if (!booking || String(booking.provider_id) !== normalizedProviderId) {
      throw new ForbiddenException('Booking is not assigned to this provider');
    }

    const currentStatus = String(booking.status || '').trim().toLowerCase();
    if (!(validTransitions[currentStatus] || []).includes(normalizedStatus)) {
      throw new BadRequestException(
        `Cannot transition booking from '${currentStatus}' to '${normalizedStatus}'`,
      );
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: normalizedStatus,
      updated_at: now,
    };
    if (normalizedStatus === 'in_progress') updates.started_at = now;
    if (normalizedStatus === 'completed') updates.completed_at = now;

    const { data: updated, error: updateError } = await this.supabase
      .schema('booking')
      .from('bookings')
      .update(updates)
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) throw new BadRequestException(updateError.message);

    const labels: Record<string, string> = {
      pending: 'Request created',
      confirmed: 'Provider accepted your booking',
      in_progress: 'Provider started your service',
      completed: 'Service completed',
      cancelled: 'Booking cancelled',
    };

    await this.supabase
      .schema('booking')
      .from('booking_timeline_events')
      .insert({
        booking_id: bookingId,
        event_type: 'status-change',
        label: labels[normalizedStatus],
        icon: normalizedStatus,
        created_at: now,
      });

    return { message: 'Booking status updated successfully.', booking: updated };

  @Put('v1/availability')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async saveAvailability(@Request() req: any, @Body() body: any) {
    const accessToken = this.extractAccessToken(req) || undefined;
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.SAVE_AVAILABILITY, {
        ...body,
        userId: req['user'].id,
        accessToken,
      }),
    );
  }

  @Get('v1/my-services')
  @UseGuards(SupabaseAuthGuard)
  async getMyServices(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_MY_SERVICES, {
        providerId: req['user'].id,
      }),
    );
  }

  @Post('v1/pricing-guidance')
  @UseGuards(SupabaseAuthGuard, VerifiedProviderGuard)
  async getPricingGuidance(@Request() req: any, @Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_PRICING_GUIDANCE, {
        ...body,
        providerId: req['user'].id,
      }),
    );
  }

  @Post('v1/my-services')
  @UseGuards(SupabaseAuthGuard, VerifiedProviderGuard)
  @HttpCode(202)
  async createMyService(@Request() req: any, @Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.CREATE_MY_SERVICE, {
      ...body,
      providerId: req['user'].id,
    });
    return { status: 'accepted' };
  }

  @Patch('v1/my-services/:serviceId')
  @UseGuards(SupabaseAuthGuard, VerifiedProviderGuard)
  @HttpCode(202)
  async updateMyService(
    @Param('serviceId') serviceId: string,
    @Request() req: any,
    @Body() body: any,
  ) {
    this.kafka.emit(PROVIDER_PATTERNS.UPDATE_MY_SERVICE, {
      ...body,
      serviceId,
      providerId: req['user'].id,
    });
    return { status: 'accepted' };
  }

  @Delete('v1/my-services/:serviceId')
  @UseGuards(SupabaseAuthGuard, VerifiedProviderGuard)
  @HttpCode(202)
  async deleteMyService(
    @Param('serviceId') serviceId: string,
    @Request() req: any,
  ) {
    this.kafka.emit(PROVIDER_PATTERNS.DELETE_MY_SERVICE, {
      serviceId,
      providerId: req['user'].id,
    });
    return { status: 'accepted' };
  }

  @Post('v1/additional-charges')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async createAdditionalCharges(@Request() req: any, @Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.CREATE_ADDITIONAL_CHARGES, {
      ...body,
      providerId: req['user'].id,
    });
    return { status: 'accepted' };
  }

  @Get('v1/additional-charges/:bookingId')
  @UseGuards(SupabaseAuthGuard)
  async getAdditionalCharges(
    @Param('bookingId') bookingId: string,
    @Request() req: any,
  ) {
    const normalizedBookingId = String(bookingId || '').trim();
    const requesterId = String(req?.['user']?.id || '').trim();
    if (!normalizedBookingId) throw new BadRequestException('bookingId is required');

    const { data: booking, error: bookingError } = await this.supabase
      .schema('booking')
      .from('bookings')
      .select('id, customer_id, provider_id')
      .eq('id', normalizedBookingId)
      .maybeSingle();

    if (bookingError) throw new InternalServerErrorException(bookingError.message);
    if (
      !booking ||
      ![booking.customer_id, booking.provider_id].map(String).includes(requesterId)
    ) {
      throw new ForbiddenException('Booking charges are not available to this user');
    }

    const { data, error } = await this.supabase
      .schema('booking')
      .from('additional_charges')
      .select('*')
      .eq('booking_id', normalizedBookingId)
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return { charges: data || [] };
  }

  @Patch('v1/additional-charges/review')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async reviewAdditionalCharges(@Request() req: any, @Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.REVIEW_ADDITIONAL_CHARGES, {
      ...body,
      requesterId: req['user'].id,
      requesterRole: req['user'].role,
    });
    return { status: 'accepted' };
  }

  @Post('v1/reviews')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async submitReview(@Request() req: any, @Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.SUBMIT_REVIEW, {
        ...body,
        reviewee_id: body?.reviewee_id || body?.provider_id,
        reviewer_id: req['user'].id,
      }),
    );
  }

  @Post('v1/reports')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async submitReport(@Request() req: any, @Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.SUBMIT_REPORT, {
        ...body,
        reporter_id: req['user'].id,
      }),
    );
  }

  @Patch('v1/kyc/reupload')
  @UseGuards(SupabaseAuthGuard)
  @UseInterceptors(
    FileInterceptor('document_file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @HttpCode(202)
  async reuploadKyc(
    @UploadedFile() file: Express.Multer.File,
    @Body('user_id') _userId: string,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('A document file is required');
    const payload = {
      userId: req['user'].id,
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer.toString('base64'),
      },
    };
    this.kafka.emit(PROVIDER_PATTERNS.REUPLOAD_KYC, payload);
    return { status: 'accepted' };
  }

  @Get('v1/verification/document-types')
  @UseGuards(SupabaseAuthGuard)
  async getRequiredDocumentTypes() {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_REQUIRED_DOCUMENT_TYPES, {}),
    );
  }

  @Get('v1/me/required-documents')
  @UseGuards(SupabaseAuthGuard)
  async getMyRequiredDocuments() {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_REQUIRED_DOCUMENT_TYPES, {}),
    );
  }

  @Get('v1/me/verification')
  @UseGuards(SupabaseAuthGuard)
  async getMyVerification(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_MY_VERIFICATION, {
        userId: req['user'].id,
      }),
    );
  }

  @Get('v1/me/documents')
  @UseGuards(SupabaseAuthGuard)
  async getMyDocuments(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_MY_DOCUMENTS, {
        userId: req['user'].id,
      }),
    );
  }

  @Post('v1/me/documents')
  @UseGuards(SupabaseAuthGuard)
  @UseInterceptors(
    FileInterceptor('document_file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body('document_type') documentType: string,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('A document file is required');
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.UPLOAD_DOCUMENT, {
        userId: req['user'].id,
        document_type: documentType,
        file: {
          originalname: file.originalname,
          mimetype: file.mimetype,
          buffer: file.buffer.toString('base64'),
        },
      }),
    );
  }

  @Delete('v1/me/documents/:documentId')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async deleteMyDocument(
    @Param('documentId') documentId: string,
    @Request() req: any,
  ) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.DELETE_MY_DOCUMENT, {
        userId: req['user'].id,
        documentId,
      }),
    );
  }

  @Post('v1/me/submit-for-review')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async submitForReview(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.SUBMIT_FOR_REVIEW, {
        userId: req['user'].id,
      }),
    );
  }

  // ========== PARAMETERIZED ROUTES ==========

  @Get('v1/:id/availability')
  async getAvailability(@Param('id') id: string) {
    const providerId = String(id || '').trim();
    if (!providerId) throw new BadRequestException('Provider id is required');

    const [weeklyResult, windowsResult, daysOffResult] = await Promise.all([
      this.supabase
        .schema('booking')
        .from('provider_availability')
        .select('*')
        .eq('user_id', providerId),
      this.supabase
        .schema('booking')
        .from('provider_availability_windows')
        .select('*')
        .eq('user_id', providerId)
        .order('sort_order', { ascending: true })
        .order('start_time', { ascending: true }),
      this.supabase
        .schema('booking')
        .from('provider_days_off')
        .select('*')
        .eq('user_id', providerId),
    ]);

    if (weeklyResult.error) {
      throw new InternalServerErrorException(weeklyResult.error.message);
    }
    if (windowsResult.error) {
      throw new InternalServerErrorException(windowsResult.error.message);
    }
    if (daysOffResult.error) {
      throw new InternalServerErrorException(daysOffResult.error.message);
    }

    return {
      weeklySchedule: weeklyResult.data || [],
      availabilityWindows: windowsResult.data || [],
      daysOff: daysOffResult.data || [],
    };
  }

  @Get('v1/:id/reserved-slots')
  async getReservedSlots(@Param('id') id: string, @Query('date') date: string) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_RESERVED_SLOTS, {
        providerId: id,
        date,
      }),
    );
  }

  @Get('v1/:id/availability/check')
  async checkAvailability(
    @Param('id') id: string,
    @Query('scheduled_at') scheduledAt: string,
    @Query('hours_required') hoursRequired: string,
  ) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.CHECK_AVAILABILITY, {
        providerId: id,
        scheduledAt,
        hoursRequired,
      }),
    );
  }

  @Get('v1/:id/profile-draft')
  @UseGuards(SupabaseAuthGuard)
  async getProfileDraft(@Param('id') id: string, @Request() req: any) {
    if (String(req['user']?.id || '').trim() !== String(id || '').trim()) {
      throw new ForbiddenException('Provider profile draft access denied');
    }
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_PROFILE_DRAFT, {
        userId: id,
      }),
    );
  }

  @Patch('v1/:id/profile-draft')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async saveProfileDraft(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: any,
  ) {
    if (String(req['user']?.id || '').trim() !== String(id || '').trim()) {
      throw new ForbiddenException('Provider profile draft access denied');
    }
    this.kafka.emit(PROVIDER_PATTERNS.SAVE_PROFILE_DRAFT, {
      ...body,
      userId: id,
    });
    return { status: 'accepted' };
  }

  @Patch('v1/profile')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async updateProviderProfile(@Request() req: any, @Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.SAVE_PROFILE_DRAFT, {
      ...body,
      userId: req['user'].id,
    });
    return { status: 'accepted' };
  }

  @Get('v1/:user_id')
  @UseGuards(SupabaseAuthGuard)
  async getProfile(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_PROFILE, {
        userId: req['user'].id,
      }),
    );
  }

  @Get('v1/dashboard/:id')
  @UseGuards(SupabaseAuthGuard)
  async getDashboard(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_DASHBOARD, {
        providerId: req['user'].id,
      }),
    );
  }

  @Get('v1/trust-score/:provider_id')
  async getTrustScore(@Param('provider_id') providerId: string) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_TRUST_SCORE, { providerId }),
    );
  }

  @Get('v1/reviews/:id')
  async getReviews(@Param('id') id: string) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_REVIEWS, { providerId: id }),
    );
  }

  // Review Response endpoints
  @Post('v1/reviews/:reviewId/response')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(201)
  async createReviewResponse(
    @Request() req: any,
    @Param('reviewId') reviewId: string,
    @Body() body: { response_text: string },
  ) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.CREATE_REVIEW_RESPONSE, {
        review_id: reviewId,
        responder_id: req['user'].id,
        response_text: body.response_text,
      }),
    );
  }

  @Patch('v1/reviews/:reviewId/response')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(200)
  async updateReviewResponse(
    @Request() req: any,
    @Param('reviewId') reviewId: string,
    @Body() body: { response_text: string },
  ) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.UPDATE_REVIEW_RESPONSE, {
        review_id: reviewId,
        responder_id: req['user'].id,
        response_text: body.response_text,
      }),
    );
  }

  @Get('v1/reviews/:reviewId/response')
  @UseGuards(SupabaseAuthGuard)
  async getReviewWithResponse(@Param('reviewId') reviewId: string) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_REVIEW_WITH_RESPONSE, { reviewId }),
    );
  }
}
