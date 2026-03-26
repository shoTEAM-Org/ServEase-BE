import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';
import { KafkaLoggingInterceptor } from '@app/common';
import { AuthServiceModule } from './auth-service.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthServiceModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'auth-service',
        brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      },
      consumer: { groupId: 'auth-service-group' },
      producer: { createPartitioner: Partitioners.LegacyPartitioner },
    },
  });
  app.useGlobalInterceptors(new KafkaLoggingInterceptor());
  await app.listen();
  console.log('Auth Service is running');
}
bootstrap();
