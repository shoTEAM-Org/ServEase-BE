import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request, Inject, OnModuleInit, HttpCode, BadRequestException, NotFoundException, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { CHAT_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/chat')
@UseGuards(SupabaseAuthGuard)
export class ChatController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  private buildChatHttpError(error: any, fallback: string) {
    const response = error?.response;
    const status =
      Number(response?.statusCode || response?.status || error?.statusCode || error?.status) || 500;
    const rawMessage = response?.message || error?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.filter((item: any) => typeof item === 'string').join(', ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : fallback;

    if (status === 400) return new BadRequestException(message || fallback);
    if (status === 401) return new UnauthorizedException(message || fallback);
    if (status === 404) return new NotFoundException(message || fallback);
    return new InternalServerErrorException(
      !message || message === 'Internal server error' ? fallback : message
    );
  }

  async onModuleInit() {
    [CHAT_PATTERNS.GET_CONVERSATIONS, CHAT_PATTERNS.GET_MESSAGES, CHAT_PATTERNS.SEND_MESSAGE]
      .forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  @Get('v1/conversations')
  async getConversations(@Request() req: any, @Query('role') role?: string) {
    try {
      return await lastValueFrom(
        this.kafka.send(CHAT_PATTERNS.GET_CONVERSATIONS, { userId: req['user'].id, role })
      );
    } catch (error) {
      throw this.buildChatHttpError(error, 'Unable to load conversations.');
    }
  }

  @Get('v1/conversations/:bookingId/messages')
  async getMessages(@Param('bookingId') bookingId: string, @Request() req: any) {
    try {
      return await lastValueFrom(
        this.kafka.send(CHAT_PATTERNS.GET_MESSAGES, { bookingId, userId: req['user'].id })
      );
    } catch (error) {
      throw this.buildChatHttpError(error, 'Unable to load chat messages.');
    }
  }

  @Post('v1/conversations/:bookingId/messages')
  async sendMessage(@Param('bookingId') bookingId: string, @Request() req: any, @Body() body: { text?: string }) {
    const text = String(body?.text || '').trim();
    if (!text) {
      throw new BadRequestException('Message text cannot be empty.');
    }

    try {
      return await lastValueFrom(
        this.kafka.send(CHAT_PATTERNS.SEND_MESSAGE, {
          bookingId,
          senderId: req['user'].id,
          text,
        })
      );
    } catch (error) {
      throw this.buildChatHttpError(error, 'Unable to send message.');
    }
  }

  @Patch('v1/conversations/:bookingId/read') @HttpCode(202)
  async markRead(@Param('bookingId') bookingId: string, @Request() req: any) { this.kafka.emit(CHAT_PATTERNS.MARK_READ, { bookingId, userId: req['user'].id }); return { status: 'accepted' }; }
}
