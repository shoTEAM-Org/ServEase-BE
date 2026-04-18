import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ChatServiceModule } from './chat-service.module.js';
import { enableMicroserviceTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'chat-service';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ChatServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'chat-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'chat-service-consumer' },
    },
  });
  enableMicroserviceTracing(app, 'chat-service');
  await app.listen();
  console.log('Chat Service is listening on Kafka');
}
bootstrap();
