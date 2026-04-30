import { Controller, Inject, Logger } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { CHAT_PATTERNS } from '@app/common';
import { ChatService } from './chat.service.js';

@Controller()
export class ChatKafkaController {
  private readonly logger = new Logger(ChatKafkaController.name);

  constructor(@Inject(ChatService) private readonly chatService: ChatService) {}

  @MessagePattern(CHAT_PATTERNS.GET_CONVERSATIONS)
  async getConversations(@Payload() data: any) {
    const startedAt = Date.now();
    this.logger.log(
      `Received ${CHAT_PATTERNS.GET_CONVERSATIONS} userId=${String(data?.userId || '')} role=${String(data?.role || '')}`,
    );
    const result = await this.chatService.getConversations(data.userId, data.role);
    this.logger.log(
      `Completed ${CHAT_PATTERNS.GET_CONVERSATIONS} in ${Date.now() - startedAt}ms`,
    );
    return result;
  }

  @MessagePattern(CHAT_PATTERNS.GET_MESSAGES)
  async getMessages(@Payload() data: any) {
    const startedAt = Date.now();
    this.logger.log(
      `Received ${CHAT_PATTERNS.GET_MESSAGES} contextType=${String(data?.contextType || '')} contextId=${String(data?.contextId || data?.bookingId || '')}`,
    );
    if (data.contextType && data.contextId) {
      const result = await this.chatService.getMessagesByContext(data.contextType, data.contextId, data.userId);
      this.logger.log(
        `Completed ${CHAT_PATTERNS.GET_MESSAGES} in ${Date.now() - startedAt}ms`,
      );
      return result;
    }
    const result = await this.chatService.getMessages(data.bookingId, data.userId);
    this.logger.log(
      `Completed ${CHAT_PATTERNS.GET_MESSAGES} in ${Date.now() - startedAt}ms`,
    );
    return result;
  }

  @MessagePattern(CHAT_PATTERNS.SEND_MESSAGE)
  async sendMessage(@Payload() data: any) {
    if (data.contextType && data.contextId) {
      return this.chatService.sendMessageByContext(data.contextType, data.contextId, data.senderId, data.text);
    }
    return this.chatService.sendMessage(data.bookingId, data.senderId, data.text);
  }

  @EventPattern(CHAT_PATTERNS.MARK_READ)
  async markRead(@Payload() data: any) {
    return this.chatService.markRead(data.bookingId, data.userId);
  }
}
