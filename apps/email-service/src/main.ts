import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { EmailServiceModule } from './email-service.module.js';
import { enableMicroserviceTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'email-service';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(EmailServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'email-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'email-service-consumer' },
    },
  });
  enableMicroserviceTracing(app, 'email-service');
  await app.listen();
  console.log('Email Service is listening on Kafka');
}
bootstrap();
