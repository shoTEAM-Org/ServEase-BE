import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { AUTH_PATTERNS } from '@app/common';
import { sendWithTimeout } from '../utils/kafka-request.js';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<any>();
    const userId = String(request?.user?.id || '').trim();
    if (!userId) {
      throw new ForbiddenException('Admin access required');
    }

    const profile = await sendWithTimeout<any>(
      this.kafka.send(AUTH_PATTERNS.GET_PROFILE, { userId }),
    );
    if (String(profile?.role || '').trim() !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}