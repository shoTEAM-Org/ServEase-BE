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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientKafka } from '@nestjs/microservices';
import { sendWithTimeout } from '../utils/kafka-request.js';
import { BOOKING_PATTERNS, CHAT_PATTERNS, PROVIDER_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';
import 'multer';

@Controller('api/provider')
export class ProviderController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  private extractAccessToken(req: any): string {
    const authHeader = String(req?.headers?.authorization || '').trim();
    if (!authHeader) return '';
    const [scheme, token] = authHeader.split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== 'bearer') return '';
    return String(token || '').trim();
  }

  async onModuleInit() {
    [
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
      PROVIDER_PATTERNS.GET_MY_SERVICES,
      PROVIDER_PATTERNS.GET_PROFILE_DRAFT,
      PROVIDER_PATTERNS.GET_RESCHEDULES,
      PROVIDER_PATTERNS.GET_ADDITIONAL_CHARGES,
      BOOKING_PATTERNS.UPDATE_STATUS_RPC,
    ].forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
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
    return { success: true, data: [] };
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
  async getBookingById(@Param('id') id: string) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_BOOKING_BY_ID, { bookingId: id }),
    );
  }

  @Patch('v1/booking/:id/status')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async updateBookingStatus(
    @Param('id') id: string,
    @Request() req: any,
    @Body('status') status: string,
  ) {
    const result = await sendWithTimeout(
      this.kafka.send(BOOKING_PATTERNS.UPDATE_STATUS_RPC, {
        id,
        status,
        actorId: req['user'].id,
        actorRole: 'provider',
      }),
    );
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (normalizedStatus === 'confirmed') {
      this.kafka.emit(CHAT_PATTERNS.ENSURE_CONVERSATION, { bookingId: id });
    }
    return result;
  }

  @Put('v1/availability')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async saveAvailability(@Request() req: any, @Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.SAVE_AVAILABILITY, {
      userId: req['user'].id,
      accessToken: this.extractAccessToken(req),
      ...body,
    });
    return { status: 'accepted' };
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

  @Post('v1/my-services')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async createMyService(@Request() req: any, @Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.CREATE_MY_SERVICE, {
      providerId: req['user'].id,
      ...body,
    });
    return { status: 'accepted' };
  }

  @Patch('v1/my-services/:serviceId')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async updateMyService(
    @Param('serviceId') serviceId: string,
    @Request() req: any,
    @Body() body: any,
  ) {
    this.kafka.emit(PROVIDER_PATTERNS.UPDATE_MY_SERVICE, {
      serviceId,
      providerId: req['user'].id,
      ...body,
    });
    return { status: 'accepted' };
  }

  @Delete('v1/my-services/:serviceId')
  @UseGuards(SupabaseAuthGuard)
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

  @Post('v1/reschedule-requests')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async createReschedule(@Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.CREATE_RESCHEDULE, body);
    return { status: 'accepted' };
  }

  @Get('v1/reschedule-requests/:bookingId')
  @UseGuards(SupabaseAuthGuard)
  async getReschedules(@Param('bookingId') bookingId: string) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_RESCHEDULES, { bookingId }),
    );
  }

  @Patch('v1/reschedule-requests/:requestId/review')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async reviewReschedule(
    @Param('requestId') requestId: string,
    @Body() body: any,
  ) {
    this.kafka.emit(PROVIDER_PATTERNS.REVIEW_RESCHEDULE, {
      requestId,
      ...body,
    });
    return { status: 'accepted' };
  }

  @Post('v1/additional-charges')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async createAdditionalCharges(@Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.CREATE_ADDITIONAL_CHARGES, body);
    return { status: 'accepted' };
  }

  @Get('v1/additional-charges/:bookingId')
  @UseGuards(SupabaseAuthGuard)
  async getAdditionalCharges(@Param('bookingId') bookingId: string) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_ADDITIONAL_CHARGES, { bookingId }),
    );
  }

  @Patch('v1/additional-charges/review')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async reviewAdditionalCharges(@Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.REVIEW_ADDITIONAL_CHARGES, body);
    return { status: 'accepted' };
  }

  @Post('v1/reviews')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async submitReview(@Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.SUBMIT_REVIEW, body);
    return { status: 'accepted' };
  }

  @Post('v1/reports')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async submitReport(@Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.SUBMIT_REPORT, body);
    return { status: 'accepted' };
  }

  @Patch('v1/kyc/reupload')
  @UseGuards(SupabaseAuthGuard)
  @UseInterceptors(FileInterceptor('document_file'))
  @HttpCode(202)
  async reuploadKyc(
    @UploadedFile() file: Express.Multer.File,
    @Body('user_id') userId: string,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('A document file is required');
    const payload = {
      userId: userId || req['user'].id,
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        buffer: file.buffer.toString('base64'),
      },
    };
    this.kafka.emit(PROVIDER_PATTERNS.REUPLOAD_KYC, payload);
    return { status: 'accepted' };
  }

  // ========== PARAMETERIZED ROUTES ==========

  @Get('v1/:id/availability')
  async getAvailability(@Param('id') id: string, @Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_AVAILABILITY, {
        userId: id,
        accessToken: this.extractAccessToken(req),
      }),
    );
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
  async getProfileDraft(@Param('id') id: string) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_PROFILE_DRAFT, { userId: id }),
    );
  }

  @Patch('v1/:id/profile-draft')
  @HttpCode(202)
  async saveProfileDraft(@Param('id') id: string, @Body() body: any) {
    this.kafka.emit(PROVIDER_PATTERNS.SAVE_PROFILE_DRAFT, {
      userId: id,
      ...body,
    });
    return { status: 'accepted' };
  }

  @Get('v1/:user_id')
  async getProfile(@Param('user_id') userId: string) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_PROFILE, { userId }),
    );
  }

  @Get('v1/dashboard/:id')
  @UseGuards(SupabaseAuthGuard)
  async getDashboard(@Param('id') id: string) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_DASHBOARD, { providerId: id }),
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
}
