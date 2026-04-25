import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AuthServiceModule } from './auth-service.module.js';
import { enableMicroserviceTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'auth-service';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'auth-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'auth-service-consumer' },
    },
  });
  enableMicroserviceTracing(app, 'auth-service');
  await app.listen();
  console.log('Auth Service is listening on Kafka');
}
bootstrap();
