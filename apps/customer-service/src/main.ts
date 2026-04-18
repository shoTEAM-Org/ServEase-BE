import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { CustomerServiceModule } from './customer-service.module.js';
import { enableMicroserviceTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'customer-service';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(CustomerServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'customer-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'customer-service-consumer' },
    },
  });
  enableMicroserviceTracing(app, 'customer-service');
  await app.listen();
  console.log('Customer Service is listening on Kafka');
}
bootstrap();
