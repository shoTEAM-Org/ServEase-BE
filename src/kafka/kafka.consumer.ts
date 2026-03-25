import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Consumer, Admin, EachMessagePayload } from 'kafkajs';
import { getKafkaClient } from './kafka.client';
import { KAFKA_TOPICS } from './kafka.topics';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Consumer;
  private admin: Admin;

  constructor() {
    const kafka = getKafkaClient();
    this.consumer = kafka.consumer({ groupId: 'servease-group' });
    this.admin = kafka.admin();
  }

  async onModuleInit() {
    await this.ensureTopics();
    await this.startConsumer();
  }

  private async startConsumer(retries = 5, delayMs = 5000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.consumer.connect();
        await this.consumer.subscribe({
          topics: Object.values(KAFKA_TOPICS),
          fromBeginning: false,
        });

        await this.consumer.run({
          eachMessage: async (messagePayload) => {
            await this.handleMessage(messagePayload);
          },
        });

        this.logger.log(`Kafka consumer subscribed to: ${Object.values(KAFKA_TOPICS).join(', ')}`);
        return;
      } catch (error) {
        this.logger.warn(`Consumer start attempt ${attempt}/${retries} failed: ${error.message}`);
        try { await this.consumer.disconnect(); } catch {}
        if (attempt === retries) throw error;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async ensureTopics(retries = 5, delayMs = 3000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.admin.connect();
        const created = await this.admin.createTopics({
          waitForLeaders: true,
          topics: Object.values(KAFKA_TOPICS).map((topic) => ({
            topic,
            numPartitions: 1,
            replicationFactor: 1,
          })),
        });
        await this.admin.disconnect();

        this.logger.log(created ? 'Kafka topics created' : 'Kafka topics already exist');
        return;
      } catch (error) {
        this.logger.warn(`Topic creation attempt ${attempt}/${retries} failed: ${error.message}`);
        if (attempt === retries) throw error;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  private async handleMessage({ topic, partition, message }: EachMessagePayload) {
    const payload = JSON.parse(message.value?.toString() || '{}');
    this.logger.log(`[${topic}] partition=${partition} payload=${JSON.stringify(payload)}`);

    switch (topic) {
      case KAFKA_TOPICS.BOOKING_CREATED:
        await this.onBookingCreated(payload);
        break;
      case KAFKA_TOPICS.BOOKING_STATUS_UPDATED:
        await this.onBookingStatusUpdated(payload);
        break;
      case KAFKA_TOPICS.PAYMENT_CREATED:
        await this.onPaymentCreated(payload);
        break;
      default:
        this.logger.warn(`No handler for topic: ${topic}`);
    }
  }

  private async onBookingCreated(payload: Record<string, unknown>) {
    // TODO: Add your business logic here (e.g. notify provider, send confirmation email)
    this.logger.log(`Booking created: ${payload.bookingReference} for provider ${payload.providerId}`);
  }

  private async onBookingStatusUpdated(payload: Record<string, unknown>) {
    // TODO: Add your business logic here (e.g. notify customer of status change)
    this.logger.log(`Booking ${payload.bookingId} status changed to: ${payload.status}`);
  }

  private async onPaymentCreated(payload: Record<string, unknown>) {
    // TODO: Add your business logic here (e.g. send receipt, update provider earnings)
    this.logger.log(`Payment created for booking ${payload.bookingId}, amount: ${payload.amount}`);
  }
}
