import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { CHAT_PATTERNS } from '@app/common';
import { ChatService } from './chat.service.js';

@Controller()
export class ChatKafkaController {
  constructor(@Inject(ChatService) private readonly chatService: ChatService) {}

  @MessagePattern(CHAT_PATTERNS.GET_CONVERSATIONS)
  async getConversations(@Payload() data: any) {
    return this.chatService.getConversations(data.userId, data.role);
  }

  @MessagePattern(CHAT_PATTERNS.GET_MESSAGES)
  async getMessages(@Payload() data: any) {
    return this.chatService.getMessages(data.bookingId, data.userId);
  }

  @MessagePattern(CHAT_PATTERNS.SEND_MESSAGE)
  async sendMessage(@Payload() data: any) {
    return this.chatService.sendMessage(data.bookingId, data.senderId, data.text);
  }

  @EventPattern(CHAT_PATTERNS.MARK_READ)
  async markRead(@Payload() data: any) {
    return this.chatService.markRead(data.bookingId, data.userId);
  }
}
