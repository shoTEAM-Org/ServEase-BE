import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ChatServiceModule } from './chat-service.module.js';
import { ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ChatServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'chat-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'chat-service-consumer' },
    },
  });
  await app.listen();
  console.log('Chat Service is listening on Kafka');
}
bootstrap();
