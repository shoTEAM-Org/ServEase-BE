import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NOTIFICATION_PATTERNS } from '@app/common';
import { EmailService } from './email.service.js';

@Controller()
export class EmailKafkaController {
  constructor(private readonly emailService: EmailService) {}

  @EventPattern(NOTIFICATION_PATTERNS.USER_REGISTERED)
  async handleUserRegistered(@Payload() data: any) {
    await this.emailService.sendWelcome(
      data.userId,
      data.email,
      data.fullName,
      data.role,
    );
  }

  @EventPattern(NOTIFICATION_PATTERNS.PROVIDER_APPLICATION_APPROVED)
  async handleProviderApproved(@Payload() data: any) {
    await this.emailService.sendProviderApproved(data.userId);
  }

  @EventPattern(NOTIFICATION_PATTERNS.PROVIDER_APPLICATION_REJECTED)
  async handleProviderRejected(@Payload() data: any) {
    await this.emailService.sendProviderRejected(data.userId, data.metadata?.reason);
  }
}
