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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientKafka } from '@nestjs/microservices';
import { sendWithTimeout } from '../utils/kafka-request.js';
import { PROVIDER_PATTERNS } from '@app/common';
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
      PROVIDER_PATTERNS.SAVE_AVAILABILITY,
      PROVIDER_PATTERNS.UPDATE_BOOKING_STATUS,
      PROVIDER_PATTERNS.GET_MY_SERVICES,
      PROVIDER_PATTERNS.GET_PROFILE_DRAFT,
      PROVIDER_PATTERNS.GET_ADDITIONAL_CHARGES,
      PROVIDER_PATTERNS.SUBMIT_REVIEW,
      PROVIDER_PATTERNS.SUBMIT_REPORT,
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
  async getBookingById(@Param('id') id: string, @Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_BOOKING_BY_ID, {
        bookingId: id,
        providerId: req['user'].id,
      }),
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
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.UPDATE_BOOKING_STATUS, {
        bookingId: id,
        providerId: req['user'].id,
        status,
      }),
    );
  }

  @Put('v1/availability')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async saveAvailability(@Request() req: any, @Body() body: any) {
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.SAVE_AVAILABILITY, {
        ...body,
        userId: req['user'].id,
        accessToken: this.extractAccessToken(req),
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

  @Post('v1/my-services')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async createMyService(@Request() req: any, @Body() body: any) {
    if (String(req['user']?.role || '').trim() !== 'provider') {
      throw new ForbiddenException('Provider access required');
    }
    this.kafka.emit(PROVIDER_PATTERNS.CREATE_MY_SERVICE, {
      ...body,
      providerId: req['user'].id,
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
    if (String(req['user']?.role || '').trim() !== 'provider') {
      throw new ForbiddenException('Provider access required');
    }
    this.kafka.emit(PROVIDER_PATTERNS.UPDATE_MY_SERVICE, {
      ...body,
      serviceId,
      providerId: req['user'].id,
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
    if (String(req['user']?.role || '').trim() !== 'provider') {
      throw new ForbiddenException('Provider access required');
    }
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
    return sendWithTimeout(
      this.kafka.send(PROVIDER_PATTERNS.GET_ADDITIONAL_CHARGES, {
        bookingId,
        providerId: req['user'].id,
      }),
    );
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
  @UseInterceptors(FileInterceptor('document_file'))
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
  async saveProfileDraft(@Param('id') id: string, @Request() req: any, @Body() body: any) {
    if (String(req['user']?.id || '').trim() !== String(id || '').trim()) {
      throw new ForbiddenException('Provider profile draft access denied');
    }
    this.kafka.emit(PROVIDER_PATTERNS.SAVE_PROFILE_DRAFT, {
      ...body,
      userId: id,
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
}
