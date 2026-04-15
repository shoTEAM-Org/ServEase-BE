import { Controller, Post, Get, Body, Request, UseGuards, UseInterceptors, UploadedFile, Inject, OnModuleInit, HttpCode, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { AUTH_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';
import 'multer';

@Controller('api/auth')
export class AuthController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [AUTH_PATTERNS.REGISTER_CUSTOMER, AUTH_PATTERNS.LOGIN, AUTH_PATTERNS.REGISTER_PROVIDER, AUTH_PATTERNS.REFRESH, AUTH_PATTERNS.GET_ME]
      .forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  @Post('v1/register/customer')
  async register(@Body() dto: any) {
    return lastValueFrom(this.kafka.send(AUTH_PATTERNS.REGISTER_CUSTOMER, dto));
  }

  @Post('v1/login')
  async login(@Body() dto: any) {
    try {
      return await lastValueFrom(this.kafka.send(AUTH_PATTERNS.LOGIN, dto));
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : null;
      if (message && message !== 'Internal server error') {
        throw new UnauthorizedException(message);
      }
      throw new InternalServerErrorException('Login failed. Please try again.');
    }
  }

  @Post('v2/register')
  @UseInterceptors(FileInterceptor('document_file'))
  async registerProvider(@Body() dto: any, @UploadedFile() file: Express.Multer.File) {
    const payload = { ...dto, file: file ? { originalname: file.originalname, mimetype: file.mimetype, buffer: file.buffer.toString('base64') } : null };
    return lastValueFrom(this.kafka.send(AUTH_PATTERNS.REGISTER_PROVIDER, payload));
  }

  @Post('v1/refresh') @HttpCode(200)
  async refreshSession(@Body() body: { refresh_token: string }) {
    return lastValueFrom(this.kafka.send(AUTH_PATTERNS.REFRESH, body));
  }

  @Get('v1/me') @UseGuards(SupabaseAuthGuard)
  async getCurrentUser(@Request() req: any) {
    return lastValueFrom(this.kafka.send(AUTH_PATTERNS.GET_ME, { userId: req['user'].id }));
  }

  @Post('v1/logout') @UseGuards(SupabaseAuthGuard) @HttpCode(202)
  async logout(@Request() req: any) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    this.kafka.emit(AUTH_PATTERNS.LOGOUT, { accessToken: token });
    return { status: 'accepted' };
  }

  @Post('v1/forgot-password') @HttpCode(202)
  async forgotPassword(@Body() body: { email: string; redirect_to?: string }) {
    this.kafka.emit(AUTH_PATTERNS.FORGOT_PASSWORD, body);
    return { status: 'accepted' };
  }

  @Post('v1/reset-password') @HttpCode(202)
  async resetPassword(@Body() body: any) {
    this.kafka.emit(AUTH_PATTERNS.RESET_PASSWORD, body);
    return { status: 'accepted' };
  }
}
