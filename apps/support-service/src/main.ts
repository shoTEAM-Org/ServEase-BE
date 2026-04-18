import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { SupportServiceModule } from './support-service.module.js';
import { enableMicroserviceTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'support-service';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(SupportServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'support-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'support-service-consumer' },
    },
  });
  enableMicroserviceTracing(app, 'support-service');
  await app.listen();
  console.log('Support Service is listening on Kafka');
}
bootstrap();
