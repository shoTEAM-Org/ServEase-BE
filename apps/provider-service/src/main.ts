import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';
import { KafkaLoggingInterceptor } from '@app/common';
import { ProviderServiceModule } from './provider-service.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(ProviderServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'provider-service',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
        retry: { initialRetryTime: 300, retries: 10 },
      },
      consumer: {
        groupId: 'provider-service-group',
        allowAutoTopicCreation: true,
        retry: { initialRetryTime: 300, retries: 10 },
      },
      producer: { createPartitioner: Partitioners.LegacyPartitioner },
    },
  });
  app.useGlobalInterceptors(new KafkaLoggingInterceptor());
  await app.listen();
  console.log('Provider Service is running');
}
bootstrap();
