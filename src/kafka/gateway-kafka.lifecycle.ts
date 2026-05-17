import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import {
  ADMIN_PATTERNS,
  AUTH_PATTERNS,
  BOOKING_PATTERNS,
  CATALOG_PATTERNS,
  CHAT_PATTERNS,
  CUSTOMER_PATTERNS,
  NOTIFICATION_PATTERNS,
  PAYMENT_PATTERNS,
  PROVIDER_PATTERNS,
  SUPPORT_PATTERNS,
} from '@app/common';

// Only the NOTIFICATION_PATTERNS the gateway calls as RPC (.send). The rest are
// @EventPattern fire-and-forget emitted by other services — never by the gateway.
const GATEWAY_NOTIFICATION_RPC_PATTERNS = [
  NOTIFICATION_PATTERNS.GET_NOTIFICATIONS,
  NOTIFICATION_PATTERNS.GET_UNREAD_COUNT,
];

@Injectable()
export class GatewayKafkaLifecycle
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(GatewayKafkaLifecycle.name);
  private readonly requiredReplyTopic = `${CATALOG_PATTERNS.GET_CATEGORIES}.reply`;
  private readonly responsePatterns = new Set<string>([
    ...Object.values(ADMIN_PATTERNS),
    ...Object.values(AUTH_PATTERNS),
    ...Object.values(BOOKING_PATTERNS),
    ...Object.values(CATALOG_PATTERNS),
    ...Object.values(CHAT_PATTERNS),
    ...Object.values(CUSTOMER_PATTERNS),
    ...GATEWAY_NOTIFICATION_RPC_PATTERNS,
    ...Object.values(PAYMENT_PATTERNS),
    ...Object.values(PROVIDER_PATTERNS),
    ...Object.values(SUPPORT_PATTERNS),
  ]);

  constructor(@Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka) {}

  async onApplicationBootstrap() {
    for (const pattern of this.responsePatterns) {
      this.kafka.subscribeToResponseOf(pattern);
    }

    const kafkaInternals = this.kafka as unknown as {
      responsePatterns?: string[];
      getConsumerAssignments?: () => Record<string, number>;
    };
    if (Array.isArray(kafkaInternals.responsePatterns)) {
      kafkaInternals.responsePatterns = Array.from(
        new Set(kafkaInternals.responsePatterns),
      );
    }

    await this.connectUntilReplyConsumerReady();
    this.logger.log('Gateway Kafka client connected');
  }

  async onApplicationShutdown() {
    await this.kafka.close();
  }

  private async connectUntilReplyConsumerReady() {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        await this.kafka.connect();
        if (await this.waitForReplyAssignment()) return;
        lastError = new Error(
          `Gateway Kafka reply topic ${this.requiredReplyTopic} was not assigned`,
        );
      } catch (error) {
        lastError = error;
      }

      await this.kafka.close().catch(() => undefined);
      await this.sleep(attempt * 1000);
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Gateway Kafka client failed to connect');
  }

  private async waitForReplyAssignment() {
    const deadline = Date.now() + 12000;
    do {
      const assignments = (
        this.kafka as unknown as {
          getConsumerAssignments?: () => Record<string, number>;
        }
      ).getConsumerAssignments?.();
      if (assignments && assignments[this.requiredReplyTopic] !== undefined) {
        return true;
      }
      await this.sleep(250);
    } while (Date.now() < deadline);

    return false;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
