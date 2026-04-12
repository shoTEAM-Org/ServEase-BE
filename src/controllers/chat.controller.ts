import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request, Inject, OnModuleInit, HttpCode } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { CHAT_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/chat')
@UseGuards(SupabaseAuthGuard)
export class ChatController implements OnModuleInit {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onModuleInit() {
    [CHAT_PATTERNS.GET_CONVERSATIONS, CHAT_PATTERNS.GET_MESSAGES, CHAT_PATTERNS.SEND_MESSAGE]
      .forEach((p) => this.kafka.subscribeToResponseOf(p));
    await this.kafka.connect();
  }

  @Get('v1/conversations')
  async getConversations(@Request() req: any, @Query('role') role?: string) { return lastValueFrom(this.kafka.send(CHAT_PATTERNS.GET_CONVERSATIONS, { userId: req['user'].id, role })); }

  @Get('v1/conversations/:bookingId/messages')
  async getMessages(@Param('bookingId') bookingId: string, @Request() req: any) { return lastValueFrom(this.kafka.send(CHAT_PATTERNS.GET_MESSAGES, { bookingId, userId: req['user'].id })); }

  @Post('v1/conversations/:bookingId/messages')
  async sendMessage(@Param('bookingId') bookingId: string, @Request() req: any, @Body() body: { text: string }) { return lastValueFrom(this.kafka.send(CHAT_PATTERNS.SEND_MESSAGE, { bookingId, senderId: req['user'].id, text: body.text })); }

  @Patch('v1/conversations/:bookingId/read') @HttpCode(202)
  async markRead(@Param('bookingId') bookingId: string, @Request() req: any) { this.kafka.emit(CHAT_PATTERNS.MARK_READ, { bookingId, userId: req['user'].id }); return { status: 'accepted' }; }
}
