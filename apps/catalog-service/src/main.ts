import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { CatalogServiceModule } from './catalog-service.module.js';
import { ensureKafkaTopics } from '@app/common';

async function bootstrap() {
  await ensureKafkaTopics();
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(CatalogServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: { clientId: 'catalog-service', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] },
      consumer: { groupId: 'catalog-service-consumer' },
    },
  });
  await app.listen();
  console.log('Catalog Service is listening on Kafka');
}
bootstrap();
