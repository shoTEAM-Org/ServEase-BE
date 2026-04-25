import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { PaymentServiceModule } from './payment-service.module.js';
import { enableMicroserviceTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'payment-service';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(PaymentServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'payment-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'payment-service-consumer' },
    },
  });
  enableMicroserviceTracing(app, 'payment-service');
  await app.listen();
  console.log('Payment Service is listening on Kafka');
}
bootstrap();
