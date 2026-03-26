import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';
import { KafkaLoggingInterceptor } from '@app/common';
import { CatalogServiceModule } from './catalog-service.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(CatalogServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'catalog-service',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      consumer: { groupId: 'catalog-service-group' },
      producer: { createPartitioner: Partitioners.LegacyPartitioner },
    },
  });
  app.useGlobalInterceptors(new KafkaLoggingInterceptor());
  await app.listen();
  console.log('Catalog Service is running');
}
bootstrap();
