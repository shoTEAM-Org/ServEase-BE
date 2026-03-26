import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';
import { KafkaLoggingInterceptor } from '@app/common';
import { CustomerServiceModule } from './customer-service.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(CustomerServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'customer-service',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
        retry: { initialRetryTime: 300, retries: 10 },
      },
      consumer: {
        groupId: 'customer-service-group',
        allowAutoTopicCreation: true,
        retry: { initialRetryTime: 300, retries: 10 },
      },
      producer: { createPartitioner: Partitioners.LegacyPartitioner },
    },
  });
  app.useGlobalInterceptors(new KafkaLoggingInterceptor());
  await app.listen();
  console.log('Customer Service is running');
}
bootstrap();
