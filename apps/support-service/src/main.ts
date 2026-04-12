import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { SupportServiceModule } from './support-service.module.js';
import { ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(SupportServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'support-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'support-service-consumer' },
    },
  });
  await app.listen();
  console.log('Support Service is listening on Kafka');
}
bootstrap();
