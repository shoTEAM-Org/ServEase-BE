import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ProviderServiceModule } from './provider-service.module.js';
import { enableMicroserviceTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'provider-service';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ProviderServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'provider-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'provider-service-consumer' },
    },
  });
  enableMicroserviceTracing(app, 'provider-service');
  await app.listen();
  console.log('Provider Service is listening on Kafka');
}
bootstrap();
