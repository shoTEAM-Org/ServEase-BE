import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { CatalogServiceModule } from './catalog-service.module.js';
import { enableMicroserviceTracing, ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'catalog-service';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(CatalogServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'catalog-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'catalog-service-consumer' },
    },
  });
  enableMicroserviceTracing(app, 'catalog-service');
  await app.listen();
  console.log('Catalog Service is listening on Kafka');
}
bootstrap();
