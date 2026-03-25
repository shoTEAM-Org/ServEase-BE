import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Producer, Partitioners } from 'kafkajs';
import { getKafkaClient } from './kafka.client';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private producer: Producer;

  constructor() {
    this.producer = getKafkaClient().producer({
      createPartitioner: Partitioners.LegacyPartitioner,
    });
  }

  async onModuleInit() {
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async emit(topic: string, payload: object): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{ value: JSON.stringify(payload) }],
    });
    this.logger.debug(`Emitted to ${topic}: ${JSON.stringify(payload)}`);
  }
}
