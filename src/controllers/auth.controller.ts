import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Inject,
  OnModuleInit,
  HttpCode,
  UnauthorizedException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientKafka } from '@nestjs/microservices';
import { SupabaseClient } from '@supabase/supabase-js';
import { catchError } from 'rxjs';
import { sendWithTimeout } from '../utils/kafka-request.js';
import { AUTH_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';
import { AdminRoleGuard } from '../guards/admin-role.guard.js';
import 'multer';

@Controller('api/auth')
export class AuthController implements OnModuleInit {
  constructor(
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
    private readonly supabase: SupabaseClient,
  ) {}

  async onModuleInit() {
    [
      AUTH_PATTERNS.REGISTER_CUSTOMER,
      AUTH_PATTERNS.LOGIN,
      AUTH_PATTERNS.REGISTER_PROVIDER,
      AUTH_PATTERNS.REFRESH,
      AUTH_PATTERNS.GET_ME,
      AUTH_PATTERNS.GET_PROFILE,
    ].forEach((p) => this.kafka.subscribeToResponseOf(p));
  }

  @Post('v1/register/customer')
  async register(@Body() dto: any) {
    const payload = {
      ...dto,
      role: 'customer',
    };
    return sendWithTimeout(
      this.kafka.send(AUTH_PATTERNS.REGISTER_CUSTOMER, payload),
    );
  }

  @Post('v1/register')
  @UseGuards(SupabaseAuthGuard, AdminRoleGuard)
  async registerAdmin(@Body() dto: any) {
    const payload = {
      ...dto,
      role: 'admin',
    };
    return sendWithTimeout(
      this.kafka.send(AUTH_PATTERNS.REGISTER_CUSTOMER, payload),
    );
  }

  @Post('v1/login')
  async login(@Body() dto: any) {
    try {
      return await sendWithTimeout(this.kafka.send(AUTH_PATTERNS.LOGIN, dto));
    } catch (err: any) {
      const messageCandidates = [
        typeof err?.message === 'string' ? err.message : '',
        typeof err?.response?.message === 'string' ? err.response.message : '',
        typeof err?.error?.message === 'string' ? err.error.message : '',
        typeof err?.error === 'string' ? err.error : '',
      ]
        .map((value) => value.trim())
        .filter(Boolean);
      const rawMessage = messageCandidates[0] || '';
      const normalizedMessage = rawMessage.toLowerCase();

      if (
        normalizedMessage.includes('timed out') ||
        normalizedMessage.includes('unavailable')
      ) {
        throw new InternalServerErrorException(
          'Authentication service is temporarily unavailable. Please try again.',
        );
      }

      throw new UnauthorizedException(
        rawMessage && normalizedMessage !== 'internal server error'
          ? rawMessage
          : 'Invalid credentials or account is not active.',
      );
    }
  }

  @Post('v2/register')
  @UseInterceptors(
    FileInterceptor('document_file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB — matches Supabase Storage default
    }),
  )
  async registerProvider(
    @Body() dto: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new HttpException('document_file is required', 400);
    }

    // Upload file to Supabase Storage before sending to Kafka so the message
    // stays small regardless of file size (avoids Kafka message size limits).
    const filePath = `kyc/pending/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: uploadError } = await this.supabase.storage
      .from('verification-docs')
      .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (uploadError) {
      throw new HttpException(
        `File upload failed: ${uploadError.message}`,
        500,
      );
    }

    const payload = {
      ...dto,
      role: 'provider',
      file: {
        filePath,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
    };

    return sendWithTimeout(
      this.kafka.send(AUTH_PATTERNS.REGISTER_PROVIDER, payload).pipe(
        catchError(async (err) => {
          // Clean up the pre-uploaded file if registration fails
          await this.supabase.storage.from('verification-docs').remove([filePath]);
          console.error('KAFKA_ERROR_REGISTER_PROVIDER:', err);
          const response =
            err?.response && typeof err.response === 'object'
              ? err.response
              : err;
          const statusCode = Number(response?.statusCode ?? err?.statusCode);
          const rawMessage = response?.message ?? err?.message;
          const message = Array.isArray(rawMessage)
            ? rawMessage.join('; ')
            : String(rawMessage || 'Provider registration failed.');

          throw new HttpException(
            message,
            Number.isInteger(statusCode) &&
              statusCode >= 400 &&
              statusCode <= 599
              ? statusCode
              : 500,
          );
        }),
      ),
    );
  }

  @Post('v1/refresh')
  @HttpCode(200)
  async refreshSession(@Body() body: { refresh_token: string }) {
    return sendWithTimeout(this.kafka.send(AUTH_PATTERNS.REFRESH, body));
  }

  @Get('v1/me')
  @UseGuards(SupabaseAuthGuard)
  async getCurrentUser(@Request() req: any) {
    return sendWithTimeout(
      this.kafka.send(AUTH_PATTERNS.GET_ME, { userId: req['user'].id }),
    );
  }

  @Post('v1/logout')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(202)
  async logout(@Request() req: any) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    this.kafka.emit(AUTH_PATTERNS.LOGOUT, { accessToken: token });
    return { status: 'accepted' };
  }

  @Post('v1/forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() body: { email: string; redirect_to?: string }) {
    this.kafka.emit(AUTH_PATTERNS.FORGOT_PASSWORD, body);
    return { status: 'accepted' };
  }

  @Post('v1/reset-password')
  @HttpCode(202)
  async resetPassword(@Body() body: any) {
    this.kafka.emit(AUTH_PATTERNS.RESET_PASSWORD, body);
    return { status: 'accepted' };
  }
}
