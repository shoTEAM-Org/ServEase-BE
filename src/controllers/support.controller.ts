import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Inject,
  HttpCode,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { SUPPORT_PATTERNS } from '@app/common';
import { SupabaseAuthGuard } from '../guards/supabase-auth.guard.js';

@Controller('api/support')
@UseGuards(SupabaseAuthGuard)
export class SupportController {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  @Post('v1/tickets')
  @HttpCode(202)
  createTicket(@Request() req: any, @Body() body: any) {
    this.kafka.emit(SUPPORT_PATTERNS.CREATE_TICKET, {
      ...body,
      userId: req['user'].id,
    });
    return { status: 'accepted' };
  }
}
